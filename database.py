"""
Database module for storing and retrieving search results
Uses JSON file-based storage for simplicity (can be upgraded to SQL database)
"""

import json
import os
from datetime import datetime
import uuid

DB_DIR = 'data'
DB_FILE = os.path.join(DB_DIR, 'searches.json')

def init_db():
    """Initialize database directory and file"""
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR)

    if not os.path.exists(DB_FILE):
        with open(DB_FILE, 'w') as f:
            json.dump({}, f)

def save_results(location, radius, property_type, leads):
    """
    Save search results to database

    Args:
        location: Search location
        radius: Search radius in miles
        property_type: Type of property (apartments, trailers, housing_companies)
        leads: List of lead dictionaries

    Returns:
        search_id: Unique identifier for the search
    """
    try:
        search_id = str(uuid.uuid4())[:8]  # Short unique ID

        # Load existing searches
        with open(DB_FILE, 'r') as f:
            searches = json.load(f)

        # Create new search record
        search_record = {
            'search_id': search_id,
            'location': location,
            'radius': radius,
            'property_type': property_type,
            'lead_count': len(leads),
            'leads': leads,
            'created_at': datetime.now().isoformat(),
            'status': 'completed'
        }

        # Store search
        searches[search_id] = search_record

        # Write back to database
        with open(DB_FILE, 'w') as f:
            json.dump(searches, f, indent=2)

        print(f"[+] Saved search {search_id} with {len(leads)} leads")
        return search_id

    except Exception as e:
        print(f"[!] Error saving results: {str(e)}")
        return None

def get_results(search_id):
    """
    Retrieve search results by search_id

    Args:
        search_id: Unique identifier for the search

    Returns:
        Dictionary containing search results or None
    """
    try:
        with open(DB_FILE, 'r') as f:
            searches = json.load(f)

        return searches.get(search_id)

    except Exception as e:
        print(f"[!] Error retrieving results: {str(e)}")
        return None

def list_all_searches():
    """List all searches in database"""
    try:
        with open(DB_FILE, 'r') as f:
            searches = json.load(f)
        return list(searches.values())

    except Exception as e:
        print(f"[!] Error listing searches: {str(e)}")
        return []

def delete_search(search_id):
    """Delete a search by search_id"""
    try:
        with open(DB_FILE, 'r') as f:
            searches = json.load(f)

        if search_id in searches:
            del searches[search_id]
            with open(DB_FILE, 'w') as f:
                json.dump(searches, f, indent=2)
            print(f"[+] Deleted search {search_id}")
            return True
        return False

    except Exception as e:
        print(f"[!] Error deleting search: {str(e)}")
        return False
