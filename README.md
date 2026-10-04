# Junk Junkies Indiana

Static site (Tailwind compiled) + Vercel functions in `api/` for the Our Work map, crew uploads (`/crew/`) and Google reviews.

- Rebuild pages/CSS: `bash scripts/build.sh`
- Env vars (Vercel): `DATABASE_URL` (Neon), `BLOB_READ_WRITE_TOKEN` (Blob), `CREW_PIN`; optional `GOOGLE_PLACES_KEY` + `GOOGLE_PLACE_ID` for live Google reviews.
