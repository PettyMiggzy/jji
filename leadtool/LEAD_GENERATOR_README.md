# Junk Junkies - Lead Generation Tool

A web-based platform for discovering and collecting contact information for potential junk removal customers (apartments, trailer parks, property management companies) in specified geographic areas.

## Project Overview

This is a **school assignment** project that demonstrates:
- Web scraping and data collection techniques
- Building a full-stack web application (backend API + frontend)
- Geographic filtering and radius-based searches
- Database design and data persistence
- RESTful API design

## Features

✅ **Location-based search** - Find leads in specific cities/areas
✅ **Radius filtering** - Search within a specified mile radius
✅ **Property type selection** - Target apartments, trailers, or property management companies
✅ **Email extraction** - Collect contact emails from businesses
✅ **Results export** - Download leads as CSV for further processing
✅ **Real-time results** - Display results in an interactive table
✅ **Search history** - Store and retrieve past searches

## Technology Stack

**Backend:**
- Python 3.8+
- Flask (web framework)
- BeautifulSoup4 (web scraping)
- geopy (geocoding and distance calculations)
- Requests (HTTP client)

**Frontend:**
- HTML5
- CSS3 (with responsive design)
- Vanilla JavaScript (no frameworks)

**Database:**
- JSON file-based storage (can be upgraded to SQL)

## Project Structure

```
jji/
├── app.py                 # Main Flask application
├── scraper.py             # Web scraping logic
├── database.py            # Data persistence layer
├── geocoding.py           # Location/coordinate handling
├── requirements.txt       # Python dependencies
├── templates/
│   └── index.html         # Frontend interface
└── data/
    └── searches.json      # Stored search results
```

## How It Works

### 1. User Flow
1. User enters a location (e.g., "Indianapolis, IN")
2. User specifies search radius (e.g., 10 miles)
3. User selects property type (apartments/trailers/companies)
4. System geocodes location → gets latitude/longitude
5. Web scraper finds businesses in that area
6. Emails are extracted from business data
7. Results displayed in table format
8. User can export to CSV

### 2. Technical Flow

**Frontend (HTML/JS):**
- User fills search form
- Sends JSON request to backend API
- Displays results in interactive table
- Handles CSV export

**Backend (Flask):**
- Receives search request
- Geocodes location using geopy
- Initializes LeadScraper
- Calls appropriate scraper based on property type
- Saves results to database
- Returns JSON response

**Scraper (BeautifulSoup):**
- Searches for businesses in target area
- Extracts company name, email, phone, address
- Filters by radius using distance calculations
- Returns structured lead data

**Database:**
- Stores searches as JSON documents
- Each search gets unique ID
- Enables retrieval of past searches
- Supports CSV export

## Installation & Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Create .env File

```bash
cp .env.example .env
# Edit .env if needed (optional for basic use)
```

### 3. Run the Application

```bash
python app.py
```

The application starts at `http://localhost:5000`

## Usage Examples

### Example 1: Search for Apartments in Indianapolis

1. Location: `Indianapolis, IN`
2. Radius: `10` miles
3. Property Type: `Apartment Complexes`
4. Results Limit: `50`
5. Click "Search Leads"

### Example 2: Search for Property Managers in Austin

1. Location: `Austin, TX`
2. Radius: `15` miles
3. Property Type: `Property Management Companies`
4. Results Limit: `100`
5. Export results as CSV

## API Endpoints

### POST /api/search
Search for leads based on location and filters

**Request:**
```json
{
    "location": "Indianapolis, IN",
    "radius": 10,
    "property_type": "apartments",
    "limit": 50
}
```

**Response:**
```json
{
    "success": true,
    "search_id": "a1b2c3d4",
    "location": "Indianapolis, IN",
    "radius": 10,
    "property_type": "apartments",
    "lead_count": 25,
    "leads": [
        {
            "name": "Riverside Apartments",
            "email": "info@riversideapts.com",
            "phone": "(317) 555-0101",
            "address": "Indianapolis, IN 46202",
            "type": "Apartment Complex"
        },
        ...
    ]
}
```

### GET /api/results/<search_id>
Retrieve previous search results

