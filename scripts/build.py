#!/usr/bin/env python3
"""Static SEO page generator. Run: python3 scripts/build.py  (then tailwind build, see scripts/build.sh)"""
import json, os, datetime, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://junkjunkiesindiana.com"
PHONE_DISPLAY, PHONE_TEL = "(317) 637-8807", "+13176378807"
KEY = "fad0a06a-8881-4103-a497-16555dd0f082"
TODAY = datetime.date.today().isoformat()
OG = f"{BASE}/assets/og-image.jpg"

# ---------------------------------------------------------------- data
CITIES = [
 dict(slug="indianapolis", name="Indianapolis", county="Marion", zips="46202, 46203, 46205, 46219, 46220, 46227, 46237, 46250",
  areas=["Downtown", "Broad Ripple", "Fountain Square", "Irvington", "Mass Ave", "Garfield Park", "Castleton", "Meridian-Kessler"],
  housing="Indianapolis is full of older brick homes, bungalows and century-old houses with full basements, plus thousands of apartments around downtown, Butler University and IU Indianapolis.",
  jobs="basement cleanouts in older homes, student and apartment move-outs, estate cleanouts, and furniture or appliance pickups from Eastside and Southside neighborhoods",
  note="From Broad Ripple to Garfield Park, we cover every Indianapolis zip code inside and outside I-465.", lat=39.7684, lon=-86.1581),
 dict(slug="carmel", name="Carmel", county="Hamilton", zips="46032, 46033, 46074, 46280",
  areas=["Carmel City Center", "Arts & Design District", "Village of WestClay", "Home Place", "Primrose"],
  housing="Carmel is known for larger newer homes, finished basements and bonus rooms, so cleanouts here are usually furniture, exercise equipment, old playsets and renovation leftovers.",
  jobs="remodel debris, finished basement cleanouts, moving-day leftovers, and playset or hot tub removal",
  note="Carmel and the rest of Hamilton County are part of our regular service area.", lat=39.9784, lon=-86.1180),
 dict(slug="fishers", name="Fishers", county="Hamilton", zips="46037, 46038",
  areas=["Geist", "Nickel Plate District", "Olio Road corridor", "Saxony", "Cumberland Road area"],
  housing="Fishers has a lot of newer subdivisions and lake-area homes around Geist Reservoir, which means garage cleanouts, outdoor furniture and moving-related junk.",
  jobs="garage cleanouts, move-in and move-out leftovers, patio furniture and dock or deck debris around Geist",
  note="Whether you are on the Geist waterfront or in a newer subdivision off 116th Street, we can come to you.", lat=39.9568, lon=-86.0134),
 dict(slug="noblesville", name="Noblesville", county="Hamilton", zips="46060, 46062",
  areas=["Old Town and the downtown square", "Morse Reservoir", "Forest Park area", "Hazel Dell", "Ford Road"],
  housing="Noblesville mixes historic homes near the downtown square with newer subdivisions and lake properties, so we see everything from antique-filled estates to new-build construction debris.",
  jobs="estate cleanouts, shed and deck teardowns, yard debris and lakehouse cleanouts",
  note="Noblesville is the Hamilton County seat and a core part of our service area.", lat=40.0456, lon=-86.0086),
 dict(slug="westfield", name="Westfield", county="Hamilton", zips="46074",
  areas=["Grand Park area", "Monon Trail corridor", "Downtown Westfield", "Springmill Road", "Union Street"],
  housing="Westfield is one of the fastest-growing towns in central Indiana, with many new builds, so a lot of our work here is construction leftovers and moving-day cleanouts.",
  jobs="new-build construction debris, move-in cleanouts, old farm outbuilding teardowns and acreage cleanups",
  note="From new homes near Grand Park to older properties out toward the edge of town, we haul it.", lat=40.0428, lon=-86.1275),
 dict(slug="zionsville", name="Zionsville", county="Boone", zips="46077",
  areas=["The Village", "Eagle Creek area", "Sycamore", "Austin Oaks", "Holliday Farms"],
  housing="Zionsville has historic homes around the brick-street Village, large lots with outbuildings, and big newer homes with finished basements and multi-car garages.",
  jobs="estate cleanouts, barn and outbuilding cleanouts, large garage cleanouts and furniture removal",
  note="Boone County is part of our regular service area, including larger properties and outbuildings.", lat=39.9509, lon=-86.2619),
 dict(slug="greenwood", name="Greenwood", county="Johnson", zips="46142, 46143",
  areas=["Old City", "Center Grove", "Greenwood Park Mall area", "Smith Valley Road", "Main Street"],
  housing="Greenwood has a mix of established ranch homes, apartments near the mall and newer neighborhoods toward Center Grove.",
  jobs="furniture and mattress removal, apartment turnovers, garage cleanouts and appliance pickups",
  note="We serve Greenwood and the south side out to Center Grove.", lat=39.6137, lon=-86.1067),
 dict(slug="franklin", name="Franklin", county="Johnson", zips="46131",
  areas=["Downtown Franklin", "Franklin College area", "Hurricane Road", "Jefferson Street"],
  housing="Franklin combines historic homes near downtown and the college with rural properties on the edges of Johnson County.",
  jobs="estate cleanouts, student and rental move-outs, barn and shed cleanouts and yard debris",
  note="We serve Franklin and the rural properties around it.", lat=39.4806, lon=-86.0545),
 dict(slug="avon", name="Avon", county="Hendricks", zips="46123",
  areas=["Avon Town Center", "Dan Jones Road", "Ronald Reagan Parkway area", "Rockport Road"],
  housing="Avon is mostly newer subdivisions with attached garages and bonus rooms, so cleanouts here tend to be moves, garage purges and renovation debris.",
  jobs="garage cleanouts, moving leftovers, appliance and furniture removal and swing set teardowns",
  note="Hendricks County is part of our regular west-side service area.", lat=39.7628, lon=-86.3997),
 dict(slug="plainfield", name="Plainfield", county="Hendricks", zips="46168",
  areas=["Historic Plainfield", "Perry Road area", "US 40 corridor", "Vestal Road"],
  housing="Plainfield has older homes, many rentals and apartments, and a heavy mix of commercial and warehouse space near the airport.",
  jobs="apartment and rental cleanouts, light commercial cleanouts, furniture removal and garage cleanups",
  note="We handle both homes and small businesses in Plainfield.", lat=39.7043, lon=-86.3994),
 dict(slug="brownsburg", name="Brownsburg", county="Hendricks", zips="46112",
  areas=["Old Town Brownsburg", "Northfield area", "Green Street corridor", "Raceway Road"],
  housing="Brownsburg has a historic downtown, many newer subdivisions and a growing number of larger lots with sheds, decks and playsets.",
  jobs="shed and deck demolition, playset removal, garage cleanouts and yard waste",
  note="Brownsburg is part of our regular west-side service area.", lat=39.8434, lon=-86.3978),
 dict(slug="lawrence", name="Lawrence", county="Marion", zips="46216, 46226, 46236",
  areas=["Lawrence Village", "Fort Harrison area", "Oaklandon", "Lawrence Township"],
  housing="Lawrence is on Indianapolis's northeast side, with mid-century ranch homes, many apartments and houses backing up to Fort Harrison State Park.",
  jobs="apartment turnovers, estate cleanouts of mid-century homes, furniture and appliance removal and yard cleanups",
  note="Lawrence and the northeast side of Marion County are part of our regular service area.", lat=39.8386, lon=-86.0258),
 dict(slug="speedway", name="Speedway", county="Marion", zips="46222, 46224",
  areas=["Main Street", "Crawfordsville Road corridor", "Near the Indianapolis Motor Speedway", "Georgetown Road area"],
  housing="Speedway is a small, tight-knit town on the west side of Indianapolis, with older homes, garages full of decades of racing gear and lots of rental properties.",
  jobs="garage cleanouts, rental turnovers, estate cleanouts and furniture removal",
  note="Speedway is part of our regular west-side service area.", lat=39.7915, lon=-86.2360),
 dict(slug="beech-grove", name="Beech Grove", county="Marion", zips="46107",
  areas=["Main Street Beech Grove", "Churchman Avenue", "Emerson Avenue corridor", "Albany Street"],
  housing="Beech Grove is an older, close-in southeast suburb with a lot of small homes, bungalows and long-held family properties.",
  jobs="estate and downsizing cleanouts, basement and garage cleanouts and appliance removal",
  note="We are comfortable with the older-home cleanouts Beech Grove is known for.", lat=39.7219, lon=-86.0897),
 dict(slug="greenfield", name="Greenfield", county="Hancock", zips="46140",
  areas=["Downtown Greenfield", "US 40 corridor", "Pennsy Trail area", "Hancock County fairgrounds area"],
  housing="Greenfield is the Hancock County seat, with historic homes near downtown, newer neighborhoods and plenty of rural properties and farm outbuildings nearby.",
  jobs="estate cleanouts, barn and outbuilding cleanouts, rental turnovers and yard debris removal",
  note="We serve Greenfield and Hancock County.", lat=39.7851, lon=-85.7697),
 dict(slug="mooresville", name="Mooresville", county="Morgan", zips="46158",
  areas=["Downtown Mooresville", "Indiana 67 corridor", "Main Street", "Hadley Road area"],
  housing="Mooresville mixes older in-town homes with newer subdivisions and larger rural lots in Morgan County.",
  jobs="garage and shed cleanouts, estate cleanouts, appliance removal and yard debris",
  note="Mooresville is the southwest edge of our regular service area.", lat=39.6128, lon=-86.3744),
]

