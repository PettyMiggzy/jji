"""
Real lead sources: OpenStreetMap (Overpass API) for businesses inside a radius,
plus the contact emails those businesses publish on their own websites.
No emails are guessed or generated; every returned email was found in a tag or a page.
"""

import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeout
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from email_validator import validate_email, EmailNotValidError

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
USER_AGENT = "JunkJunkiesLeadTool/1.0 (school project; contact via repo PettyMiggzy/jji)"
METERS_PER_MILE = 1609.34
MAX_RADIUS_MILES = 50
OVERPASS_BUDGET = 20
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DIRECTORY_HOSTS = ("facebook.com","yelp.com","yellowpages.com","mapquest.com","bbb.org","linkedin.com","zillow.com","apartments.com","directionus.com","instagram.com","x.com","twitter.com","google.com","manta.com","chamberofcommerce.com","trulia.com","realtor.com","rent.com","apartmentlist.com")
SITE_TIME_BUDGET = 30
MAX_PAGE_BYTES = 1_500_000
CONTACT_PATHS = ["", "/contact", "/contact-us"]

# type -> (label, Overpass tag filters). Every filter also requires a name.
CONTACT_KEYS = ["website", "email", "contact:website", "contact:email"]

# type -> (label, tag filters). Each filter is paired with each contact key so Overpass
# only returns businesses that publish a website or email, which keeps queries fast.
CATEGORIES = {
    "apartments": (
        "Apartment Complex",
        ['["building"="apartments"]', '["residential"="apartments"]'],
    ),
    "trailers": (
        "Trailer / Mobile Home Park",
        ['["residential"~"^(trailer_park|mobile_home_park)$"]', '["tourism"="caravan_site"]'],
    ),
    "housing_companies": (
        "Property Management / Real Estate",
        ['["office"="property_management"]', '["office"="estate_agent"]', '["shop"="estate_agent"]'],
    ),
}

SEARCH_TERMS = {
    "apartments": ["apartments", "apartment homes", "apartment community", "lofts"],
    "trailers": ["mobile home park", "trailer park"],
    "housing_companies": ["property management", "real estate", "realty", "leasing office"],
}

# OSM (category, type) pairs accepted for each lead type; filters out unrelated name matches.
ALLOWED_OSM_TYPES = {
    "apartments": {("building", "apartments"), ("landuse", "residential"), ("office", "property_management")},
    "trailers": {("landuse", "residential"), ("tourism", "caravan_site")},
    "housing_companies": {("office", "property_management"), ("office", "estate_agent"), ("shop", "estate_agent")},
}

JUNK_EMAIL = re.compile(
    r"(^(donations?|careers?|jobs?|hr|press|media|privacy|abuse|webmaster|unsubscribe|billing|accounting)@)|(\.(png|jpe?g|gif|svg|webp|css|js)$)|example\.|sentry|wixpress|@2x|noreply|no-reply|donotreply|u003e",
    re.I,
)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def check_email(address):
    """Syntax plus DNS check. Returns the normalized address or None."""
    if not address or JUNK_EMAIL.search(address):
        return None
    try:
        return validate_email(address.strip(), check_deliverability=True).normalized
    except EmailNotValidError:
        return None


def build_query(category, lat, lon, radius_miles):
    meters = int(min(radius_miles, MAX_RADIUS_MILES) * METERS_PER_MILE)
    statements = "".join(
        f'nwr{flt}["name"]["{key}"](around:{meters},{lat},{lon});'
        for flt in CATEGORIES[category][1]
        for key in CONTACT_KEYS
    )
    return f"[out:json][timeout:25];({statements});out center tags 250;"


def query_overpass(query):
    deadline = time.time() + OVERPASS_BUDGET
    last_error = None
    for url in OVERPASS_MIRRORS:
        remaining = deadline - time.time()
        if remaining < 5:
            break
        try:
            resp = requests.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=min(30, remaining))
            if resp.status_code == 200:
                return resp.json().get("elements", [])
            last_error = f"{url} returned {resp.status_code}"
        except (requests.RequestException, ValueError) as exc:
            last_error = f"{url}: {type(exc).__name__}"
    raise RuntimeError(f"All Overpass mirrors failed ({last_error})")


