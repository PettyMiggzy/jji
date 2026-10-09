// Public client page API. A customer opens the link we text them (a long random token) to see a quote or invoice, and can approve a quote or ask for changes.
// Nothing here lists anything: you can only fetch the one document whose token you hold.
import { db, ensureTable, clean } from './_lib.js';
import { bizOf, docNumber, totals, paidSum } from './_docs.js';
import { notifySms } from './lead.js';

const money = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const sql = db(); if (!sql) return res.status(503).json({ error: 'Not available right now' });
  try {
    await ensureTable(sql);
    const b = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})) : {};
    const t = String((req.method === 'POST' ? b.t : req.query && req.query.t) || '');
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(t)) return res.status(404).json({ error: 'This link is not valid.' });
    let kind = 'quote', [doc] = await sql`SELECT * FROM quotes WHERE token = ${t}`;
    if (!doc) { kind = 'invoice'; [doc] = await sql`SELECT *, to_char(due_date, 'YYYY-MM-DD') AS due FROM invoices WHERE token = ${t}`; }
    if (!doc) return res.status(404).json({ error: 'This link is not valid.' });
    const [lead] = await sql`SELECT id, site, name, status FROM leads WHERE id = ${doc.lead_id}`; if (!lead) return res.status(404).json({ error: 'This link is not valid.' });
    const biz = bizOf(lead.site), tt = totals(doc.items, doc.discount_pct, doc.tax_pct), table = kind === 'quote' ? 'quotes' : 'invoices';
    const log = (k, text) => sql`INSERT INTO lead_events (lead_id, kind, text) VALUES (${lead.id}, ${k}, ${text})`;

    if (req.method === 'POST') {
      if (kind !== 'quote') return res.status(400).json({ error: 'Nothing to do on an invoice.' });
      if (doc.status === 'draft') return res.status(404).json({ error: 'This link is not valid.' });
      if (doc.status === 'approved') return res.status(200).json({ ok: true, status: 'approved' });
      const num = docNumber('quote', doc.id);
      if (b.action === 'approve') {
        const name = clean(b.name, 80); if (name.length < 2) return res.status(400).json({ error: 'Type your full name to approve.' });
        await sql`UPDATE quotes SET status = 'approved', decided_at = now(), signed_name = ${name}, client_note = ${clean(b.note, 600)} WHERE id = ${doc.id}`;
        await sql`UPDATE leads SET status = CASE WHEN status = 'done' THEN status ELSE 'booked' END, quote_amount = ${tt.total}::numeric, job_amount = COALESCE(job_amount, ${tt.total}::numeric), contacted_at = COALESCE(contacted_at, now()) WHERE id = ${lead.id}`;
        await log('quote_approved', num + '|' + name);
        await notifySms(`Quote ${num} APPROVED by ${name} (${money(tt.total)}) - ${lead.site}. Schedule it in the CRM.`);
        return res.status(200).json({ ok: true, status: 'approved' });
      }
      if (b.action === 'changes' || b.action === 'decline') {
        const st = b.action === 'changes' ? 'changes_requested' : 'declined', note = clean(b.note, 600);
        if (st === 'changes_requested' && !note) return res.status(400).json({ error: 'Tell us what you would like changed.' });
        await sql`UPDATE quotes SET status = ${st}, decided_at = now(), client_note = ${note} WHERE id = ${doc.id}`;
        await log(st === 'declined' ? 'quote_declined' : 'quote_changes', num + '|' + note);
        await notifySms(`Quote ${num} ${st === 'declined' ? 'DECLINED' : 'needs changes'} by ${firstName(lead.name)}${note ? ': ' + note.slice(0, 120) : ''} - ${lead.site}`);
        return res.status(200).json({ ok: true, status: st });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    if (doc.status === 'draft') return res.status(404).json({ error: 'This link is not valid.' });
    if (!doc.viewed_at) { if (kind === 'quote') await sql`UPDATE quotes SET viewed_at = now() WHERE id = ${doc.id}`; else await sql`UPDATE invoices SET viewed_at = now() WHERE id = ${doc.id}`; await log(kind + '_viewed', docNumber(kind, doc.id)); }
    const paid = paidSum(doc.payments);
    return res.status(200).json({
      kind, number: docNumber(kind, doc.id), status: doc.status, client: firstName(lead.name), business: { name: biz.name, phone: biz.phone },
      items: doc.items, discount_pct: Number(doc.discount_pct), tax_pct: Number(doc.tax_pct), ...tt, message: doc.message, deposit: kind === 'quote' ? Number(doc.deposit) : 0,
      due: doc.due || null, paid, balance: kind === 'invoice' ? Math.max(0, Math.round((tt.total - paid) * 100) / 100) : 0, payments: kind === 'invoice' ? (doc.payments || []).map(p => ({ amount: p.amount, method: p.method, at: p.at })) : [],
      signed_name: doc.signed_name, decided_at: doc.decided_at, sent_at: doc.sent_at
    });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Something went wrong. Please call us.' }); }
}
