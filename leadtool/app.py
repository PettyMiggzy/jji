"""
Junk Junkies - Lead Generation Tool (Enhanced Version)
Full-stack application with SQL database, real web scraping, email validation, and advanced filtering
"""

from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
from models import db, Search, Lead
from sources import find_leads
from db_service import (
    init_db, save_results, get_results, list_all_searches,
    delete_search, get_statistics, search_by_filters, get_leads_by_search
)
from geocoding import get_coordinates
import os
from dotenv import load_dotenv
from functools import wraps
import hmac

load_dotenv()

app = Flask(__name__)
CORS(app)

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///junk_junkies.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.environ['SECRET_KEY']

# Initialize database
db.init_app(app)

with app.app_context():
    db.create_all()

# Admin password
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']

def login_required(f):
    """Decorator to check if admin is logged in"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

# ============= MAIN ROUTES =============

@app.route('/')
def index():
    """Serve the main frontend page"""
    return render_template('index.html')

# ============= ADMIN ROUTES =============

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    """Admin login page"""
    if request.method == 'POST':
        password = request.form.get('password')
        if password and hmac.compare_digest(password, ADMIN_PASSWORD):
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

# ============= API ROUTES - SEARCH =============

@app.route('/api/search', methods=['POST'])
def search_leads():
    """
    Main search endpoint with advanced filtering

    Request JSON:
    {
        "location": "Indianapolis, IN",
        "radius": 10,
        "property_type": "apartments|trailers|housing_companies",
        "limit": 50,
        "min_price": 500,  # optional
        "max_price": 2000  # optional
    }
    """
    try:
        data = request.json
        location = data.get('location')
        radius = data.get('radius', 10)
        property_type = data.get('property_type', 'apartments')
        limit = data.get('limit', 50)
        min_price = data.get('min_price')
        max_price = data.get('max_price')

        if not location:
            return jsonify({'error': 'Location is required'}), 400

        # Geocode location
        lat, lon = get_coordinates(location)
        if not lat:
            return jsonify({'error': 'Could not geocode location'}), 400

        print(f"[*] Searching for {property_type} near {location} ({lat}, {lon}) within {radius} miles")

        if property_type not in ('apartments', 'trailers', 'housing_companies'):
            return jsonify({'error': 'Invalid property type'}), 400

        try:
            leads = find_leads(property_type, lat, lon, radius, limit)
        except RuntimeError as exc:
            return jsonify({'error': f'Business data source unavailable, try again shortly. ({exc})'}), 503

        # Apply price filters if specified
        if min_price or max_price:
            leads = [l for l in leads if apply_price_filter(l, min_price, max_price)]

        # Save to database
        search_id = save_results(location, lat, lon, radius, property_type, leads)

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

def apply_price_filter(lead, min_price, max_price):
    """Apply price filtering to lead"""
    price = lead.get('price')

    if price is None:
        return True  # Include if no price info

    if min_price and price < min_price:
        return False

    if max_price and price > max_price:
        return False

    return True

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
        fieldnames = ['name', 'email', 'phone', 'address', 'type', 'price', 'email_validated']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        for lead in leads:
            writer.writerow({
                'name': lead.get('name', ''),
                'email': lead.get('email', ''),
                'phone': lead.get('phone', ''),
                'address': lead.get('address', ''),
                'type': lead.get('type', ''),
                'price': lead.get('price', ''),
                'email_validated': lead.get('email_validated', False)
            })

        return output.getvalue(), 200, {
            'Content-Disposition': f'attachment; filename=leads_{search_id}.csv',
            'Content-Type': 'text/csv'
        }
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============= API ROUTES - ADMIN =============

@app.route('/api/admin/stats', methods=['GET'])
@login_required
def get_admin_stats():
    """Get admin statistics"""
    try:
        searches = list_all_searches()
        stats = get_statistics()

        return jsonify({
            'total_searches': stats['total_searches'],
            'total_leads': stats['total_leads'],
            'avg_leads': stats['avg_leads'],
            'searches': searches
        }), 200
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

@app.route('/api/admin/search/filter', methods=['POST'])
@login_required
def admin_filter_searches():
    """Advanced search filtering for admin"""
    try:
        data = request.json
        property_type = data.get('property_type')
        location = data.get('location')
        min_leads = data.get('min_leads')
        max_leads = data.get('max_leads')
        limit = data.get('limit', 50)

        results = search_by_filters(
            property_type=property_type,
            location=location,
            min_leads=min_leads,
            max_leads=max_leads,
            limit=limit
        )

        return jsonify({
            'count': len(results),
            'searches': results
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/leads/<search_id>', methods=['GET'])
@login_required
def admin_get_leads(search_id):
    """Get leads with price filtering for admin"""
    try:
        min_price = request.args.get('min_price', type=float)
        max_price = request.args.get('max_price', type=float)

        leads = get_leads_by_search(search_id, min_price, max_price)

        return jsonify({
            'search_id': search_id,
            'lead_count': len(leads),
            'leads': leads
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============= UTILITY ROUTES =============

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'database': 'connected'}), 200

@app.route('/api/stats', methods=['GET'])
def get_public_stats():
    """Public statistics endpoint"""
    try:
        stats = get_statistics()
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============= ERROR HANDLERS =============

@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(e):
    """Handle 500 errors"""
    return jsonify({'error': 'Server error'}), 500

# ============= STARTUP =============

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=5000)
