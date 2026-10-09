// Owner CRM: every quote request from every site lands in `leads`; this endpoint lets the owner work them (status, notes, amounts, follow-ups) and add phone leads by hand.
// Needs ADMIN_PIN (header x-admin-pin). All sites share one database, so one CRM covers them all.
import { db, ensureTable, adminOk, clean } from './_lib.js';

const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'done', 'lost'];
const SOURCES = ['website', 'ad', 'phone', 'referral', 'other'];
const SITES = ['spring', 'tomball', 'cypress', 'college-station', 'indiana', 'florida'];
const money = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : undefined; };
const day = v => { if (v === '' || v == null) return null; return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(Date.parse(v)) ? String(v) : undefined; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!adminOk(req)) return res.status(401).json({ error: 'Admin PIN required' });
  const sql = db(); if (!sql) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTable(sql);
    if (req.method === 'GET') {
      const leads = await sql`SELECT id, site, created_at, name, phone, email, service, city, zip, message, photos, status, notes, source,
        quote_amount::float8 AS quote_amount, job_amount::float8 AS job_amount, to_char(follow_up, 'YYYY-MM-DD') AS follow_up, contacted_at
        FROM leads ORDER BY created_at DESC LIMIT 1000`;
      return res.status(200).json({ leads, statuses: STATUSES, sources: SOURCES });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (b.action === 'add') {
      const name = clean(b.name, 120), phone = clean(b.phone, 40);
      if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
      const site = SITES.includes(b.site) ? b.site : 'indiana', source = SOURCES.includes(b.source) ? b.source : 'phone';
      const status = STATUSES.includes(b.status) ? b.status : 'new';
      const [row] = await sql`INSERT INTO leads (site, name, phone, email, service, city, zip, message, page, source, status, contacted_at)
        VALUES (${site}, ${name}, ${phone}, ${clean(b.email, 120)}, ${clean(b.service, 80)}, ${clean(b.city, 80)}, ${clean(b.zip, 12)}, ${clean(b.message, 800)}, 'added by hand', ${source}, ${status},
        ${status === 'new' ? null : new Date().toISOString()}) RETURNING id`;
      return res.status(201).json({ ok: true, id: row.id });
    }

    const id = Number(b.id); if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
    if (b.action === 'delete') {
      const r = await sql`DELETE FROM leads WHERE id = ${id} RETURNING id`;
      return res.status(200).json({ ok: true, deleted: r.length });
    }
    if (b.action === 'update') {
      const f = b.fields || {};
      const has = k => Object.prototype.hasOwnProperty.call(f, k);
      const status = has('status') ? (STATUSES.includes(f.status) ? f.status : undefined) : null;
      const source = has('source') ? (SOURCES.includes(f.source) ? f.source : undefined) : null;
      const quote = has('quote_amount') ? money(f.quote_amount) : null, job = has('job_amount') ? money(f.job_amount) : null, fu = has('follow_up') ? day(f.follow_up) : null;
      if ([status, source, quote, job, fu].includes(undefined)) return res.status(400).json({ error: 'Bad value' });
      const notes = has('notes') ? clean(f.notes, 4000) : null;
      const name = has('name') ? clean(f.name, 120) : null, phone = has('phone') ? clean(f.phone, 40) : null;
      const r = await sql`UPDATE leads SET
        status = COALESCE(${status}::text, status),
        source = COALESCE(${source}::text, source),
        notes = COALESCE(${notes}::text, notes),
        name = COALESCE(NULLIF(${name}::text, ''), name),
        phone = COALESCE(NULLIF(${phone}::text, ''), phone),
        quote_amount = CASE WHEN ${has('quote_amount')}::boolean THEN ${quote}::numeric ELSE quote_amount END,
        job_amount = CASE WHEN ${has('job_amount')}::boolean THEN ${job}::numeric ELSE job_amount END,
        follow_up = CASE WHEN ${has('follow_up')}::boolean THEN ${fu}::date ELSE follow_up END,
        contacted_at = CASE WHEN contacted_at IS NULL AND ${status}::text IS NOT NULL AND ${status}::text <> 'new' THEN now() ELSE contacted_at END
        WHERE id = ${id} RETURNING id`;
      return res.status(200).json({ ok: true, updated: r.length });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
}
