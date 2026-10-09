/* Customer page: opened from the link we text them. Shows a quote or invoice; a quote can be approved or sent back with changes. */
(function () {
  var root = document.getElementById('portalApp'); if (!root) return;
  var t = new URLSearchParams(location.search).get('t') || '';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var m = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var day = function (d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
  var card = 'rounded-2xl border border-line bg-slate2 p-4 sm:p-6';
  function fail(msg) { root.innerHTML = '<div class="' + card + ' text-center"><div class="display text-2xl font-extrabold mb-2">Link not found</div><p class="text-bone/70">' + esc(msg || 'This link is not valid or has expired.') + '</p></div>'; }
  function post(body) { body.t = t; return fetch('/api/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; }); }); }
  function items(d) {
    return '<div class="grid gap-3 mt-4">' + d.items.map(function (i) { return '<div class="flex justify-between gap-4 border-b border-line pb-3"><div class="min-w-0"><div class="font-semibold">' + esc(i.name) + '</div>' + (i.description ? '<div class="text-sm text-bone/60">' + esc(i.description) + '</div>' : '') + '<div class="text-xs text-bone/50 mt-0.5">' + esc(i.qty) + ' × ' + m(i.price) + '</div></div><div class="font-semibold whitespace-nowrap">' + m(i.qty * i.price) + '</div></div>'; }).join('') + '</div>' +
      '<div class="mt-4 grid gap-1 text-sm"><div class="flex justify-between text-bone/70"><span>Subtotal</span><span>' + m(d.subtotal) + '</span></div>' + (d.discount ? '<div class="flex justify-between text-bone/70"><span>Discount (' + d.discount_pct + '%)</span><span>−' + m(d.discount) + '</span></div>' : '') + (d.tax ? '<div class="flex justify-between text-bone/70"><span>Tax (' + d.tax_pct + '%)</span><span>' + m(d.tax) + '</span></div>' : '') + '<div class="flex justify-between display text-2xl font-extrabold mt-1"><span>Total</span><span>' + m(d.total) + '</span></div></div>';
  }
  function render(d) {
    var isQ = d.kind === 'quote', phone = d.business.phone, head = '<div class="text-sm text-bone/60">' + esc(d.business.name) + '</div><h1 class="display text-3xl sm:text-4xl font-extrabold mt-1">' + (isQ ? 'Quote ' : 'Invoice ') + esc(d.number) + '</h1><p class="text-bone/70 mt-1">Prepared for ' + esc(d.client || 'you') + (d.sent_at ? ' · ' + day(d.sent_at) : '') + '</p>';
    var banner = '';
    if (isQ && d.status === 'approved') banner = '<div class="rounded-xl border border-ember/50 bg-ember/10 px-4 py-3 mt-4 text-ember">✓ Approved' + (d.signed_name ? ' by ' + esc(d.signed_name) : '') + (d.decided_at ? ' on ' + day(d.decided_at) : '') + '. We will text you to confirm the day and time.</div>';
    if (isQ && d.status === 'changes_requested') banner = '<div class="rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 mt-4 text-amber-200">We got your request for changes. We will send an updated quote shortly.</div>';
    if (isQ && d.status === 'declined') banner = '<div class="rounded-xl border border-line px-4 py-3 mt-4 text-bone/70">You declined this quote. Changed your mind? Call or text ' + esc(phone) + '.</div>';
    if (!isQ && d.status === 'paid') banner = '<div class="rounded-xl border border-ember/50 bg-ember/10 px-4 py-3 mt-4 text-ember">✓ Paid in full. Thank you!</div>';
    if (!isQ && d.status === 'void') banner = '<div class="rounded-xl border border-line px-4 py-3 mt-4 text-bone/70">This invoice was cancelled.</div>';
    var body = '<div class="' + card + '">' + head + banner + (d.message ? '<p class="mt-4 text-bone/80">' + esc(d.message) + '</p>' : '') + items(d) +
      (isQ && d.deposit ? '<p class="mt-3 text-sm text-bone/60">A deposit of ' + m(d.deposit) + ' is requested to hold your date. We will let you know how to send it.</p>' : '') +
      (!isQ ? '<div class="mt-4 grid gap-1 text-sm border-t border-line pt-3">' + (d.payments.length ? d.payments.map(function (p) { return '<div class="flex justify-between text-bone/70"><span>Payment · ' + esc(p.method) + ' · ' + day(p.at) + '</span><span>−' + m(p.amount) + '</span></div>'; }).join('') : '') + '<div class="flex justify-between display text-xl font-extrabold"><span>Balance due</span><span>' + m(d.balance) + '</span></div>' + (d.due && d.balance > 0 ? '<div class="text-bone/60">Due ' + day(d.due) + '</div>' : '') + '</div><p class="mt-4 text-sm text-bone/70">To pay or ask about this invoice, call or text <a class="text-ember font-semibold" href="tel:' + esc(phone) + '">' + esc(phone) + '</a>.</p>' : '') + '</div>';
    if (isQ && ['sent', 'changes_requested', 'declined'].indexOf(d.status) > -1) {
      body += '<div class="' + card + ' mt-4"><div class="display text-xl font-extrabold mb-1">Ready to book?</div><p class="text-sm text-bone/60 mb-3">Type your full name to approve this quote.</p><input id="pName" autocomplete="name" placeholder="Your full name" class="bg-ink border border-line rounded-xl px-4 py-3 w-full mb-3"><textarea id="pNote" rows="2" placeholder="Anything we should know? (optional)" class="bg-ink border border-line rounded-xl px-4 py-3 w-full mb-3"></textarea><button id="pOk" class="rounded-full bg-ember text-ink font-bold px-8 py-4 w-full sm:w-auto">Approve this quote</button><p id="pMsg" class="text-sm text-red-300 mt-3" role="status"></p>' +
        '<div class="mt-5 pt-4 border-t border-line"><div class="font-semibold mb-2">Want something changed?</div><textarea id="pChg" rows="2" placeholder="Tell us what you would like changed" class="bg-ink border border-line rounded-xl px-4 py-3 w-full mb-3"></textarea><div class="flex flex-wrap gap-3"><button id="pCh" class="rounded-full border border-line px-6 py-3">Ask for changes</button><button id="pNo" class="text-sm text-bone/50 underline">No thanks, decline</button></div></div></div>';
    }
    body += '<p class="text-center text-sm text-bone/50 mt-6">Questions? Call or text <a class="text-ember" href="tel:' + esc(phone) + '">' + esc(phone) + '</a>' + ' · <button onclick="window.print()" class="underline">Print</button></p>';
    root.innerHTML = body;
    function go(btn, body) { btn.disabled = true; var msg = document.getElementById('pMsg'); post(body).then(function () { load(); }).catch(function (e) { msg.textContent = e.message; btn.disabled = false; }); }
    var ok = document.getElementById('pOk'); if (ok) {
      ok.onclick = function () { go(ok, { action: 'approve', name: document.getElementById('pName').value, note: document.getElementById('pNote').value }); };
      document.getElementById('pCh').onclick = function () { go(this, { action: 'changes', note: document.getElementById('pChg').value }); };
      document.getElementById('pNo').onclick = function () { if (confirm('Decline this quote?')) go(this, { action: 'decline' }); };
    }
  }
  function load() { if (!t) { fail('This link is missing its code. Open the link from your text message.'); return; } fetch('/api/portal?t=' + encodeURIComponent(t)).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); }).then(render).catch(function (e) { fail(e.message); }); }
  load();
})();
