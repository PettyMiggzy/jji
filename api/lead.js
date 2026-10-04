// Saves a copy of each quote request so the owner dashboard can list leads. Email still goes out through Web3Forms.
import { site, db, ensureTable, clean } from './_lib.js';
// Optional text-message alert to the owner. Active only when TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM and NOTIFY_TO (comma-separated numbers) are set.
export async function notifySms(text) {
  const { TWILIO_SID: sid, TWILIO_TOKEN: tok, TWILIO_FROM: from, NOTIFY_TO: to } = process.env;
  if (!sid || !tok || !from || !to) return;
  await Promise.all(to.split(',').map(n => n.trim()).filter(Boolean).map(n =>
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: n, Body: text.slice(0, 600) }) }).catch(() => {})));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const sql = db();
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (b.botcheck) return res.status(200).json({ ok: true });                       // honeypot
    const name = clean([b.name, b.first_name, b.last_name].filter(Boolean).join(' '), 120), phone = clean(b.phone, 40);
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    await notifySms(`New quote (${site}): ${name} ${phone}${b.service ? ' | ' + clean(b.service, 80) : ''}${b.zip || b.city ? ' | ' + clean(b.zip || b.city, 40) : ''}${b.message || b.details ? ' | ' + clean(b.message || b.details, 300) : ''}`);
    if (!sql) return res.status(200).json({ ok: false });
    await ensureTable(sql);
    await sql`INSERT INTO leads (site, name, phone, email, service, city, zip, address, message, page)
      VALUES (${site}, ${name}, ${phone}, ${clean(b.email, 120)}, ${clean(b.service, 80)}, ${clean(b.city, 80)}, ${clean(b.zip, 12)}, ${clean(b.address, 160)}, ${clean(b.message || b.details, 800)}, ${clean(b.page || b.subject, 160)})`;
    return res.status(201).json({ ok: true });
  } catch (e) { console.error(e); return res.status(200).json({ ok: false }); }
}
