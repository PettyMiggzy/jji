// Owner CRM: every quote request from every site lands in `leads`; this endpoint lets the owner work them (status, schedule, crew, amounts, follow-ups, a full activity timeline)
// and add phone leads by hand. Needs ADMIN_PIN (header x-admin-pin). All sites share one database, so one CRM covers them all.
import { db, ensureTable, adminGate, clean } from './_lib.js';
import { bizOf, linkFor, newToken, docNumber, cleanItems, totals, paidSum, pct, amt } from './_docs.js';

const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'done', 'lost'];
const SOURCES = ['website', 'ad', 'phone', 'referral', 'other'];
const SITES = ['spring', 'tomball', 'cypress', 'college-station', 'indiana', 'florida'];
const LOST = ['', 'price', 'no response', 'went elsewhere', 'not ready', 'outside area', 'other'];
const money = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : undefined; };
const day = v => { if (v === '' || v == null) return null; return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(Date.parse(v)) ? String(v) : undefined; };
const when = v => { if (v === '' || v == null) return null; const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : undefined; };


const shapeQuote = (q, site) => ({ id: q.id, number: docNumber('quote', q.id), status: q.status, items: q.items, discount_pct: Number(q.discount_pct), tax_pct: Number(q.tax_pct), deposit: Number(q.deposit), message: q.message, ...totals(q.items, q.discount_pct, q.tax_pct),
  created_at: q.created_at, sent_at: q.sent_at, viewed_at: q.viewed_at, decided_at: q.decided_at, client_note: q.client_note, signed_name: q.signed_name, link: linkFor(site, 'quote', q.token) });
