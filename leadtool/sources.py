"""
Real lead sources: OpenStreetMap (Overpass API) for businesses inside a radius,
plus the contact emails those businesses publish on their own websites.
No emails are guessed or generated; every returned email was found in a tag or a page.
"""

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


LEAD_TYPES = {
    # key: label shown in menus, lead (singular, shown per lead), group, Overture categories in priority order
    "apartments": {"label": "Apartment complexes", "lead": "Apartment Complex", "group": "Housing", "overture": ["apartment"]},
    "trailers": {"label": "Trailer / mobile home parks", "lead": "Trailer / Mobile Home Park", "group": "Housing", "overture": ["mobile_home_park"]},
    "housing_companies": {"label": "Property management & real estate", "lead": "Property Management / Real Estate", "group": "Housing",
                          "overture": ["property_management", "real_estate_agent", "commercial_real_estate", "real_estate_investment", "housing_authority"]},
    "realtors": {"label": "Realtors / real estate agents", "lead": "Real Estate Agent", "group": "Referral partners", "overture": ["real_estate_agent"]},
    "movers": {"label": "Moving companies", "lead": "Moving Company", "group": "Referral partners", "overture": ["mover"]},
    "storage": {"label": "Self-storage facilities", "lead": "Storage Facility", "group": "Referral partners", "overture": ["self_storage_facility", "storage_facility"]},
    "contractors": {"label": "Contractors & remodelers", "lead": "Contractor", "group": "Referral partners",
                    "overture": ["demolition_service", "altering_and_remodeling_contractor", "bathroom_remodeling", "kitchen_remodeling",
                                 "flooring_contractor", "building_or_construction_service", "contractor"]},
    "estate_attorneys": {"label": "Wills, trusts & probate attorneys", "lead": "Estate Attorney", "group": "Referral partners", "overture": ["wills_trusts_and_probate"]},
    "senior_living": {"label": "Assisted living & senior services", "lead": "Senior Living / Services", "group": "Referral partners", "overture": ["assisted_living_facility", "senior_citizen_service"]},
    "funeral": {"label": "Funeral services", "lead": "Funeral Service", "group": "Referral partners", "overture": ["funeral_service"]},
    "inspectors": {"label": "Home inspectors", "lead": "Home Inspector", "group": "Referral partners", "overture": ["home_inspector"]},
    "auctions": {"label": "Auction houses & antique stores", "lead": "Auction / Antique", "group": "Referral partners", "overture": ["auction_house", "antique_store"]},
    "hotels": {"label": "Hotels & motels", "lead": "Hotel / Motel", "group": "Commercial cleanouts", "overture": ["hotel", "motel"]},
    "competitors": {"label": "Junk removal & dumpster competitors", "lead": "Competitor", "group": "Competitors",
                    "overture": ["junk_removal_and_hauling", "dumpster_rental", "junkyard"]},
}
OVERTURE_CATS = {k: v["overture"] for k, v in LEAD_TYPES.items()}
CUSTOM_RE = re.compile(r"^[a-z][a-z0-9_]{1,60}$")


def resolve_type(property_type, custom_category=None):
    """Return a valid lead type key, "custom:<overture_category>", or None."""
    if property_type == "custom":
        cat = (custom_category or "").strip().lower().replace(" ", "_")
        return f"custom:{cat}" if CUSTOM_RE.match(cat) else None
    return property_type if property_type in LEAD_TYPES else None


def type_label(type_key):
    if type_key.startswith("custom:"):
        return type_key[7:].replace("_", " ").title()
    return LEAD_TYPES[type_key]["lead"]


def overture_categories(type_key):
    return [type_key[7:]] if type_key.startswith("custom:") else LEAD_TYPES[type_key]["overture"]


def type_groups():
    """[(group, [(key, label), ...]), ...] in menu order."""
    groups = {}
    for key, info in LEAD_TYPES.items():
        groups.setdefault(info["group"], []).append((key, info["label"]))
    return list(groups.items())


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


def _duck_connect(duckdb):
    con = duckdb.connect()
    con.execute("SET memory_limit='300MB'; SET threads=2; SET home_directory='/tmp'; SET extension_directory='/tmp/duckdb_ext';")
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';"
                " SET s3_access_key_id=''; SET s3_secret_access_key=''; SET s3_session_token='';")
    return con


