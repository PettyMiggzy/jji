// Retries Google Business Profile uploads that failed or were pending. Daily Vercel Cron, or call manually with the crew PIN.
import { db, ensureTable, crewOk } from './_lib.js';
import { uploadToGbp, gbpConfigured } from './_gbp.js';
export default async function handler(req, res) {
  const cron = process.env.CRON_SECRET && req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET;
  if (!cron && !crewOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const sql = db(); if (!sql) return res.status(503).json({ error: 'no database' });
  await ensureTable(sql);
  const rows = await sql`SELECT id, site, before_url, after_url FROM jobs WHERE gbp_status IN ('pending','failed') AND created_at > now() - interval '7 days' ORDER BY id LIMIT 25`;
  let ok = 0, failed = 0, skipped = 0;
  for (const j of rows) {
    if (!gbpConfigured(j.site)) { skipped++; continue; }
    try { await uploadToGbp(j.site, [j.after_url, j.before_url]); await sql`UPDATE jobs SET gbp_status='done' WHERE id=${j.id}`; ok++; }
    catch (e) { console.error(e); await sql`UPDATE jobs SET gbp_status='failed' WHERE id=${j.id}`; failed++; }
  }
  return res.status(200).json({ checked: rows.length, ok, failed, skipped });
}
