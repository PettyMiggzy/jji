// Saves a copy of each quote request so the owner dashboard can list leads. Email still goes out through Web3Forms.
import { put } from '@vercel/blob';
import { site, db, ensureTable, clean } from './_lib.js';

const MAX_PHOTO = 1_200_000; // bytes per photo after base64 decode; the request limit on Vercel is 4.5 MB total
function decodeJpeg(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  return buf.length > 0 && buf.length <= MAX_PHOTO && buf[0] === 0xff && buf[1] === 0xd8 ? buf : null;
}
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
    // Customer photos (optional, up to 4): stored publicly under an unguessable name, linked from the email and the dashboard.
    const photoBufs = (Array.isArray(b.photos) ? b.photos : []).slice(0, 4).map(decodeJpeg).filter(Boolean);
    const photoUrls = [];
    for (let i = 0; i < photoBufs.length; i++) {
      try { photoUrls.push((await put(`quotes/${site}/${Date.now()}-${i}.jpg`, photoBufs[i], { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })).url); }
      catch (e) { console.error(e); }
    }
    await notifySms(`New quote (${site}): ${name} ${phone}${b.service ? ' | ' + clean(b.service, 80) : ''}${b.zip || b.city ? ' | ' + clean(b.zip || b.city, 40) : ''}${b.message || b.details ? ' | ' + clean(b.message || b.details, 300) : ''}${photoUrls.length ? ' | ' + photoUrls.length + ' photo(s): ' + photoUrls[0] : ''}`);
    if (!sql) return res.status(200).json({ ok: false, photos: photoUrls });
    await ensureTable(sql);
    await sql`INSERT INTO leads (site, name, phone, email, service, city, zip, address, message, page, photos, source)
      VALUES (${site}, ${name}, ${phone}, ${clean(b.email, 120)}, ${clean(b.service, 80)}, ${clean(b.city, 80)}, ${clean(b.zip, 12)}, ${clean(b.address, 160)}, ${clean(b.message || b.details, 800)}, ${clean(b.page || b.subject, 160)}, ${JSON.stringify(photoUrls)}::jsonb, ${b.source === 'ad' ? 'ad' : 'website'})`;
    return res.status(201).json({ ok: true, photos: photoUrls });
  } catch (e) { console.error(e); return res.status(200).json({ ok: false }); }
}