def market_sizing(lat, lon, radius_miles, type_keys, zip_name=None):
    """Count businesses per ZIP inside the radius, for one or more lead types, ranked by total."""
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError("Market sizing unavailable (duckdb not installed)") from exc
    from math import cos, radians
    radius = min(radius_miles, MAX_RADIUS_MILES)
    dlat = radius / 69.0
    dlon = radius / (69.0 * max(cos(radians(lat)), 0.1))
    cat_to_type = {}
    for t in type_keys:
        for c in overture_categories(t):
            cat_to_type.setdefault(c, t)
    cats = ",".join("'%s'" % c for c in cat_to_type)
    path = f"s3://overturemaps-us-west-2/release/{overture_release()}/theme=places/type=place/*"
    sql = f"""
        SELECT left(addresses[1].postcode, 5), taxonomy.primary, count(*), count(websites[1]), count(emails[1])
        FROM read_parquet('{path}', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {lon - dlon} AND {lon + dlon} AND bbox.ymin BETWEEN {lat - dlat} AND {lat + dlat}
          AND taxonomy.primary IN ({cats}) AND addresses[1].postcode IS NOT NULL
          AND COALESCE(operating_status, 'open') NOT ILIKE '%closed%'
          AND 2*3958.8*asin(sqrt(pow(sin(radians(bbox.ymin-({lat}))/2),2)
              + cos(radians(({lat})))*cos(radians(bbox.ymin))*pow(sin(radians(bbox.xmin-({lon}))/2),2))) <= {radius}
        GROUP BY 1, 2
    """
    try:
        rows = _duck_connect(duckdb).execute(sql).fetchall()
    except Exception as exc:
        raise RuntimeError(f"Overture Maps error: {str(exc)[:160]}") from exc
    zips = {}
    for z, cat, n, web, em in rows:
        if not z or not z.isdigit() or len(z) != 5:
            continue
        row = zips.setdefault(z, {"zip": z, "total": 0, "websites": 0, "emails": 0, "by_type": {}})
        row["total"] += n
        row["websites"] += web
        row["emails"] += em
        key = cat_to_type[cat]
        row["by_type"][key] = row["by_type"].get(key, 0) + n
    ranked = sorted(zips.values(), key=lambda r: (-r["total"], r["zip"]))
    for r in ranked:
        r["place"] = zip_name(r["zip"]) if zip_name else ""
    return ranked[:60]


def find_categories(lat, lon, text, radius_miles=10):
    """Valid Overture category names near a point whose name contains `text`, with counts."""
    try:
        import duckdb
    except ImportError as exc:
        raise RuntimeError("Category lookup unavailable (duckdb not installed)") from exc
    from math import cos, radians
    dlat = radius_miles / 69.0
    dlon = radius_miles / (69.0 * max(cos(radians(lat)), 0.1))
    safe = re.sub(r"[^a-z0-9_]", "", text.lower())
    path = f"s3://overturemaps-us-west-2/release/{overture_release()}/theme=places/type=place/*"
    sql = f"""
        SELECT taxonomy.primary, count(*), count(websites[1]), count(emails[1])
        FROM read_parquet('{path}', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {lon - dlon} AND {lon + dlon} AND bbox.ymin BETWEEN {lat - dlat} AND {lat + dlat}
          AND taxonomy.primary LIKE '%{safe}%'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    """
    try:
        rows = _duck_connect(duckdb).execute(sql).fetchall()
    except Exception as exc:
        raise RuntimeError(f"Overture Maps error: {str(exc)[:160]}") from exc
    return [{"category": c, "places": n, "websites": w, "emails": e} for c, n, w, e in rows]


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
    cats = ",".join("'%s'" % c for c in overture_categories(category))
    path = f"s3://overturemaps-us-west-2/release/{overture_release()}/theme=places/type=place/*"
    sql = f"""
        SELECT names.primary, websites[1], emails[1], phones[1], addresses[1].freeform,
               addresses[1].locality, addresses[1].region, bbox.xmin, bbox.ymin, taxonomy.primary
        FROM read_parquet('{path}', hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {lon - dlon} AND {lon + dlon} AND bbox.ymin BETWEEN {lat - dlat} AND {lat + dlat}
          AND taxonomy.primary IN ({cats})
          AND COALESCE(operating_status, 'open') NOT ILIKE '%closed%'
    """
    try:
        rows = _duck_connect(duckdb).execute(sql).fetchall()
    except Exception as exc:  # duckdb raises many exception types for network/schema problems
        raise RuntimeError(f"Overture Maps error: {str(exc)[:160]}") from exc
    label = type_label(category)
    found = []
    rank = {c: i for i, c in enumerate(overture_categories(category))}  # list order = lead priority
    for name, web, email, phone, freeform, city, region, x, y, cat in rows:
        dist = miles_between(lat, lon, y, x)
        if not name or dist > radius:
            continue
        found.append(((rank.get(cat, 99), dist), {
            "name": name, "email": email, "phone": phone, "website": web, "type": label, "source": "Overture Maps",
            "address": ", ".join(p for p in (freeform, city, region) if p) or None,
        }))
    found.sort(key=lambda t: (t[0][0], t[1]["email"] is None, t[0][1]))  # best business type, listed email, nearest
    return [biz for _, biz in found[:500]]


def is_directory(url):
    host = urlparse(url).netloc.lower().replace("www.", "")
    return any(host == d or host.endswith("." + d) for d in DIRECTORY_HOSTS)


def find_leads(category, lat, lon, radius_miles, limit, warnings=None):
    """Return up to `limit` real leads that have a verified published email."""
    label = type_label(category)
    businesses, source_errors = {}, []

    def add(biz):
        if biz["name"] and (biz["email"] or (biz["website"] and not is_directory(biz["website"]))):
            businesses.setdefault((biz["name"].lower(), biz["address"] or biz["website"] or biz["email"]), biz)

    try:
        for biz in query_overture(category, lat, lon, radius_miles):
            add(biz)
    except RuntimeError as exc:
        source_errors.append(str(exc))
        if warnings is not None:
            warnings.append(str(exc))
        print(f"[!] {exc}")
    if category in SEARCH_TERMS and len(businesses) < limit * 3:  # thin results: top up from OpenStreetMap
        try:
            for biz in query_nominatim(category, lat, lon, radius_miles):
                add(biz)
        except RuntimeError as exc:
            source_errors.append(str(exc))
    if category in CATEGORIES and len(businesses) < limit:
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
