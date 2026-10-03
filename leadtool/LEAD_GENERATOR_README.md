# Junk Junkies Lead Tool

Flask app that finds potential junk-removal customers (apartment complexes, trailer / mobile home parks, property management and real estate companies) within a radius of a location, and returns the contact emails they publish.

## How leads are found

No emails are guessed or generated. Every email comes from a business listing or from that business's own website.

1. **Geocode** the location (Nominatim) and compute the radius.
2. **Find businesses** inside the radius:
   - Google Places text search, only when `GOOGLE_MAPS_API_KEY` is set (best coverage).
   - OpenStreetMap via Nominatim and Overpass (free, but sparse: many businesses publish no email).
3. **Get the email**: use the listing's email tag if present, otherwise fetch the business's homepage plus `/contact` and `/contact-us` (robots.txt respected), reading `mailto:` links and visible addresses. Directory and social sites (Yelp, Facebook, etc.) are skipped because their emails are not the business's.
4. **Check the email**: syntax plus DNS (domain can receive mail). This does not prove a mailbox exists. Role mailboxes like `donations@` and `noreply@` are dropped, and duplicates are removed.

Search time is bounded (about 75 seconds worst case) to fit hosting limits. Emails are never sent by this tool.

## Run locally

```bash
cd leadtool
pip install -r requirements.txt
export SECRET_KEY=any-long-random-string ADMIN_PASSWORD=choose-one
# optional, enables Google Places:
export GOOGLE_MAPS_API_KEY=your-key
python app.py          # http://localhost:5000
```

## Deployment

- Runs on Render (`gunicorn app:app`) from the `leadtool/` folder.
- Admin pages are reachable at `/admin` on the main site through Vercel rewrites in `vercel.json`.
- The free Render plan sleeps when idle and uses temporary disk, so saved searches reset on redeploy. Use Render Postgres via `DATABASE_URL` to keep them.

## Endpoints

- `POST /api/search` with `location`, `radius` (miles, max 50), `property_type` (`apartments`, `trailers`, `housing_companies`), `limit`
- `GET /api/results/<id>`, `GET /api/export/<id>` (CSV)
- `/admin`, `/api/admin/*` require the admin password

## Known limits

- OpenStreetMap-only searches return few leads; add a Google Places key for volume.
- Website email extraction only finds addresses the site publishes.
- Respect CAN-SPAM and each recipient's opt-out if you ever email these contacts.
