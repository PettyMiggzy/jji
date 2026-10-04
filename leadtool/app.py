"""
Junk Junkies - Lead Generation Tool (Enhanced Version)
Full-stack application with SQL database, real web scraping, email validation, and advanced filtering
"""

from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
from models import db, Search, Lead
from sources import find_leads, resolve_type, type_groups, type_label, market_sizing, find_categories, LEAD_TYPES
from db_service import (
    init_db, save_results, get_results, list_all_searches,
    delete_search, get_statistics, search_by_filters, get_leads_by_search
)
from geocoding import get_coordinates, zip_place
import os
from dotenv import load_dotenv
from functools import wraps
import hmac
import re
import threading
import time
import uuid

load_dotenv()

app = Flask(__name__)
app.url_map.strict_slashes = False
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

# Only one memory-heavy lookup at a time (the free host has 512MB)
search_lock = threading.Lock()
sweep_jobs = {}
PRESET_SETS = {
    'housing_all': ['apartments', 'housing_companies', 'trailers'],
    'partners_all': [k for k, v in LEAD_TYPES.items() if v['group'] == 'Referral partners'],
}


@app.context_processor
def inject_lead_types():
    return {'lead_type_groups': type_groups()}

def login_required(f):
    """Decorator to check if admin is logged in"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Login required'}), 401
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

# ============= MAIN ROUTES =============

@app.route('/')
def index():
    return redirect(url_for('admin_search_page'))


@app.route('/admin/search')
@login_required
def admin_search_page():
    """Lead search form (ZIP, radius, business type)"""
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
@login_required
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
            return jsonify({'error': 'We could not find that ZIP code or place. Try a 5-digit US ZIP or "City, ST".'}), 400

        print(f"[*] Searching for {property_type} near {location} ({lat}, {lon}) within {radius} miles")

        type_key = resolve_type(property_type, data.get('custom_category'))
        if not type_key:
            return jsonify({'error': 'Pick a business type, or enter a category name using letters, numbers and underscores.'}), 400
        try:
            radius = max(1, min(int(radius), 50))
            limit = max(1, min(int(limit), 200))
        except (TypeError, ValueError):
            return jsonify({'error': 'Radius and limit must be numbers.'}), 400

        if not search_lock.acquire(blocking=False):
            return jsonify({'error': 'Another search is running. Try again in a minute.'}), 429
        warnings = []
        try:
            leads = find_leads(type_key, lat, lon, radius, limit, warnings)
        except RuntimeError as exc:
            return jsonify({'error': f'Business data source unavailable, try again shortly. ({exc})'}), 503
        finally:
            search_lock.release()
        if not leads and type_key.startswith('custom:'):
            warnings.append(f"No matches for category '{type_key[7:]}'. Use Find category to see valid names near this ZIP.")

        # Apply price filters if specified
        if min_price or max_price:
            leads = [l for l in leads if apply_price_filter(l, min_price, max_price)]

        # Save to database
        search_id = save_results(location, lat, lon, radius, type_key, leads)

        return jsonify({
            'success': True,
            'search_id': search_id,
            'location': location,
            'radius': radius,
            'property_type': type_key,
            'lead_count': len(leads),
            'leads': leads,
            'warnings': warnings
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
@login_required
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
@login_required
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
        fieldnames = ['name', 'email', 'phone', 'address', 'type', 'website', 'email_validated']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        for lead in leads:
            writer.writerow({
                'name': lead.get('name', ''),
                'email': lead.get('email', ''),
                'phone': lead.get('phone', ''),
                'address': lead.get('address', ''),
                'type': lead.get('type', ''),
                'website': lead.get('url', ''),
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

# ============= MARKET SIZING, CATEGORY FINDER, TERRITORY SWEEP =============

@app.route('/admin/market')
@login_required
def admin_market_page():
    return render_template('market.html')


@app.route('/admin/sweep')
@login_required
def admin_sweep_page():
    return render_template('sweep.html')


def _locate(location):
    lat, lon = get_coordinates(location or '')
    if not lat:
        return None, None, (jsonify({'error': 'We could not find that ZIP code or place. Try a 5-digit US ZIP or "City, ST".'}), 400)
    return lat, lon, None


@app.route('/api/categories', methods=['GET'])
@login_required
def api_categories():
    """Valid Overture category names near a ZIP that contain the search text."""
    q = re.sub(r'[^a-z0-9_ ]', '', (request.args.get('q') or '').lower()).strip().replace(' ', '_')
    if len(q) < 3:
        return jsonify({'error': 'Type at least 3 letters.'}), 400
    lat, lon, err = _locate(request.args.get('location') or '46204')
    if err:
        return err
    if not search_lock.acquire(blocking=False):
        return jsonify({'error': 'Another search is running. Try again in a minute.'}), 429
    try:
        return jsonify({'categories': find_categories(lat, lon, q)}), 200
    except RuntimeError as exc:
        return jsonify({'error': str(exc)}), 503
    finally:
        search_lock.release()


@app.route('/api/market', methods=['POST'])
@login_required
def api_market():
    """Rank ZIP codes around a location by how many target businesses they hold, plus competitor counts."""
    data = request.json or {}
    lat, lon, err = _locate(data.get('location'))
    if err:
        return err
    choice = data.get('property_type', 'housing_all')
    types = PRESET_SETS.get(choice) or [resolve_type(choice, data.get('custom_category'))]
    if not types or None in types:
        return jsonify({'error': 'Pick a business type, or enter a valid category name.'}), 400
    try:
        radius = max(1, min(int(data.get('radius', 15)), 50))
    except (TypeError, ValueError):
        return jsonify({'error': 'Radius must be a number.'}), 400
    if not search_lock.acquire(blocking=False):
        return jsonify({'error': 'Another search is running. Try again in a minute.'}), 429
    try:
        rows = market_sizing(lat, lon, radius, types, zip_place)
        competitors = {r['zip']: r['total'] for r in market_sizing(lat, lon, radius, ['competitors'], zip_place)}
    except RuntimeError as exc:
        return jsonify({'error': str(exc)}), 503
    finally:
        search_lock.release()
    for r in rows:
        r['competitors'] = competitors.get(r['zip'], 0)
        r['whitespace'] = round(r['total'] / (r['competitors'] + 1), 1)
        r['by_type'] = {type_label(k): v for k, v in r['by_type'].items()}
    return jsonify({'location': data.get('location'), 'radius': radius, 'rows': rows}), 200


def _run_sweep(job_id, zips, radius, type_key, per_zip_limit):
    job = sweep_jobs[job_id]
    merged, seen, first = [], set(), None
    try:
        for i, z in enumerate(zips):
            job.update(current=z, done=i)
            lat, lon = get_coordinates(z)
            first = first or (lat, lon)
            with search_lock:
                try:
                    leads = find_leads(type_key, lat, lon, radius, per_zip_limit, [])
                except RuntimeError as exc:
                    job['errors'].append(f'{z}: {exc}')
                    continue
            for lead in leads:
                key = (lead.get('email') or '').lower()
                if key and key not in seen:
                    seen.add(key)
                    lead['zip'] = z
                    merged.append(lead)
            job['lead_count'] = len(merged)
        with app.app_context():
            job['search_id'] = save_results('Sweep: ' + ', '.join(zips), first[0], first[1], radius, type_key, merged)
        job.update(status='done', done=len(zips), current='', leads=merged)
    except Exception as exc:
        job.update(status='error', error=str(exc))


@app.route('/api/sweep', methods=['POST'])
@login_required
def api_sweep_start():
    data = request.json or {}
    raw = data.get('zips') or ''
    zips = list(dict.fromkeys(re.findall(r'\b\d{5}\b', raw if isinstance(raw, str) else ' '.join(map(str, raw)))))
    if not zips:
        return jsonify({'error': 'Enter at least one 5-digit ZIP code.'}), 400
    if len(zips) > 8:
        return jsonify({'error': 'Up to 8 ZIP codes per sweep.'}), 400
    unknown = [z for z in zips if not get_coordinates(z)[0]]
    if unknown:
        return jsonify({'error': 'Unknown ZIP code(s): ' + ', '.join(unknown)}), 400
    type_key = resolve_type(data.get('property_type'), data.get('custom_category'))
    if not type_key:
        return jsonify({'error': 'Pick a business type, or enter a valid category name.'}), 400
    try:
        radius = max(1, min(int(data.get('radius', 10)), 50))
        per_zip = max(5, min(int(data.get('limit', 25)), 100))
    except (TypeError, ValueError):
        return jsonify({'error': 'Radius and limit must be numbers.'}), 400
    if any(j['status'] == 'running' for j in sweep_jobs.values()):
        return jsonify({'error': 'A sweep is already running. Wait for it to finish.'}), 409
    for old in sorted(sweep_jobs, key=lambda k: sweep_jobs[k]['started'])[:-9]:
        sweep_jobs.pop(old, None)
    job_id = uuid.uuid4().hex[:10]
    sweep_jobs[job_id] = {'status': 'running', 'total': len(zips), 'done': 0, 'current': zips[0], 'lead_count': 0,
                          'errors': [], 'started': time.time(), 'type': type_key, 'zips': zips}
    threading.Thread(target=_run_sweep, args=(job_id, zips, radius, type_key, per_zip), daemon=True).start()
    return jsonify({'job_id': job_id, 'total': len(zips)}), 202


@app.route('/api/sweep/<job_id>', methods=['GET'])
@login_required
def api_sweep_status(job_id):
    job = sweep_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Sweep not found (the server may have restarted).'}), 404
    return jsonify({k: v for k, v in job.items() if k != 'started'}), 200

# ============= UTILITY ROUTES =============

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'database': 'connected'}), 200

@app.route('/api/stats', methods=['GET'])
@login_required
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
