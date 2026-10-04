import { put, del } from '@vercel/blob';
import { site, db, ensureTable, crewOk, clean } from './_lib.js';
import { nearest } from './_routes.js';
import { uploadToGbp, gbpConfigured } from './_gbp.js';

const MAX_IMG = 1_900_000; // bytes after base64 decode; the request limit on Vercel is 4.5 MB total

function decodeImg(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  return buf.length > 0 && buf.length <= MAX_IMG && buf[0] === 0xff && buf[1] === 0xd8 ? buf : null;
}

export default async function handler(req, res) {
  const sql = db();
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      if (!sql) return res.status(200).json({ configured: false, jobs: [] });
      await ensureTable(sql);
      const rows = await sql`SELECT id, created_at, service, city, area, lat, lon, description, before_url, after_url
        FROM jobs WHERE site = ${site} AND hidden = false ORDER BY created_at DESC LIMIT 300`;
      return res.status(200).json({ configured: true, jobs: rows });
    }
    if (req.method === 'DELETE') {
      const ap = process.env.ADMIN_PIN || '', got = String(req.headers['x-admin-pin'] || '');
      let d = ap.length === got.length && ap.length > 0 ? 0 : 1; for (let i = 0; i < ap.length && !d; i++) d |= ap.charCodeAt(i) ^ got.charCodeAt(i);
      if (d) return res.status(401).json({ error: 'Admins only' });
    } else if (!crewOk(req)) return res.status(401).json({ error: 'Wrong PIN' });
    if (!sql) return res.status(503).json({ error: 'Database not configured yet' });
    await ensureTable(sql);

    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const after = decodeImg(b.after), before = b.before ? decodeImg(b.before) : null;
      if (!after) return res.status(400).json({ error: 'An "after" photo (JPEG) is required' });
      if (b.before && !before) return res.status(400).json({ error: 'Bad "before" photo' });
      const lat = Number(b.lat), lon = Number(b.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ error: 'Location required' });
      // privacy: round to 2 decimals (about 1 km) so we never publish a customer's exact address
      const rLat = Math.round(lat * 100) / 100, rLon = Math.round(lon * 100) / 100;
      // route the job to the nearest of our service areas: this decides which site, map and Google profile it belongs to
      const near = nearest(lat, lon);
      if (!near) return res.status(400).json({ error: 'That location is outside all of our service areas' });
      const jobSite = near.site;
      const city = clean(b.city, 60) && b.city !== 'Auto' ? clean(b.city, 60) : near.city;
      const stamp = Date.now();
      const aUrl = (await put(`jobs/${jobSite}/${stamp}-after.jpg`, after, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })).url;
      const bUrl = before ? (await put(`jobs/${jobSite}/${stamp}-before.jpg`, before, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })).url : null;
      const wantGbp = b.gbp !== false && gbpConfigured(jobSite);
      const [row] = await sql`INSERT INTO jobs (site, service, city, area, lat, lon, description, before_url, after_url, gbp_status)
        VALUES (${jobSite}, ${clean(b.service, 60)}, ${city}, ${clean(b.area, 80)}, ${rLat}, ${rLon}, ${clean(b.description, 600)}, ${bUrl}, ${aUrl}, ${wantGbp ? 'pending' : 'none'})
        RETURNING id, created_at`;
      let gbp = 'none';
      if (wantGbp) {
        try { await uploadToGbp(jobSite, [aUrl, bUrl]); await sql`UPDATE jobs SET gbp_status='done' WHERE id=${row.id}`; gbp = 'done'; }
        catch (e) { console.error(e); await sql`UPDATE jobs SET gbp_status='failed' WHERE id=${row.id}`; gbp = 'failed'; }
      }
      return res.status(201).json({ ok: true, id: row.id, site: jobSite, siteName: near.siteName, city, gbp });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
      const rows = await sql`DELETE FROM jobs WHERE id = ${id} AND site = ${site} RETURNING before_url, after_url`;
      for (const r of rows) for (const u of [r.before_url, r.after_url]) if (u) { try { await del(u); } catch (_) {} }
      return res.status(200).json({ ok: true, deleted: rows.length });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
