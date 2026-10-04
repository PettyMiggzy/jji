// Live Google reviews via the Places API (New). Needs env: GOOGLE_PLACES_KEY, GOOGLE_PLACE_ID
function trim(t, max = 420) { if (t.length <= max) return t; const cut = t.slice(0, max); return cut.slice(0, Math.max(cut.lastIndexOf(' '), 200)).replace(/[\s,;:.-]+$/, '') + '…'; }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  const key = process.env.GOOGLE_PLACES_KEY, id = process.env.GOOGLE_PLACE_ID;
  if (!key || !id) return res.status(200).json({ configured: false, reviews: [] });
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews' } });
    if (!r.ok) throw new Error('places ' + r.status);
    const j = await r.json();
    const reviews = (j.reviews || []).filter(v => (v.rating || 0) >= 4 && v.text && v.text.text).map(v => ({
      author: v.authorAttribution?.displayName || 'Google user', photo: v.authorAttribution?.photoUri || '',
      rating: v.rating, text: trim(v.text.text), when: v.relativePublishTimeDescription || '' }));
    return res.status(200).json({ configured: true, rating: j.rating || null, count: j.userRatingCount || 0, url: j.googleMapsUri || '', reviews });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ configured: true, reviews: [], error: true });
  }
}
