#!/usr/bin/env python3
"""Generate site art via Venice. Reads key from env var `venice_api` (never commit keys)."""
import os, sys, json, base64, urllib.request

KEY = os.environ.get("venice_api") or os.environ.get("VENICE_API_KEY")
if not KEY:
    sys.exit("Set venice_api env var")

STYLE = ("cinematic dark moody photoreal illustration, near-black background, hot orange ember rim lighting, "
         "gritty premium contractor brand look, no text, no logos, no watermark")
JOBS = {
  "hero": ("wide shot of a rugged black junk removal box truck at dusk on a suburban Indianapolis street, "
           "two crew members in black shirts loading old couch and furniture, orange glow, " + STYLE, 1280, 720),
  "basement": ("cluttered basement full of old furniture and boxes being cleared out, orange work light, " + STYLE, 1024, 768),
  "estate": ("garage cleanout in progress, stacked old appliances and furniture, crew silhouettes, " + STYLE, 1024, 768),
  "storm": ("backyard after winter ice storm, broken tree limbs and damaged fence being hauled away, " + STYLE, 1024, 768),
}
only = sys.argv[1:] or list(JOBS)
for name in only:
    prompt, w, h = JOBS[name]
    body = json.dumps({"model": "flux-2-pro", "prompt": prompt, "width": w, "height": h,
                       "format": "webp", "return_binary": False, "safe_mode": False}).encode()
    req = urllib.request.Request("https://api.venice.ai/api/v1/image/generate", body,
        {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=180))
    open(f"assets/{name}.webp", "wb").write(base64.b64decode(r["images"][0]))
    print("saved", name)
