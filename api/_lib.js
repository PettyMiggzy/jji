import { neon } from '@neondatabase/serverless';
import SITE from './_site.js';
export const site = SITE;
export function db() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}
export async function ensureTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY, site TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    service TEXT, city TEXT, area TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    description TEXT, before_url TEXT, after_url TEXT)`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gbp_status TEXT NOT NULL DEFAULT 'none'`;
  await sql`CREATE TABLE IF NOT EXISTS leads (id SERIAL PRIMARY KEY, site TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), name TEXT, phone TEXT, email TEXT, service TEXT, city TEXT, zip TEXT, address TEXT, message TEXT, page TEXT)`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_amount NUMERIC(10,2)`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS job_amount NUMERIC(10,2)`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up DATE`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason TEXT NOT NULL DEFAULT ''`;
  await sql`CREATE TABLE IF NOT EXISTS lead_events (id SERIAL PRIMARY KEY, lead_id INT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now(), kind TEXT NOT NULL, text TEXT NOT NULL DEFAULT '')`;
  await sql`CREATE INDEX IF NOT EXISTS lead_events_lead ON lead_events (lead_id, at DESC)`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS crew_name TEXT`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'`;
  await sql`CREATE TABLE IF NOT EXISTS crew_codes (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
}
// Who is posting? The shared CREW_PIN still works (shown as "Crew"); otherwise the code must belong to an active crew member.
export async function crewWho(req, sql) {
  const ip = ipOf(req);
  if (await lockedOut(sql, ip)) return null;
  if (crewOk(req)) return { name: 'Crew' };
  const got = String(req.headers['x-crew-pin'] || '').trim();
  if (!sql || !/^[A-Za-z0-9]{4,12}$/.test(got)) { if (got) await noteFail(sql, ip); return null; }
  const [r] = await sql`SELECT name FROM crew_codes WHERE code = ${got} AND active = true`;
  if (!r) await noteFail(sql, ip);
  return r ? { name: r.name } : null;
}
export function crewOk(req) {
  const pin = process.env.CREW_PIN || '';
  const got = String(req.headers['x-crew-pin'] || '');
  if (!pin || got.length !== pin.length) return false;
  let d = 0; for (let i = 0; i < pin.length; i++) d |= pin.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
export function clean(s, max) { return String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max); }
export function adminOk(req) {
  const ap = process.env.ADMIN_PIN || '', got = String(req.headers['x-admin-pin'] || '');
  if (!ap || got.length !== ap.length) return false;
  let d = 0; for (let i = 0; i < ap.length; i++) d |= ap.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}

// Wrong-PIN lockout: 10 wrong tries from one address in 15 minutes locks that address out for the rest of the window. Fails open if the database is down.
const ipOf = req => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 64);
async function lockedOut(sql, ip) {
  if (!sql) return false;
  try {
    await sql`CREATE TABLE IF NOT EXISTS admin_fails (id SERIAL PRIMARY KEY, ip TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    const [r] = await sql`SELECT count(*)::int AS n FROM admin_fails WHERE ip = ${ip} AND at > now() - interval '15 minutes'`;
    return r.n >= 10;
  } catch (e) { return false; }
}
async function noteFail(sql, ip) {
  if (!sql) return;
  try { await sql`INSERT INTO admin_fails (ip) VALUES (${ip})`; await sql`DELETE FROM admin_fails WHERE at < now() - interval '1 day'`; } catch (e) {}
}
// Use at the top of every owner-only endpoint. Returns true when the request may continue; otherwise it has already answered.
export async function adminGate(req, res, sql) {
  const ip = ipOf(req);
  if (await lockedOut(sql, ip)) { res.status(429).json({ error: 'Too many wrong PINs. Try again in 15 minutes.' }); return false; }
  if (adminOk(req)) return true;
  if (String(req.headers['x-admin-pin'] || '')) await noteFail(sql, ip);
  res.status(401).json({ error: 'Admin PIN required' }); return false;
}
export async function ensureJarvis(sql) {
  await sql`CREATE TABLE IF NOT EXISTS jarvis_messages (id SERIAL PRIMARY KEY, thread TEXT NOT NULL DEFAULT 'main', role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', images JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS jarvis_requests (id SERIAL PRIMARY KEY, thread TEXT NOT NULL DEFAULT 'main', sites TEXT, page TEXT, summary TEXT NOT NULL, urgency TEXT NOT NULL DEFAULT 'normal', images JSONB NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'new', reply TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
}