const shapeInvoice = (v, site) => { const t = totals(v.items, v.discount_pct, v.tax_pct), paid = paidSum(v.payments); return { id: v.id, number: docNumber('invoice', v.id), status: v.status, quote_id: v.quote_id, items: v.items, discount_pct: Number(v.discount_pct), tax_pct: Number(v.tax_pct), due: v.due || null, message: v.message,
  ...t, paid, balance: Math.max(0, Math.round((t.total - paid) * 100) / 100), payments: v.payments, created_at: v.created_at, sent_at: v.sent_at, viewed_at: v.viewed_at, paid_at: v.paid_at, link: linkFor(site, 'invoice', v.token) }; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const sql = db();
  if (!(await adminGate(req, res, sql))) return;
  if (!sql) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTable(sql);
    if (req.method === 'GET') {
      const eid = Number(req.query && req.query.events);
      if (eid) {
        const events = await sql`SELECT id, at, kind, text FROM lead_events WHERE lead_id = ${eid} ORDER BY at DESC, id DESC LIMIT 200`;
        return res.status(200).json({ events });
      }
      const lid = Number(req.query && req.query.lead);
      if (lid) {
        const [lead] = await sql`SELECT id, site FROM leads WHERE id = ${lid}`; if (!lead) return res.status(404).json({ error: 'Lead not found' });
        const qs = await sql`SELECT * FROM quotes WHERE lead_id = ${lid} ORDER BY id DESC`, ivs = await sql`SELECT *, to_char(due_date, 'YYYY-MM-DD') AS due FROM invoices WHERE lead_id = ${lid} ORDER BY id DESC`;
        return res.status(200).json({ quotes: qs.map(q => shapeQuote(q, lead.site)), invoices: ivs.map(v => shapeInvoice(v, lead.site)) });
      }
      const leads = await sql`SELECT id, site, created_at, name, phone, email, service, city, zip, address, message, photos, status, notes, source, assigned, lost_reason,
        quote_amount::float8 AS quote_amount, job_amount::float8 AS job_amount, to_char(follow_up, 'YYYY-MM-DD') AS follow_up, contacted_at, scheduled_for, (SELECT max(at) FROM lead_events e WHERE e.lead_id = leads.id) AS last_activity FROM leads ORDER BY created_at DESC LIMIT 1500`;
      const crew = await sql`SELECT DISTINCT name FROM crew_codes WHERE active = true ORDER BY name`;
      const dq = await sql`SELECT id, lead_id, status, items, discount_pct, tax_pct, sent_at, viewed_at, decided_at FROM quotes ORDER BY id DESC LIMIT 2000`;
      const di = await sql`SELECT id, lead_id, status, items, discount_pct, tax_pct, payments, to_char(due_date, 'YYYY-MM-DD') AS due, created_at, sent_at, paid_at FROM invoices ORDER BY id DESC LIMIT 2000`;
      const docs = {
        quotes: dq.map(q => ({ id: q.id, lead_id: q.lead_id, status: q.status, number: docNumber('quote', q.id), total: totals(q.items, q.discount_pct, q.tax_pct).total, sent_at: q.sent_at, viewed_at: q.viewed_at, decided_at: q.decided_at })),
        invoices: di.map(v => { const t = totals(v.items, v.discount_pct, v.tax_pct).total, paid = paidSum(v.payments); return { id: v.id, lead_id: v.lead_id, status: v.status, number: docNumber('invoice', v.id), total: t, paid, balance: Math.max(0, Math.round((t - paid) * 100) / 100), due: v.due, created_at: v.created_at, sent_at: v.sent_at, paid_at: v.paid_at }; })
      };
      return res.status(200).json({ leads, docs, crew: crew.map(c => c.name), statuses: STATUSES, sources: SOURCES, lost: LOST });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const log = (id, kind, text) => sql`INSERT INTO lead_events (lead_id, kind, text) VALUES (${id}, ${kind}, ${String(text || '').slice(0, 2000)})`;

    if (b.action === 'add') {
      const name = clean(b.name, 120), phone = clean(b.phone, 40);
      if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
      const site = SITES.includes(b.site) ? b.site : 'indiana', source = SOURCES.includes(b.source) ? b.source : 'phone';
      const status = STATUSES.includes(b.status) ? b.status : 'new';
      const [row] = await sql`INSERT INTO leads (site, name, phone, email, service, city, zip, address, message, page, source, status, contacted_at)
        VALUES (${site}, ${name}, ${phone}, ${clean(b.email, 120)}, ${clean(b.service, 80)}, ${clean(b.city, 80)}, ${clean(b.zip, 12)}, ${clean(b.address, 160)}, ${clean(b.message, 800)}, 'added by hand', ${source}, ${status},
        ${status === 'new' ? null : new Date().toISOString()}) RETURNING id`;
      await log(row.id, 'created', source);
      return res.status(201).json({ ok: true, id: row.id });
    }


    // ---- quotes, invoices and payments ----
    const leadOf = async lid => { const [l] = await sql`SELECT id, site, status, name, quote_amount::float8 AS quote_amount, job_amount::float8 AS job_amount FROM leads WHERE id = ${lid}`; return l; };
    const docIn = (b, kind) => ({ items: cleanItems(b.items), discount: pct(b.discount_pct), tax: pct(b.tax_pct), message: clean(b.message, 1500), deposit: amt(b.deposit) ?? 0, due: /^\d{4}-\d{2}-\d{2}$/.test(String(b.due || '')) ? b.due : null });
    if (b.action === 'quote_save') {
      const lead = await leadOf(Number(b.lead_id)); if (!lead) return res.status(404).json({ error: 'Lead not found' });
      const d = docIn(b); if (!d.items.length) return res.status(400).json({ error: 'Add at least one line item' });
      let q;
      if (b.id) {
        const [old] = await sql`SELECT id, status FROM quotes WHERE id = ${Number(b.id)} AND lead_id = ${lead.id}`; if (!old) return res.status(404).json({ error: 'Quote not found' });
        if (old.status === 'approved') return res.status(400).json({ error: 'This quote was already approved. Make a new quote or an invoice.' });
        [q] = await sql`UPDATE quotes SET items = ${JSON.stringify(d.items)}::jsonb, discount_pct = ${d.discount}, tax_pct = ${d.tax}, deposit = ${d.deposit}, message = ${d.message} WHERE id = ${old.id} RETURNING *`;
      } else {
        [q] = await sql`INSERT INTO quotes (lead_id, items, discount_pct, tax_pct, deposit, message, token) VALUES (${lead.id}, ${JSON.stringify(d.items)}::jsonb, ${d.discount}, ${d.tax}, ${d.deposit}, ${d.message}, ${newToken()}) RETURNING *`;
        await log(lead.id, 'quote_draft', docNumber('quote', q.id));
      }
      return res.status(200).json({ ok: true, quote: shapeQuote(q, lead.site) });
    }
    if (b.action === 'quote_send') {
      const [q] = await sql`SELECT * FROM quotes WHERE id = ${Number(b.id)}`; if (!q) return res.status(404).json({ error: 'Quote not found' });
      const lead = await leadOf(q.lead_id); const t = totals(q.items, q.discount_pct, q.tax_pct);
      const [n] = await sql`UPDATE quotes SET status = CASE WHEN status IN ('draft', 'declined', 'changes_requested') THEN 'sent' ELSE status END, sent_at = COALESCE(sent_at, now()) WHERE id = ${q.id} RETURNING *`;
      await sql`UPDATE leads SET quote_amount = ${t.total}::numeric, status = CASE WHEN status IN ('new', 'contacted') THEN 'quoted' ELSE status END, contacted_at = COALESCE(contacted_at, now()) WHERE id = ${lead.id}`;
      await log(lead.id, 'quote_sent', docNumber('quote', q.id) + '|' + t.total);
      return res.status(200).json({ ok: true, quote: shapeQuote(n, lead.site) });
    }
    if (b.action === 'quote_set') { // owner records the customer's answer (e.g. approved by phone)
      const st = b.status; if (!['approved', 'declined'].includes(st)) return res.status(400).json({ error: 'Bad status' });
      const [q] = await sql`SELECT * FROM quotes WHERE id = ${Number(b.id)}`; if (!q) return res.status(404).json({ error: 'Quote not found' });
      const lead = await leadOf(q.lead_id), t = totals(q.items, q.discount_pct, q.tax_pct);
      const [n] = await sql`UPDATE quotes SET status = ${st}, decided_at = now(), sent_at = COALESCE(sent_at, now()), signed_name = CASE WHEN ${st} = 'approved' THEN 'Recorded by owner' ELSE signed_name END WHERE id = ${q.id} RETURNING *`;
      if (st === 'approved') { await sql`UPDATE leads SET status = CASE WHEN status IN ('done') THEN status ELSE 'booked' END, quote_amount = ${t.total}::numeric, job_amount = COALESCE(job_amount, ${t.total}::numeric), contacted_at = COALESCE(contacted_at, now()) WHERE id = ${lead.id}`; }
      await log(lead.id, st === 'approved' ? 'quote_approved' : 'quote_declined', docNumber('quote', q.id) + '|owner');
      return res.status(200).json({ ok: true, quote: shapeQuote(n, lead.site) });
    }
    if (b.action === 'quote_delete') {
      const [q] = await sql`SELECT id, status FROM quotes WHERE id = ${Number(b.id)}`; if (!q) return res.status(404).json({ error: 'Quote not found' });
      if (q.status !== 'draft') return res.status(400).json({ error: 'Only drafts can be deleted' });
      await sql`DELETE FROM quotes WHERE id = ${q.id}`; return res.status(200).json({ ok: true });
    }
    if (b.action === 'invoice_save') {
      const lead = await leadOf(Number(b.lead_id)); if (!lead) return res.status(404).json({ error: 'Lead not found' });
      const d = docIn(b); if (!d.items.length) return res.status(400).json({ error: 'Add at least one line item' });
      let v;
      if (b.id) {
        const [old] = await sql`SELECT id, status FROM invoices WHERE id = ${Number(b.id)} AND lead_id = ${lead.id}`; if (!old) return res.status(404).json({ error: 'Invoice not found' });
        if (['paid', 'void'].includes(old.status)) return res.status(400).json({ error: 'A paid or voided invoice cannot be edited' });
        [v] = await sql`UPDATE invoices SET items = ${JSON.stringify(d.items)}::jsonb, discount_pct = ${d.discount}, tax_pct = ${d.tax}, due_date = ${d.due}::date, message = ${d.message} WHERE id = ${old.id} RETURNING *, to_char(due_date, 'YYYY-MM-DD') AS due`;
      } else {
        const qid = Number(b.quote_id) || null;
        [v] = await sql`INSERT INTO invoices (lead_id, quote_id, items, discount_pct, tax_pct, due_date, message, token) VALUES (${lead.id}, ${qid}, ${JSON.stringify(d.items)}::jsonb, ${d.discount}, ${d.tax}, ${d.due}::date, ${d.message}, ${newToken()}) RETURNING *, to_char(due_date, 'YYYY-MM-DD') AS due`;
        await log(lead.id, 'invoice_draft', docNumber('invoice', v.id));
      }
      return res.status(200).json({ ok: true, invoice: shapeInvoice(v, lead.site) });
    }
    if (b.action === 'invoice_send') {
      const [v] = await sql`SELECT * FROM invoices WHERE id = ${Number(b.id)}`; if (!v) return res.status(404).json({ error: 'Invoice not found' });
      if (['paid', 'void'].includes(v.status)) return res.status(400).json({ error: 'This invoice is closed' });
      const lead = await leadOf(v.lead_id), t = totals(v.items, v.discount_pct, v.tax_pct);
      const [n] = await sql`UPDATE invoices SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = COALESCE(sent_at, now()) WHERE id = ${v.id} RETURNING *, to_char(due_date, 'YYYY-MM-DD') AS due`;
      await log(lead.id, 'invoice_sent', docNumber('invoice', v.id) + '|' + t.total);
      return res.status(200).json({ ok: true, invoice: shapeInvoice(n, lead.site) });
    }
    if (b.action === 'payment_add') {
      const [v] = await sql`SELECT * FROM invoices WHERE id = ${Number(b.id)}`; if (!v) return res.status(404).json({ error: 'Invoice not found' });
      if (v.status === 'void') return res.status(400).json({ error: 'This invoice was voided' });
      const t = totals(v.items, v.discount_pct, v.tax_pct), already = paidSum(v.payments), a = amt(b.amount);
      if (!a || a <= 0) return res.status(400).json({ error: 'Enter the amount received' });
      if (a > t.total - already + 0.005) return res.status(400).json({ error: 'That is more than the balance due' });
      const method = ['cash', 'check', 'card', 'zelle', 'cash app', 'venmo', 'other'].includes(b.method) ? b.method : 'other';
      const pays = [...v.payments, { amount: a, method, note: clean(b.note, 200), at: new Date().toISOString() }], paidAll = paidSum(pays) >= t.total - 0.005;
      const [n] = await sql`UPDATE invoices SET payments = ${JSON.stringify(pays)}::jsonb, status = ${paidAll ? 'paid' : 'partial'}, paid_at = ${paidAll ? new Date().toISOString() : null}::timestamptz, sent_at = COALESCE(sent_at, now()) WHERE id = ${v.id} RETURNING *, to_char(due_date, 'YYYY-MM-DD') AS due`;
      const lead = await leadOf(v.lead_id);
      if (paidAll) await sql`UPDATE leads SET status = 'done', job_amount = ${t.total}::numeric WHERE id = ${lead.id}`;
      await log(lead.id, 'payment', docNumber('invoice', v.id) + '|' + a + '|' + method);
      return res.status(200).json({ ok: true, invoice: shapeInvoice(n, lead.site) });
    }
    if (b.action === 'invoice_void') {
      const [v] = await sql`SELECT * FROM invoices WHERE id = ${Number(b.id)}`; if (!v) return res.status(404).json({ error: 'Invoice not found' });
      if (paidSum(v.payments) > 0) return res.status(400).json({ error: 'This invoice has payments recorded. It cannot be voided.' });
      await sql`UPDATE invoices SET status = 'void' WHERE id = ${v.id}`; await log(v.lead_id, 'invoice_void', docNumber('invoice', v.id)); return res.status(200).json({ ok: true });
    }

    const id = Number(b.id); if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
    if (b.action === 'delete') {
      await sql`DELETE FROM lead_events WHERE lead_id = ${id}`; await sql`DELETE FROM quotes WHERE lead_id = ${id}`; await sql`DELETE FROM invoices WHERE lead_id = ${id}`;
      const r = await sql`DELETE FROM leads WHERE id = ${id} RETURNING id`;
      return res.status(200).json({ ok: true, deleted: r.length });
    }
    if (b.action === 'note' || b.action === 'call') {
      const text = clean(b.text, 2000);
      if (b.action === 'note' && !text) return res.status(400).json({ error: 'Type a note first' });
      const [old] = await sql`SELECT id, status FROM leads WHERE id = ${id}`; if (!old) return res.status(404).json({ error: 'Lead not found' });
      await log(id, b.action, text);
      if (b.action === 'call' && old.status === 'new') {
        await sql`UPDATE leads SET status = 'contacted', contacted_at = COALESCE(contacted_at, now()) WHERE id = ${id}`;
        await log(id, 'status', 'new|contacted');
      }
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'update') {
      const f = b.fields || {}, has = k => Object.prototype.hasOwnProperty.call(f, k);
      const [old] = await sql`SELECT id, site, created_at, name, phone, email, service, city, zip, address, message, photos, status, notes, source, assigned, lost_reason,
        quote_amount::float8 AS quote_amount, job_amount::float8 AS job_amount, to_char(follow_up, 'YYYY-MM-DD') AS follow_up, contacted_at, scheduled_for FROM leads WHERE id = ${id}`;
      if (!old) return res.status(404).json({ error: 'Lead not found' });
      const n = { ...old };
      if (has('status')) { if (!STATUSES.includes(f.status)) return res.status(400).json({ error: 'Bad status' }); n.status = f.status; }
      if (has('source')) { if (!SOURCES.includes(f.source)) return res.status(400).json({ error: 'Bad source' }); n.source = f.source; }
      if (has('lost_reason')) { if (!LOST.includes(f.lost_reason)) return res.status(400).json({ error: 'Bad reason' }); n.lost_reason = f.lost_reason; }
      for (const k of ['quote_amount', 'job_amount']) if (has(k)) { const v = money(f[k]); if (v === undefined) return res.status(400).json({ error: 'Bad amount' }); n[k] = v; }
      if (has('follow_up')) { const v = day(f.follow_up); if (v === undefined) return res.status(400).json({ error: 'Bad date' }); n.follow_up = v; }
      if (has('scheduled_for')) { const v = when(f.scheduled_for); if (v === undefined) return res.status(400).json({ error: 'Bad date' }); n.scheduled_for = v; }
      for (const [k, max] of [['notes', 4000], ['assigned', 60], ['address', 160], ['email', 120], ['service', 80], ['city', 80], ['zip', 12]]) if (has(k)) n[k] = clean(f[k], max);
      for (const [k, max] of [['name', 120], ['phone', 40]]) if (has(k)) { const v = clean(f[k], max); if (v) n[k] = v; }
      if (n.status !== 'lost') n.lost_reason = has('status') ? '' : n.lost_reason;
      const stamp = old.contacted_at || (n.status !== 'new' ? new Date().toISOString() : null);
      await sql`UPDATE leads SET status = ${n.status}, source = ${n.source}, notes = ${n.notes}, name = ${n.name}, phone = ${n.phone}, email = ${n.email}, service = ${n.service}, city = ${n.city}, zip = ${n.zip},
        address = ${n.address}, assigned = ${n.assigned}, lost_reason = ${n.lost_reason}, quote_amount = ${n.quote_amount}::numeric, job_amount = ${n.job_amount}::numeric,
        follow_up = ${n.follow_up}::date, scheduled_for = ${n.scheduled_for}::timestamptz, contacted_at = ${stamp}::timestamptz WHERE id = ${id}`;
      const same = (a, c) => String(a ?? '') === String(c ?? '');
      if (!same(old.status, n.status)) await log(id, 'status', old.status + '|' + n.status);
      if (!same(old.quote_amount, n.quote_amount)) await log(id, 'quote', n.quote_amount ?? '');
      if (!same(old.job_amount, n.job_amount)) await log(id, 'job', n.job_amount ?? '');
      if (!same(old.scheduled_for && new Date(old.scheduled_for).toISOString(), n.scheduled_for)) await log(id, 'schedule', n.scheduled_for ?? '');
      if (!same(old.assigned, n.assigned)) await log(id, 'assign', n.assigned);
      if (!same(old.follow_up, n.follow_up)) await log(id, 'followup', n.follow_up ?? '');
      if (!same(old.lost_reason, n.lost_reason) && n.lost_reason) await log(id, 'lost', n.lost_reason);
      return res.status(200).json({ ok: true, updated: 1 });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}
