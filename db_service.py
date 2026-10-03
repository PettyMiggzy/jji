"""
Database service layer using SQLAlchemy
Replaces JSON file-based storage with SQL database
"""

from models import db, Search, Lead, Statistics
from datetime import datetime
import uuid

def init_db():
    """Initialize database tables"""
    from app import app
    with app.app_context():
        db.create_all()

def save_results(location, latitude, longitude, radius, property_type, leads):
    """
    Save search results to database

    Args:
        location: Search location string
        latitude: Latitude coordinate
        longitude: Longitude coordinate
        radius: Search radius in miles
        property_type: Type of property
        leads: List of lead dictionaries

    Returns:
        search_id: Unique identifier for the search
    """
    try:
        search_id = str(uuid.uuid4())[:8]

        # Create search record
        search = Search(
            id=search_id,
            location=location,
            latitude=latitude,
            longitude=longitude,
            radius=radius,
            property_type=property_type,
            lead_count=len(leads),
            status='completed'
        )

        # Add leads
        for lead_data in leads:
            lead = Lead(
                search_id=search_id,
                name=lead_data.get('name'),
                email=lead_data.get('email'),
                phone=lead_data.get('phone'),
                address=lead_data.get('address'),
                type=lead_data.get('type'),
                price=lead_data.get('price'),
                amenities=lead_data.get('amenities'),
                url=lead_data.get('url'),
                email_validated=lead_data.get('email_validated', False)
            )
            search.leads.append(lead)

        # Save to database
        db.session.add(search)
        db.session.commit()

        print(f"[+] Saved search {search_id} with {len(leads)} leads to database")
        return search_id

    except Exception as e:
        print(f"[!] Error saving results: {str(e)}")
        db.session.rollback()
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
        search = Search.query.filter_by(id=search_id).first()
        if not search:
            return None
        return search.to_dict()

    except Exception as e:
        print(f"[!] Error retrieving results: {str(e)}")
        return None

def list_all_searches(limit=None, offset=0):
    """
    List all searches in database

    Args:
        limit: Maximum number of results
        offset: Number of results to skip

    Returns:
        List of search dictionaries
    """
    try:
        query = Search.query.order_by(Search.created_at.desc())

        if offset:
            query = query.offset(offset)
        if limit:
            query = query.limit(limit)

        searches = query.all()
        return [search.to_dict() for search in searches]

    except Exception as e:
        print(f"[!] Error listing searches: {str(e)}")
        return []

def delete_search(search_id):
    """
    Delete a search by search_id

    Args:
        search_id: Unique identifier for the search

    Returns:
        True if deleted, False otherwise
    """
    try:
        search = Search.query.filter_by(id=search_id).first()
        if search:
            db.session.delete(search)
            db.session.commit()
            print(f"[+] Deleted search {search_id}")
            return True
        return False

    except Exception as e:
        print(f"[!] Error deleting search: {str(e)}")
        db.session.rollback()
        return False

def get_statistics():
    """Get global statistics"""
    try:
        total_searches = Search.query.count()
        total_leads = db.session.query(Lead).count()
        avg_leads = total_leads // max(total_searches, 1)

        return {
            'total_searches': total_searches,
            'total_leads': total_leads,
            'avg_leads': avg_leads
        }

    except Exception as e:
        print(f"[!] Error getting statistics: {str(e)}")
        return {'total_searches': 0, 'total_leads': 0, 'avg_leads': 0}

def search_by_filters(property_type=None, location=None, min_leads=None, max_leads=None, limit=50):
    """
    Search with advanced filters

    Args:
        property_type: Filter by property type
        location: Filter by location (partial match)
        min_leads: Minimum leads returned
        max_leads: Maximum leads returned
        limit: Max results to return

    Returns:
        List of matching searches
    """
    try:
        query = Search.query

        if property_type:
            query = query.filter_by(property_type=property_type)

        if location:
            query = query.filter(Search.location.ilike(f'%{location}%'))

        if min_leads:
            query = query.filter(Search.lead_count >= min_leads)

        if max_leads:
            query = query.filter(Search.lead_count <= max_leads)

        results = query.order_by(Search.created_at.desc()).limit(limit).all()
        return [search.to_dict() for search in results]

    except Exception as e:
        print(f"[!] Error searching: {str(e)}")
        return []

def get_leads_by_search(search_id, min_price=None, max_price=None):
    """
    Get leads from a search with optional price filtering

    Args:
        search_id: Search ID
        min_price: Minimum price filter
        max_price: Maximum price filter

    Returns:
        List of leads
    """
    try:
        query = Lead.query.filter_by(search_id=search_id)

        if min_price:
            query = query.filter(Lead.price >= min_price)

        if max_price:
            query = query.filter(Lead.price <= max_price)

        leads = query.all()
        return [lead.to_dict() for lead in leads]

    except Exception as e:
        print(f"[!] Error getting leads: {str(e)}")
        return []
