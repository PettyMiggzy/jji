"""
Geocoding module for converting locations to coordinates and calculating distances
"""

from geopy.geocoders import Nominatim
from geopy.distance import geodesic
import csv
import os
import re
import time

# Initialize geocoder (using free Nominatim service)
geocoder = Nominatim(user_agent="junk_junkies_lead_scraper")

ZIP_RE = re.compile(r"^\s*(\d{5})(?:-\d{4})?\s*$")
PLACE_RE = re.compile(r"^\s*(.+?)\s*,?\s+([A-Za-z]{2})\s*$")
ZIP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geo", "us_zips.csv")
_zips = None
_places = None


def _load_tables():
    """Load the bundled US ZIP table (GeoNames postal codes, CC BY 4.0) once per process."""
    global _zips, _places
    if _zips is not None:
        return
    _zips, grouped = {}, {}
    with open(ZIP_FILE, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            lat, lon = float(row["lat"]), float(row["lon"])
            _zips[row["zip"]] = (lat, lon)
            grouped.setdefault((_norm(row["place"]), row["state"].upper()), []).append((lat, lon))
    _places = {k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in grouped.items()}


def _norm(name):
    return re.sub(r"\s+", " ", re.sub(r"[.\']", "", name.lower())).strip()


def _nominatim(location):
    try:
        result = geocoder.geocode(location, country_codes="us", timeout=10)
        return (result.latitude, result.longitude) if result else (None, None)
    except Exception as e:
        print(f"[!] Nominatim fallback failed: {e}")
        return None, None


def get_coordinates(location):
    """
    Convert a US ZIP code ("46241") or "City, ST" to (latitude, longitude) using the bundled
    table, so it never depends on a rate-limited web service. Other text falls back to Nominatim.
    Returns (None, None) when nothing matches.
    """
    location = location or ""
    _load_tables()
    zip_match = ZIP_RE.match(location)
    if zip_match:
        coords = _zips.get(zip_match.group(1))
        if coords:
            print(f"[+] ZIP {zip_match.group(1)} -> {coords}")
            return coords
        print(f"[!] ZIP {zip_match.group(1)} is not a known US ZIP")
        return None, None
    place_match = PLACE_RE.match(location)
    if place_match:
        coords = _places.get((_norm(place_match.group(1)), place_match.group(2).upper()))
        if coords:
            print(f"[+] {location!r} -> {coords}")
            return coords
    return _nominatim(location)

def calculate_distance(lat1, lon1, lat2, lon2):
    """
    Calculate distance between two coordinates in miles

    Args:
        lat1, lon1: First coordinate pair
        lat2, lon2: Second coordinate pair

    Returns:
        Distance in miles
    """
    try:
        coord1 = (lat1, lon1)
        coord2 = (lat2, lon2)
        distance = geodesic(coord1, coord2).miles
        return distance

    except Exception as e:
        print(f"[!] Error calculating distance: {str(e)}")
        return None

def get_nearby_locations(center_lat, center_lon, radius_miles):
    """
    Generate a list of bounding box coordinates for a radius search

    Args:
        center_lat, center_lon: Center coordinates
        radius_miles: Search radius in miles

    Returns:
        Dictionary with bounding box coordinates
    """
    # Convert miles to degrees (approximate)
    # 1 degree ≈ 69 miles
    degrees = radius_miles / 69.0

    return {
        'north': center_lat + degrees,
        'south': center_lat - degrees,
        'east': center_lon + degrees,
        'west': center_lon - degrees,
        'center_lat': center_lat,
        'center_lon': center_lon,
        'radius': radius_miles
    }
