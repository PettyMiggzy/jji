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
}
export function crewOk(req) {
  const pin = process.env.CREW_PIN || '';
  const got = String(req.headers['x-crew-pin'] || '');
  if (!pin || got.length !== pin.length) return false;
  let d = 0; for (let i = 0; i < pin.length; i++) d |= pin.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
export function clean(s, max) { return String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max); }