def element_to_business(el, label):
    tags = el.get("tags", {})
    parts = [tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:city"), tags.get("addr:state"), tags.get("addr:postcode")]
    website = tags.get("website") or tags.get("contact:website")
    if website and not website.startswith("http"):
        website = "http://" + website
    return {
        "name": tags.get("name"),
        "email": tags.get("email") or tags.get("contact:email"),
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "address": " ".join(p for p in parts if p) or None,
        "website": website,
        "type": label,
        "source": "OpenStreetMap",
    }


def _allowed(session, url):
    parsed = urlparse(url)
    rp = RobotFileParser()
    try:
        resp = session.get(f"{parsed.scheme}://{parsed.netloc}/robots.txt", timeout=5)
        if resp.status_code != 200:
            return True
        rp.parse(resp.text.splitlines())
        return rp.can_fetch(USER_AGENT, url)
    except requests.RequestException:
        return True


def extract_emails(html, site_host):
    """Return candidate emails from mailto links first, then page text; same-domain first."""
    soup = BeautifulSoup(html, "html.parser")
    found = []
    for a in soup.find_all("a", href=True):
        if a["href"].lower().startswith("mailto:"):
            found.append(a["href"][7:].split("?")[0].strip())
    found += EMAIL_RE.findall(soup.get_text(" "))
    seen, ordered = set(), []
    for e in found:
        key = e.lower()
        if key not in seen and not JUNK_EMAIL.search(key):
            seen.add(key)
            ordered.append(e)
    root = ".".join(site_host.split(".")[-2:]).lower()
    return sorted(ordered, key=lambda e: 0 if e.lower().endswith("@" + root) or e.lower().endswith("." + root) else 1)


def email_from_website(website):
    """Fetch the homepage and contact pages and return the first deliverable published email."""
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    host = urlparse(website).netloc.replace("www.", "")
    if not _allowed(session, website):
        return None
    for path in CONTACT_PATHS:
        try:
            resp = session.get(urljoin(website, path or "/"), timeout=6)
        except requests.RequestException:
            continue
        if resp.status_code != 200 or "text/html" not in resp.headers.get("Content-Type", ""):
            continue
        for candidate in extract_emails(resp.text[:MAX_PAGE_BYTES], host)[:5]:
            good = check_email(candidate)
            if good:
                return good
    return None


def miles_between(lat1, lon1, lat2, lon2):
    from math import asin, cos, radians, sin, sqrt
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    h = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 3958.8 * 2 * asin(sqrt(h))


def query_nominatim(category, lat, lon, radius_miles):
    """OSM search by business type inside a bounding box, filtered to the true radius."""
    from math import cos, radians
    radius = min(radius_miles, MAX_RADIUS_MILES)
    dlat = radius / 69.0
    dlon = radius / (69.0 * max(cos(radians(lat)), 0.1))
    viewbox = f"{lon - dlon},{lat + dlat},{lon + dlon},{lat - dlat}"
    label = CATEGORIES[category][0]
    found, errors = [], 0
    for i, term in enumerate(SEARCH_TERMS[category]):
        if i:
            time.sleep(1.1)  # Nominatim usage policy: max 1 request per second
        try:
            resp = requests.get(
                NOMINATIM_URL,
                params={"q": term, "format": "jsonv2", "extratags": 1, "addressdetails": 0,
                        "bounded": 1, "viewbox": viewbox, "limit": 40},
                headers={"User-Agent": USER_AGENT}, timeout=15,
            )
            resp.raise_for_status()
            results = resp.json()
        except (requests.RequestException, ValueError):
            errors += 1
            continue
        for r in results:
            if (r.get("category"), r.get("type")) not in ALLOWED_OSM_TYPES[category]:
                continue
            if miles_between(lat, lon, float(r["lat"]), float(r["lon"])) > radius:
                continue
            found.append(element_to_business({"tags": {**(r.get("extratags") or {}), "name": r.get("name") or ""}}, label))
    if errors == len(SEARCH_TERMS[category]):
        raise RuntimeError("Nominatim unavailable")
    return found


OVERTURE_CATS = {
    "apartments": ["apartment"],
    "trailers": ["mobile_home_park"],
    "housing_companies": ["property_management", "real_estate_agent", "commercial_real_estate",
                          "real_estate_investment", "housing_authority"],
}
OVERTURE_DEFAULT_RELEASE = "2026-09-23.1"
_overture_release = None


def overture_release():
    """Latest Overture release folder (they retire old ones), cached per process."""
    global _overture_release
    if _overture_release:
        return _overture_release
    try:
        resp = requests.get("https://overturemaps-us-west-2.s3.amazonaws.com/",
                            params={"list-type": "2", "prefix": "release/", "delimiter": "/"}, timeout=10)
        found = sorted(re.findall(r"<Prefix>release/([0-9][^/<]*)/</Prefix>", resp.text))
        _overture_release = found[-1] if found else OVERTURE_DEFAULT_RELEASE
    except requests.RequestException:
        _overture_release = OVERTURE_DEFAULT_RELEASE
    return _overture_release


def query_overture(category, lat, lon, radius_miles):
    """Free Overture Maps places (public S3 parquet), searched by bounding box then exact radius."""
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError("Overture source unavailable (duckdb not installed)") from exc
    from math import cos, radians
    radius = min(radius_miles, MAX_RADIUS_MILES)
    dlat = radius / 69.0
    dlon = radius / (69.0 * max(cos(radians(lat)), 0.1))
    cats = ",".join("'%s'" % c for c in OVERTURE_CATS[category])
    path = f"s3://overturemaps-us-west-2/release/{overture_release()}/theme=places/type=place/*"
    sql = f"""
        SELECT names.primary, websites[1], emails[1], phones[1], addresses[1].freeform,
               addresses[1].locality, addresses[1].region, bbox.xmin, bbox.ymin
        FROM read_parquet('{path}', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {lon - dlon} AND {lon + dlon} AND bbox.ymin BETWEEN {lat - dlat} AND {lat + dlat}
          AND taxonomy.primary IN ({cats})
          AND COALESCE(operating_status, 'open') NOT ILIKE '%closed%'
    """
    try:
        con = duckdb.connect()
        con.execute("SET memory_limit='300MB'; SET threads=2; SET home_directory='/tmp'; SET extension_directory='/tmp/duckdb_ext';")
        con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';"
                    " SET s3_access_key_id=''; SET s3_secret_access_key=''; SET s3_session_token='';")
        rows = con.execute(sql).fetchall()
    except Exception as exc:  # duckdb raises many exception types for network/schema problems
        raise RuntimeError(f"Overture Maps error: {str(exc)[:160]}") from exc
    label = CATEGORIES[category][0]
    found = []
    for name, web, email, phone, freeform, city, region, x, y in rows:
        dist = miles_between(lat, lon, y, x)
        if not name or dist > radius:
            continue
        found.append((dist, {
            "name": name, "email": email, "phone": phone, "website": web, "type": label, "source": "Overture Maps",
            "address": ", ".join(p for p in (freeform, city, region) if p) or None,
        }))
    found.sort(key=lambda t: (t[1]["email"] is None, t[0]))  # published email first, then nearest
    return [biz for _, biz in found[:500]]