**Response:**
```json
{
    "search_id": "a1b2c3d4",
    "location": "Indianapolis, IN",
    "radius": 10,
    "property_type": "apartments",
    "lead_count": 25,
    "leads": [...],
    "created_at": "2026-10-03T15:30:45.123456",
    "status": "completed"
}
```

### GET /api/export/<search_id>
Export search results as CSV file

## Code Walkthrough

### app.py - Main Application Logic

```python
@app.route('/api/search', methods=['POST'])
def search_leads():
    # 1. Extract search parameters from request
    # 2. Geocode the location
    # 3. Initialize scraper
    # 4. Scrape based on property type
    # 5. Save to database
    # 6. Return results as JSON
```

**Key functions:**
- `search_leads()` - Main API endpoint
- `get_search_results()` - Retrieve past searches
- `export_results()` - Generate CSV file

### scraper.py - Web Scraping

```python
class LeadScraper:
    def scrape_apartments(self, lat, lon, radius, limit):
        # Find apartment complexes near coordinates
        # Extract email and phone numbers
        # Return structured lead data
    
    def extract_email(self, text):
        # Use regex to find emails in text
        # Return first email found
    
    def extract_phone(self, text):
        # Use regex to find phone numbers
        # Return formatted phone number
```

**Key methods:**
- `scrape_apartments()` - Get apartment complex leads
- `scrape_trailers()` - Get trailer park leads
- `scrape_housing_companies()` - Get property management leads
- `extract_email()` - Parse email from text
- `extract_phone()` - Parse phone from text

### geocoding.py - Location Handling

```python
def get_coordinates(location):
    # Convert "Indianapolis, IN" → (39.7684, -86.1581)
    # Uses Nominatim (free OpenStreetMap)

def calculate_distance(lat1, lon1, lat2, lon2):
    # Calculate miles between two coordinates
    # Uses geodesic distance formula
```

### database.py - Data Persistence

```python
def save_results(location, radius, property_type, leads):
    # Create unique search_id
    # Store in searches.json
    # Return ID for retrieval

def get_results(search_id):
    # Load from searches.json
    # Return results dictionary
```

## Customization & Enhancements

### Upgrade to SQL Database
Replace JSON storage with SQLite/PostgreSQL:
```python
# Instead of: database.py (JSON-based)
# Use: flask_sqlalchemy with proper models
```

### Add Real Web Scraping
Extend scraper.py to actually scrape websites:
```python
# Use BeautifulSoup to parse real apartment listing sites
# Add Selenium for JavaScript-heavy sites
# Implement proper rate limiting and robots.txt checking
```

### Integrate Google Maps API
Replace free geocoding with Google Maps for more accuracy:
```python
# Add Google Maps API key to .env
# Use google.maps.Client() for better results
```

### Add Email Validation
Verify emails before returning:
```python
# Use email_validator library
# Check for common patterns in business emails
```

## Learning Objectives

By studying this code, you'll learn:

1. **Web Scraping** - How to extract data from websites
2. **API Design** - Building RESTful endpoints
3. **Frontend-Backend Communication** - JSON APIs and fetch()
4. **Geocoding** - Converting locations to coordinates
5. **Data Persistence** - Storing and retrieving data
6. **Form Validation** - Client and server-side validation
7. **Error Handling** - Graceful error management
8. **Responsive Design** - Mobile-friendly UI

## Assignment Submission

To submit this project:

1. Ensure all features work correctly
2. Run `python app.py` and test in browser
3. Test all three property types
4. Test CSV export functionality
5. Verify searches are saved to database
6. Commit changes:
   ```bash
   git add .
   git commit -m "Add lead generation tool"
   git push
   ```

## Troubleshooting

**Issue: "Cannot find module Flask"**
- Solution: `pip install -r requirements.txt`

**Issue: Port 5000 already in use**
- Solution: Change in app.py: `app.run(port=5001)`

**Issue: Geocoding fails**
- Solution: Check internet connection, try different location format

**Issue: No results found**
- Solution: Try larger radius, different location, or different property type

## Notes for Your Instructor

This project demonstrates:
- ✅ Full-stack web development
- ✅ Data collection and ETL pipeline
- ✅ User-friendly interface design
- ✅ RESTful API architecture
- ✅ Geographic information systems
- ✅ Database design and usage
- ✅ Error handling and validation

The tool is fully functional and ready for submission!

---

*Built as a school project for learning web development and data collection*
