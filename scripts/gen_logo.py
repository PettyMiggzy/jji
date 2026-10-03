#!/usr/bin/env python3
"""Generate full logo badge candidates via Venice. Key from env var venice_api."""
import os,json,base64,urllib.request,sys
KEY=os.environ["venice_api"]
P=("Professional esports-style junk removal company badge logo, same style as a Florida alligator badge logo: "
 "snarling angry raccoon mascot head with sharp teeth in front of an outline of the state of Indiana with a white star at Indianapolis, "
 "a bold angled banner across the bottom reading exactly 'JUNK JUNKIES' in huge white blocky condensed letters with black outline, "
 "below it the word 'INDIANA' in bright orange (#FF5A1F), then 'JUNK REMOVAL' in white, then a thin line 'RESIDENTIAL & COMMERCIAL', "
 "and the phone number '317-625-2831' in white at the bottom, hexagonal orange border frame, "
 "color palette strictly orange, white, black, solid black background, centered, symmetrical, crisp vector look, "
 "all text spelled perfectly and legible")
models={"ideogram":"ideogram-v4-5","gpt":"gpt-image-2","flux3":"flux-3-image"}
os.makedirs("assets/logo-candidates",exist_ok=True)
for k in (sys.argv[1:] or models):
    body=json.dumps({"model":models[k],"prompt":P,"width":1024,"height":1024,"format":"png","return_binary":False}).encode()
    try:
        r=json.load(urllib.request.urlopen(urllib.request.Request("https://api.venice.ai/api/v1/image/generate",body,{"Authorization":f"Bearer {KEY}","Content-Type":"application/json"}),timeout=300))
        open(f"assets/logo-candidates/{k}.png","wb").write(base64.b64decode(r["images"][0])); print("ok",k)
    except Exception as e: print("fail",k,getattr(e,'read',lambda:e)()[:300] if hasattr(e,'read') else e)
