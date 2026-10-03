"""
Geocoding module for converting locations to coordinates and calculating distances
"""

from geopy.geocoders import Nominatim
from geopy.distance import geodesic
import time

# Initialize geocoder (using free Nominatim service)
geocoder = Nominatim(user_agent="junk_junkies_lead_scraper")

def get_coordinates(location):
    """
    Convert a location string to latitude and longitude

    Args:
        location: Location string (e.g., "Indianapolis, IN")

    Returns:
        Tuple of (latitude, longitude) or (None, None) if not found
    """
    try:
        print(f"[*] Geocoding location: {location}")

        # Geocode the location
        geolocated = geocoder.geocode(location, timeout=10)

        if geolocated:
            print(f"[+] Found coordinates: {geolocated.latitude}, {geolocated.longitude}")
            return geolocated.latitude, geolocated.longitude
        else:
            print(f"[!] Could not geocode location: {location}")
            return None, None

    except Exception as e:
        print(f"[!] Error geocoding: {str(e)}")
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
