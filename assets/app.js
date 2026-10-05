/* Junk Junkies: map, completed jobs, pricing estimator, hero reel, live Google reviews */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function ago(d) { var s = (Date.now() - new Date(d)) / 1000; if (!isFinite(s)) return ''; if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' hr ago'; if (s < 2592000) return Math.round(s / 86400) + ' days ago'; return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  function seeds() { var el = document.getElementById('seedJobs'); try { return el ? JSON.parse(el.textContent) : []; } catch (e) { return []; } }
  var JOBS = [], markers = {}, map = null;

  // ---------- pricing estimator
  var slider = $('#loadSlider');
  if (slider && slider.dataset.tiers) {
    var tiers = JSON.parse(slider.dataset.tiers);
    var upd = function () { var t = tiers[slider.value - 1]; $('#loadPrice').textContent = t.price; $('#loadLabel').textContent = '— ' + t.label; $('#truckPct').textContent = t.pct; $('#truckFill').style.height = t.pct; };
    slider.addEventListener('input', upd); upd();
  }

  // ---------- hero reel (rotating photos)
  var reel = document.getElementById('heroReel');
  if (reel && reel.children.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var i = 0, n = reel.children.length;
    setInterval(function () { reel.children[i].classList.remove('on'); i = (i + 1) % n; reel.children[i].classList.add('on'); }, 4500);
  }

  // ---------- jobs UI
  function card(j) {
    var imgs = '';
    if (j.before_url && j.after_url) imgs = '<div class="grid grid-cols-2 gap-px bg-line"><figure class="relative"><img loading="lazy" src="' + esc(j.before_url) + '" alt="Before: ' + esc(j.title || j.service || 'junk removal') + '" class="w-full h-44 object-cover"><figcaption class="absolute top-2 left-2 text-[10px] font-bold tracking-widest uppercase bg-ink/80 px-2 py-1 rounded">Before</figcaption></figure><figure class="relative"><img loading="lazy" src="' + esc(j.after_url) + '" alt="After: ' + esc(j.title || j.service || 'junk removal') + '" class="w-full h-44 object-cover"><figcaption class="absolute top-2 left-2 text-[10px] font-bold tracking-widest uppercase bg-ember text-ink px-2 py-1 rounded">After</figcaption></figure></div>';
    else if (j.after_url) imgs = '<img loading="lazy" src="' + esc(j.after_url) + '" alt="' + esc(j.title || j.service || 'Completed junk removal job') + '" class="w-full h-44 object-cover">';
    var place = [j.area, j.city].filter(Boolean).join(', ');
    return '<article id="job-' + esc(j.id) + '" class="rounded-2xl border border-line bg-slate2 overflow-hidden">' + imgs + '<div class="p-5"><div class="text-xs font-semibold tracking-widest uppercase text-ember mb-1">' + esc(j.service || 'Completed job') + '</div><h3 class="display font-bold text-lg mb-2">' + esc(j.title || (j.service ? j.service + (j.city ? ' in ' + j.city : '') : 'Completed job')) + '</h3>' + (j.description ? '<p class="text-sm text-bone/65 mb-3">' + esc(j.description) + '</p>' : '') + '<div class="text-xs text-bone/45 flex flex-wrap gap-x-3">' + (place ? '<span>📍 ' + esc(place) + '</span>' : '') + (j.created_at ? '<span>' + esc(ago(j.created_at)) + '</span>' : '') + '</div></div></article>';
  }
  function renderWork() {
    var grid = $('#jobGrid'), side = $('#jobSide'), more = $('#loadMore'), cnt = $('#jobCount');
    if (cnt) cnt.textContent = JOBS.length ? JOBS.length + ' completed jobs' : '';
    if (grid) {
      if (!JOBS.length) { grid.innerHTML = '<div class="sm:col-span-2 rounded-2xl border border-dashed border-line p-8 text-center text-bone/60">Completed jobs show up here as our crew finishes them, with photos and a pin on the map. <a class="text-ember font-semibold" href="#quote">Get a quote for yours.</a></div>'; if (more) more.classList.add('hidden'); }
      else {
        var shown = 6; var draw = function () { grid.innerHTML = JOBS.slice(0, shown).map(card).join(''); if (more) { if (shown >= JOBS.length) more.classList.add('hidden'); else { more.classList.remove('hidden'); more.textContent = 'Show all ' + JOBS.length + ' jobs'; } } };
        if (more) more.onclick = function () { shown = JOBS.length; draw(); }; draw();
      }
    }
    if (side) side.innerHTML = JOBS.length ? JOBS.slice(0, 6).map(function (j) {
      var th = j.after_url || j.before_url || '';
      return '<button type="button" data-id="' + esc(j.id) + '" class="w-full flex gap-3 items-center text-left rounded-xl p-2 hover:bg-ink transition">' + (th ? '<img loading="lazy" src="' + esc(th) + '" alt="" class="w-16 h-16 rounded-lg object-cover shrink-0">' : '<div class="w-16 h-16 rounded-lg bg-ink shrink-0"></div>') + '<span class="min-w-0"><span class="block text-sm font-semibold truncate">' + esc(j.title || j.service || 'Completed job') + '</span><span class="block text-xs text-bone/50">' + esc([j.city, j.created_at ? ago(j.created_at) : ''].filter(Boolean).join(' · ')) + '</span></span></button>';
    }).join('') : '<p class="text-sm text-bone/50 p-2">No jobs posted yet.</p>';
    if (side) side.querySelectorAll('button').forEach(function (b) { b.onclick = function () { var m = markers[b.dataset.id]; if (m && map) { map.setView(m.getLatLng(), 12); m.openPopup(); $('#jjMap').scrollIntoView({ behavior: 'smooth', block: 'center' }); } else { var c = document.getElementById('job-' + b.dataset.id); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }; });
    var hj = $('#homeJobs'); if (hj && JOBS.length) { hj.querySelector('[data-grid]').innerHTML = JOBS.slice(0, 3).map(card).join(''); hj.classList.remove('hidden'); }
  }

  // ---------- map
  function initMap() {
    var el = $('#jjMap'); if (!el) return;
    if (!window.L) return setTimeout(initMap, 150);
    var cities = JSON.parse(el.dataset.cities || '[]'); var b = [];
    map = L.map(el, { scrollWheelZoom: false });
    var street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
    var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Tiles &copy; Esri' });
    L.control.layers({ 'Map': street, 'Satellite': sat }, null, { position: 'topright' }).addTo(map);
    cities.forEach(function (c) { L.circle([c.lat, c.lon], { radius: 9000, color: '#14F500', weight: 1, fillColor: '#14F500', fillOpacity: .1 }).addTo(map); L.marker([c.lat, c.lon]).addTo(map).bindPopup('<a href="' + c.u + '"><b>' + esc(c.n) + '</b><br>Junk removal in ' + esc(c.n) + '</a>'); b.push([c.lat, c.lon]); });
    JOBS.forEach(function (j) { if (j.lat == null || j.lon == null) return; var m = L.circleMarker([j.lat, j.lon], { radius: 9, color: '#fff', weight: 2, fillColor: '#14F500', fillOpacity: 1 }).addTo(map).bindPopup((j.after_url ? '<img src="' + esc(j.after_url) + '" style="width:190px;border-radius:8px"><br>' : '') + '<b>' + esc(j.title || j.service || 'Completed job') + '</b><br>' + esc(j.city || '')); markers[j.id] = m; b.push([j.lat, j.lon]); });
    if (b.length) map.fitBounds(b, { padding: [30, 30] }); else map.setView([30.2, -95.5], 9);
    el.classList.add('jj-dark');
    var fs = document.createElement('button'); fs.type = 'button'; fs.textContent = '⛶'; fs.title = 'Fullscreen'; fs.className = 'jj-fs'; fs.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen && el.requestFullscreen(); setTimeout(function () { map.invalidateSize(); }, 300); }; el.appendChild(fs);
  }

  // ---------- reviews

  // rotating reel of reviews: one card on phones, three on wide screens, loops forever
  function reviewReel(grid, cards) {
    var n = cards.length, i = 0, per = 1, timer = null, slides, startX = null;
    var track = document.createElement('div'), dots = document.createElement('div');
    track.style.cssText = 'display:flex;transition:transform .7s ease;will-change:transform';
    dots.className = 'flex justify-center gap-2 mt-5';
    grid.className = ''; grid.style.overflow = 'hidden'; grid.innerHTML = '';
    grid.appendChild(track);
    var wrap = grid.parentNode; var old = wrap.querySelector('[data-dots]'); if (old) old.remove(); dots.setAttribute('data-dots', ''); grid.after(dots);
    function perView() { return window.matchMedia('(min-width:768px)').matches ? Math.max(1, Math.min(3, n - 1)) : 1; }
    function build() {
      per = perView();
      track.innerHTML = cards.concat(cards.slice(0, per)).map(function (c) { return '<div style="flex:0 0 ' + (100 / per) + '%;padding:0 8px;box-sizing:border-box">' + c + '</div>'; }).join('');
      Array.prototype.forEach.call(track.querySelectorAll('blockquote'), function (b) { b.style.height = '100%'; });
      dots.innerHTML = cards.map(function (_, k) { return '<button type="button" aria-label="Review ' + (k + 1) + '" data-k="' + k + '" style="width:9px;height:9px;border-radius:9999px;background:#F4F1EA;opacity:.3;border:0;padding:0"></button>'; }).join('');
      go(i % n, false);
    }
    function mark() { Array.prototype.forEach.call(dots.children, function (d, k) { d.style.opacity = k === (i % n) ? '1' : '.3'; d.style.background = k === (i % n) ? '#14F500' : '#F4F1EA'; }); }
    function go(k, anim) { i = k; track.style.transition = anim === false ? 'none' : ''; track.style.transform = 'translateX(-' + (k * 100 / per) + '%)'; mark(); }
    function next() { go(i + 1); if (i >= n) setTimeout(function () { go(0, false); }, 720); }
    function prev() { if (i <= 0) go(n - 1, false); else go(i - 1); }
    function play() { stop(); if (n > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(function () { if (!document.hidden) next(); }, 5500); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    if (n < 2) { build(); return; }
    build(); play();
    dots.onclick = function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (k != null) { go(Number(k)); play(); } };
    grid.addEventListener('mouseenter', stop); grid.addEventListener('mouseleave', play);
    grid.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; stop(); }, { passive: true });
    grid.addEventListener('touchend', function (e) { if (startX != null) { var dx = e.changedTouches[0].clientX - startX; if (dx < -40) next(); else if (dx > 40) prev(); startX = null; } play(); });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (perView() !== per) build(); }, 200); });
  }
  function renderReviews(d) {
    var box = $('#reviewsLive'); if (!box || !d || !d.reviews || !d.reviews.length) return;
    var stars = function (n) { return '★★★★★'.slice(0, Math.round(n)); };
    box.querySelector('[data-head]').innerHTML = d.rating ? '<span class="text-ember">' + stars(d.rating) + '</span> ' + esc(d.rating.toFixed(1)) + ' on Google' + (d.count ? ' · ' + esc(d.count) + ' reviews' : '') : 'Reviews from Google';
    reviewReel(box.querySelector('[data-grid]'), d.reviews.slice(0, 10).map(function (r) { return '<blockquote class="rounded-3xl bg-ink border border-line p-6"><div class="text-ember mb-2">' + stars(r.rating) + '</div><p class="text-bone/80 mb-4">' + esc(r.text) + '</p><footer class="text-sm text-bone/50">— ' + esc(r.author) + (r.when ? ', ' + esc(r.when) : '') + '</footer></blockquote>'; }));
    if (d.url) box.querySelector('[data-link]').href = d.url; else box.querySelector('[data-link]').remove();
    box.classList.remove('hidden');
    var st = $('#staticReviews'); if (st) st.remove();
  }

  var done = 0; function step() { if (++done === 2) { renderWork(); initMap(); } }
  fetch('/api/jobs').then(function (r) { return r.json(); }).then(function (d) { JOBS = (d.jobs || []).concat(seeds()); }).catch(function () { JOBS = seeds(); }).then(step);
  fetch('/api/reviews').then(function (r) { return r.json(); }).then(renderReviews).catch(function () {}).then(step);
})();
