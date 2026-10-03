#!/usr/bin/env bash
# Regenerates SEO pages + compiled CSS. Run from repo root: bash scripts/build.sh
set -e
python3 scripts/build.py
cd tools && npx tailwindcss -c tailwind.config.js -i input.css -o ../assets/site.css --minify
