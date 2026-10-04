/* Crew job-site upload: take photos, tag the job, drop a pin on the map. */
(function () {
  var f = document.getElementById('crewForm'); if (!f) return;
  var $ = function (s) { return f.querySelector(s); }, msg = document.getElementById('crewMsg'), pin = $('[name=pin]');
  try { pin.value = localStorage.getItem('jjpin') || ''; } catch (e) {}
  var cities = JSON.parse(f.dataset.cities || '[]'), pos = null;
  $('#gpsBtn').onclick = function () {
    msg.textContent = 'Getting location...';
    navigator.geolocation.getCurrentPosition(function (p) { pos = { lat: p.coords.latitude, lon: p.coords.longitude }; msg.textContent = 'Location saved (shown on the map only to the nearest ~1 km).'; $('#gpsBtn').textContent = '✓ Location saved'; }, function () { msg.textContent = 'Could not get GPS. The selected city will be used.'; }, { enableHighAccuracy: true, timeout: 12000 });
  };
  function toJpeg(file) {
    return createImageBitmap(file).then(function (bm) {
      var s = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      var q = 0.82, out = c.toDataURL('image/jpeg', q);
      while (out.length * 0.75 > 1.8e6 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      return out;
    });
  }
  f.addEventListener('submit', function (e) {
    e.preventDefault(); var b = $('#crewBtn'), after = $('[name=after]').files[0], before = $('[name=before]').files[0];
    if (!after) { msg.textContent = 'Add an "after" photo.'; return; }
    var city = $('[name=city]').value, c = cities.filter(function (x) { return x.n === city; })[0];
    var p = pos || (c ? { lat: c.lat, lon: c.lon } : null); if (!p) { msg.textContent = 'Tap "Use my location" or pick the city.'; return; }
    b.disabled = true; msg.textContent = 'Uploading...';
    Promise.all([toJpeg(after), before ? toJpeg(before) : Promise.resolve(null)]).then(function (im) {
      return fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-crew-pin': pin.value }, body: JSON.stringify({ service: $('[name=service]').value, city: city || 'Auto', gbp: $('[name=gbp]').checked, area: $('[name=area]').value, lat: p.lat, lon: p.lon, description: $('[name=description]').value, after: im[0], before: im[1] }) });
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (r) {
      if (!r.ok) throw new Error(r.j.error || 'Upload failed');
      try { localStorage.setItem('jjpin', pin.value); } catch (e) {}
      msg.textContent = '✓ Posted to ' + (r.j.siteName || 'the site') + ' (' + (r.j.city || '') + ')' + (r.j.gbp === 'done' ? ' and Google.' : r.j.gbp === 'failed' ? '. Google upload failed, it will retry.' : '.'); f.reset(); pos = null; $('#gpsBtn').textContent = '📍 Use my location (recommended)'; pin.value = localStorage.getItem('jjpin') || '';
    }).catch(function (err) { msg.textContent = '⚠ ' + err.message; }).then(function () { b.disabled = false; });
  });
})();
