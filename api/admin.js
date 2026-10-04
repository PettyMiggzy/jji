// Owner dashboard API. Needs ADMIN_PIN (header x-admin-pin). Works across all sites because they share one database.
import { db, ensureTable } from './_lib.js';
import { uploadToGbp, gbpConfigured } from './_gbp.js';

function adminOk(req) {
  const ap = process.env.ADMIN_PIN || '', got = String(req.headers['x-admin-pin'] || '');
  if (!ap || got.length !== ap.length) return false;
  let d = 0; for (let i = 0; i < ap.length; i++) d |= ap.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!adminOk(req)) return res.status(401).json({ error: 'Admin PIN required' });
  const sql = db(); if (!sql) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTable(sql);
    if (req.method === 'GET') {
      const stats = await sql`SELECT site, COUNT(*) FILTER (WHERE NOT hidden)::int AS jobs, COUNT(*) FILTER (WHERE hidden)::int AS hidden,
        MAX(created_at) AS last_job,
        COUNT(*) FILTER (WHERE gbp_status='done')::int AS gbp_done, COUNT(*) FILTER (WHERE gbp_status='pending')::int AS gbp_pending,
        COUNT(*) FILTER (WHERE gbp_status='failed')::int AS gbp_failed
        FROM jobs GROUP BY site ORDER BY site`;
      const jobs = await sql`SELECT id, site, created_at, service, city, area, description, before_url, after_url, hidden, gbp_status FROM jobs ORDER BY created_at DESC LIMIT 150`;
      const leads = await sql`SELECT id, site, created_at, name, phone, email, service, city, zip, message FROM leads ORDER BY created_at DESC LIMIT 100`;
      const gbp = {}; for (const s of ['spring', 'tomball', 'cypress', 'college-station', 'indiana']) gbp[s] = gbpConfigured(s);
      return res.status(200).json({ stats, jobs, leads, gbp, reviews: !!(process.env.GOOGLE_PLACES_KEY && process.env.GOOGLE_PLACE_ID) });
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = Number(b.id); if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
      if (b.action === 'hide' || b.action === 'unhide') {
        const r = await sql`UPDATE jobs SET hidden = ${b.action === 'hide'} WHERE id = ${id} RETURNING id`;
        return res.status(200).json({ ok: true, updated: r.length });
      }
      if (b.action === 'retry_gbp') {
        const [j] = await sql`SELECT site, before_url, after_url FROM jobs WHERE id = ${id}`;
        if (!j) return res.status(404).json({ error: 'not found' });
        if (!gbpConfigured(j.site)) return res.status(400).json({ error: 'Google profile not connected for ' + j.site });
        try { await uploadToGbp(j.site, [j.after_url, j.before_url]); await sql`UPDATE jobs SET gbp_status='done' WHERE id=${id}`; return res.status(200).json({ ok: true, gbp: 'done' }); }
        catch (e) { console.error(e); await sql`UPDATE jobs SET gbp_status='failed' WHERE id=${id}`; return res.status(502).json({ error: 'Google upload failed' }); }
      }
      return res.status(400).json({ error: 'unknown action' });
    }
    res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}