GOOGLE_TERMS = {
    "apartments": ["apartment complex", "apartment community"],
    "trailers": ["mobile home park", "trailer park"],
    "housing_companies": ["property management company", "real estate agency"],
}
GOOGLE_URL = "https://places.googleapis.com/v1/places:searchText"


def query_google_places(category, lat, lon, radius_miles, api_key):
    """Google Places (New) text search; needs GOOGLE_MAPS_API_KEY. Returns businesses with websites."""
    radius_m = min(radius_miles * METERS_PER_MILE, 50000)  # Places circle bias max is 50 km
    label = CATEGORIES[category][0]
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.displayName,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,places.location,nextPageToken",
        "Content-Type": "application/json",
    }
    found, errors = [], 0
    for term in GOOGLE_TERMS[category]:
        body = {"textQuery": term, "pageSize": 20,
                "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lon}, "radius": radius_m}}}
        for _ in range(3):
            try:
                resp = requests.post(GOOGLE_URL, json=body, headers=headers, timeout=15)
                if resp.status_code != 200:
                    try:
                        detail = resp.json().get("error", {}).get("message", "")
                    except ValueError:
                        detail = ""
                    raise RuntimeError(f"Google Places error {resp.status_code}: {detail[:200]}")
                data = resp.json()
            except requests.RequestException:
                errors += 1
                break
            for pl in data.get("places", []):
                loc = pl.get("location") or {}
                if loc and miles_between(lat, lon, loc["latitude"], loc["longitude"]) > radius_miles:
                    continue
                found.append({
                    "name": (pl.get("displayName") or {}).get("text"),
                    "email": None,
                    "phone": pl.get("nationalPhoneNumber"),
                    "address": pl.get("formattedAddress"),
                    "website": pl.get("websiteUri"),
                    "type": label,
                    "source": "Google Places",
                })
            if not data.get("nextPageToken"):
                break
            body["pageToken"] = data["nextPageToken"]
    if errors and not found:
        raise RuntimeError("Google Places unavailable (network error)")
    return found


def is_directory(url):
    host = urlparse(url).netloc.lower().replace("www.", "")
    return any(host == d or host.endswith("." + d) for d in DIRECTORY_HOSTS)


def find_leads(category, lat, lon, radius_miles, limit, warnings=None):
    """Return up to `limit` real leads that have a verified published email."""
    label = CATEGORIES[category][0]
    businesses, source_errors = {}, []

    def add(biz):
        if biz["name"] and (biz["email"] or (biz["website"] and not is_directory(biz["website"]))):
            businesses.setdefault((biz["name"].lower(), biz["address"] or biz["website"] or biz["email"]), biz)

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if api_key:
        try:
            for biz in query_google_places(category, lat, lon, radius_miles, api_key):
                add(biz)
        except RuntimeError as exc:
            source_errors.append(str(exc))
            if warnings is not None:
                warnings.append(str(exc))
            print(f"[!] {exc}")
    try:
        for biz in query_overture(category, lat, lon, radius_miles):
            add(biz)
    except RuntimeError as exc:
        source_errors.append(str(exc))
        if warnings is not None:
            warnings.append(str(exc))
        print(f"[!] {exc}")
    if len(businesses) < limit * 3:  # thin results: top up from OpenStreetMap
        try:
            for biz in query_nominatim(category, lat, lon, radius_miles):
                add(biz)
        except RuntimeError as exc:
            source_errors.append(str(exc))
    if len(businesses) < limit:
        try:
            for el in query_overpass(build_query(category, lat, lon, radius_miles)):
                add(element_to_business(el, label))
        except RuntimeError as exc:
            source_errors.append(str(exc))
    if not businesses and source_errors:
        raise RuntimeError("; ".join(source_errors))

    leads, seen_emails, pending = [], set(), []
    for biz in businesses.values():
        good = check_email(biz["email"]) if biz["email"] else None
        if good:
            biz["email"], biz["email_source"] = good, f"{biz.get('source', 'Directory')} listing"
            leads.append(biz)
            seen_emails.add(good.lower())
        elif biz["website"]:
            pending.append(biz)

    pool = ThreadPoolExecutor(max_workers=12)
    futures = {pool.submit(email_from_website, biz["website"]): biz for biz in pending[:90]}
    try:
        for fut in as_completed(futures, timeout=SITE_TIME_BUDGET):
            if len(leads) >= limit:
                break
            biz = futures[fut]
            try:
                email = fut.result()
            except Exception:
                email = None
            if email and email.lower() not in seen_emails:
                seen_emails.add(email.lower())
                biz["email"], biz["email_source"] = email, "Business website"
                leads.append(biz)
    except FuturesTimeout:
        pass
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    return [
        {
            "name": b["name"],
            "email": b["email"],
            "phone": b["phone"],
            "address": b["address"] or "",
            "type": b["type"],
            "price": None,
            "amenities": "[]",
            "url": b["website"],
            "email_validated": True,
            "email_source": b["email_source"],
        }
        for b in leads[:limit]
    ]
