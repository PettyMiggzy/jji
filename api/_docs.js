// Shared helpers for quotes and invoices (owner CRM + the public client page).
import { randomBytes } from 'node:crypto';

export const BIZ = {
  spring: { name: 'Junk Junkies Texas Junk Removal Spring', phone: '(346) 413-9644', domain: 'junkjunkiestexas.com' },
  tomball: { name: 'Junk Junkies Texas Junk Removal Tomball', phone: '(346) 413-9644', domain: 'junkjunkiestomball.com' },
  cypress: { name: 'Junk Junkies Texas Junk Removal Cypress', phone: '(346) 413-9644', domain: 'junkjunkiescypress.com' },
  'college-station': { name: 'Junk Junkies Texas Junk Removal College Station', phone: '(346) 413-9644', domain: 'junkjunkiescollegestation.com' },
  indiana: { name: 'Junk Junkies Indiana Junk Removal Indianapolis', phone: '(317) 637-8807', domain: 'www.junkjunkiesindiana.com' },
  florida: { name: 'Junk Junkies', phone: '(346) 413-9644', domain: 'junkjunkiestexas.com' }
};
export const bizOf = site => BIZ[site] || BIZ.indiana;
export const linkFor = (site, kind, token) => 'https://' + bizOf(site).domain + '/q/?t=' + token;
export const newToken = () => randomBytes(18).toString('base64url'); // 24 URL-safe characters, unguessable
export const docNumber = (kind, id) => (kind === 'quote' ? 'Q-' : 'INV-') + (1000 + Number(id));
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const pct = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? r2(n) : 0; };
export const amt = v => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 && n < 1e7 ? r2(n) : null; };

// Line items: [{name, description, qty, price}] cleaned and capped.
export function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).map(i => ({
    name: String(i && i.name || '').replace(/[<>]/g, '').trim().slice(0, 120),
    description: String(i && i.description || '').replace(/[<>]/g, '').trim().slice(0, 300),
    qty: (() => { const q = Number(i && i.qty); return Number.isFinite(q) && q > 0 && q <= 1000 ? r2(q) : 1; })(),
    price: amt(i && i.price) ?? 0
  })).filter(i => i.name);
}
export function totals(items, discountPct, taxPct) {
  const subtotal = r2((items || []).reduce((a, i) => a + Number(i.qty) * Number(i.price), 0));
  const discount = r2(subtotal * pct(discountPct) / 100), taxable = r2(subtotal - discount), tax = r2(taxable * pct(taxPct) / 100);
  return { subtotal, discount, tax, total: r2(taxable + tax) };
}
export const paidSum = payments => r2((payments || []).reduce((a, p) => a + Number(p.amount || 0), 0));
