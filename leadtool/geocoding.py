"""
Geocoding module for converting locations to coordinates and calculating distances
"""

from geopy.geocoders import Nominatim
from geopy.distance import geodesic
import re
import time

# Initialize geocoder (using free Nominatim service)
geocoder = Nominatim(user_agent="junk_junkies_lead_scraper")

ZIP_RE = re.compile(r"^\s*(\d{5})(?:-\d{4})?\s*$")


def get_coordinates(location):
    """
    Convert a US ZIP code ("46241") or place ("Haines City, FL") to (latitude, longitude).
    Searches are restricted to the US; returns (None, None) when nothing matches.
    """
    try:
        zip_match = ZIP_RE.match(location or "")
        if zip_match:
            zip5 = zip_match.group(1)
            result = geocoder.geocode({"postalcode": zip5, "country": "US"}, addressdetails=True, timeout=10)
            if result and str(result.raw.get("address", {}).get("postcode", ""))[:5] != zip5:
                print(f"[!] ZIP {zip5} resolved to a different postcode; treating as not found")
                result = None
        else:
            result = geocoder.geocode(location, country_codes="us", timeout=10)
        if result:
            print(f"[+] Geocoded {location!r} -> {result.latitude}, {result.longitude}")
            return result.latitude, result.longitude
        print(f"[!] Could not geocode {location!r}")
        return None, None
    except Exception as e:
        print(f"[!] Error geocoding: {e}")
        return None, None

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
