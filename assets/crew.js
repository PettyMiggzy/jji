/* Crew job photos: sign in with your code, start a job with the before photo, finish it with the after photo and it lands on the map. */
(function () {
  var app = document.getElementById('crewApp'); if (!app) return;
  var $ = function (s) { return app.querySelector(s); }, msg = $('#crewMsg'), login = $('#crewLogin'), main = $('#crewMain'), f = $('#crewForm'), openBox = $('#crewOpen');
  var cities = JSON.parse(app.dataset.cities || '[]'), pos = null, code = '';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function say(t) { msg.textContent = t || ''; }
  function api(method, body, qs) {
    return fetch('/api/jobs' + (qs || ''), { method: method, headers: { 'Content-Type': 'application/json', 'x-crew-pin': code }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; }); });
  }
  function toJpeg(file) {
    return createImageBitmap(file).then(function (bm) {
      var s = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      var q = 0.82, out = c.toDataURL('image/jpeg', q);
      while (out.length * 0.75 > 1.8e6 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      return out;
    });
  }
  $('#gpsBtn').onclick = function () {
    say('Getting location...');
    navigator.geolocation.getCurrentPosition(function (p) { pos = { lat: p.coords.latitude, lon: p.coords.longitude }; say('Location saved (shown on the map only to the nearest ~1 km).'); $('#gpsBtn').textContent = '✓ Location saved'; },
      function () { say('Could not get your location. Pick the city instead.'); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  function loadOpen() {
    return api('GET', null, '?open=1').then(function (d) {
      $('#crewHi').textContent = 'Signed in as ' + d.name + '.';
      openBox.innerHTML = d.jobs.length ? d.jobs.map(function (j) {
        return '<div class="rounded-2xl border border-line bg-slate2 p-3" data-id="' + j.id + '"><div class="flex gap-3 items-center">' + (j.before_url ? '<img src="' + esc(j.before_url) + '" alt="" class="w-16 h-16 rounded-lg object-cover shrink-0">' : '') +
          '<div class="min-w-0 flex-1"><div class="font-semibold truncate">' + esc(j.service || 'Job') + ' · ' + esc(j.city || '') + '</div><div class="text-xs text-bone/50">Started by ' + esc(j.crew_name || 'Crew') + '</div></div></div>' +
          '<label class="block mt-3"><span class="text-sm text-bone/70">After photo</span><input type="file" accept="image/*" capture="environment" class="fin-photo mt-1 block w-full text-sm"></label>' +
          '<button class="fin-btn mt-3 rounded-full bg-ember hover:bg-emberDark text-ink font-bold px-6 py-3 transition">Finish job and pin it</button></div>';
      }).join('') : '<p class="text-bone/50 text-sm">No open jobs.</p>';
      openBox.querySelectorAll('.fin-btn').forEach(function (btn) {
        btn.onclick = function () {
          var card = btn.closest('[data-id]'), file = card.querySelector('.fin-photo').files[0];
          if (!file) { say('Add the after photo first.'); return; }
          btn.disabled = true; say('Posting...');
          toJpeg(file).then(function (a) { return api('POST', { action: 'finish', id: Number(card.dataset.id), after: a, gbp: f.querySelector('[name=gbp]').checked }); })
            .then(function (r) { say('✓ Finished. The job is now on the ' + (r.city || '') + ' map' + (r.gbp === 'done' ? ' and on Google.' : r.gbp === 'failed' ? '. Google upload failed, the owner can retry it.' : '.')); return loadOpen(); })
            .catch(function (e) { say('⚠ ' + e.message); btn.disabled = false; });
        };
      });
      return d;
    });
  }
  function signIn(c, quiet) {
    code = c.trim(); say(quiet ? '' : 'Signing in...');
    return loadOpen().then(function () { try { localStorage.setItem('jjcrew', code); } catch (e) {} login.style.display = 'none'; main.hidden = false; say(''); })
      .catch(function (e) { try { localStorage.removeItem('jjcrew'); } catch (x) {} login.style.display = ''; main.hidden = true; if (!quiet) say('⚠ ' + e.message); });
  }
  login.addEventListener('submit', function (e) { e.preventDefault(); signIn(login.querySelector('[name=pin]').value); });
  try { var saved = localStorage.getItem('jjcrew') || localStorage.getItem('jjpin'); if (saved) signIn(saved, true); } catch (e) {}
  f.addEventListener('submit', function (e) {
    e.preventDefault(); var b = $('#crewBtn'), before = f.querySelector('[name=before]').files[0], after = f.querySelector('[name=after]').files[0];
    if (!before) { say('Add the before photo.'); return; }
    var city = f.querySelector('[name=city]').value, c = cities.filter(function (x) { return x.n === city; })[0];
    var p = pos || (c ? { lat: c.lat, lon: c.lon } : null); if (!p) { say('Tap "Use my location" or pick the city.'); return; }
    b.disabled = true; say('Uploading...');
    Promise.all([toJpeg(before), after ? toJpeg(after) : Promise.resolve(null)]).then(function (im) {
      return api('POST', { action: im[1] ? undefined : 'start', service: f.querySelector('[name=service]').value, city: city || 'Auto', gbp: f.querySelector('[name=gbp]').checked, area: f.querySelector('[name=area]').value, lat: p.lat, lon: p.lon, description: f.querySelector('[name=description]').value, before: im[0], after: im[1] });
    }).then(function (r) {
      say(r.started ? '✓ Job started in ' + (r.city || '') + '. When you finish, add the after photo under "Open jobs".' : '✓ Posted to ' + (r.siteName || 'the site') + ' (' + (r.city || '') + ')' + (r.gbp === 'done' ? ' and Google.' : r.gbp === 'failed' ? '. Google upload failed, the owner can retry it.' : '.'));
      f.reset(); pos = null; $('#gpsBtn').textContent = '📍 Use my location (recommended)'; return loadOpen();
    }).catch(function (err) { say('⚠ ' + err.message); }).then(function () { b.disabled = false; });
  });
})();
