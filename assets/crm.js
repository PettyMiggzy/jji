/* Junk Junkies CRM. Every quote request from every site, worked as a pipeline.
   Tabs: Today (what to do now), Pipeline (drag-and-drop board), Leads (search + export), Schedule (booked jobs by day), Insights (charts).
   Needs the admin PIN (same one as the dashboard). */
(() => {
  const root = document.getElementById('crmApp'); if (!root) return;
  const SITES = { spring: 'Spring', tomball: 'Tomball', cypress: 'Cypress', 'college-station': 'College Station', indiana: 'Indiana', florida: 'Florida' };
  const BIZ = { spring: 'Junk Junkies Texas Junk Removal Spring', tomball: 'Junk Junkies Texas Junk Removal Tomball', cypress: 'Junk Junkies Texas Junk Removal Cypress', 'college-station': 'Junk Junkies Texas Junk Removal College Station', indiana: 'Junk Junkies Indiana Junk Removal Indianapolis', florida: 'Junk Junkies' };
  const REVIEW = { indiana: 'https://search.google.com/local/writereview?placeid=ChIJR9GXKjKaGicRM3HzbjWXhoE' };
  const ORDER = ['new', 'contacted', 'quoted', 'booked', 'done', 'lost'];
  const STATUS = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', booked: 'Booked', done: 'Done', lost: 'Lost' };
  const SOURCE = { website: 'Website', ad: 'Google ad', phone: 'Phone call', referral: 'Referral', other: 'Other' };
  const SRC_COLOR = { website: '#3987e5', ad: '#d95926', phone: '#199e70', referral: '#c98500', other: '#d55181' }; // validated categorical slots 1-5 (dark surface)
  const LOST = ['price', 'no response', 'went elsewhere', 'not ready', 'outside area', 'other'];
  const TIERS = [[99, 'Small pickup'], [250, '25% of trailer'], [475, '50% of trailer'], [675, '75% of trailer'], [850, 'Full trailer']];
  const BLUE = '#3987e5', GRID = '#2c2c2a', MUTED = '#898781';
  let pin = ''; try { pin = sessionStorage.getItem('jjadmin') || ''; } catch (e) {}
  let drawerLead = null;
  const QSTAT = { draft: 'Draft', sent: 'Sent', approved: 'Approved', declined: 'Declined', changes_requested: 'Changes requested' }, ISTAT = { draft: 'Draft', sent: 'Unpaid', partial: 'Partly paid', paid: 'Paid', void: 'Void' };
  const PAYM = ['cash', 'check', 'card', 'zelle', 'cash app', 'venmo', 'other'];
  const LOADS = [['Small pickup (minimum)', 99], ['Quarter trailer load', 250], ['Half trailer load', 475], ['Three-quarter trailer load', 675], ['Full trailer load', 850]];
  const S = { leads: [], crew: [], tab: 'today', open: null, adding: false, events: {}, toast: '', f: { status: 'all', site: 'all', source: 'all', q: '' }, tpl: '', loaded: false, docs: {}, builder: null, payFor: null };
  try { S.tab = sessionStorage.getItem('jjcrmtab') || 'today'; } catch (e) {}

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => n == null || n === '' ? '' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const num = n => Number(n) || 0;
  const moneyC = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const calc = (items, dp, tp) => { const sub = r2(items.reduce((a, i) => a + num(i.qty) * num(i.price), 0)), disc = r2(sub * num(dp) / 100), taxable = r2(sub - disc), tax = r2(taxable * num(tp) / 100); return { subtotal: sub, discount: disc, tax, total: r2(taxable + tax) }; };
  const mins = d => (Date.now() - new Date(d)) / 60000;
  const dur = m => m < 60 ? Math.max(1, Math.round(m)) + ' min' : m < 1440 ? Math.round(m / 60) + ' hr' : Math.round(m / 1440) + ' day' + (Math.round(m / 1440) === 1 ? '' : 's');
  const ago = d => dur(mins(d)) + ' ago';
  const pad = n => ('0' + n).slice(-2);
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  const fmtDT = d => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtDay = d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = d => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const localInput = iso => { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const digits = p => String(p || '').replace(/\D/g, '').slice(-10);
  const first = n => String(n || '').trim().split(/\s+/)[0] || 'there';
  const byId = id => S.leads.find(l => l.id === Number(id));
  const isOpenLead = l => l.status !== 'done' && l.status !== 'lost';
  const lastTouch = l => l.last_activity || l.contacted_at || l.created_at;
  const sum = (arr, k) => arr.reduce((a, l) => a + num(l[k]), 0);

  async function api(method, body, qs) {
    const r = await fetch('/api/crm' + (qs || ''), { method, headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j;
  }
  function login(msg) {
    root.innerHTML = '<form id="lf" class="max-w-sm mx-auto grid gap-3"><input id="lp" type="password" placeholder="Admin PIN" autocomplete="off" class="bg-ink border border-line rounded-xl px-4 py-3"><button class="rounded-full bg-ember text-ink font-bold px-6 py-3">Open CRM</button><p class="text-sm text-bone/60">' + esc(msg || '') + '</p></form>';
    document.getElementById('lf').onsubmit = e => { e.preventDefault(); pin = document.getElementById('lp').value; load(); };
  }
  async function load(quiet) {
    try {
      const d = await api('GET'); try { sessionStorage.setItem('jjadmin', pin); } catch (e) {}
      S.leads = d.leads; S.docs.all = d.docs || { quotes: [], invoices: [] }; S.crew = d.crew || []; S.loaded = true;
      const nNew = S.leads.filter(l => l.status === 'new').length; document.title = (nNew ? '(' + nNew + ') ' : '') + 'STAGR';
      if (!root.querySelector('#crmMain')) shell();
      if (quiet && S.open) return; // do not redraw under someone who is editing
      renderMain(); renderDrawer();
    } catch (e) {
      if (/PIN/.test(e.message)) { pin = ''; S.loaded = false; try { sessionStorage.removeItem('jjadmin'); } catch (x) {} login(e.message); } // wrong or changed PIN: stop retrying so the lockout never trips on its own
      else if (!S.loaded) login(e.message); else { S.toast = '⚠ ' + e.message; renderMain(); }
    }
  }
  function say(t) { S.toast = t; const el = document.getElementById('crmToast'); if (el) { el.textContent = t; el.classList.toggle('hidden', !t); } clearTimeout(say.t); if (t) say.t = setTimeout(() => say(''), 4000); }

  /* ---------- shell ---------- */
  const TABS = [['today', 'Today'], ['pipeline', 'Pipeline'], ['leads', 'Leads'], ['schedule', 'Schedule'], ['insights', 'Insights']];
  function shell() {
    root.innerHTML = '<div class="flex flex-wrap items-center justify-between gap-3 mb-5"><div id="crmTabs" class="flex gap-1 overflow-x-auto rounded-full border border-line p-1 bg-slate2"></div><div class="flex items-center gap-2"><button id="crmAddBtn" class="rounded-full bg-ember text-ink font-bold px-5 py-2.5">+ Add lead</button><button id="crmRefresh" class="rounded-full border border-line px-4 py-2.5 text-sm" aria-label="Refresh">↻</button></div></div>' +
      '<p id="crmToast" class="hidden text-sm text-ember mb-3" role="status"></p><div id="crmMain"></div><div id="crmDrawer"></div><div id="crmTip" class="hidden fixed z-[80] pointer-events-none rounded-lg border border-line bg-ink px-3 py-2 text-xs shadow-xl"></div>';
  }
  function tabs() {
    const nNew = S.leads.filter(l => l.status === 'new').length;
    document.getElementById('crmTabs').innerHTML = TABS.map(([k, label]) => '<button data-tab="' + k + '" class="whitespace-nowrap rounded-full px-4 py-2 text-sm ' + (S.tab === k ? 'bg-ember text-ink font-bold' : 'text-bone/70') + '">' + label + (k === 'today' && nNew ? ' <span class="ml-1 rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5">' + nNew + '</span>' : '') + '</button>').join('');
  }
  function renderMain() {
    if (!document.getElementById('crmMain')) return; tabs();
    const v = { today: viewToday, pipeline: viewPipeline, leads: viewLeads, schedule: viewSchedule, insights: viewInsights }[S.tab] || viewToday;
    const keep = document.activeElement && document.activeElement.id === 'crmQ';
    document.getElementById('crmMain').innerHTML = v();
    if (S.toast) { const el = document.getElementById('crmToast'); el.textContent = S.toast; el.classList.remove('hidden'); }
    if (keep) { const q = document.getElementById('crmQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
    if (S.tab === 'pipeline') wireBoard();
  }

  /* ---------- small building blocks ---------- */
  const badge = (txt, cls) => '<span class="inline-block rounded-full border px-2 py-0.5 text-xs ' + (cls || 'border-line text-bone/60') + '">' + txt + '</span>';
  const waitingHtml = l => l.status === 'new' && mins(l.created_at) > 15 ? '<span class="text-red-400 font-bold text-xs">⚠ Waiting ' + dur(mins(l.created_at)) + '</span>' : '<span class="text-xs text-bone/50">' + ago(l.created_at) + '</span>';
  function repeatCount(l) { const d = digits(l.phone); return d.length < 7 ? 0 : S.leads.filter(x => x.id !== l.id && digits(x.phone) === d).length; }
  function leadCard(l, extra) {
    const rc = repeatCount(l);
    return '<button data-open="' + l.id + '" class="w-full text-left rounded-xl border border-line bg-slate2 p-3 hover:border-ember/60"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="font-semibold truncate">' + esc(l.name) + (rc ? ' ' + badge('Repeat customer', 'border-ember/50 text-ember') : '') + '</div><div class="text-sm text-bone/70 truncate">' + esc([l.service, l.city].filter(Boolean).join(' · ') || 'No details yet') + '</div></div><div class="text-right shrink-0">' + waitingHtml(l) + '<div class="text-xs text-bone/50 mt-0.5">' + esc(SITES[l.site] || l.site) + '</div></div></div>' +
      '<div class="flex flex-wrap items-center gap-2 mt-2 text-xs text-bone/60">' + badge(STATUS[l.status]) + badge(SOURCE[l.source] || l.source) + (l.quote_amount != null ? '<span>quote ' + money(l.quote_amount) + '</span>' : '') + (l.job_amount != null ? '<span>job ' + money(l.job_amount) + '</span>' : '') + (l.scheduled_for ? '<span>📅 ' + fmtDT(l.scheduled_for) + '</span>' : '') + (l.assigned ? '<span>👷 ' + esc(l.assigned) + '</span>' : '') + (extra || '') + '</div></button>';
  }
  const section = (title, sub, list, empty) => '<section class="mb-8"><div class="flex items-baseline justify-between gap-3 mb-2"><h2 class="display text-xl font-extrabold">' + title + ' <span class="text-bone/40 text-base font-normal">' + list.length + '</span></h2><span class="text-xs text-bone/50 text-right">' + sub + '</span></div><div class="grid gap-2 md:grid-cols-2">' + (list.length ? list.join('') : '<p class="text-bone/50 text-sm">' + empty + '</p>') + '</div></section>';
  const tile = (label, big, small, hot, tab) => '<button ' + (tab ? 'data-tab="' + tab + '"' : '') + ' class="text-left rounded-2xl border ' + (hot ? 'border-red-500/60' : 'border-line') + ' bg-slate2 p-4"><div class="text-xs text-bone/50">' + label + '</div><div class="display text-3xl font-extrabold ' + (hot ? 'text-red-400' : '') + '">' + big + '</div><div class="text-xs text-bone/50">' + small + '</div></button>';

  /* ---------- TODAY ---------- */
  function todayBuckets() {
    const t = today(), tmr = ymd(new Date(Date.now() + 864e5));
    const callNow = S.leads.filter(l => l.status === 'new').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const due = S.leads.filter(l => l.follow_up && l.follow_up <= t && isOpenLead(l)).sort((a, b) => a.follow_up.localeCompare(b.follow_up));
    const jobs = S.leads.filter(l => l.status === 'booked' && l.scheduled_for && [t, tmr].includes(ymd(new Date(l.scheduled_for)))).sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
    const dueIds = new Set(due.map(l => l.id));
    const cold = S.leads.filter(l => l.status === 'quoted' && !dueIds.has(l.id) && mins(lastTouch(l)) > 3 * 1440).sort((a, b) => new Date(lastTouch(a)) - new Date(lastTouch(b)));
    const unscheduled = S.leads.filter(l => l.status === 'booked' && !l.scheduled_for);
    const D = S.docs.all || { quotes: [], invoices: [] }, lead = id => byId(id);
    const approved = D.quotes.filter(q => q.status === 'approved' && lead(q.lead_id) && lead(q.lead_id).status === 'booked' && !lead(q.lead_id).scheduled_for).map(q => ({ l: lead(q.lead_id), q }));
    const changes = D.quotes.filter(q => q.status === 'changes_requested' && lead(q.lead_id)).map(q => ({ l: lead(q.lead_id), q }));
    const unpaid = D.invoices.filter(v => ['sent', 'partial'].includes(v.status) && v.balance > 0 && lead(v.lead_id)).map(v => ({ l: lead(v.lead_id), v })).sort((a, b) => (a.v.due || '9') .localeCompare(b.v.due || '9'));
    return { callNow, due, jobs, cold, unscheduled, approved, changes, unpaid };
  }
  function viewToday() {
    const b = todayBuckets(), oldest = b.callNow.length ? mins(b.callNow[0].created_at) : 0;
    const hr = new Date().getHours(), hello = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const all = b.callNow.length + b.due.length + b.jobs.length + b.cold.length + b.approved.length + b.changes.length + b.unpaid.length;
    return '<div class="mb-6"><div class="display text-2xl font-extrabold">' + hello + '.</div><p class="text-bone/60">' + (all ? 'Here is what needs you right now.' : 'Nothing is waiting on you. Nice.') + '</p></div>' +
      '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">' +
      tile('Call now', b.callNow.length, b.callNow.length ? 'oldest waiting ' + dur(oldest) : 'all caught up', b.callNow.length > 0 && oldest > 15) +
      tile('Follow-ups due', b.due.length, 'today or overdue', b.due.length > 0) +
      tile('Jobs today + tomorrow', b.jobs.length, b.jobs.length ? money(sum(b.jobs, 'job_amount')) + ' booked' : 'nothing scheduled', false, 'schedule') +
      tile('Quotes going cold', b.cold.length, 'no contact in 3+ days', b.cold.length > 0) + '</div>' +
      section('✅ Approved quotes: schedule them', 'The customer said yes. Pick a date and crew.', b.approved.map(x => leadCard(x.l, '<span class="text-ember">' + x.q.number + ' approved · ' + moneyC(x.q.total) + '</span>')), 'No approved quotes waiting to be scheduled.') +
      section('📞 Call now', 'Fast replies win jobs. Red means waiting over 15 minutes.', b.callNow.map(l => leadCard(l)), 'Every new lead has been contacted.') +
      section('⏰ Follow-ups due', 'Set from a lead when you quote it.', b.due.map(l => leadCard(l, '<span class="text-red-300">follow up ' + esc(l.follow_up) + '</span>')), 'No follow-ups due.') +
      section('💬 Customer asked for changes', 'They answered your quote with a request.', b.changes.map(x => leadCard(x.l, '<span class="text-amber-300">' + x.q.number + (x.q.client_note ? ': “' + esc(x.q.client_note.slice(0, 60)) + '”' : '') + '</span>')), 'No change requests.') +
      section('🚛 Jobs today and tomorrow', b.unscheduled.length ? '⚠ ' + b.unscheduled.length + ' booked job(s) have no date yet' : 'Scheduled and assigned', b.jobs.map(l => leadCard(l)), 'No jobs on the schedule for the next two days.') +
      section('💵 Unpaid invoices', 'Money you are still waiting on.', b.unpaid.map(x => leadCard(x.l, '<span class="' + (x.v.due && x.v.due < today() ? 'text-red-300 font-semibold' : 'text-bone/70') + '">' + x.v.number + ' · balance ' + moneyC(x.v.balance) + (x.v.due ? ' · due ' + esc(x.v.due) : '') + '</span>')), 'Nothing unpaid. 🎉') +
      section('🧊 Quotes going cold', 'Quoted, but nobody has touched them in over 3 days.', b.cold.map(l => leadCard(l, '<span class="text-amber-300">quiet for ' + dur(mins(lastTouch(l))) + '</span>')), 'No cold quotes.');
  }

  /* ---------- PIPELINE (board) ---------- */
  function viewPipeline() {
    const cols = ORDER.map(st => {
      let items = S.leads.filter(l => l.status === st); if (st === 'done' || st === 'lost') items = items.slice(0, 15);
      const total = st === 'quoted' ? money(sum(S.leads.filter(l => l.status === st), 'quote_amount')) : (st === 'booked' || st === 'done') ? money(sum(S.leads.filter(l => l.status === st), 'job_amount')) : '';
      return '<div data-col="' + st + '" class="snap-start shrink-0 w-[82vw] sm:w-72 rounded-2xl border border-line bg-ink/60 p-2"><div class="flex items-center justify-between px-2 py-2"><div class="font-semibold">' + STATUS[st] + ' <span class="text-bone/40 font-normal">' + S.leads.filter(l => l.status === st).length + '</span></div><div class="text-xs text-bone/50">' + total + '</div></div><div class="grid gap-2 min-h-[4rem]">' +
        (items.map(l => '<div draggable="true" data-drag="' + l.id + '">' + leadCard(l) + '</div>').join('') || '<p class="text-xs text-bone/40 px-2 pb-2">Drop a lead here</p>') + '</div></div>';
    }).join('');
    return '<p class="text-sm text-bone/60 mb-3">Drag a lead to move it along, or tap it to open. Swipe sideways on a phone.</p><div class="flex gap-3 overflow-x-auto snap-x pb-4">' + cols + '</div>';
  }
  function wireBoard() {
    document.querySelectorAll('[data-drag]').forEach(el => el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', el.dataset.drag); e.dataTransfer.effectAllowed = 'move'; }));
    document.querySelectorAll('[data-col]').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('border-ember'); });
      col.addEventListener('dragleave', () => col.classList.remove('border-ember'));
      col.addEventListener('drop', async e => {
        e.preventDefault(); col.classList.remove('border-ember'); const l = byId(e.dataTransfer.getData('text/plain')), st = col.dataset.col; if (!l || l.status === st) return;
        await save(l.id, { status: st }, 'Moved ' + l.name + ' to ' + STATUS[st] + '.'); if (st === 'lost' || st === 'booked') openLead(l.id);
      });
    });
  }

  /* ---------- LEADS (list) ---------- */
  function filtered() {
    const q = S.f.q.toLowerCase();
    return S.leads.filter(l => (S.f.status === 'all' || l.status === S.f.status) && (S.f.site === 'all' || l.site === S.f.site) && (S.f.source === 'all' || l.source === S.f.source) &&
      (!q || [l.name, l.phone, l.email, l.service, l.city, l.zip, l.address, l.notes, l.message].join(' ').toLowerCase().includes(q)));
  }
  const sel = (id, opts, cur, all) => '<select id="' + id + '" class="bg-ink border border-line rounded-xl px-3 py-2 text-sm"><option value="all">' + all + '</option>' + Object.keys(opts).map(k => '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + esc(opts[k]) + '</option>').join('') + '</select>';
  function viewLeads() {
    const list = filtered();
    const chips = ['all'].concat(ORDER).map(k => '<button data-fstatus="' + k + '" class="rounded-full border px-3 py-1.5 text-sm ' + (S.f.status === k ? 'bg-ember text-ink border-ember font-bold' : 'border-line text-bone/70') + '">' + (k === 'all' ? 'All ' + S.leads.length : STATUS[k] + ' ' + S.leads.filter(l => l.status === k).length) + '</button>').join('');
    return '<div class="flex flex-wrap gap-2 mb-3">' + chips + '</div><div class="flex flex-wrap gap-2 mb-4"><input id="crmQ" type="search" placeholder="Search name, phone, address, notes..." value="' + esc(S.f.q) + '" class="bg-ink border border-line rounded-xl px-3 py-2 text-sm flex-1 min-w-[12rem]">' + sel('fSite', SITES, S.f.site, 'All sites') + sel('fSrc', SOURCE, S.f.source, 'All sources') + '<button id="crmCsv" class="rounded-full border border-line px-4 py-2 text-sm">Export CSV</button></div>' +
      '<div class="grid gap-2 md:grid-cols-2">' + (list.map(l => leadCard(l)).join('') || '<p class="text-bone/50">No leads match.</p>') + '</div><p class="text-xs text-bone/40 mt-6">' + list.length + ' of ' + S.leads.length + ' leads. Every quote request from all six sites lands here automatically.</p>';
  }
  function exportCsv() {
    const cols = ['id', 'received', 'site', 'source', 'name', 'phone', 'email', 'service', 'city', 'zip', 'address', 'status', 'quote', 'job_amount', 'scheduled_for', 'assigned', 'follow_up', 'lost_reason', 'notes'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = filtered().map(l => [l.id, new Date(l.created_at).toISOString(), l.site, l.source, l.name, l.phone, l.email, l.service, l.city, l.zip, l.address, l.status, l.quote_amount, l.job_amount, l.scheduled_for, l.assigned, l.follow_up, l.lost_reason, l.notes].map(q).join(','));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([cols.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' })); a.download = 'junk-junkies-leads-' + today() + '.csv'; a.click();
  }

  /* ---------- SCHEDULE ---------- */
  function viewSchedule() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const jobs = S.leads.filter(l => l.status === 'booked' && l.scheduled_for && new Date(l.scheduled_for) >= start).sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
    const unsched = S.leads.filter(l => l.status === 'booked' && !l.scheduled_for);
    const wk = jobs.filter(l => new Date(l.scheduled_for) < new Date(start.getTime() + 7 * 864e5));
    const groups = {}; jobs.forEach(l => { const k = ymd(new Date(l.scheduled_for)); (groups[k] = groups[k] || []).push(l); });
    const label = k => k === today() ? 'Today' : k === ymd(new Date(Date.now() + 864e5)) ? 'Tomorrow' : fmtDay(k + 'T12:00:00');
    return '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">' + tile('Next 7 days', wk.length + ' jobs', money(sum(wk, 'job_amount')) + ' booked', false) + tile('Needs a date', unsched.length, 'booked, not scheduled', unsched.length > 0) + tile('Crew', S.crew.length || '—', S.crew.length ? 'active crew codes' : 'add codes on the dashboard', false) + tile('All upcoming', jobs.length, money(sum(jobs, 'job_amount')) + ' total', false) + '</div>' +
      (unsched.length ? section('⚠ Booked but no date', 'Open each one and pick a date and crew.', unsched.map(l => leadCard(l)), '') : '') +
      (Object.keys(groups).sort().map(k => '<section class="mb-6"><h2 class="display text-lg font-extrabold mb-2">' + label(k) + ' <span class="text-bone/40 font-normal text-sm">' + fmtDay(k + 'T12:00:00') + ' · ' + groups[k].length + ' job' + (groups[k].length > 1 ? 's' : '') + '</span></h2><div class="grid gap-2 md:grid-cols-2">' +
        groups[k].map(l => '<button data-open="' + l.id + '" class="text-left rounded-xl border border-line bg-slate2 p-3 hover:border-ember/60 flex gap-3"><div class="display font-extrabold text-ember w-20 shrink-0">' + fmtTime(l.scheduled_for) + '</div><div class="min-w-0"><div class="font-semibold truncate">' + esc(l.name) + '</div><div class="text-sm text-bone/70 truncate">' + esc([l.service, l.address || l.city].filter(Boolean).join(' · ')) + '</div><div class="text-xs text-bone/50 mt-1">' + (l.assigned ? '👷 ' + esc(l.assigned) : '<span class="text-amber-300">⚠ No crew assigned</span>') + (l.job_amount != null ? ' · ' + money(l.job_amount) : '') + '</div></div></button>').join('') + '</div></section>').join('') || '<p class="text-bone/50">Nothing is scheduled yet. Open a booked lead and set a date.</p>');
  }

  /* ---------- INSIGHTS ---------- */
  const tipAttr = t => ' data-tip="' + esc(t) + '"';
  function vcols(data, opt) { // data: [{label, value, tip}]  -> thin rounded columns, baseline-anchored
    const W = 640, H = 190, L = 34, B = 24, T = 10, n = data.length, max = Math.max(1, ...data.map(d => d.value)), niceMax = Math.max(3, Math.ceil(max / 3) * 3);
    const top = opt && opt.money ? Math.max(1, max * 1.1) : niceMax, step = (W - L) / n, bw = Math.min(14, step * 0.6), ph = H - B - T;
    let g = '', bars = '';
    for (let i = 0; i <= 3; i++) { const y = T + ph - ph * i / 3, val = top * i / 3; g += '<line x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="' + GRID + '" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="' + MUTED + '">' + (opt && opt.money ? (val >= 1000 ? '$' + Math.round(val / 100) / 10 + 'k' : '$' + Math.round(val)) : Math.round(val)) + '</text>'; }
    data.forEach((d, i) => {
      const x = L + step * i + (step - bw) / 2, h = d.value ? Math.max(3, ph * d.value / top) : 0, y = T + ph - h;
      bars += '<g' + tipAttr(d.tip) + ' class="cursor-pointer"><rect x="' + (L + step * i) + '" y="' + T + '" width="' + step + '" height="' + ph + '" fill="transparent"/>' + (h ? '<path d="M' + x + ' ' + (T + ph) + 'V' + (y + 4) + 'Q' + x + ' ' + y + ' ' + (x + 4) + ' ' + y + 'H' + (x + bw - 4) + 'Q' + (x + bw) + ' ' + y + ' ' + (x + bw) + ' ' + (y + 4) + 'V' + (T + ph) + 'Z" fill="' + BLUE + '"/>' : '') + '</g>';
      if (d.label) bars += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="' + MUTED + '">' + esc(d.label) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto" role="img" aria-label="' + esc(opt.aria) + '">' + g + '<line x1="' + L + '" x2="' + W + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="#383835"/>' + bars + '</svg>';
  }
  function hbars(rows, color) { // rows: [{label, value, text}] direct-labelled
    const max = Math.max(1, ...rows.map(r => r.value));
    return rows.length ? '<div class="grid gap-2">' + rows.map(r => '<div' + tipAttr(r.label + ': ' + (r.text || r.value)) + '><div class="flex justify-between text-sm"><span class="truncate pr-2">' + esc(r.label) + '</span><span class="text-bone/70">' + esc(r.text || r.value) + '</span></div><div class="h-2.5 mt-1 rounded-full bg-line/60"><div class="h-2.5 rounded-full" style="width:' + Math.max(2, r.value / max * 100) + '%;background:' + (color || BLUE) + '"></div></div></div>').join('') + '</div>' : '<p class="text-sm text-bone/50">Nothing yet.</p>';
  }
  const card = (title, sub, body, table) => '<section class="rounded-2xl border border-line bg-slate2 p-4"><h3 class="display font-extrabold">' + title + '</h3><p class="text-xs text-bone/50 mb-3">' + sub + '</p>' + body + (table ? '<details class="mt-3"><summary class="text-xs text-bone/50 cursor-pointer">View as table</summary><table class="w-full text-xs mt-2">' + table.map(r => '<tr class="border-t border-line"><td class="py-1 text-bone/70">' + esc(r[0]) + '</td><td class="py-1 text-right">' + esc(r[1]) + '</td></tr>').join('') + '</table></details>' : '') + '</section>';
  function viewInsights() {
    const now = Date.now(), L = S.leads, DAY = 864e5;
    const inRange = (l, a, b) => { const t = new Date(l.created_at).getTime(); return t >= now - b * DAY && t < now - a * DAY; };
    const l30 = L.filter(l => inRange(l, 0, 30)), l60 = L.filter(l => inRange(l, 30, 60));
    const won = L.filter(l => l.status === 'booked' || l.status === 'done'), lost = L.filter(l => l.status === 'lost');
    const decided = won.length + lost.length, rate = decided ? Math.round(won.length / decided * 100) : null;
    const jobsAmt = won.filter(l => l.job_amount != null), avg = jobsAmt.length ? sum(jobsAmt, 'job_amount') / jobsAmt.length : null;
    const resp = L.filter(l => l.contacted_at).map(l => (new Date(l.contacted_at) - new Date(l.created_at)) / 60000).filter(m => m >= 0).sort((a, b) => a - b);
    const med = resp.length ? resp[Math.floor(resp.length / 2)] : null, fast = resp.length ? Math.round(resp.filter(m => m <= 15).length / resp.length * 100) : null;
    const delta = l60.length ? Math.round((l30.length - l60.length) / l60.length * 100) : null;
    const DQ = (S.docs.all || { quotes: [] }).quotes, DI = (S.docs.all || { invoices: [] }).invoices.filter(v => v.status !== 'void'), moneyD = n => n ? moneyC(n) : '$0', sentQ = DQ.filter(q => q.status !== 'draft').length, qRate = sentQ ? Math.round(DQ.filter(q => q.status === 'approved').length / sentQ * 100) : null;
    const kpi = (label, big, small) => '<div class="rounded-2xl border border-line bg-slate2 p-4"><div class="text-xs text-bone/50">' + label + '</div><div class="display text-3xl sm:text-4xl font-extrabold">' + big + '</div><div class="text-xs text-bone/50">' + small + '</div></div>';
    const kpis = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">' +
      kpi('Leads, last 30 days', l30.length, delta == null ? 'no earlier data yet' : (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta) + '% vs the 30 days before') +
      kpi('Won revenue', money(sum(won, 'job_amount')) || '$0', won.length + ' booked or done job' + (won.length === 1 ? '' : 's')) +
      kpi('Win rate', rate == null ? '—' : rate + '%', decided ? won.length + ' won, ' + lost.length + ' lost' : 'needs a won or lost lead') +
      kpi('Average job', avg == null ? '—' : money(avg), jobsAmt.length ? 'across ' + jobsAmt.length + ' priced jobs' : 'add job amounts to see this') +
      kpi('Median reply time', med == null ? '—' : dur(med), fast == null ? 'no contacted leads yet' : fast + '% answered within 15 min') +
      kpi('Open quotes', money(sum(L.filter(l => l.status === 'quoted'), 'quote_amount')) || '$0', L.filter(l => l.status === 'quoted').length + ' waiting on a decision') +
      kpi('Collected', moneyD(sum(DI, 'paid')), DI.filter(v => v.paid > 0).length + ' invoice' + (DI.filter(v => v.paid > 0).length === 1 ? '' : 's') + ' with payments') +
      kpi('Unpaid invoices', moneyD(sum(DI.filter(v => ['sent', 'partial'].includes(v.status)), 'balance')), DI.filter(v => ['sent', 'partial'].includes(v.status)).length + ' waiting on payment' + (DI.filter(v => ['sent', 'partial'].includes(v.status) && v.due && v.due < today()).length ? ', ' + DI.filter(v => ['sent', 'partial'].includes(v.status) && v.due && v.due < today()).length + ' overdue' : '')) +
      kpi('Quote approval rate', qRate == null ? '—' : qRate + '%', DQ.filter(q => q.status === 'approved').length + ' approved of ' + DQ.filter(q => q.status !== 'draft').length + ' sent') + '</div>';
    // leads per day (30)
    const days = []; for (let i = 29; i >= 0; i--) { const d = new Date(now - i * DAY), k = ymd(d); days.push({ k, label: i % 7 === 0 ? (d.getMonth() + 1) + '/' + d.getDate() : '', value: L.filter(l => ymd(new Date(l.created_at)) === k).length }); }
    days.forEach(d => d.tip = fmtDay(d.k + 'T12:00:00') + ': ' + d.value + ' lead' + (d.value === 1 ? '' : 's'));
    // funnel
    const reach = [['Leads received', L.length], ['Contacted', L.filter(l => l.contacted_at || l.status !== 'new').length], ['Quoted', L.filter(l => ['quoted', 'booked', 'done'].includes(l.status) || l.quote_amount != null).length], ['Booked', won.length], ['Done', L.filter(l => l.status === 'done').length]];
    const fmax = Math.max(1, reach[0][1]);
    const funnel = '<div class="grid gap-2">' + reach.map((r, i) => '<div' + tipAttr(r[0] + ': ' + r[1]) + '><div class="flex justify-between text-sm"><span>' + r[0] + '</span><span class="text-bone/70">' + r[1] + (i && reach[i - 1][1] ? ' · ' + Math.round(r[1] / reach[i - 1][1] * 100) + '% of previous' : '') + '</span></div><div class="h-6 mt-1 rounded-md bg-line/60"><div class="h-6 rounded-md" style="width:' + Math.max(1.5, r[1] / fmax * 100) + '%;background:' + BLUE + '"></div></div></div>').join('') + '</div>';
    // sources (stacked, direct labels + legend)
    const srcCounts = Object.keys(SOURCE).map(k => [k, L.filter(l => l.source === k).length]).filter(r => r[1]);
    const stack = srcCounts.length ? '<div class="flex gap-0.5 h-8 rounded-md overflow-hidden">' + srcCounts.map(r => '<div' + tipAttr(SOURCE[r[0]] + ': ' + r[1] + ' (' + Math.round(r[1] / L.length * 100) + '%)') + ' style="flex:' + r[1] + ';background:' + SRC_COLOR[r[0]] + ';min-width:6px" class="rounded-[3px]"></div>').join('') + '</div><div class="grid gap-1.5 mt-3">' + srcCounts.map(r => '<div class="flex items-center justify-between text-sm"><span class="flex items-center gap-2"><span class="inline-block w-3 h-3 rounded-sm" style="background:' + SRC_COLOR[r[0]] + '"></span>' + SOURCE[r[0]] + '</span><span class="text-bone/70">' + r[1] + ' · ' + Math.round(r[1] / L.length * 100) + '%</span></div>').join('') + '</div>' : '<p class="text-sm text-bone/50">Nothing yet.</p>';
    const count = (arr, f) => { const m = {}; arr.forEach(l => { const k = f(l); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const bySite = count(L, l => SITES[l.site] || l.site), bySvc = count(L, l => l.service).slice(0, 8), lostWhy = count(lost, l => l.lost_reason || 'no reason given');
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => ({ label: d, value: L.filter(l => new Date(l.created_at).getDay() === i).length }));
    // revenue by month (last 6)
    const months = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'short' }) }); }
    months.forEach(mo => { const inM = won.filter(l => { const d = new Date(l.scheduled_for || l.created_at); return d.getFullYear() === mo.y && d.getMonth() === mo.m; }); mo.value = sum(inM, 'job_amount'); mo.jobs = inM.length; mo.tip = mo.label + ' ' + mo.y + ': ' + money(mo.value) + ' from ' + mo.jobs + ' job' + (mo.jobs === 1 ? '' : 's'); });
    return kpis + '<div class="grid lg:grid-cols-2 gap-4 items-start">' +
      card('Leads per day', 'Last 30 days. Hover or tap a bar.', vcols(days, { aria: 'Leads per day for the last 30 days' }), days.slice(-10).reverse().map(d => [fmtDay(d.k + 'T12:00:00'), d.value]).concat([['30-day total', l30.length]])) +
      card('Pipeline funnel', 'How far leads get. Fix the biggest drop first.', funnel, reach.map(r => [r[0], r[1]])) +
      card('Where leads come from', 'Google ads vs the website vs phone calls.', stack, srcCounts.map(r => [SOURCE[r[0]], r[1]])) +
      card('Won revenue by month', 'Booked and done jobs, by job date.', vcols(months, { money: true, aria: 'Won revenue by month' }), months.map(m => [m.label + ' ' + m.y, money(m.value)])) +
      card('Leads by location', 'Which site brings the work.', hbars(bySite.map(r => ({ label: r[0], value: r[1] }))), bySite) +
      card('Top services requested', 'What people ask for most.', hbars(bySvc.map(r => ({ label: r[0], value: r[1] }))), bySvc) +
      card('Leads by weekday', 'When customers reach out.', hbars(wd.map(r => ({ label: r.label, value: r.value }))), wd.map(r => [r.label, r.value])) +
      card('Why we lose jobs', 'Mark a lead Lost and pick the reason.', hbars(lostWhy.map(r => ({ label: r[0], value: r[1] })), '#d95926'), lostWhy) + '</div>';
  }

  /* ---------- DRAWER (lead detail) ---------- */
  const EVICON = { created: '✨', call: '📞', note: '📝', status: '🔁', quote: '💲', job: '💲', schedule: '📅', assign: '👷', followup: '⏰', lost: '✖', quote_draft: '🧾', quote_sent: '📤', quote_viewed: '👀', quote_approved: '✅', quote_declined: '🚫', quote_changes: '💬', invoice_draft: '🧾', invoice_sent: '📤', invoice_viewed: '👀', payment: '💵', invoice_void: '✖' };
  function evText(e) {
    const t = e.text;
    return { created: 'Lead received' + (t ? ' (' + (SOURCE[t] || t) + ')' : ''), call: t ? 'Called: ' + t : 'Called', note: t, status: (() => { const p = t.split('|'); return 'Moved from ' + (STATUS[p[0]] || p[0]) + ' to ' + (STATUS[p[1]] || p[1]); })(),
      quote: t ? 'Quote set to ' + money(t) : 'Quote cleared', job: t ? 'Job amount set to ' + money(t) : 'Job amount cleared', schedule: t ? 'Scheduled for ' + fmtDT(t) : 'Schedule cleared', assign: t ? 'Assigned to ' + t : 'Unassigned', followup: t ? 'Follow-up set for ' + t : 'Follow-up cleared', lost: 'Marked lost: ' + t,
      quote_draft: 'Quote ' + t + ' drafted', quote_sent: (() => { const p = t.split('|'); return 'Quote ' + p[0] + ' sent (' + moneyC(p[1]) + ')'; })(), quote_viewed: 'Customer opened the quote', quote_approved: (() => { const p = t.split('|'); return 'Quote ' + p[0] + ' approved by ' + (p[1] === 'owner' ? 'you (by phone)' : p[1]); })(), quote_declined: 'Quote declined', quote_changes: 'Customer asked for changes: ' + (t.split('|')[1] || ''),
      invoice_draft: 'Invoice ' + t + ' drafted', invoice_sent: (() => { const p = t.split('|'); return 'Invoice ' + p[0] + ' sent (' + moneyC(p[1]) + ')'; })(), invoice_viewed: 'Customer opened the invoice', payment: (() => { const p = t.split('|'); return 'Payment ' + moneyC(p[1]) + ' by ' + p[2] + ' on ' + p[0]; })(), invoice_void: 'Invoice ' + t + ' voided' }[e.kind] || t;
  }
  function templates(l) {
    const f = first(l.name), svc = (l.service || 'junk removal').toLowerCase(), biz = BIZ[l.site] || 'Junk Junkies', q = l.quote_amount != null ? money(l.quote_amount) : '[price]', when = l.scheduled_for ? fmtDT(l.scheduled_for) : '[date and time]';
    return [
      ['First reply', 'Hi ' + f + ', this is ' + biz + '. Thanks for reaching out about ' + svc + '! Can you text a few photos of everything you want gone? I will send you a firm price right away.'],
      ['Send the quote', 'Hi ' + f + ', based on what you sent, your price is ' + q + ' for loading, hauling and cleanup. Want me to put you on the schedule? We take 10% off for seniors, veterans and first responders.'],
      ['Quote follow-up', 'Hi ' + f + ', just checking in on your ' + svc + ' quote of ' + q + '. Still need it gone? I can fit you in this week.'],
      ['Confirm booking', 'Hi ' + f + ', you are on the schedule for ' + when + '. We will text you when the crew is on the way. Reply here if anything changes.'],
      ['On the way', 'Hi ' + f + ', the ' + biz + ' crew is on the way to you now!'],
      ['Ask for a review', 'Thanks again ' + f + '! If we did a good job, a quick Google review helps a small local crew a lot.' + (REVIEW[l.site] ? ' ' + REVIEW[l.site] : ' Just search "' + biz + '" on Google and tap Write a review.')]
    ];
  }
  function drawerHtml(l) {
    const rc = repeatCount(l), ev = S.events[l.id], inp = 'bg-ink border border-line rounded-xl px-3 py-2 w-full text-sm', lab = 'block text-xs text-bone/50';
    const tp = templates(l), cur = tp.find(t => t[0] === S.tpl);
    return '<div class="fixed inset-0 z-[60]"><div data-close class="absolute inset-0 bg-black/70"></div><aside class="absolute right-0 top-0 h-full w-full sm:w-[34rem] bg-ink border-l border-line overflow-y-auto" role="dialog" aria-label="Lead details">' +
      '<div class="sticky top-0 z-10 bg-ink/95 backdrop-blur border-b border-line px-4 py-3 flex items-center justify-between gap-3"><div class="min-w-0"><div class="display text-xl font-extrabold truncate">' + esc(l.name) + '</div><div class="text-xs text-bone/50">' + esc(SITES[l.site] || l.site) + ' · ' + esc(SOURCE[l.source] || l.source) + ' · ' + ago(l.created_at) + '</div></div><button data-close class="rounded-full border border-line w-10 h-10 shrink-0" aria-label="Close">✕</button></div>' +
      '<div class="p-4 grid gap-5">' +
      (rc ? '<div class="rounded-xl border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">Repeat customer: ' + rc + ' earlier lead' + (rc > 1 ? 's' : '') + ' from this phone number.</div>' : '') +
      (l.status === 'new' && mins(l.created_at) > 15 ? '<div class="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">⚠ Waiting ' + dur(mins(l.created_at)) + ' for a first reply.</div>' : '') +
      '<div class="flex flex-wrap gap-2"><a class="rounded-full bg-ember text-ink font-bold px-5 py-2.5" href="tel:' + esc(l.phone) + '">📞 ' + esc(l.phone) + '</a><a class="rounded-full border border-line px-5 py-2.5" href="sms:' + esc(l.phone) + '">Text</a>' + (l.email ? '<a class="rounded-full border border-line px-5 py-2.5" href="mailto:' + esc(l.email) + '">Email</a>' : '') + '</div>' +
      '<div class="flex flex-wrap gap-2"><button data-call="No answer" class="rounded-full border border-line px-4 py-2 text-sm">Called: no answer</button><button data-call="Spoke with customer" class="rounded-full border border-line px-4 py-2 text-sm">Called: talked</button><button data-call="Left voicemail" class="rounded-full border border-line px-4 py-2 text-sm">Called: voicemail</button></div>' +
      '<div><div class="' + lab + ' mb-1">Stage</div><div class="flex flex-wrap gap-1.5">' + ORDER.map(k => '<button data-status="' + k + '" class="rounded-full border px-3.5 py-1.5 text-sm ' + (l.status === k ? 'bg-ember text-ink border-ember font-bold' : 'border-line text-bone/70') + '">' + STATUS[k] + '</button>').join('') + '</div>' +
      (l.status === 'lost' ? '<label class="' + lab + ' mt-3">Why was it lost?<select data-f="lost_reason" class="' + inp + ' mt-1"><option value="">Pick a reason</option>' + LOST.map(r => '<option' + (l.lost_reason === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label>' : '') + '</div>' +
      (l.message ? '<div><div class="' + lab + '">Customer said</div><p class="text-sm text-bone/80 mt-1">“' + esc(l.message) + '”</p></div>' : '') +
      ((l.photos && l.photos.length) ? '<div><div class="' + lab + ' mb-1">Photos from the customer</div><div class="flex flex-wrap gap-2">' + l.photos.map(u => '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(u) + '" alt="Customer photo" class="w-24 h-24 rounded-lg object-cover"></a>').join('') + '</div></div>' : '') +
      docsHtml(l) +
      '<div class="rounded-2xl border border-line bg-slate2 p-3 grid gap-3"><div class="text-sm font-semibold">Quick price (no formal quote)</div><div class="flex flex-wrap gap-1.5">' + TIERS.map(t => '<button data-tier="' + t[0] + '" title="' + t[1] + '" class="rounded-full border border-line px-3 py-1.5 text-sm">' + money(t[0]) + '</button>').join('') + '</div><div class="grid grid-cols-2 gap-2"><label class="' + lab + '">Quote $<input data-f="quote_amount" inputmode="decimal" value="' + (l.quote_amount == null ? '' : l.quote_amount) + '" class="' + inp + ' mt-1"></label><label class="' + lab + '">Final job $<input data-f="job_amount" inputmode="decimal" value="' + (l.job_amount == null ? '' : l.job_amount) + '" class="' + inp + ' mt-1"></label></div><p class="text-xs text-bone/40">Tap a price to fill the quote: small pickup, 25%, 50%, 75% or a full trailer.</p></div>' +
      '<div class="rounded-2xl border border-line bg-slate2 p-3 grid gap-3"><div class="text-sm font-semibold">Schedule and crew</div><label class="' + lab + '">Job date and time<input data-f="scheduled_for" type="datetime-local" value="' + localInput(l.scheduled_for) + '" class="' + inp + ' mt-1"></label><div class="grid grid-cols-2 gap-2"><label class="' + lab + '">Crew<select data-f="assigned" class="' + inp + ' mt-1"><option value="">Unassigned</option>' + S.crew.concat(l.assigned && !S.crew.includes(l.assigned) ? [l.assigned] : []).map(c => '<option' + (l.assigned === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label><label class="' + lab + '">Follow up on<input data-f="follow_up" type="date" value="' + esc(l.follow_up || '') + '" class="' + inp + ' mt-1"></label></div><div class="flex gap-2 text-xs"><button data-fu="1" class="rounded-full border border-line px-3 py-1">Tomorrow</button><button data-fu="3" class="rounded-full border border-line px-3 py-1">In 3 days</button><button data-fu="7" class="rounded-full border border-line px-3 py-1">Next week</button></div></div>' +
      '<div class="grid gap-2"><div class="text-sm font-semibold">Customer details</div><input data-f="address" placeholder="Job address" value="' + esc(l.address) + '" class="' + inp + '"><div class="grid grid-cols-3 gap-2"><input data-f="service" placeholder="Service" value="' + esc(l.service) + '" class="' + inp + ' col-span-3 sm:col-span-1"><input data-f="city" placeholder="City" value="' + esc(l.city) + '" class="' + inp + '"><input data-f="zip" placeholder="Zip" value="' + esc(l.zip) + '" class="' + inp + '"></div><div class="grid grid-cols-2 gap-2"><input data-f="name" placeholder="Name" value="' + esc(l.name) + '" class="' + inp + '"><input data-f="phone" placeholder="Phone" value="' + esc(l.phone) + '" class="' + inp + '"></div><input data-f="email" placeholder="Email" value="' + esc(l.email) + '" class="' + inp + '"><textarea data-f="notes" rows="3" placeholder="Job notes: gate code, stairs, anything the crew should know" class="' + inp + '">' + esc(l.notes) + '</textarea></div>' +
      '<div class="rounded-2xl border border-line bg-slate2 p-3 grid gap-2"><div class="text-sm font-semibold">Text this customer</div><div class="flex flex-wrap gap-1.5">' + tp.map(t => '<button data-tpl="' + esc(t[0]) + '" class="rounded-full border px-3 py-1.5 text-xs ' + (S.tpl === t[0] ? 'bg-ember text-ink border-ember font-bold' : 'border-line text-bone/70') + '">' + t[0] + '</button>').join('') + '</div>' +
      (cur ? '<textarea id="tplText" rows="4" class="' + inp + '">' + esc(cur[1]) + '</textarea><div class="flex gap-2"><a id="tplSms" class="rounded-full bg-ember text-ink font-bold px-4 py-2 text-sm" href="sms:' + esc(digits(l.phone)) + '?&body=' + encodeURIComponent(cur[1]) + '">Open in Messages</a><button data-copy class="rounded-full border border-line px-4 py-2 text-sm">Copy</button></div><p class="text-xs text-bone/40">Edit the text first if you like. Fill in anything in [brackets].</p>' : '<p class="text-xs text-bone/40">Pick a message to prefill it with this customer\'s name, price and date.</p>') + '</div>' +
      '<div class="flex gap-3 sticky bottom-0 bg-ink/95 backdrop-blur py-3 -mx-4 px-4 border-t border-line"><button data-save class="rounded-full bg-ember text-ink font-bold px-8 py-3">Save changes</button><button data-close class="rounded-full border border-line px-6 py-3">Close</button></div>' +
      '<div><div class="text-sm font-semibold mb-2">Activity</div><div class="flex gap-2 mb-3"><input id="noteIn" placeholder="Add a note..." class="' + inp + '"><button data-note class="rounded-full border border-line px-4 py-2 text-sm shrink-0">Add</button></div><div class="grid gap-2">' +
      (ev ? ev.map(e => '<div class="flex gap-2 text-sm"><span class="w-6 text-center">' + (EVICON[e.kind] || '•') + '</span><div class="min-w-0 flex-1"><div class="text-bone/90 break-words">' + esc(evText(e)) + '</div><div class="text-xs text-bone/40">' + fmtDT(e.at) + '</div></div></div>').join('') : '<p class="text-xs text-bone/40">Loading...</p>') +
      '<div class="flex gap-2 text-sm"><span class="w-6 text-center">✨</span><div><div class="text-bone/90">Quote request received</div><div class="text-xs text-bone/40">' + fmtDT(l.created_at) + '</div></div></div></div></div>' +
      '<div class="text-center pb-4"><button data-del class="text-xs text-bone/40 underline">Delete this lead</button></div></div></aside></div>';
  }
  function addHtml() {
    const inp = 'bg-ink border border-line rounded-xl px-3 py-2 w-full text-sm';
    return '<div class="fixed inset-0 z-[60]"><div data-close class="absolute inset-0 bg-black/70"></div><aside class="absolute right-0 top-0 h-full w-full sm:w-[30rem] bg-ink border-l border-line overflow-y-auto p-4" role="dialog" aria-label="Add a lead"><div class="flex items-center justify-between mb-4"><div class="display text-xl font-extrabold">Add a lead</div><button data-close class="rounded-full border border-line w-10 h-10" aria-label="Close">✕</button></div>' +
      '<form id="addF" class="grid gap-3"><p class="text-sm text-bone/60">For phone calls, texts and referrals that did not come through a website form.</p><input name="name" required placeholder="Name" class="' + inp + '"><input name="phone" required type="tel" placeholder="Phone" class="' + inp + '"><input name="service" placeholder="What they need" class="' + inp + '"><div class="grid grid-cols-2 gap-2"><input name="city" placeholder="City" class="' + inp + '"><input name="zip" placeholder="Zip" class="' + inp + '"></div><input name="address" placeholder="Job address" class="' + inp + '">' +
      '<div class="grid grid-cols-2 gap-2"><select name="site" class="' + inp + '">' + Object.keys(SITES).map(k => '<option value="' + k + '">' + SITES[k] + '</option>').join('') + '</select><select name="source" class="' + inp + '">' + Object.keys(SOURCE).map(k => '<option value="' + k + '"' + (k === 'phone' ? ' selected' : '') + '>' + SOURCE[k] + '</option>').join('') + '</select></div><textarea name="message" rows="3" placeholder="Notes" class="' + inp + '"></textarea><button class="rounded-full bg-ember text-ink font-bold px-8 py-3">Add lead</button></form></aside></div>';
  }
  function renderDrawer() {
    const el = document.getElementById('crmDrawer'); if (!el) return;
    if (S.adding) { drawerLead = null; el.innerHTML = addHtml(); document.getElementById('addF').onsubmit = onAdd; return; }
    const l = S.open && byId(S.open); if (!l) { drawerLead = null; el.innerHTML = ''; return; }
    if (S.builder) { const keep = el.querySelector('aside'); const sc = keep ? keep.scrollTop : 0; el.innerHTML = builderHtml(l); const a2 = el.querySelector('aside'); if (a2) a2.scrollTop = sc; return; }
    // keep whatever is typed in the form (and the scroll position) when the panel redraws, e.g. after changing the stage or logging a call
    const same = drawerLead === l.id, draft = {}; if (same) el.querySelectorAll('[data-f]').forEach(i => { draft[i.dataset.f] = i.value; });
    const scroll = same && el.querySelector('aside') ? el.querySelector('aside').scrollTop : 0; el.innerHTML = drawerHtml(l); drawerLead = l.id;
    el.querySelectorAll('[data-f]').forEach(i => { if (Object.prototype.hasOwnProperty.call(draft, i.dataset.f)) i.value = draft[i.dataset.f]; });
    const a = el.querySelector('aside'); if (a) a.scrollTop = scroll;
  }
  async function openLead(id) {
    S.open = Number(id); S.adding = false; S.tpl = ''; drawerLead = null; renderDrawer(); document.body.style.overflow = 'hidden';
    S.builder = null; S.builderLink = null; S.payFor = null;
    await Promise.all([api('GET', null, '?events=' + id).then(r => { S.events[id] = r.events; }).catch(() => { S.events[id] = []; }), loadDocs(id)]); if (S.open === Number(id)) renderDrawer();
  }
  function closeDrawer() { S.open = null; S.adding = false; S.builder = null; S.builderLink = null; S.payFor = null; document.body.style.overflow = ''; renderDrawer(); renderMain(); }
  function drawerChanges(l) {
    const d = document.getElementById('crmDrawer'), out = {};
    d.querySelectorAll('[data-f]').forEach(i => {
      const k = i.dataset.f; let v = i.value, old = l[k];
      if (k === 'scheduled_for') { if ((localInput(old) || '') !== v) out[k] = v ? new Date(v).toISOString() : ''; return; }
      if (['quote_amount', 'job_amount'].includes(k)) { if (String(old == null ? '' : old) !== v.replace(/[$,\s]/g, '')) out[k] = v; return; }
      if (String(old == null ? '' : old) !== v) out[k] = v;
    });
    return out;
  }
  async function save(id, fields, msg) {
    try { await api('POST', { action: 'update', id: Number(id), fields }); say(msg || 'Saved.'); delete S.events[id]; await load(); if (S.open === Number(id)) { S.events[id] = (await api('GET', null, '?events=' + id)).events; renderDrawer(); } }
    catch (e) { say('⚠ ' + e.message); }
  }
  async function onAdd(e) {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); d.action = 'add';
    try { const r = await api('POST', d); S.adding = false; say('Lead added.'); S.tab = 'leads'; await load(); openLead(r.id); } catch (er) { say('⚠ ' + er.message); }
  }


  /* ---------- QUOTES, INVOICES, PAYMENTS ---------- */
  const smsLink = (l, text) => 'sms:' + digits(l.phone) + '?&body=' + encodeURIComponent(text);
  const docMsg = (l, kind, link) => 'Hi ' + first(l.name) + ', here is your ' + kind + ' from ' + (BIZ[l.site] || 'Junk Junkies') + ': ' + link;
  async function loadDocs(id) { try { S.docs[id] = await api('GET', null, '?lead=' + id); } catch (e) { S.docs[id] = { quotes: [], invoices: [] }; } }
  async function refreshDocs(id) { await loadDocs(id); delete S.events[id]; await load(); try { S.events[id] = (await api('GET', null, '?events=' + id)).events; } catch (e) {} renderDrawer(); }
  const chip = (txt, cls) => '<span class="inline-block rounded-full border px-2 py-0.5 text-xs ' + cls + '">' + txt + '</span>';
  function docsHtml(l) {
    const d = S.docs[l.id]; if (!d) return '<p class="text-xs text-bone/40">Loading quotes and invoices...</p>';
    const btn = (attr, label, cls) => '<button ' + attr + ' class="rounded-full border ' + (cls || 'border-line') + ' px-3 py-1.5 text-xs">' + label + '</button>';
    const qrows = d.quotes.map(q => {
      const st = q.status === 'sent' && q.viewed_at ? 'Viewed, waiting' : QSTAT[q.status] || q.status, col = q.status === 'approved' ? 'border-ember text-ember' : q.status === 'declined' ? 'border-red-500/60 text-red-300' : q.status === 'changes_requested' ? 'border-amber-400/60 text-amber-300' : 'border-line text-bone/70';
      return '<div class="rounded-xl border border-line bg-ink p-3"><div class="flex items-center justify-between gap-2"><div class="font-semibold">' + q.number + ' <span class="text-bone/60 font-normal">' + moneyC(q.total) + '</span></div>' + chip(st, col) + '</div>' +
        (q.status === 'changes_requested' && q.client_note ? '<p class="text-xs text-amber-300 mt-1">“' + esc(q.client_note) + '”</p>' : '') + (q.status === 'approved' && q.signed_name ? '<p class="text-xs text-bone/50 mt-1">Approved by ' + esc(q.signed_name) + ' · ' + fmtDT(q.decided_at) + '</p>' : '') +
        '<div class="flex flex-wrap gap-1.5 mt-2">' + (q.status !== 'approved' ? btn('data-qedit="' + q.id + '"', 'Edit') : '') + (q.status !== 'draft' ? '<a href="' + smsLink(l, docMsg(l, 'quote', q.link)) + '" class="rounded-full border border-line px-3 py-1.5 text-xs">Text link</a>' + btn('data-copylink="' + esc(q.link) + '"', 'Copy link') + '<a href="' + esc(q.link) + '" target="_blank" rel="noopener" class="rounded-full border border-line px-3 py-1.5 text-xs">Preview</a>' : btn('data-qsendid="' + q.id + '"', 'Send to customer', 'border-ember text-ember')) +
        (q.status === 'sent' || q.status === 'changes_requested' ? btn('data-qapprove="' + q.id + '"', 'Mark approved (by phone)') : '') + (q.status === 'approved' && !d.invoices.some(v => v.quote_id === q.id) ? btn('data-qinvoice="' + q.id + '"', 'Create invoice', 'border-ember text-ember') : '') + (q.status === 'draft' ? btn('data-qdel="' + q.id + '"', 'Delete') : '') + '</div></div>';
    }).join('');
    const irows = d.invoices.map(v => {
      const st = ISTAT[v.status] || v.status, over = v.due && v.due < today() && ['sent', 'partial'].includes(v.status), col = v.status === 'paid' ? 'border-ember text-ember' : over ? 'border-red-500/60 text-red-300' : 'border-line text-bone/70';
      const pay = S.payFor === v.id ? '<div class="mt-2 grid gap-2 rounded-lg border border-line p-2"><div class="grid grid-cols-2 gap-2"><input id="payAmt" inputmode="decimal" value="' + v.balance + '" class="bg-ink border border-line rounded-lg px-3 py-2 text-sm"><select id="payMeth" class="bg-ink border border-line rounded-lg px-3 py-2 text-sm">' + PAYM.map(m => '<option>' + m + '</option>').join('') + '</select></div><input id="payNote" placeholder="Note (optional)" class="bg-ink border border-line rounded-lg px-3 py-2 text-sm"><div class="flex gap-2"><button data-paysave="' + v.id + '" class="rounded-full bg-ember text-ink font-bold px-4 py-2 text-sm">Record payment</button><button data-paycancel class="text-xs text-bone/50 underline">Cancel</button></div></div>' : '';
      return '<div class="rounded-xl border border-line bg-ink p-3"><div class="flex items-center justify-between gap-2"><div class="font-semibold">' + v.number + ' <span class="text-bone/60 font-normal">' + moneyC(v.total) + '</span></div>' + chip((over ? 'Overdue · ' : '') + st, col) + '</div>' +
        '<div class="text-xs text-bone/50 mt-1">' + (v.paid ? 'Paid ' + moneyC(v.paid) + ' · ' : '') + (v.status !== 'paid' && v.status !== 'void' ? 'Balance ' + moneyC(v.balance) : '') + (v.due ? ' · due ' + esc(v.due) : '') + '</div>' +
        (v.payments && v.payments.length ? '<div class="text-xs text-bone/50 mt-1">' + v.payments.map(p => moneyC(p.amount) + ' ' + esc(p.method) + ' · ' + fmtDay(p.at)).join('<br>') + '</div>' : '') +
        '<div class="flex flex-wrap gap-1.5 mt-2">' + (!['paid', 'void'].includes(v.status) ? btn('data-iedit="' + v.id + '"', 'Edit') : '') + (v.status === 'draft' ? btn('data-isendid="' + v.id + '"', 'Send to customer', 'border-ember text-ember') : '') + (v.status !== 'draft' ? '<a href="' + smsLink(l, docMsg(l, 'invoice', v.link)) + '" class="rounded-full border border-line px-3 py-1.5 text-xs">Text link</a>' + btn('data-copylink="' + esc(v.link) + '"', 'Copy link') + '<a href="' + esc(v.link) + '" target="_blank" rel="noopener" class="rounded-full border border-line px-3 py-1.5 text-xs">Preview</a>' : '') +
        (['sent', 'partial', 'draft'].includes(v.status) ? btn('data-payopen="' + v.id + '"', 'Record payment', 'border-ember text-ember') : '') + (!['paid', 'void'].includes(v.status) && !v.paid ? btn('data-ivoid="' + v.id + '"', 'Void') : '') + '</div>' + pay + '</div>';
    }).join('');
    return '<div class="rounded-2xl border border-line bg-slate2 p-3 grid gap-3"><div class="flex items-center justify-between gap-2"><div class="text-sm font-semibold">Quotes and invoices</div><div class="flex gap-1.5"><button data-newq class="rounded-full bg-ember text-ink font-bold px-3.5 py-1.5 text-xs">+ Quote</button><button data-newi class="rounded-full border border-line px-3.5 py-1.5 text-xs">+ Invoice</button></div></div>' +
      (qrows || irows ? '<div class="grid gap-2">' + qrows + irows + '</div>' : '<p class="text-xs text-bone/40">Nothing yet. Build an itemized quote, text the customer a link, and they can approve it from their phone.</p>') + '</div>';
  }
  function startBuilder(type, l, src) {
    const isQ = type === 'quote', base = { type, lead_id: l.id, id: src ? src.id : null, status: src ? src.status : 'draft', quote_id: null, items: src ? src.items.map(i => Object.assign({}, i)) : [], discount_pct: src ? src.discount_pct : 0, tax_pct: src ? src.tax_pct : 0, deposit: src && src.deposit || 0, due: src && src.due || '',
      message: src ? src.message : isQ ? 'Thanks for reaching out, ' + first(l.name) + '! Here is your quote for ' + (l.service ? l.service.toLowerCase() : 'junk removal') + '. Tap Approve and we will get you on the schedule.' : 'Thank you for choosing ' + (BIZ[l.site] || 'Junk Junkies') + '! We appreciate your business.' };
    if (!src && !base.items.length) base.items.push({ name: 'Half trailer load', description: l.service || '', qty: 1, price: 475 });
    S.builder = base; renderDrawer();
  }
  function readBuilder() {
    const b = S.builder; if (!b) return;
    const el = document.getElementById('crmDrawer'); if (!el.querySelector('[data-bi]')) return;
    b.items = [...el.querySelectorAll('[data-row]')].map(r => ({ name: r.querySelector('[data-bi=name]').value, description: r.dataset.desc || '', qty: r.querySelector('[data-bi=qty]').value, price: r.querySelector('[data-bi=price]').value }));
    b.discount_pct = el.querySelector('[data-bf=discount_pct]').value; b.tax_pct = el.querySelector('[data-bf=tax_pct]').value; b.message = el.querySelector('[data-bf=message]').value;
    const dep = el.querySelector('[data-bf=deposit]'); if (dep) b.deposit = dep.value; const due = el.querySelector('[data-bf=due]'); if (due) b.due = due.value;
  }
  function builderHtml(l) {
    const b = S.builder, isQ = b.type === 'quote', inp = 'bg-ink border border-line rounded-xl px-3 py-2 w-full text-sm', t = calc(b.items.map(i => ({ qty: num(i.qty) || 1, price: i.price })), b.discount_pct, b.tax_pct);
    return '<div class="fixed inset-0 z-[60]"><div data-bclose class="absolute inset-0 bg-black/70"></div><aside class="absolute right-0 top-0 h-full w-full sm:w-[36rem] bg-ink border-l border-line overflow-y-auto" role="dialog" aria-label="' + (isQ ? 'Quote' : 'Invoice') + ' builder">' +
      '<div class="sticky top-0 z-10 bg-ink/95 backdrop-blur border-b border-line px-4 py-3 flex items-center justify-between gap-3"><div class="min-w-0"><div class="display text-xl font-extrabold truncate">' + (b.id ? 'Edit ' : 'New ') + (isQ ? 'quote' : 'invoice') + '</div><div class="text-xs text-bone/50">for ' + esc(l.name) + ' · ' + esc(SITES[l.site] || l.site) + '</div></div><button data-bclose class="rounded-full border border-line w-10 h-10 shrink-0" aria-label="Back">✕</button></div>' +
      '<div class="p-4 grid gap-4"><div><div class="text-xs text-bone/50 mb-1.5">Add a line (tap one, or add your own)</div><div class="flex flex-wrap gap-1.5">' + LOADS.map((x, i) => '<button data-badd="' + i + '" class="rounded-full border border-line px-3 py-1.5 text-xs">' + x[0].replace(' trailer load', '').replace(' (minimum)', '') + ' ' + money(x[1]) + '</button>').join('') + '<button data-badd="custom" class="rounded-full border border-ember text-ember px-3 py-1.5 text-xs">+ Custom item</button></div></div>' +
      '<div class="grid gap-2">' + b.items.map((i, k) => '<div data-row="' + k + '" data-desc="' + esc(i.description || '') + '" class="rounded-xl border border-line bg-slate2 p-2 grid gap-2"><input data-bi="name" placeholder="Item" value="' + esc(i.name) + '" class="' + inp + '"><div class="grid grid-cols-[4rem_1fr_auto] gap-2 items-center"><input data-bi="qty" inputmode="decimal" value="' + esc(i.qty) + '" aria-label="Quantity" class="' + inp + '"><input data-bi="price" inputmode="decimal" value="' + esc(i.price) + '" aria-label="Price each" class="' + inp + '"><button data-bdel="' + k + '" class="text-bone/50 px-2" aria-label="Remove">✕</button></div><div class="text-xs text-bone/40 text-right">' + moneyC(num(i.qty || 1) * num(i.price)) + (i.description ? ' · ' + esc(i.description) : '') + '</div></div>').join('') + '</div>' +
      '<div class="grid grid-cols-' + (isQ ? '3' : '3') + ' gap-2"><label class="text-xs text-bone/50">Discount %<input data-bf="discount_pct" inputmode="decimal" value="' + esc(b.discount_pct) + '" class="' + inp + ' mt-1"></label><label class="text-xs text-bone/50">Sales tax %<input data-bf="tax_pct" inputmode="decimal" value="' + esc(b.tax_pct) + '" class="' + inp + ' mt-1"></label>' + (isQ ? '<label class="text-xs text-bone/50">Deposit $<input data-bf="deposit" inputmode="decimal" value="' + esc(b.deposit) + '" class="' + inp + ' mt-1"></label>' : '<label class="text-xs text-bone/50">Due date<input data-bf="due" type="date" value="' + esc(b.due) + '" class="' + inp + ' mt-1"></label>') + '</div>' +
      '<label class="text-xs text-bone/50">Message to the customer<textarea data-bf="message" rows="3" class="' + inp + ' mt-1">' + esc(b.message) + '</textarea></label>' +
      '<div class="rounded-2xl border border-line bg-slate2 p-3 text-sm grid gap-1"><div class="flex justify-between text-bone/70"><span>Subtotal</span><span>' + moneyC(t.subtotal) + '</span></div>' + (t.discount ? '<div class="flex justify-between text-bone/70"><span>Discount</span><span>−' + moneyC(t.discount) + '</span></div>' : '') + (t.tax ? '<div class="flex justify-between text-bone/70"><span>Tax</span><span>' + moneyC(t.tax) + '</span></div>' : '') + '<div class="flex justify-between display text-xl font-extrabold"><span>Total</span><span>' + moneyC(t.total) + '</span></div>' + (isQ && num(b.deposit) ? '<div class="flex justify-between text-bone/60"><span>Deposit requested</span><span>' + moneyC(b.deposit) + '</span></div>' : '') + '</div>' +
      (S.builderLink ? '<div class="rounded-xl border border-ember/50 bg-ember/10 p-3 grid gap-2"><div class="text-sm text-ember font-semibold">Ready to send</div><div class="text-xs break-all text-bone/70">' + esc(S.builderLink) + '</div><div class="flex flex-wrap gap-2"><a href="' + smsLink(l, docMsg(l, b.type, S.builderLink)) + '" class="rounded-full bg-ember text-ink font-bold px-4 py-2 text-sm">Text it to ' + esc(first(l.name)) + '</a><button data-copylink="' + esc(S.builderLink) + '" class="rounded-full border border-line px-4 py-2 text-sm">Copy link</button><a href="' + esc(S.builderLink) + '" target="_blank" rel="noopener" class="rounded-full border border-line px-4 py-2 text-sm">Preview</a></div></div>' : '') +
      '<div class="flex gap-3 sticky bottom-0 bg-ink/95 backdrop-blur py-3 -mx-4 px-4 border-t border-line"><button data-bsave="send" class="rounded-full bg-ember text-ink font-bold px-6 py-3">Save and ' + (b.status === 'draft' || !b.id ? 'send' : 'update') + '</button><button data-bsave="draft" class="rounded-full border border-line px-5 py-3">Save draft</button></div></div></aside></div>';
  }
  async function builderSave(mode) {
    readBuilder(); const b = S.builder; if (!b) return;
    try {
      const payload = { action: b.type + '_save', lead_id: b.lead_id, id: b.id, quote_id: b.quote_id, items: b.items, discount_pct: b.discount_pct, tax_pct: b.tax_pct, message: b.message, deposit: b.deposit, due: b.due };
      const r = await api('POST', payload), doc = r.quote || r.invoice; b.id = doc.id; b.status = doc.status;
      if (mode === 'send') { const r2 = await api('POST', { action: b.type + '_send', id: doc.id }); S.builderLink = (r2.quote || r2.invoice).link; b.status = (r2.quote || r2.invoice).status; say((b.type === 'quote' ? 'Quote' : 'Invoice') + ' sent. Text the link to the customer.'); }
      else say('Draft saved.');
      await refreshDocs(b.lead_id); if (mode !== 'send') { S.builder = null; S.builderLink = null; renderDrawer(); }
    } catch (e) { say('⚠ ' + e.message); }
  }
  async function docClick(t, l) {
    const d = S.docs[l.id] || { quotes: [], invoices: [] }, run = async (body, msg) => { try { await api('POST', body); say(msg); await refreshDocs(l.id); } catch (e) { say('⚠ ' + e.message); } };
    if (t.hasAttribute('data-newq')) { S.builderLink = null; startBuilder('quote', l); return true; }
    if (t.hasAttribute('data-newi')) { S.builderLink = null; startBuilder('invoice', l); return true; }
    if (t.dataset.qedit) { S.builderLink = null; startBuilder('quote', l, d.quotes.find(q => q.id === Number(t.dataset.qedit))); return true; }
    if (t.dataset.iedit) { S.builderLink = null; startBuilder('invoice', l, d.invoices.find(v => v.id === Number(t.dataset.iedit))); return true; }
    if (t.dataset.qsendid) { try { const r = await api('POST', { action: 'quote_send', id: Number(t.dataset.qsendid) }); S.builderLink = null; say('Quote sent. Use Text link to message the customer.'); await refreshDocs(l.id); } catch (e) { say('⚠ ' + e.message); } return true; }
    if (t.dataset.isendid) { await run({ action: 'invoice_send', id: Number(t.dataset.isendid) }, 'Invoice sent. Use Text link to message the customer.'); return true; }
    if (t.dataset.qapprove) { if (confirm('Record that the customer approved this quote?')) await run({ action: 'quote_set', id: Number(t.dataset.qapprove), status: 'approved' }, 'Quote approved. The job is booked.'); return true; }
    if (t.dataset.qinvoice) { const q = d.quotes.find(x => x.id === Number(t.dataset.qinvoice)); try { await api('POST', { action: 'invoice_save', lead_id: l.id, quote_id: q.id, items: q.items, discount_pct: q.discount_pct, tax_pct: q.tax_pct, message: '' }); say('Invoice drafted from the quote.'); await refreshDocs(l.id); } catch (e) { say('⚠ ' + e.message); } return true; }
    if (t.dataset.qdel) { if (confirm('Delete this draft quote?')) await run({ action: 'quote_delete', id: Number(t.dataset.qdel) }, 'Draft deleted.'); return true; }
    if (t.dataset.ivoid) { if (confirm('Void this invoice?')) await run({ action: 'invoice_void', id: Number(t.dataset.ivoid) }, 'Invoice voided.'); return true; }
    if (t.dataset.payopen) { S.payFor = Number(t.dataset.payopen); renderDrawer(); return true; }
    if (t.hasAttribute('data-paycancel')) { S.payFor = null; renderDrawer(); return true; }
    if (t.dataset.paysave) { const body = { action: 'payment_add', id: Number(t.dataset.paysave), amount: document.getElementById('payAmt').value, method: document.getElementById('payMeth').value, note: document.getElementById('payNote').value }; S.payFor = null; await run(body, 'Payment recorded.'); return true; }
    if (t.dataset.copylink) { try { await navigator.clipboard.writeText(t.dataset.copylink); say('Link copied.'); } catch (e) { say(t.dataset.copylink); } return true; }
    return false;
  }

  /* ---------- events ---------- */
  root.addEventListener('click', async e => {
    const t = e.target.closest('button,a,[data-close]'); if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; try { sessionStorage.setItem('jjcrmtab', S.tab); } catch (x) {} renderMain(); window.scrollTo(0, 0); return; }
    if (t.dataset.open) { openLead(t.dataset.open); return; }
    if (t.hasAttribute('data-close')) { closeDrawer(); return; }
    if (t.id === 'crmAddBtn') { S.adding = true; S.open = null; renderDrawer(); return; }
    if (t.id === 'crmRefresh') { say('Refreshed.'); load(); return; }
    if (t.id === 'crmCsv') { exportCsv(); return; }
    if (t.dataset.fstatus) { S.f.status = t.dataset.fstatus; renderMain(); return; }
    const l = S.open && byId(S.open); if (!l) return;
    if (S.builder) {
      if (t.hasAttribute('data-bclose')) { S.builder = null; S.builderLink = null; renderDrawer(); return; }
      if (t.dataset.badd) { readBuilder(); const x = t.dataset.badd === 'custom' ? { name: '', description: '', qty: 1, price: '' } : { name: LOADS[Number(t.dataset.badd)][0], description: l.service || '', qty: 1, price: LOADS[Number(t.dataset.badd)][1] }; S.builder.items = S.builder.items.filter(i => i.name || num(i.price)).concat([x]); renderDrawer(); return; }
      if (t.dataset.bdel) { readBuilder(); S.builder.items.splice(Number(t.dataset.bdel), 1); renderDrawer(); return; }
      if (t.dataset.bsave) { await builderSave(t.dataset.bsave); return; }
      if (t.dataset.copylink) { await docClick(t, l); return; }
      return;
    }
    if (await docClick(t, l)) return;
    if (t.dataset.status) { await save(l.id, { status: t.dataset.status }, 'Moved to ' + STATUS[t.dataset.status] + '.'); return; }
    if (t.dataset.call) { try { await api('POST', { action: 'call', id: l.id, text: t.dataset.call }); say('Call logged.'); delete S.events[l.id]; await load(); S.events[l.id] = (await api('GET', null, '?events=' + l.id)).events; renderDrawer(); } catch (er) { say('⚠ ' + er.message); } return; }
    if (t.dataset.tier) { const i = document.querySelector('#crmDrawer [data-f=quote_amount]'); i.value = t.dataset.tier; return; }
    if (t.dataset.fu) { const i = document.querySelector('#crmDrawer [data-f=follow_up]'); i.value = ymd(new Date(Date.now() + Number(t.dataset.fu) * 864e5)); return; }
    if (t.dataset.tpl) { S.tpl = t.dataset.tpl; renderDrawer(); return; }
    if (t.hasAttribute('data-copy')) { const v = document.getElementById('tplText').value; try { await navigator.clipboard.writeText(v); say('Message copied.'); } catch (x) { document.getElementById('tplText').select(); say('Press copy on your keyboard.'); } return; }
    if (t.hasAttribute('data-save')) { const ch = drawerChanges(l); if (!Object.keys(ch).length) { say('No changes to save.'); return; } await save(l.id, ch); return; }
    if (t.hasAttribute('data-note')) { const i = document.getElementById('noteIn'); if (!i.value.trim()) return; try { await api('POST', { action: 'note', id: l.id, text: i.value }); S.events[l.id] = (await api('GET', null, '?events=' + l.id)).events; await load(); renderDrawer(); say('Note added.'); } catch (er) { say('⚠ ' + er.message); } return; }
    if (t.hasAttribute('data-del')) { if (confirm('Delete this lead and its history for good?')) { try { await api('POST', { action: 'delete', id: l.id }); closeDrawer(); say('Deleted.'); await load(); } catch (er) { say('⚠ ' + er.message); } } return; }
  });
  root.addEventListener('change', e => { const t = e.target; if (t.id === 'fSite') { S.f.site = t.value; renderMain(); } else if (t.id === 'fSrc') { S.f.source = t.value; renderMain(); } else if (t.id === 'tplText') { const l = byId(S.open), a = document.getElementById('tplSms'); if (a && l) a.href = 'sms:' + digits(l.phone) + '?&body=' + encodeURIComponent(t.value); } });
  root.addEventListener('input', e => { const t = e.target; if (S.builder && (t.dataset.bi || t.dataset.bf)) { readBuilder(); const sc = document.querySelector('#crmDrawer aside').scrollTop, ae = document.activeElement, key = ae && (ae.dataset.bi || ae.dataset.bf), row = ae && ae.closest('[data-row]') ? ae.closest('[data-row]').dataset.row : null, pos = ae && ae.selectionStart; renderDrawer(); const el = row !== null ? document.querySelector('#crmDrawer [data-row="' + row + '"] [data-bi=' + key + ']') : document.querySelector('#crmDrawer [data-bf=' + key + ']'); document.querySelector('#crmDrawer aside').scrollTop = sc; if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {} } return; } if (t.id === 'crmQ') { S.f.q = t.value; renderMain(); } else if (t.id === 'tplText') { const l = byId(S.open), a = document.getElementById('tplSms'); if (a && l) a.href = 'sms:' + digits(l.phone) + '?&body=' + encodeURIComponent(t.value); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (S.builder) { S.builder = null; S.builderLink = null; renderDrawer(); } else if (S.open || S.adding) closeDrawer(); } });
  // drag-and-drop on the board is wired in wireBoard(); hover/tap tooltips for charts:
  const tip = () => document.getElementById('crmTip');
  const showTip = (el, x, y) => { const t = tip(); if (!t) return; t.textContent = el.dataset.tip; t.classList.remove('hidden'); const w = t.offsetWidth; t.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px'; t.style.top = Math.max(8, y - 44) + 'px'; };
  root.addEventListener('pointerover', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); });
  root.addEventListener('pointermove', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else if (tip()) tip().classList.add('hidden'); });
  root.addEventListener('pointerleave', () => { if (tip()) tip().classList.add('hidden'); });
  document.addEventListener('scroll', () => { if (tip()) tip().classList.add('hidden'); }, { passive: true });
  setInterval(() => { if (!document.hidden && pin && S.loaded) load(true); }, 45000);
  if (pin) load(); else login();
})();
