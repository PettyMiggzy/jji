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

  // ---------- Ask Jarvis chat
  var chatTimer = null;
  function jfetch(method, body) { return fetch('/api/jarvis', { method: method, headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Error'); return j; }); }); }
  function shrink(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var m = 1280, sc = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var q = 0.72, out = c.toDataURL('image/jpeg', q);
        while (out.length > 1500000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  function mountChat(box) {
    if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
    var pending = [];
    box.innerHTML = '<div class="rounded-3xl border border-ember/40 bg-slate2 p-4 sm:p-5">' +
      '<div class="flex items-center justify-between gap-2 mb-3"><div><div class="display text-xl font-extrabold">Ask Jarvis</div><div class="text-xs text-bone/60">Tell Jarvis what to change on the sites. Send screenshots too.</div></div><div id="jReqs" class="text-xs text-bone/60 text-right"></div></div>' +
      '<div id="jLog" class="h-[15rem] sm:h-[22rem] overflow-y-auto rounded-2xl bg-ink border border-line p-3 grid gap-2 content-start"></div>' +
      '<div id="jTrack" class="mt-3"></div><div id="jPrev" class="flex gap-2 mt-2 flex-wrap"></div>' +
      '<div class="flex gap-2 mt-3 items-end"><label class="shrink-0 cursor-pointer rounded-xl border border-line bg-ink px-3 py-3 text-lg" title="Attach photos">📎<input id="jFile" type="file" accept="image/*" multiple class="hidden"></label>' +
      '<textarea id="jText" rows="2" maxlength="2000" placeholder="What do you want changed?" class="flex-1 bg-ink border border-line rounded-xl px-4 py-3 text-base resize-none"></textarea>' +
      '<button id="jSend" class="shrink-0 rounded-full bg-ember hover:bg-emberDark text-ink font-bold px-5 py-3">Send</button></div>' +
      '<p id="jErr" class="text-xs text-red-400 mt-2 min-h-[1rem]"></p></div>';
    var log = box.querySelector('#jLog'), prev = box.querySelector('#jPrev'), err = box.querySelector('#jErr'), txt = box.querySelector('#jText'), send = box.querySelector('#jSend');
    function bubble(m) {
      var me = m.role === 'user', imgs = (m.images || []).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="" class="w-20 h-20 object-cover rounded-lg"></a>'; }).join('');
      return '<div class="flex ' + (me ? 'justify-end' : 'justify-start') + '"><div class="max-w-[85%] rounded-2xl px-3 py-2 text-sm ' + (me ? 'bg-ember text-ink' : 'bg-slate2 border border-line') + '">' +
        (m.content ? '<div class="whitespace-pre-wrap">' + esc(m.content) + '</div>' : '') + (imgs ? '<div class="flex gap-1 flex-wrap mt-1">' + imgs + '</div>' : '') + '</div></div>';
    }
    var lastId = 0;
    function refresh(force) {
      jfetch('GET').then(function (d) {
        var top = d.messages.length ? d.messages[d.messages.length - 1].id : 0;
        if (force || top !== lastId) {
          var atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
          log.innerHTML = d.messages.length ? d.messages.map(bubble).join('') : '<p class="text-bone/50 text-sm">Hi, I am Jarvis. What would you like changed on the websites?</p>';
          if (force || atEnd || top !== lastId) log.scrollTop = log.scrollHeight;
          lastId = top;
        }

        var cur = d.requests.filter(function (r) { return r.status !== 'done'; })[0] || d.requests[0];
        var tr = box.querySelector('#jTrack');
        if (cur && (cur.status !== 'done' || (Date.now() - new Date(cur.updated_at)) < 86400000)) {
          var steps = ['Received', 'Reviewing', 'Working on it', 'Done'], at = { 'new': 0, question: 1, working: 2, done: 3 }[cur.status]; if (at == null) at = 0;
          tr.innerHTML = '<div class="text-xs text-bone/50 mb-1">Request #' + cur.id + (cur.status === 'question' ? ' · waiting on your answer' : '') + '</div><div class="flex items-center gap-1">' + steps.map(function (st, k) {
            var on = k < at || cur.status === 'done', now = k === at && cur.status !== 'done';
            return '<div class="flex-1"><div class="h-1.5 rounded-full ' + (on ? 'bg-ember' : (now ? 'bg-ember/40 animate-pulse' : 'bg-line')) + '"></div><div class="text-[10px] mt-1 ' + (on || now ? 'text-ember' : 'text-bone/40') + '">' + st + '</div></div>';
          }).join('') + '</div>';
        } else tr.innerHTML = '';
        var open = d.requests.filter(function (r) { return r.status !== 'done'; }).length;
        box.querySelector('#jReqs').innerHTML = (open ? '<span class="text-ember font-semibold">' + open + ' in progress</span><br>' : '') + (d.requests[0] ? 'Latest: #' + d.requests[0].id + ' ' + esc(d.requests[0].status) : '');
      }).catch(function (e) { err.textContent = e.message; });
    }
    box.querySelector('#jFile').onchange = function (e) {
      var files = Array.prototype.slice.call(e.target.files || [], 0, 4 - pending.length);
      Promise.all(files.map(shrink)).then(function (arr) {
        arr.forEach(function (u) { if (u && pending.length < 4) pending.push(u); });
        prev.innerHTML = pending.map(function (u) { return '<img src="' + u + '" alt="" class="w-14 h-14 object-cover rounded-lg border border-line">'; }).join('');
      });
      e.target.value = '';
    };
    function doSend() {
      var t = txt.value.trim(); if (!t && !pending.length) return;
      send.disabled = true; send.textContent = '…'; err.textContent = '';
      jfetch('POST', { message: t, images: pending }).then(function (res) {
        if (res && res.filed) { try { fetch('https://formsubmit.co/ajax/' + res.notifyTo, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ _subject: 'Jarvis request #' + res.filed.id + (res.filed.urgent ? ' (URGENT)' : ''), _template: 'table', _captcha: 'false', message: res.filed.text }) }); } catch (e) {} }
        txt.value = ''; pending = []; prev.innerHTML = ''; refresh(true);
      }).catch(function (e) { err.textContent = e.message; }).then(function () { send.disabled = false; send.textContent = 'Send'; });
    }
    send.onclick = doSend;
    refresh(true);
    chatTimer = setInterval(function () { if (!document.hidden) refresh(false); }, 8000);
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
        '<div class="min-w-0 flex-1"><div class="text-sm font-semibold truncate">' + esc(j.service || 'Job') + ' · ' + esc(j.city || '') + '</div><div class="text-xs text-bone/50">' + esc(nm) + ' · ' + ago(j.created_at) + (j.crew_name ? ' · ' + esc(j.crew_name) : '') + (j.status === 'open' ? ' · <span class="text-ember">OPEN, waiting on after photo</span>' : ' · Google: ' + esc(j.gbp_status)) + '</div></div>' +
        '<div class="flex gap-2 shrink-0">' + (j.gbp_status === 'failed' || j.gbp_status === 'pending' ? '<button data-a="retry_gbp" data-id="' + j.id + '" class="text-xs rounded-full border border-line px-3 py-1.5">Retry Google</button>' : '') +
        '<button data-a="' + (j.hidden ? 'unhide' : 'hide') + '" data-id="' + j.id + '" class="text-xs rounded-full border border-line px-3 py-1.5">' + (j.hidden ? 'Show' : 'Hide') + '</button></div></div>';
    }).join('') || '<p class="text-bone/50">No jobs yet.</p>';
    var leadRows = (d.leads || []).map(function (l) { var nm = (NAMES[l.site] || {}).name || l.site; return '<div class="rounded-xl border border-line bg-slate2 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><div class="font-semibold">' + esc(l.name) + ' <a class="text-ember text-sm font-normal" href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a></div><div class="text-xs text-bone/50">' + esc(nm) + ' · ' + ago(l.created_at) + '</div></div><div class="text-sm text-bone/70">' + esc([l.service, l.city, l.zip].filter(Boolean).join(' · ')) + '</div>' + (l.message ? '<div class="text-sm text-bone/55 mt-1">' + esc(l.message) + '</div>' : '') + '</div>'; }).join('') || '<p class="text-bone/50">No quote requests saved yet.</p>';
    var crewRows = (d.crew || []).map(function (c) { return '<div class="flex items-center justify-between gap-3 rounded-xl border border-line bg-slate2 p-3 ' + (c.active ? '' : 'opacity-50') + '"><div><div class="font-semibold">' + esc(c.name) + '</div><div class="text-xs text-bone/50">' + (c.active ? 'Active' : 'Revoked') + '</div></div><div class="flex items-center gap-3"><span class="display text-xl font-extrabold tracking-widest text-ember">' + esc(c.code) + '</span><button data-a="' + (c.active ? 'crew_revoke' : 'crew_restore') + '" data-id="' + c.id + '" class="text-xs rounded-full border border-line px-3 py-1.5">' + (c.active ? 'Revoke' : 'Restore') + '</button></div></div>'; }).join('') || '<p class="text-bone/50 text-sm">No crew codes yet. Add a name to make one.</p>';
    var crewBox = '<h2 class="display text-xl font-extrabold mb-1">Crew codes</h2><p class="text-sm text-bone/60 mb-3">Give each person their own code for <a class="text-ember" href="/crew/" target="_blank" rel="noopener">/crew/</a>. Every job shows who posted it, and you can shut a code off any time.</p><form id="crewAdd" class="flex gap-2 mb-3"><input id="crewName" placeholder="Crew member name" class="bg-ink border border-line rounded-xl px-4 py-3 flex-1 min-w-0"><button class="rounded-full bg-ember text-ink font-bold px-5 py-3">Add</button></form><div class="grid gap-2 mb-10">' + crewRows + '</div>';
    root.innerHTML = '<div id="jarvisBox" class="mb-10"></div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">' + cards + '</div>' + crewBox + '<h2 class="display text-xl font-extrabold mb-3">Latest quote requests (all sites)</h2><div class="grid gap-2 mb-10">' + leadRows + '</div><div class="flex items-center justify-between mb-3"><h2 class="display text-xl font-extrabold">Latest jobs (all sites)</h2><button id="rf" class="text-xs rounded-full border border-line px-3 py-1.5">Refresh</button></div><div class="grid gap-2">' + rows + '</div>' +
      '<p class="mt-8 text-xs text-bone/40">Hiding a job removes it from the public map and gallery but keeps it here. Reviews feed: ' + (d.reviews ? 'connected on this site' : 'not set on this site') + '.</p>';
    mountChat(document.getElementById('jarvisBox'));
    document.getElementById('rf').onclick = load;
    document.getElementById('crewAdd').onsubmit = function (e) { e.preventDefault(); var n = document.getElementById('crewName').value; api('POST', { action: 'crew_add', name: n }).then(function (r) { load(); setTimeout(function () { alert('Code for ' + r.name + ': ' + r.code + '\\nGive them this and the link ' + location.origin + '/crew/'); }, 400); }).catch(function (er) { alert(er.message); }); };
    root.querySelectorAll('button[data-a]').forEach(function (b) { b.onclick = function () { b.disabled = true; api('POST', { action: b.dataset.a, id: Number(b.dataset.id) }).then(load).catch(function (e) { alert(e.message); b.disabled = false; }); }; });
  }
  if (pin) load(); else login();
})();
