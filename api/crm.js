// Owner CRM: every quote request from every site lands in `leads`; this endpoint lets the owner work them (status, schedule, crew, amounts, follow-ups, a full activity timeline)
// and add phone leads by hand. Needs ADMIN_PIN (header x-admin-pin). All sites share one database, so one CRM covers them all.
import { db, ensureTable, adminOk, clean } from './_lib.js';

const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'done', 'lost'];
const SOURCES = ['website', 'ad', 'phone', 'referral', 'other'];
const SITES = ['spring', 'tomball', 'cypress', 'college-station', 'indiana', 'florida'];
const LOST = ['', 'price', 'no response', 'went elsewhere', 'not ready', 'outside area', 'other'];
const money = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : undefined; };
const day = v => { if (v === '' || v == null) return null; return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(Date.parse(v)) ? String(v) : undefined; };
const when = v => { if (v === '' || v == null) return null; const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : undefined; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!adminOk(req)) return res.status(401).json({ error: 'Admin PIN required' });
  const sql = db(); if (!sql) return res.status(503).json({ error: 'Database not configured' });
  try {
    await ensureTable(sql);
    if (req.method === 'GET') {
      const eid = Number(req.query && req.query.events);
      if (eid) {
        const events = await sql`SELECT id, at, kind, text FROM lead_events WHERE lead_id = ${eid} ORDER BY at DESC, id DESC LIMIT 200`;
        return res.status(200).json({ events });
      }
      const leads = await sql`SELECT id, site, created_at, name, phone, email, service, city, zip, address, message, photos, status, notes, source, assigned, lost_reason,
        quote_amount::float8 AS quote_amount, job_amount::float8 AS job_amount, to_char(follow_up, 'YYYY-MM-DD') AS follow_up, contacted_at, scheduled_for, (SELECT max(at) FROM lead_events e WHERE e.lead_id = leads.id) AS last_activity FROM leads ORDER BY created_at DESC LIMIT 1500`;
      const crew = await sql`SELECT DISTINCT name FROM crew_codes WHERE active = true ORDER BY name`;
      return res.status(200).json({ leads, crew: crew.map(c => c.name), statuses: STATUSES, sources: SOURCES, lost: LOST });
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

    const id = Number(b.id); if (!Number.isInteger(id)) return res.status(400).json({ error: 'id required' });
    if (b.action === 'delete') {
      await sql`DELETE FROM lead_events WHERE lead_id = ${id}`;
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
