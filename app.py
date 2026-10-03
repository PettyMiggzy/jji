"""
Junk Junkies - Lead Generation Tool
Main Flask application for collecting potential customer emails based on location and radius
"""

from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
from scraper import LeadScraper
from database import init_db, save_results, get_results, list_all_searches, delete_search
from geocoding import get_coordinates, calculate_distance
import os
from dotenv import load_dotenv
from functools import wraps

load_dotenv()

app = Flask(__name__)
CORS(app)
app.secret_key = 'junk_junkies_secret_key_bankz_2024'  # For session management

# Initialize database
init_db()

# Admin password
ADMIN_PASSWORD = 'Bankz'

def login_required(f):
    """Decorator to check if admin is logged in"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    """Serve the main frontend page"""
    return render_template('index.html')

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    """Admin login page"""
    if request.method == 'POST':
        password = request.form.get('password')
        if password == ADMIN_PASSWORD:
            session['admin_logged_in'] = True
            return redirect(url_for('admin_dashboard'))
        else:
            return render_template('admin_login.html', error='Invalid password')
    return render_template('admin_login.html')

@app.route('/admin/logout')
def admin_logout():
    """Admin logout"""
    session.pop('admin_logged_in', None)
    return redirect(url_for('admin_login'))

@app.route('/admin')
@login_required
def admin_dashboard():
    """Admin dashboard page"""
    return render_template('admin.html')

@app.route('/api/admin/stats', methods=['GET'])
@login_required
def get_admin_stats():
    """Get admin statistics"""
    try:
        searches = list_all_searches()
        total_leads = sum(s.get('lead_count', 0) for s in searches)

        stats = {
            'total_searches': len(searches),
            'total_leads': total_leads,
            'searches': searches
        }
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/search/<search_id>', methods=['DELETE'])
@login_required
def admin_delete_search(search_id):
    """Delete a search"""
    try:
        if delete_search(search_id):
            return jsonify({'success': True, 'message': 'Search deleted'}), 200
        else:
            return jsonify({'error': 'Search not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search', methods=['POST'])
def search_leads():
    """
    API endpoint to search for leads based on location and radius

    Expected JSON:
    {
        "location": "Indianapolis, IN",
        "radius": 10,  # miles
        "property_type": "apartments|trailers|housing_companies",
        "limit": 100
    }
    """
    try:
        data = request.json
        location = data.get('location')
        radius = data.get('radius', 10)
        property_type = data.get('property_type', 'apartments')
        limit = data.get('limit', 50)

        if not location:
            return jsonify({'error': 'Location is required'}), 400

        # Get coordinates for the location
        lat, lon = get_coordinates(location)
        if not lat:
            return jsonify({'error': 'Could not geocode location'}), 400

        print(f"[*] Searching for {property_type} near {location} ({lat}, {lon}) within {radius} miles")

        # Initialize scraper
        scraper = LeadScraper()

        # Scrape data based on property type
        if property_type == 'apartments':
            leads = scraper.scrape_apartments(lat, lon, radius, limit)
        elif property_type == 'trailers':
            leads = scraper.scrape_trailers(lat, lon, radius, limit)
        elif property_type == 'housing_companies':
            leads = scraper.scrape_housing_companies(lat, lon, radius, limit)
        else:
            return jsonify({'error': 'Invalid property type'}), 400

        # Save results to database
        search_id = save_results(location, radius, property_type, leads)

        return jsonify({
            'success': True,
            'search_id': search_id,
            'location': location,
            'radius': radius,
            'property_type': property_type,
            'lead_count': len(leads),
            'leads': leads
        }), 200

    except Exception as e:
        print(f"[!] Error in search_leads: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/results/<search_id>', methods=['GET'])
def get_search_results(search_id):
    """Retrieve previous search results"""
    try:
        results = get_results(search_id)
        if not results:
            return jsonify({'error': 'Search not found'}), 404
        return jsonify(results), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export/<search_id>', methods=['GET'])
def export_results(search_id):
    """Export search results as CSV"""
    import csv
    from io import StringIO

    try:
        results = get_results(search_id)
        if not results:
            return jsonify({'error': 'Search not found'}), 404

        leads = results.get('leads', [])

        # Create CSV
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=['name', 'email', 'phone', 'address', 'type'])
        writer.writeheader()
        writer.writerows(leads)

        return output.getvalue(), 200, {
            'Content-Disposition': f'attachment; filename=leads_{search_id}.csv',
            'Content-Type': 'text/csv'
        }
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