SERVICES = [
 dict(slug="basement-cleanout-indianapolis", name="Basement Cleanout", h1="Basement Cleanout in Indianapolis",
  kw="basement cleanout Indianapolis", icon="01",
  blurb="Decades of storage, flooded contents and old furniture, carried up the stairs and gone in one visit.",
  intro="Basements in Indianapolis tend to collect everything: old furniture, boxes, workbenches, water-damaged items and things nobody wants to carry up the stairs. We do the heavy lifting so you do not have to.",
  items=["Old furniture, couches and mattresses", "Water-damaged contents after flooding", "Boxes, bins and decades of storage", "Workbenches, shelving and exercise equipment", "Old appliances: washers, dryers, freezers", "Paneling, carpet and light demolition debris"],
  faq=[("Do you carry items up basement stairs?", "Yes. Our crew carries everything out of the basement, up the stairs and to the truck. You do not have to move anything beforehand."),
       ("Can you clean out a flooded or damp basement?", "We remove water-damaged furniture and contents. We do not handle mold remediation, but we can clear the space so a remediation company can work."),
       ("How much does a basement cleanout cost?", "Price depends on how much space your items fill in our truck. Text a photo to (317) 637-8807 for a free quote before we start.")]),
 dict(slug="estate-cleanout-indianapolis", name="Estate Cleanout", h1="Estate & Hoarding Cleanout in Indianapolis",
  kw="estate cleanout Indianapolis", icon="02",
  blurb="Respectful, thorough cleanouts for families, attorneys and realtors on tight timelines.",
  intro="Cleaning out a home after a loss, a move to assisted living or a sale is hard. We work respectfully and efficiently, setting aside what you want to keep and clearing the rest so the property is ready.",
  items=["Whole-house cleanouts, attic to basement", "Hoarding and heavy-clutter cleanouts", "Furniture, clothing and household goods", "Garage, shed and outbuilding contents", "Pre-listing cleanouts for realtors", "Cleanouts coordinated with family or attorneys"],
  faq=[("Can you work around items we want to keep?", "Yes. Walk the home with our crew first and mark what stays. We clear the rest."),
       ("Do you donate usable items?", "Usable furniture and household goods go to donation partners where possible, and recyclables are separated from true trash."),
       ("Can you work on a closing deadline?", "We schedule around closing dates and can often start within a day or two. Call (317) 637-8807 with your timeline.")]),
 dict(slug="furniture-removal-indianapolis", name="Furniture Removal", h1="Furniture Removal in Indianapolis",
  kw="furniture removal Indianapolis", icon="03",
  blurb="Couches, mattresses, dressers, tables and more, picked up and hauled away.",
  intro="Old couches, sleeper sofas, dressers, mattresses and dining sets are bulky, heavy and hard to get rid of. We pick them up from inside your home, garage or curb and haul them off.",
  items=["Couches, sectionals and recliners", "Mattresses and box springs", "Dressers, bed frames and nightstands", "Dining tables and chairs", "Desks, bookcases and office furniture", "Patio and outdoor furniture"],
  faq=[("Do you take furniture from upstairs?", "Yes. We remove furniture from any floor, including apartments and second-story rooms."),
       ("Can you take a single item?", "Yes. Single-item pickups are common. Text a photo for a firm price."),
       ("Do you take mattresses?", "Yes, mattresses and box springs of any size are accepted.")]),
 dict(slug="appliance-removal-indianapolis", name="Appliance Removal", h1="Appliance Removal in Indianapolis",
  kw="appliance removal Indianapolis", icon="04",
  blurb="Refrigerators, washers, dryers, stoves and water heaters removed and disposed of properly.",
  intro="Heavy appliances are a pain to move and often need special handling. We disconnect-ready, lift and haul away old refrigerators, washers, dryers, ranges, dishwashers and more.",
  items=["Refrigerators and freezers", "Washers and dryers", "Stoves, ovens and ranges", "Dishwashers and microwaves", "Water heaters", "Window AC units and dehumidifiers"],
  faq=[("Do you disconnect appliances?", "Appliances should be disconnected from water, gas and power before we arrive. We handle the lifting and hauling."),
       ("Can you take a fridge with food inside?", "Please empty it first. We take it from there."),
       ("Do you recycle appliances?", "Metal appliances are recycled where possible.")]),
 dict(slug="storm-debris-removal-indianapolis", name="Storm & Yard Debris", h1="Storm Damage & Yard Debris Removal in Indianapolis",
  kw="storm debris removal Indianapolis", icon="05",
  blurb="Downed limbs, ice-damaged fences and storm debris cleared after Central Indiana weather.",
  intro="Central Indiana gets ice storms, high winds and heavy rain. After bad weather we haul downed limbs, damaged fencing, flooded basement contents and general storm debris.",
  items=["Downed tree limbs and branches", "Ice and wind-damaged fencing", "Flooded basement contents", "Damaged outdoor furniture and playsets", "Shingles and roofing debris (priced by load)", "General yard waste and brush"],
  faq=[("Do you cut down trees?", "No. We haul debris once limbs are on the ground and cut to a manageable size. We can point you to a tree service if needed."),
       ("Can you help after a basement flood?", "Yes. We remove soaked furniture, carpet and contents so the space can dry and be repaired."),
       ("Are heavy materials priced differently?", "Heavy items like shingles, concrete and dirt are priced by the bed load because of weight and disposal cost.")]),
 dict(slug="shed-deck-demolition-indianapolis", name="Shed, Deck & Light Demolition", h1="Shed, Deck & Hot Tub Removal in Indianapolis",
  kw="shed removal Indianapolis", icon="06",
  blurb="Sheds, decks, above-ground pools, hot tubs and playsets torn down and hauled in one visit.",
  intro="Rotting decks, old sheds, swing sets and hot tubs are big jobs. We take them apart and haul every piece away so you do not have to rent a dumpster or make multiple trips.",
  items=["Sheds and small outbuildings", "Wood decks and railings", "Above-ground pools", "Hot tubs and spas", "Swing sets and playsets", "Fences and gates"],
  faq=[("Do you tear down as well as haul?", "Yes. We handle light demolition and haul everything away in one visit."),
       ("Can you remove a hot tub?", "Yes, including draining and cutting where needed."),
       ("Do I need a dumpster?", "No. We bring the truck and the crew. No dumpster rental needed.")]),
 dict(slug="mattress-removal-indianapolis", name="Mattress Removal", h1="Mattress Removal in Indianapolis",
  kw="mattress removal Indianapolis", icon="07",
  blurb="Mattresses and box springs picked up from any room or floor and disposed of properly.",
  intro="Mattresses are awkward to carry and hard to dispose of. We pick up old mattresses and box springs from bedrooms, apartments and garages.",
  items=["Twin, full, queen and king mattresses", "Box springs and foundations", "Bed frames and headboards", "Futons and sleeper sofas", "Crib and kids' mattresses", "Multiple-mattress move-outs"],
  faq=[("Do you take box springs too?", "Yes. Mattresses, box springs and bed frames are all fine."),
       ("Can you pick up from an apartment?", "Yes. We carry mattresses down stairs and out of apartment buildings."),
       ("Is there a minimum?", "Single-item pickups are welcome. Text a photo for a firm price.")]),
 dict(slug="property-management-junk-removal-indianapolis", name="Property Management & Commercial", h1="Property Management & Commercial Junk Removal in Indianapolis",
  kw="property management junk removal Indianapolis", icon="08",
  blurb="Apartment turns, eviction cleanouts, office cleanouts and construction debris for repeat clients.",
  intro="Landlords, property managers and small businesses need junk gone quickly and reliably. We handle apartment turnovers, eviction cleanouts, office cleanouts and construction debris across the Indianapolis metro.",
  items=["Apartment and rental turnovers", "Eviction cleanouts", "Office and retail cleanouts", "Construction and renovation debris", "Pre-listing cleanouts for realtors", "Recurring pickups for repeat clients"],
  faq=[("Do you offer pricing for repeat clients?", "Yes. Call (317) 637-8807 to set up repeat-client pricing."),
       ("Can you turn a unit quickly?", "We prioritize fast turnarounds. Call us with your timeline."),
       ("Do you work with realtors?", "Yes. Pre-listing cleanouts are a regular part of our work.")]),
]

