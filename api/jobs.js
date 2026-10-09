import { put, del } from '@vercel/blob';
import { site, db, ensureTable, crewWho, adminGate, clean } from './_lib.js';
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
    if (req.method === 'GET' && req.query.open) {
      res.setHeader('Cache-Control', 'no-store');
      if (!sql) return res.status(503).json({ error: 'Database not configured yet' });
      await ensureTable(sql);
      const who = await crewWho(req, sql);
      if (!who) return res.status(401).json({ error: 'Wrong code' });
      const open = await sql`SELECT id, created_at, service, city, area, before_url, crew_name FROM jobs WHERE status = 'open' ORDER BY created_at DESC LIMIT 50`;
      return res.status(200).json({ ok: true, name: who.name, jobs: open });
    }
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      if (!sql) return res.status(200).json({ configured: false, jobs: [] });
      await ensureTable(sql);
      const rows = await sql`SELECT id, created_at, service, city, area, lat, lon, description, before_url, after_url
        FROM jobs WHERE site = ${site} AND hidden = false AND status = 'done' ORDER BY created_at DESC LIMIT 300`;
      return res.status(200).json({ configured: true, jobs: rows });
    }
    if (req.method === 'DELETE') {
      if (!(await adminGate(req, res, sql))) return;
    }
    if (!sql) return res.status(503).json({ error: 'Database not configured yet' });
    await ensureTable(sql);
    const who = req.method === 'DELETE' ? null : await crewWho(req, sql);
    if (req.method !== 'DELETE' && !who) return res.status(401).json({ error: 'Wrong code' });

    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const gbpAfterPost = async (id, jobSite, urls, wantGbp) => {
        if (!wantGbp) return 'none';
        try { await uploadToGbp(jobSite, urls); await sql`UPDATE jobs SET gbp_status='done' WHERE id=${id}`; return 'done'; }
        catch (e) { console.error(e); await sql`UPDATE jobs SET gbp_status='failed' WHERE id=${id}`; return 'failed'; }
      };

      // Step 2 of the two-step flow: the crew adds the "after" photo and the job goes live on the map.
      if (b.action === 'finish') {
        const id = Number(b.id), after = decodeImg(b.after);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
        if (!after) return res.status(400).json({ error: 'An "after" photo (JPEG) is required' });
        const [job] = await sql`SELECT id, site, city, before_url FROM jobs WHERE id = ${id} AND status = 'open'`;
        if (!job) return res.status(404).json({ error: 'That job is already finished or was removed' });
        const aUrl = (await put(`jobs/${job.site}/${Date.now()}-after.jpg`, after, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })).url;
        const wantGbp = b.gbp !== false && gbpConfigured(job.site);
        await sql`UPDATE jobs SET after_url = ${aUrl}, status = 'done', created_at = now(), description = COALESCE(NULLIF(${clean(b.description, 600)}, ''), description), gbp_status = ${wantGbp ? 'pending' : 'none'} WHERE id = ${id}`;
        const gbp = await gbpAfterPost(id, job.site, [aUrl, job.before_url], wantGbp);
        return res.status(200).json({ ok: true, id, site: job.site, city: job.city, gbp });
      }

      const start = b.action === 'start';
      const after = start ? null : decodeImg(b.after), before = b.before ? decodeImg(b.before) : null;
      if (start && !before) return res.status(400).json({ error: 'A "before" photo (JPEG) is required to start a job' });
      if (!start && !after) return res.status(400).json({ error: 'An "after" photo (JPEG) is required' });
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
      const aUrl = after ? (await put(`jobs/${jobSite}/${stamp}-after.jpg`, after, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })).url : null;
      const bUrl = before ? (await put(`jobs/${jobSite}/${stamp}-before.jpg`, before, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true })).url : null;
      const wantGbp = !start && b.gbp !== false && gbpConfigured(jobSite);
      const [row] = await sql`INSERT INTO jobs (site, service, city, area, lat, lon, description, before_url, after_url, gbp_status, crew_name, status)
        VALUES (${jobSite}, ${clean(b.service, 60)}, ${city}, ${clean(b.area, 80)}, ${rLat}, ${rLon}, ${clean(b.description, 600)}, ${bUrl}, ${aUrl}, ${wantGbp ? 'pending' : 'none'}, ${who.name}, ${start ? 'open' : 'done'})
        RETURNING id, created_at`;
      if (start) return res.status(201).json({ ok: true, id: row.id, started: true, site: jobSite, siteName: near.siteName, city });
      const gbp = await gbpAfterPost(row.id, jobSite, [aUrl, bUrl], wantGbp);
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
