// Posts job photos to the right Google Business Profile location (Business Profile API v4 media).
// Vercel env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GBP_CONFIG =
//   {"spring":{"location":"accounts/123/locations/456","refresh":"<refresh token>"}, "tomball":{...}}
// `refresh` can be left out per site when GBP_REFRESH_TOKEN is set (one Google login that manages every location).
async function accessToken(refresh) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: refresh, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('google token: ' + (j.error || r.status));
  return j.access_token;
}
function cfg(site) { try { return JSON.parse(process.env.GBP_CONFIG || '{}')[site] || null; } catch (_) { return null; } }
export function gbpConfigured(site) {
  const c = cfg(site);
  return !!(c && c.location && (c.refresh || process.env.GBP_REFRESH_TOKEN) && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
export async function uploadToGbp(site, urls) {
  const c = cfg(site);
  if (!gbpConfigured(site)) return { skipped: true };
  const token = await accessToken(c.refresh || process.env.GBP_REFRESH_TOKEN), names = [];
  for (const sourceUrl of urls.filter(Boolean)) {
    const r = await fetch(`https://mybusiness.googleapis.com/v4/${c.location}/media`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaFormat: 'PHOTO', locationAssociation: { category: 'ADDITIONAL' }, sourceUrl }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('gbp media ' + r.status + ' ' + ((j.error && j.error.message) || ''));
    names.push(j.name || '');
  }
  return { ok: true, names };
}