HOME_FAQ = [
 ("Do I need to be home?", "Not necessarily. Point us at it over text or leave the garage open. Just confirm access and payment with us first."),
 ("What won't you take?", "Hazardous materials: wet paint, chemicals, asbestos, fuel and medical waste. Ask us about anything borderline."),
 ("How fast can you get here?", "Call or text and we will tell you honestly. Same-day when the schedule allows, otherwise next-day."),
 ("Where does my stuff go?", "Usable items go to donation partners, metal and electronics get recycled, and only true trash hits the landfill."),
 ("Do you work with property managers and realtors?", "Yes. Apartment turns, pre-listing cleanouts and repeat-client pricing. Call to set it up."),
]

# ---------------------------------------------------------------- schema
BIZ_ID = f"{BASE}/#business"
def business_schema():
    return {"@context": "https://schema.org", "@type": ["LocalBusiness", "HomeAndConstructionBusiness"], "@id": BIZ_ID,
        "name": "Junk Junkies Indiana", "alternateName": "Junk Junkies Indianapolis", "url": BASE + "/",
        "image": OG, "logo": f"{BASE}/assets/logo-badge.png", "telephone": PHONE_TEL,
        "email": "info@junkjunkiesindiana.com", "priceRange": "$$",
        "description": "Junk removal, cleanouts and light demolition serving Indianapolis and surrounding Indiana cities.",
        "address": {"@type": "PostalAddress", "addressLocality": "Indianapolis", "addressRegion": "IN", "addressCountry": "US"},
        "geo": {"@type": "GeoCoordinates", "latitude": 39.7684, "longitude": -86.1581},
        "areaServed": [{"@type": "City", "name": c["name"] + ", IN"} for c in CITIES],
        "sameAs": ["https://junkjunkiesflorida.com", "https://junkjunkiestexas.com"],
        "contactPoint": {"@type": "ContactPoint", "telephone": PHONE_TEL, "contactType": "customer service", "areaServed": "US-IN", "availableLanguage": "English"},
        "hasOfferCatalog": {"@type": "OfferCatalog", "name": "Junk removal services",
            "itemListElement": [{"@type": "Offer", "itemOffered": {"@type": "Service", "name": s["name"], "url": f"{BASE}/{s['slug']}/"}} for s in SERVICES]}}
