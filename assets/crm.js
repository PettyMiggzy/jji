/* Owner CRM: work every quote request from every site. Needs the admin PIN (same one as the dashboard). */
(function () {
  var root = document.getElementById('crmApp'); if (!root) return;
  var SITES = { spring: 'Spring', tomball: 'Tomball', cypress: 'Cypress', 'college-station': 'College Station', indiana: 'Indiana', florida: 'Florida' };
  var STATUS = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', booked: 'Booked', done: 'Done', lost: 'Lost' };
  var SOURCE = { website: 'Website', ad: 'Google ad', phone: 'Phone call', referral: 'Referral', other: 'Other' };
  var pin = ''; try { pin = sessionStorage.getItem('jjadmin') || ''; } catch (e) {}
  var leads = [], filt = { status: 'all', site: 'all', source: 'all', q: '', due: false }, open = null, toast = '';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (n) { return n == null ? '' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  function mins(d) { return (Date.now() - new Date(d)) / 60000; }
  function ago(d) { var m = mins(d); if (!isFinite(m)) return ''; if (m < 60) return Math.max(1, Math.round(m)) + ' min ago'; if (m < 1440) return Math.round(m / 60) + ' hr ago'; return Math.round(m / 1440) + ' days ago'; }
  function api(method, body) { return fetch('/api/crm', { method: method, headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Error'); return j; }); }); }
  function login(msg) {
    root.innerHTML = '<form id="lf" class="max-w-sm mx-auto grid gap-3"><input id="lp" type="password" placeholder="Admin PIN" autocomplete="off" class="bg-ink border border-line rounded-xl px-4 py-3"><button class="rounded-full bg-ember text-ink font-bold px-6 py-3">Open CRM</button><p class="text-sm text-bone/60">' + esc(msg || '') + '</p></form>';
    document.getElementById('lf').onsubmit = function (e) { e.preventDefault(); pin = document.getElementById('lp').value; load(); };
  }
  function load() { return api('GET').then(function (d) { try { sessionStorage.setItem('jjadmin', pin); } catch (e) {} leads = d.leads; render(); }).catch(function (e) { login(e.message); }); }
  function visible() {
    var q = filt.q.toLowerCase(), t = today();
    return leads.filter(function (l) {
      if (filt.status !== 'all' && l.status !== filt.status) return false;
      if (filt.site !== 'all' && l.site !== filt.site) return false;
      if (filt.source !== 'all' && l.source !== filt.source) return false;
      if (filt.due && !(l.follow_up && l.follow_up <= t && l.status !== 'done' && l.status !== 'lost')) return false;
      if (q && (l.name + ' ' + l.phone + ' ' + (l.email || '') + ' ' + (l.service || '') + ' ' + (l.city || '') + ' ' + (l.notes || '') + ' ' + (l.message || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function tiles() {
    var t = today(), by = function (s) { return leads.filter(function (l) { return l.status === s; }); };
    var sum = function (arr, k) { return arr.reduce(function (a, l) { return a + (Number(l[k]) || 0); }, 0); };
    var nw = by('new'), oldest = nw.length ? Math.max.apply(null, nw.map(function (l) { return mins(l.created_at); })) : 0;
    var due = leads.filter(function (l) { return l.follow_up && l.follow_up <= t && l.status !== 'done' && l.status !== 'lost'; });
    var won = leads.filter(function (l) { return l.status === 'booked' || l.status === 'done'; });
    function tile(label, big, small, attr, hot) { return '<button ' + attr + ' class="text-left rounded-2xl border ' + (hot ? 'border-red-500/60' : 'border-line') + ' bg-slate2 p-4"><div class="text-xs text-bone/50">' + label + '</div><div class="display text-3xl font-extrabold ' + (hot ? 'text-red-400' : '') + '">' + big + '</div><div class="text-xs text-bone/50">' + small + '</div></button>'; }
    return '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">' +
      tile('New, not called yet', nw.length, nw.length ? 'oldest waiting ' + (oldest < 60 ? Math.round(oldest) + ' min' : oldest < 1440 ? Math.round(oldest / 60) + ' hr' : Math.round(oldest / 1440) + ' days') : 'all caught up', 'data-f="new"', nw.length > 0 && oldest > 15) +
      tile('Follow-ups due', due.length, 'today or overdue', 'data-f="due"', due.length > 0) +
      tile('Quoted, waiting', by('quoted').length, money(sum(by('quoted'), 'quote_amount')) + ' quoted', 'data-f="quoted"') +
      tile('Won (booked + done)', money(sum(won, 'job_amount')) || '$0', won.length + ' jobs', 'data-f="booked"') + '</div>';
  }
  function chip(label, key, val) { var on = filt[key] === val; return '<button data-chip="' + key + ':' + val + '" class="rounded-full border px-3 py-1.5 text-sm ' + (on ? 'bg-ember text-ink border-ember font-bold' : 'border-line text-bone/70') + '">' + label + '</button>'; }
  function sel(id, opts, cur, all) { return '<select id="' + id + '" class="bg-ink border border-line rounded-xl px-3 py-2 text-sm">' + '<option value="all">' + all + '</option>' + Object.keys(opts).map(function (k) { return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + esc(opts[k]) + '</option>'; }).join('') + '</select>'; }
  function card(l) {
    var isOpen = open === l.id, waiting = l.status === 'new' && mins(l.created_at) > 15, tdy = today(), overdue = l.follow_up && l.follow_up <= tdy && l.status !== 'done' && l.status !== 'lost';
    var head = '<div class="flex flex-wrap items-center justify-between gap-2"><div class="min-w-0"><button data-open="' + l.id + '" class="font-semibold text-left">' + esc(l.name) + '</button> <a class="text-ember text-sm" href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a></div>' +
      '<div class="flex items-center gap-2"><span class="text-xs ' + (waiting ? 'text-red-400 font-bold' : 'text-bone/50') + '">' + (waiting ? 'waiting ' : '') + ago(l.created_at) + '</span>' +
      '<select data-st="' + l.id + '" class="bg-ink border border-line rounded-lg px-2 py-1 text-sm">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (l.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="text-sm text-bone/70 mt-1">' + esc([l.service, l.city, l.zip].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="text-xs text-bone/45 mt-1">' + esc(SITES[l.site] || l.site) + ' · ' + esc(SOURCE[l.source] || l.source) + (l.quote_amount != null ? ' · quoted ' + money(l.quote_amount) : '') + (l.job_amount != null ? ' · job ' + money(l.job_amount) : '') + (l.follow_up ? ' · <span class="' + (overdue ? 'text-red-400 font-semibold' : '') + '">follow up ' + esc(l.follow_up) + '</span>' : '') + '</div>';
    if (!isOpen) return '<div class="rounded-xl border border-line bg-slate2 p-3">' + head + '</div>';
    var photos = (l.photos && l.photos.length) ? '<div class="flex flex-wrap gap-2 mt-3">' + l.photos.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(u) + '" alt="Customer photo" class="w-24 h-24 rounded-lg object-cover"></a>'; }).join('') + '</div>' : '';
    var inp = 'bg-ink border border-line rounded-xl px-3 py-2 w-full text-sm';
    return '<div class="rounded-xl border border-ember/50 bg-slate2 p-3" data-card="' + l.id + '">' + head +
      (l.message ? '<div class="text-sm text-bone/60 mt-2">“' + esc(l.message) + '”</div>' : '') + (l.email ? '<div class="text-xs text-bone/50 mt-1">' + esc(l.email) + '</div>' : '') + photos +
      '<div class="flex flex-wrap gap-2 mt-3"><a class="rounded-full border border-line px-4 py-2 text-sm" href="tel:' + esc(l.phone) + '">Call</a><a class="rounded-full border border-line px-4 py-2 text-sm" href="sms:' + esc(l.phone) + '">Text</a><button data-log="' + l.id + '" class="rounded-full border border-line px-4 py-2 text-sm">Log a call</button></div>' +
      '<div class="grid grid-cols-3 gap-2 mt-3"><label class="text-xs text-bone/50">Quote $<input data-f="quote_amount" inputmode="decimal" value="' + (l.quote_amount == null ? '' : l.quote_amount) + '" class="' + inp + '"></label><label class="text-xs text-bone/50">Job $<input data-f="job_amount" inputmode="decimal" value="' + (l.job_amount == null ? '' : l.job_amount) + '" class="' + inp + '"></label><label class="text-xs text-bone/50">Follow up<input data-f="follow_up" type="date" value="' + esc(l.follow_up || '') + '" class="' + inp + '"></label></div>' +
      '<label class="block text-xs text-bone/50 mt-3">Notes<textarea data-f="notes" rows="4" class="' + inp + ' mt-1">' + esc(l.notes) + '</textarea></label>' +
      '<div class="flex items-center justify-between gap-3 mt-3"><button data-save="' + l.id + '" class="rounded-full bg-ember text-ink font-bold px-6 py-2.5">Save</button><button data-del="' + l.id + '" class="text-xs text-bone/40 underline">Delete lead</button></div></div>';
  }
  function render() {
    var list = visible(), keep = document.activeElement && document.activeElement.id === 'crmQ';
    root.innerHTML = tiles() +
      '<div class="flex flex-wrap gap-2 mb-3">' + chip('All', 'status', 'all') + Object.keys(STATUS).map(function (k) { return chip(STATUS[k] + ' ' + leads.filter(function (l) { return l.status === k; }).length, 'status', k); }).join('') + '</div>' +
      '<div class="flex flex-wrap gap-2 mb-4"><input id="crmQ" type="search" placeholder="Search name, phone, notes..." value="' + esc(filt.q) + '" class="bg-ink border border-line rounded-xl px-3 py-2 text-sm flex-1 min-w-[10rem]">' + sel('fSite', SITES, filt.site, 'All sites') + sel('fSrc', SOURCE, filt.source, 'All sources') + '<button id="crmAdd" class="rounded-full bg-ember text-ink font-bold px-5 py-2">+ Add lead</button></div>' +
      (filt.due ? '<p class="text-sm text-ember mb-3">Showing follow-ups due. <button data-chip="due:off" class="underline">Show all</button></p>' : '') +
      (toast ? '<p class="text-sm text-ember mb-3" role="status">' + esc(toast) + '</p>' : '') +
      '<div id="addBox"></div><div class="grid gap-2">' + (list.map(card).join('') || '<p class="text-bone/50">No leads match.</p>') + '</div><p class="text-xs text-bone/40 mt-6">' + list.length + ' of ' + leads.length + ' leads. Every quote request from all six sites lands here automatically.</p>';
    if (keep) { var q = document.getElementById('crmQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  function find(id) { return leads.filter(function (l) { return l.id === Number(id); })[0]; }
  function save(id, fields, msg) { return api('POST', { action: 'update', id: Number(id), fields: fields }).then(function () { toast = msg || 'Saved.'; return load(); }).catch(function (e) { toast = '⚠ ' + e.message; render(); }); }
  root.addEventListener('click', function (e) {
    var t = e.target.closest('button,a'); if (!t) return;
    if (t.dataset.f && !t.closest('[data-card]')) { var f = t.dataset.f; filt.status = 'all'; filt.due = false; if (f === 'due') filt.due = true; else filt.status = f; toast = ''; render(); return; }
    if (t.dataset.chip) { var p = t.dataset.chip.split(':'); if (p[0] === 'due') filt.due = false; else filt[p[0]] = p[1]; render(); return; }
    if (t.dataset.open) { open = open === Number(t.dataset.open) ? null : Number(t.dataset.open); toast = ''; render(); return; }
    if (t.id === 'crmAdd') { addForm(); return; }
    if (t.dataset.log) { var l = find(t.dataset.log), c = t.closest('[data-card]'), ta = c.querySelector('[data-f=notes]'), d = new Date(), stamp = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); var notes = (ta.value ? ta.value + '\n' : '') + stamp + ': called'; var fields = { notes: notes }; if (l.status === 'new') fields.status = 'contacted'; save(l.id, fields, 'Call logged.'); return; }
    if (t.dataset.save) { var c2 = t.closest('[data-card]'), fl = {}; c2.querySelectorAll('[data-f]').forEach(function (i) { fl[i.dataset.f] = i.value; }); save(t.dataset.save, fl); return; }
    if (t.dataset.del) { if (confirm('Delete this lead for good?')) api('POST', { action: 'delete', id: Number(t.dataset.del) }).then(function () { open = null; toast = 'Deleted.'; return load(); }); return; }
  });
  root.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.st) { save(t.dataset.st, { status: t.value }, 'Moved to ' + STATUS[t.value] + '.'); return; }
    if (t.id === 'fSite') { filt.site = t.value; render(); } if (t.id === 'fSrc') { filt.source = t.value; render(); }
  });
  root.addEventListener('input', function (e) { if (e.target.id === 'crmQ') { filt.q = e.target.value; render(); } });
  function addForm() {
    var inp = 'bg-ink border border-line rounded-xl px-3 py-2 w-full text-sm';
    document.getElementById('addBox').innerHTML = '<form id="addF" class="rounded-xl border border-ember/50 bg-slate2 p-3 grid gap-2 mb-3"><div class="font-semibold">Add a lead (phone call, text, referral)</div>' +
      '<div class="grid sm:grid-cols-2 gap-2"><input name="name" required placeholder="Name" class="' + inp + '"><input name="phone" required type="tel" placeholder="Phone" class="' + inp + '"><input name="service" placeholder="What they need" class="' + inp + '"><input name="city" placeholder="City" class="' + inp + '"></div>' +
      '<div class="grid grid-cols-2 gap-2"><select name="site" class="' + inp + '">' + Object.keys(SITES).map(function (k) { return '<option value="' + k + '">' + SITES[k] + '</option>'; }).join('') + '</select><select name="source" class="' + inp + '">' + Object.keys(SOURCE).map(function (k) { return '<option value="' + k + '"' + (k === 'phone' ? ' selected' : '') + '>' + SOURCE[k] + '</option>'; }).join('') + '</select></div>' +
      '<textarea name="message" rows="2" placeholder="Notes" class="' + inp + '"></textarea><div class="flex gap-3 items-center"><button class="rounded-full bg-ember text-ink font-bold px-6 py-2.5">Add lead</button><button type="button" id="addX" class="text-sm text-bone/50 underline">Cancel</button></div></form>';
    document.getElementById('addX').onclick = function () { document.getElementById('addBox').innerHTML = ''; };
    document.getElementById('addF').onsubmit = function (e) { e.preventDefault(); var d = Object.fromEntries(new FormData(e.target)); d.action = 'add'; api('POST', d).then(function (r) { open = r.id; filt.status = 'all'; toast = 'Lead added.'; return load(); }).catch(function (er) { alert(er.message); }); };
  }
  setInterval(function () { if (!document.hidden && !document.activeElement.closest('[data-card],#addF')) load(); }, 60000);
  if (pin) load(); else login();
})();
