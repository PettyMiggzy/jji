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
export async function ensureJarvis(sql) {
  await sql`CREATE TABLE IF NOT EXISTS jarvis_messages (id SERIAL PRIMARY KEY, thread TEXT NOT NULL DEFAULT 'main', role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', images JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS jarvis_requests (id SERIAL PRIMARY KEY, thread TEXT NOT NULL DEFAULT 'main', sites TEXT, page TEXT, summary TEXT NOT NULL, urgency TEXT NOT NULL DEFAULT 'normal', images JSONB NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'new', reply TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
}