def faq_schema(faq):
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}
def crumbs(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": BASE + u} for i, (n, u) in enumerate(items)]}
def ld(*objs):
    return "".join(f'<script type="application/ld+json">{json.dumps(o, separators=(",", ":"))}</script>' for o in objs)

# ---------------------------------------------------------------- layout
def head(title, desc, path, schema="", extra=""):
    url = BASE + path
    return f'''<!DOCTYPE html>
<html lang="en-US"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#0B0D10">
<meta name="geo.region" content="US-IN"><meta name="geo.placename" content="Indianapolis">
<meta property="og:type" content="website"><meta property="og:site_name" content="Junk Junkies Indiana"><meta property="og:locale" content="en_US">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{OG}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}"><meta name="twitter:description" content="{desc}"><meta name="twitter:image" content="{OG}">
<link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/assets/logo-icon.png"><link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/site.css">
{extra}{schema}
</head><body class="antialiased">'''

def header():
    return f'''<header class="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-ink/80 border-b border-line">
<div class="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
<a href="/" class="flex items-center gap-2.5"><img src="/assets/logo-icon.png" width="40" height="40" alt="Junk Junkies Indiana logo" class="h-10 w-10 rounded-lg logo-pulse"><span class="display text-lg font-extrabold">JUNK<span class="text-ember">JUNKIES</span> <span class="text-bone/50 font-semibold text-xs ml-1">INDIANA</span></span></a>
<nav class="hidden md:flex items-center gap-8 text-sm text-bone/70" aria-label="Main"><a href="/services/" class="hover:text-bone">Services</a><a href="/areas/" class="hover:text-bone">Service Area</a><a href="/#pricing" class="hover:text-bone">Pricing</a><a href="/#faq" class="hover:text-bone">FAQ</a></nav>
<div class="flex items-center gap-3"><a href="tel:{PHONE_TEL}" class="hidden sm:inline-flex text-sm font-semibold text-bone/90 hover:text-ember">{PHONE_DISPLAY}</a><a href="#quote" class="inline-flex rounded-full bg-ember hover:bg-emberDark text-ink font-bold text-sm px-5 py-2.5 transition">Free Quote</a></div>
</div></header>'''

def link_cols():
    cities = "".join(f'<a href="/{c["slug"]}-junk-removal/" class="block text-bone/60 hover:text-ember py-0.5">{c["name"]}</a>' for c in CITIES)
    svcs = "".join(f'<a href="/{s["slug"]}/" class="block text-bone/60 hover:text-ember py-0.5">{s["name"]}</a>' for s in SERVICES)
    return cities, svcs

def footer():
    cities, svcs = link_cols()
    return f'''<footer class="border-t border-line py-16 pb-32 md:pb-16"><div class="max-w-7xl mx-auto px-5 grid md:grid-cols-4 gap-10 text-sm">
<div><img src="/assets/logo-badge.png" width="144" height="144" alt="Junk Junkies Indiana junk removal logo" class="h-36 w-36 mb-4" loading="lazy"><p class="text-bone/50">Junk removal for Indianapolis and surrounding cities. Part of the Junk Junkies family: Texas (HQ), Florida and Indiana.</p></div>
<div><div class="font-semibold mb-3">Services</div>{svcs}</div>
<div><div class="font-semibold mb-3">Service Area</div>{cities}</div>
<div><div class="font-semibold mb-3">Contact</div><a href="tel:{PHONE_TEL}" class="block text-bone/60 hover:text-ember">{PHONE_DISPLAY}</a><a href="sms:{PHONE_TEL}" class="block text-bone/60 hover:text-ember">Text us photos</a><a href="mailto:quote@junkjunkiesindiana.com" class="block text-bone/60 hover:text-ember">quote@junkjunkiesindiana.com</a>
<div class="mt-6 font-semibold mb-3">Sister sites</div><a rel="noopener" href="https://junkjunkiestexas.com" class="block text-bone/60 hover:text-ember">Junk Junkies Texas</a><a rel="noopener" href="https://junkjunkiesflorida.com" class="block text-bone/60 hover:text-ember">Junk Junkies Florida</a></div>
</div><div class="max-w-7xl mx-auto px-5 mt-12 text-xs text-bone/40">© {datetime.date.today().year} Junk Junkies Indiana. All rights reserved.</div></footer>
<div class="md:hidden fixed bottom-0 inset-x-0 z-50 bg-ink/95 backdrop-blur border-t border-line grid grid-cols-3 text-center text-sm font-bold"><a href="tel:{PHONE_TEL}" class="py-4 border-r border-line">Call</a><a href="sms:{PHONE_TEL}?body=Hi%20Junk%20Junkies%2C%20I%20need%20a%20quote%20for%3A" class="py-4 border-r border-line">Text</a><a href="#quote" class="py-4 bg-ember text-ink">Quote</a></div>
<script src="/assets/form.js" defer></script></body></html>'''

def quote_form(place):
    return f'''<section id="quote" class="py-20 bg-slate2 border-y border-line"><div class="max-w-5xl mx-auto px-5 grid lg:grid-cols-2 gap-10">
<div><p class="text-xs font-semibold tracking-widest uppercase text-ember mb-4">Free quote</p><h2 class="display text-3xl md:text-4xl font-extrabold leading-tight mb-4">Get a firm price for {place}.</h2>
<p class="text-bone/60 mb-6">Send the details and we will text you a number. Or call <a class="text-ember font-semibold" href="tel:{PHONE_TEL}">{PHONE_DISPLAY}</a> or text photos to the same number.</p></div>
<form id="quoteForm" class="grid sm:grid-cols-2 gap-3" aria-label="Quote request">
<input type="hidden" name="access_key" value="{KEY}"><input type="hidden" name="subject" value="Quote request: {place}"><input type="hidden" name="from_name" value="Junk Junkies Indiana website"><input type="hidden" name="page" value="{place}"><input type="checkbox" name="botcheck" style="display:none">
<input required name="name" aria-label="Full name" placeholder="Full name" class="bg-ink border border-line rounded-xl px-4 py-3 w-full focus:outline-none focus:border-ember">
<input required name="phone" type="tel" aria-label="Mobile number" placeholder="Mobile number" class="bg-ink border border-line rounded-xl px-4 py-3 w-full focus:outline-none focus:border-ember">
<input required name="zip" aria-label="Zip code" placeholder="Zip code" class="bg-ink border border-line rounded-xl px-4 py-3 w-full sm:col-span-2 focus:outline-none focus:border-ember">
<textarea name="details" aria-label="What do you need hauled" rows="3" placeholder="What do you need hauled?" class="bg-ink border border-line rounded-xl px-4 py-3 w-full sm:col-span-2 focus:outline-none focus:border-ember"></textarea>
<button type="submit" id="formBtn" class="sm:col-span-2 rounded-full bg-ember hover:bg-emberDark text-ink font-bold px-8 py-4 transition">Send My Quote Request</button>
<p id="formMsg" class="sm:col-span-2 text-sm text-center text-bone/60" role="status"></p></form></div></section>'''

def faq_html(faq):
    return '<div class="divide-y divide-line">' + "".join(f'<details class="py-5 group"><summary class="display font-bold text-lg cursor-pointer list-none flex justify-between gap-4">{q}<span class="text-ember group-open:rotate-45 transition">+</span></summary><p class="text-bone/60 mt-3">{a}</p></details>' for q, a in faq) + "</div>"

def crumb_html(parts):
    out = []
    for i, (n, u) in enumerate(parts):
        out.append(f'<a href="{u}" class="hover:text-ember">{n}</a>' if i < len(parts) - 1 else f'<span class="text-bone/80">{n}</span>')
    return '<nav aria-label="Breadcrumb" class="text-xs text-bone/50 mb-6 flex flex-wrap gap-2">' + ' <span>/</span> '.join(out) + "</nav>"

def hero(h1, sub, crumbs_html, image="/assets/hero.webp"):
    return f'''<section class="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden"><img src="{image}" width="1280" height="720" alt="" class="absolute inset-0 w-full h-full object-cover opacity-35"><div class="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-ink/30"></div>
<div class="relative max-w-5xl mx-auto px-5">{crumbs_html}<h1 class="display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.02] mb-5">{h1}</h1><p class="text-lg md:text-xl text-bone/75 max-w-2xl mb-8">{sub}</p>
<div class="flex flex-col sm:flex-row gap-3"><a href="#quote" class="inline-flex justify-center rounded-full bg-ember hover:bg-emberDark text-ink font-bold px-8 py-4 transition glow">Get a Free Quote</a><a href="tel:{PHONE_TEL}" class="inline-flex justify-center rounded-full border border-bone/25 hover:border-bone/60 font-semibold px-8 py-4 transition">Call {PHONE_DISPLAY}</a></div></div></section>'''

def write(path, html):
    p = ROOT / path.strip("/") / "index.html" if path != "/" else ROOT / "index.html"
    p.parent.mkdir(parents=True, exist_ok=True); p.write_text(html)

# ---------------------------------------------------------------- pages
def city_page(c):
    path = f"/{c['slug']}-junk-removal/"
    near = [x for x in CITIES if x["county"] == c["county"] and x is not c][:3] + [x for x in CITIES if x["county"] != c["county"]][:3]
    near = near[:6]
    title = f"Junk Removal {c['name']}, IN | Same-Day Hauling | Junk Junkies"
    desc = f"Junk removal in {c['name']}, Indiana. Furniture, appliances, cleanouts and demolition hauled away with upfront pricing. Call {PHONE_DISPLAY} for a free quote."
    faq = [
        (f"How do I get a junk removal quote in {c['name']}?", f"Text photos to {PHONE_DISPLAY}, call us, or use the form on this page. We will give you a firm price before we start."),
        (f"Do you offer same-day junk removal in {c['name']}?", f"When the schedule allows, yes. {c['name']} is in {c['county']} County, part of our service area. Call or text early in the day and we will tell you honestly what is open."),
        (f"What kinds of junk do you haul in {c['name']}?", f"Furniture, mattresses, appliances, basement and garage cleanouts, estate cleanouts, yard debris, and light demolition such as sheds, decks and hot tubs."),
        ("What can't you take?", "Hazardous materials such as wet paint, chemicals, asbestos, fuel and medical waste."),
    ]
    schema = ld(business_schema(),
        {"@context": "https://schema.org", "@type": "Service", "name": f"Junk Removal in {c['name']}, IN", "serviceType": "Junk removal", "provider": {"@id": BIZ_ID},
         "areaServed": {"@type": "City", "name": f"{c['name']}, IN", "geo": {"@type": "GeoCoordinates", "latitude": c["lat"], "longitude": c["lon"]}}, "url": BASE + path},
        crumbs([("Home", "/"), ("Service Area", "/areas/"), (c["name"], path)]), faq_schema(faq))
    svc_cards = "".join(f'<a href="/{s["slug"]}/" class="rounded-2xl bg-slate2 border border-line p-6 hover:border-ember/60 transition"><div class="display text-ember font-extrabold mb-2">{s["icon"]}</div><h3 class="display font-bold text-lg mb-1">{s["name"]}</h3><p class="text-sm text-bone/60">{s["blurb"]}</p></a>' for s in SERVICES[:6])
    area_pills = "".join(f'<li class="rounded-full border border-line bg-slate2 px-4 py-2 text-sm">{a}</li>' for a in c["areas"])
    near_links = "".join(f'<a href="/{x["slug"]}-junk-removal/" class="rounded-2xl border border-line bg-ink p-4 hover:border-ember/60 transition"><div class="font-semibold">{x["name"]}</div><div class="text-xs text-bone/50">{x["county"]} County</div></a>' for x in near)
    body = f'''<main>{hero(f"Junk Removal in {c['name']}, Indiana", f"Furniture, appliances, cleanouts and demolition hauled away. Upfront pricing before we lift a finger. Serving {c['name']} and all of {c['county']} County.", crumb_html([("Home","/"),("Service Area","/areas/"),(c['name'],path)]))}
<section class="py-16"><div class="max-w-5xl mx-auto px-5 prose-j">
<h2>{c['name']}'s junk removal crew</h2>
<p>{c['housing']}</p>
<p>In {c['name']} we most often handle {c['jobs']}. {c['note']}</p>
<p>Our process is simple: send us photos or a description, get a firm price, pick a time, and we load everything and sweep up. Usable items are donated where possible and recyclables are separated from true trash. Zip codes we regularly serve in {c['name']} include {c['zips']}.</p>
<h2>Neighborhoods and areas we serve in {c['name']}</h2>
<ul class="flex flex-wrap gap-2 mb-6 not-prose">{area_pills}</ul>
<p>Do not see your street listed? Call {PHONE_DISPLAY}. If you are in or near {c['name']} we very likely cover you.</p>
</div></section>
<section class="py-16 bg-slate2 border-y border-line"><div class="max-w-5xl mx-auto px-5"><h2 class="display text-3xl font-extrabold mb-8">What we haul in {c['name']}</h2><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{svc_cards}</div></div></section>
{quote_form(c['name'] + ", IN")}
<section class="py-16"><div class="max-w-4xl mx-auto px-5"><h2 class="display text-3xl font-extrabold mb-8">{c['name']} junk removal FAQ</h2>{faq_html(faq)}</div></section>
<section class="py-16 bg-slate2 border-t border-line"><div class="max-w-5xl mx-auto px-5"><h2 class="display text-2xl font-extrabold mb-6">Nearby cities we serve</h2><div class="grid grid-cols-2 md:grid-cols-3 gap-3">{near_links}</div><p class="mt-6 text-sm text-bone/60"><a class="text-ember font-semibold" href="/areas/">See the full service area</a></p></div></section></main>'''
    write(path, head(title, desc, path, schema, '<link rel="preload" as="image" href="/assets/hero.webp" fetchpriority="high">') + header() + body + footer())

def service_page(s):
    path = f"/{s['slug']}/"
    title = f"{s['name']} Indianapolis, IN | Upfront Pricing | Junk Junkies"
    desc = f"{s['name']} in Indianapolis and surrounding cities. {s['blurb']} Free quote: {PHONE_DISPLAY}."
    schema = ld(business_schema(),
        {"@context": "https://schema.org", "@type": "Service", "name": s["h1"], "serviceType": s["name"], "provider": {"@id": BIZ_ID}, "areaServed": {"@type": "City", "name": "Indianapolis, IN"}, "url": BASE + path},
        crumbs([("Home", "/"), ("Services", "/services/"), (s["name"], path)]), faq_schema(s["faq"]))
    items = "".join(f'<li class="flex gap-3"><span class="text-ember">✓</span><span>{i}</span></li>' for i in s["items"])
    others = "".join(f'<a href="/{o["slug"]}/" class="rounded-2xl border border-line bg-ink p-4 hover:border-ember/60 transition"><div class="font-semibold">{o["name"]}</div></a>' for o in SERVICES if o is not s)
    cities = "".join(f'<a href="/{c["slug"]}-junk-removal/" class="rounded-2xl border border-line bg-ink p-4 hover:border-ember/60 transition"><div class="font-semibold">{c["name"]}</div></a>' for c in CITIES[:8])
    body = f'''<main>{hero(s['h1'], s['blurb'], crumb_html([("Home","/"),("Services","/services/"),(s['name'],path)]))}
<section class="py-16"><div class="max-w-5xl mx-auto px-5 prose-j"><h2>{s['name']} done right</h2><p>{s['intro']}</p>
<p>Pricing is based on how much room your items take up in our truck. Labor, fuel and disposal are included, and you get a firm quote before we start. Send photos to {PHONE_DISPLAY} for the fastest price.</p>
<h2>What we take</h2><ul class="grid sm:grid-cols-2 gap-3 text-bone/80 mb-6 not-prose">{items}</ul>
<h2>How it works</h2><p><strong>1. Send photos.</strong> Text or use the form below. <strong>2. Get a firm price.</strong> No surprises. <strong>3. We haul it.</strong> Our crew loads everything and sweeps up.</p></div></section>
{quote_form("Indianapolis, IN")}
<section class="py-16"><div class="max-w-4xl mx-auto px-5"><h2 class="display text-3xl font-extrabold mb-8">{s['name']} FAQ</h2>{faq_html(s['faq'])}</div></section>
<section class="py-16 bg-slate2 border-t border-line"><div class="max-w-5xl mx-auto px-5"><h2 class="display text-2xl font-extrabold mb-6">Where we offer {s['name'].lower()}</h2><div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">{cities}</div>
<h2 class="display text-2xl font-extrabold mb-6">Other services</h2><div class="grid grid-cols-2 md:grid-cols-4 gap-3">{others}</div></div></section></main>'''
    write(path, head(title, desc, path, schema, '<link rel="preload" as="image" href="/assets/hero.webp" fetchpriority="high">') + header() + body + footer())

def hub(path, title, desc, h1, sub, cards, crumb_name):
    schema = ld(business_schema(), crumbs([("Home", "/"), (crumb_name, path)]))
    body = f'''<main>{hero(h1, sub, crumb_html([("Home","/"),(crumb_name,path)]))}<section class="py-16"><div class="max-w-6xl mx-auto px-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{cards}</div></section>{quote_form("Indianapolis, IN")}</main>'''
    write(path, head(title, desc, path, schema) + header() + body + footer())

def build():
    for c in CITIES: city_page(c)
    for s in SERVICES: service_page(s)
    cc = "".join(f'<a href="/{c["slug"]}-junk-removal/" class="rounded-2xl bg-slate2 border border-line p-6 hover:border-ember/60 transition"><h2 class="display font-bold text-xl mb-1">Junk Removal in {c["name"]}</h2><p class="text-sm text-bone/60">{c["county"]} County · {c["zips"]}</p></a>' for c in CITIES)
    hub("/areas/", "Junk Removal Service Area | Indianapolis & Central Indiana | Junk Junkies", f"Junk Junkies serves Indianapolis, Carmel, Fishers, Noblesville, Greenwood and more across Marion, Hamilton, Hendricks, Johnson, Boone, Hancock and Morgan counties. Call {PHONE_DISPLAY}.", "Junk Removal Service Area", "Indianapolis and the whole donut around it: Marion, Hamilton, Hendricks, Johnson, Boone, Hancock and Morgan counties.", cc, "Service Area")
    sc = "".join(f'<a href="/{s["slug"]}/" class="rounded-2xl bg-slate2 border border-line p-6 hover:border-ember/60 transition"><div class="display text-ember font-extrabold mb-2">{s["icon"]}</div><h2 class="display font-bold text-xl mb-1">{s["name"]}</h2><p class="text-sm text-bone/60">{s["blurb"]}</p></a>' for s in SERVICES)
    hub("/services/", "Junk Removal Services Indianapolis | Cleanouts, Furniture, Appliances | Junk Junkies", f"Basement and estate cleanouts, furniture and appliance removal, storm debris, demolition and commercial junk removal in Indianapolis. Call {PHONE_DISPLAY}.", "Junk Removal Services", "Everything from a single couch to a whole-house cleanout, hauled away with upfront pricing.", sc, "Services")

    # sitemap / robots / manifest / llms / 404
    urls = [("/", "1.0")] + [("/areas/", "0.8"), ("/services/", "0.8")] + [(f"/{s['slug']}/", "0.8") for s in SERVICES] + [(f"/{c['slug']}-junk-removal/", "0.9" if c['slug'] == 'indianapolis' else "0.7") for c in CITIES]
    (ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"<url><loc>{BASE}{u}</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>{p}</priority></url>\n" for u, p in urls) + "</urlset>\n")
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /scripts/\nDisallow: /tools/\n\nSitemap: {BASE}/sitemap.xml\n")
    (ROOT / "site.webmanifest").write_text(json.dumps({"name": "Junk Junkies Indiana", "short_name": "Junk Junkies", "start_url": "/", "display": "standalone", "background_color": "#0B0D10", "theme_color": "#FF5A1F", "icons": [{"src": "/assets/logo-icon.png", "sizes": "256x256", "type": "image/png"}]}))
    (ROOT / "llms.txt").write_text(f"# Junk Junkies Indiana\n\n> Junk removal, cleanouts and light demolition in Indianapolis and surrounding Indiana cities. Phone/text: {PHONE_DISPLAY}. Part of Junk Junkies (Texas HQ, Florida, Indiana).\n\n## Services\n" + "".join(f"- [{s['name']}]({BASE}/{s['slug']}/): {s['blurb']}\n" for s in SERVICES) + "\n## Service area\n" + "".join(f"- [{c['name']}, IN]({BASE}/{c['slug']}-junk-removal/)\n" for c in CITIES))
    (ROOT / "404.html").write_text(head("Page not found | Junk Junkies Indiana", "That page does not exist. Call Junk Junkies Indiana for junk removal in Indianapolis.", "/404", "", '<meta name="robots" content="noindex">').replace('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">', "") + header() + f'<main class="min-h-[70vh] grid place-items-center text-center px-5 pt-24"><div><h1 class="display text-5xl font-extrabold mb-4">Page not found.</h1><p class="text-bone/60 mb-6">But we can still haul your junk.</p><a href="/" class="rounded-full bg-ember text-ink font-bold px-8 py-4">Back to home</a></div></main>' + footer())
    print(len(CITIES), "cities,", len(SERVICES), "services, sitemap urls:", len(urls))

if __name__ == "__main__":
    build()
