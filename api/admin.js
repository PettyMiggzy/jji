// Owner dashboard API. Needs ADMIN_PIN (header x-admin-pin). Works across all sites because they share one database.
import { db, ensureTable, adminGate } from './_lib.js';
import { uploadToGbp, gbpConfigured } from './_gbp.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const sql = db();
  if (!(await adminGate(req, res, sql))) return;
  if (!sql) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTable(sql);
    if (req.method === 'GET') {
      const stats = await sql`SELECT site, COUNT(*) FILTER (WHERE NOT hidden)::int AS jobs, COUNT(*) FILTER (WHERE hidden)::int AS hidden,
        MAX(created_at) AS last_job,
        COUNT(*) FILTER (WHERE gbp_status='done')::int AS gbp_done, COUNT(*) FILTER (WHERE gbp_status='pending')::int AS gbp_pending,
        COUNT(*) FILTER (WHERE gbp_status='failed')::int AS gbp_failed
        FROM jobs GROUP BY site ORDER BY site`;
      const jobs = await sql`SELECT id, site, created_at, service, city, area, description, before_url, after_url, hidden, gbp_status, crew_name, status FROM jobs ORDER BY created_at DESC LIMIT 150`;
      const leads = await sql`SELECT id, site, created_at, name, phone, email, service, city, zip, message, photos FROM leads ORDER BY created_at DESC LIMIT 100`;
      const gbp = {}; for (const s of ['spring', 'tomball', 'cypress', 'college-station', 'indiana']) gbp[s] = gbpConfigured(s);
      const crew = await sql`SELECT id, code, name, active, created_at FROM crew_codes ORDER BY active DESC, created_at DESC`;
      return res.status(200).json({ stats, jobs, leads, crew, gbp, reviews: !!(process.env.GOOGLE_PLACES_KEY && process.env.GOOGLE_PLACE_ID) });
    }
    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (b.action === 'crew_add') {
        const name = String(b.name || '').replace(/[<>]/g, '').trim().slice(0, 60);
        if (!name) return res.status(400).json({ error: 'Type the crew member\'s name' });
        const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L so codes are easy to read and type
        for (let t = 0; t < 5; t++) {
          let code = ''; for (const n of crypto.getRandomValues(new Uint8Array(6))) code += abc[n % abc.length];
          try { await sql`INSERT INTO crew_codes (code, name) VALUES (${code}, ${name})`; return res.status(201).json({ ok: true, code, name }); } catch (e) { if (t === 4) throw e; }
        }
      }
      const id = Number(b.id); if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
      if (b.action === 'crew_revoke' || b.action === 'crew_restore') {
        const r = await sql`UPDATE crew_codes SET active = ${b.action === 'crew_restore'} WHERE id = ${id} RETURNING id`;
        return res.status(200).json({ ok: true, updated: r.length });
      }
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
