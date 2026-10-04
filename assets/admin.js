/* Owner dashboard: all sites at a glance, hide/unhide jobs, retry Google uploads. */
(function () {
  var root = document.getElementById('adminApp'); if (!root) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var NAMES = JSON.parse(root.dataset.sites || '{}'), pin = '';
  try { pin = sessionStorage.getItem('jjadmin') || ''; } catch (e) {}
  function ago(d) { var s = (Date.now() - new Date(d)) / 1000; if (!isFinite(s)) return '—'; if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' hr ago'; return Math.round(s / 86400) + ' days ago'; }
  function api(method, body) { return fetch('/api/admin', { method: method, headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Error'); return j; }); }); }
  function login(msg) {
    root.innerHTML = '<form id="lf" class="max-w-sm mx-auto grid gap-3"><input id="lp" type="password" placeholder="Admin PIN" autocomplete="off" class="bg-ink border border-line rounded-xl px-4 py-3"><button class="rounded-full bg-ember text-ink font-bold px-6 py-3">Open dashboard</button><p class="text-sm text-bone/60">' + esc(msg || '') + '</p></form>';
    document.getElementById('lf').onsubmit = function (e) { e.preventDefault(); pin = document.getElementById('lp').value; load(); };
  }
  function load() {
    api('GET').then(function (d) { try { sessionStorage.setItem('jjadmin', pin); } catch (e) {} render(d); }).catch(function (e) { login(e.message); });
  }
  function render(d) {
    var by = {}; d.stats.forEach(function (s) { by[s.site] = s; });
    var sites = Object.keys(NAMES);
    var cards = sites.map(function (k) {
      var s = by[k] || { jobs: 0, hidden: 0, gbp_done: 0, gbp_pending: 0, gbp_failed: 0 };
      return '<div class="rounded-2xl border border-line bg-slate2 p-5"><div class="flex items-start justify-between gap-2"><div><div class="display font-bold text-lg">' + esc(NAMES[k].name) + '</div><a class="text-xs text-ember" target="_blank" rel="noopener" href="https://' + esc(NAMES[k].domain) + '/our-work/">' + esc(NAMES[k].domain) + '</a></div><span class="text-xs rounded-full px-2 py-1 ' + (d.gbp[k] ? 'bg-ember text-ink font-bold' : 'bg-ink text-bone/50') + '">' + (d.gbp[k] ? 'Google linked' : 'Google not linked') + '</span></div>' +
        '<div class="grid grid-cols-3 gap-2 mt-4 text-center"><div><div class="display text-2xl font-extrabold">' + s.jobs + '</div><div class="text-xs text-bone/50">jobs</div></div><div><div class="display text-2xl font-extrabold">' + s.gbp_done + '</div><div class="text-xs text-bone/50">on Google</div></div><div><div class="display text-2xl font-extrabold ' + (s.gbp_failed ? 'text-red-400' : '') + '">' + s.gbp_failed + '</div><div class="text-xs text-bone/50">failed</div></div></div>' +
        '<div class="mt-3 text-xs text-bone/50">Last job: ' + (s.last_job ? ago(s.last_job) : 'none yet') + (s.hidden ? ' · ' + s.hidden + ' hidden' : '') + '</div></div>';
    }).join('');
    var rows = d.jobs.map(function (j) {
      var nm = (NAMES[j.site] || {}).name || j.site;
      return '<div class="flex gap-3 items-center rounded-xl border border-line bg-slate2 p-3 ' + (j.hidden ? 'opacity-50' : '') + '">' + (j.after_url ? '<img loading="lazy" src="' + esc(j.after_url) + '" alt="" class="w-16 h-16 rounded-lg object-cover shrink-0">' : '<div class="w-16 h-16 rounded-lg bg-ink shrink-0"></div>') +
        '<div class="min-w-0 flex-1"><div class="text-sm font-semibold truncate">' + esc(j.service || 'Job') + ' · ' + esc(j.city || '') + '</div><div class="text-xs text-bone/50">' + esc(nm) + ' · ' + ago(j.created_at) + ' · Google: ' + esc(j.gbp_status) + '</div></div>' +
        '<div class="flex gap-2 shrink-0">' + (j.gbp_status === 'failed' || j.gbp_status === 'pending' ? '<button data-a="retry_gbp" data-id="' + j.id + '" class="text-xs rounded-full border border-line px-3 py-1.5">Retry Google</button>' : '') +
        '<button data-a="' + (j.hidden ? 'unhide' : 'hide') + '" data-id="' + j.id + '" class="text-xs rounded-full border border-line px-3 py-1.5">' + (j.hidden ? 'Show' : 'Hide') + '</button></div></div>';
    }).join('') || '<p class="text-bone/50">No jobs yet.</p>';
    var leadRows = (d.leads || []).map(function (l) { var nm = (NAMES[l.site] || {}).name || l.site; return '<div class="rounded-xl border border-line bg-slate2 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><div class="font-semibold">' + esc(l.name) + ' <a class="text-ember text-sm font-normal" href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a></div><div class="text-xs text-bone/50">' + esc(nm) + ' · ' + ago(l.created_at) + '</div></div><div class="text-sm text-bone/70">' + esc([l.service, l.city, l.zip].filter(Boolean).join(' · ')) + '</div>' + (l.message ? '<div class="text-sm text-bone/55 mt-1">' + esc(l.message) + '</div>' : '') + '</div>'; }).join('') || '<p class="text-bone/50">No quote requests saved yet.</p>';
    root.innerHTML = '<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">' + cards + '</div><h2 class="display text-xl font-extrabold mb-3">Latest quote requests (all sites)</h2><div class="grid gap-2 mb-10">' + leadRows + '</div><div class="flex items-center justify-between mb-3"><h2 class="display text-xl font-extrabold">Latest jobs (all sites)</h2><button id="rf" class="text-xs rounded-full border border-line px-3 py-1.5">Refresh</button></div><div class="grid gap-2">' + rows + '</div>' +
      '<p class="mt-8 text-xs text-bone/40">Hiding a job removes it from the public map and gallery but keeps it here. Reviews feed: ' + (d.reviews ? 'connected on this site' : 'not set on this site') + '.</p>';
    document.getElementById('rf').onclick = load;
    root.querySelectorAll('button[data-a]').forEach(function (b) { b.onclick = function () { b.disabled = true; api('POST', { action: b.dataset.a, id: Number(b.dataset.id) }).then(load).catch(function (e) { alert(e.message); b.disabled = false; }); }; });
  }
  if (pin) load(); else login();
})();
