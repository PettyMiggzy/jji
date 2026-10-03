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
OVERPASS_BUDGET = 50
SITE_TIME_BUDGET = 25
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

JUNK_EMAIL = re.compile(
    r"(\.(png|jpe?g|gif|svg|webp|css|js)$)|example\.|sentry|wixpress|@2x|noreply|no-reply|donotreply|u003e",
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


def find_leads(category, lat, lon, radius_miles, limit):
    """Return up to `limit` real leads that have a verified published email."""
    label = CATEGORIES[category][0]
    businesses = {}
    for el in query_overpass(build_query(category, lat, lon, radius_miles)):
        biz = element_to_business(el, label)
        if biz["name"] and (biz["email"] or biz["website"]):
            businesses[(biz["name"].lower(), biz["address"])] = biz

    leads, seen_emails, pending = [], set(), []
    for biz in businesses.values():
        good = check_email(biz["email"]) if biz["email"] else None
        if good:
            biz["email"], biz["email_source"] = good, "OpenStreetMap listing"
            leads.append(biz)
            seen_emails.add(good.lower())
        elif biz["website"]:
            pending.append(biz)

    pool = ThreadPoolExecutor(max_workers=6)
    futures = {pool.submit(email_from_website, biz["website"]): biz for biz in pending[:60]}
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
