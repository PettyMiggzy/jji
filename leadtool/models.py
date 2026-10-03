"""
SQLAlchemy ORM models for Junk Junkies lead database
Replaces JSON file storage with proper SQL database
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

class Search(db.Model):
    """Search record model"""
    __tablename__ = 'searches'

    id = db.Column(db.String(8), primary_key=True)
    location = db.Column(db.String(255), nullable=False, index=True)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    radius = db.Column(db.Integer, nullable=False)
    property_type = db.Column(db.String(50), nullable=False, index=True)
    lead_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    status = db.Column(db.String(20), default='completed')

    # Relationship
    leads = db.relationship('Lead', backref='search', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'search_id': self.id,
            'location': self.location,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'radius': self.radius,
            'property_type': self.property_type,
            'lead_count': self.lead_count,
            'leads': [lead.to_dict() for lead in self.leads],
            'created_at': self.created_at.isoformat(),
            'status': self.status
        }

class Lead(db.Model):
    """Individual lead model"""
    __tablename__ = 'leads'

    id = db.Column(db.Integer, primary_key=True)
    search_id = db.Column(db.String(8), db.ForeignKey('searches.id'), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=True, index=True)
    phone = db.Column(db.String(20), nullable=True)
    address = db.Column(db.String(500), nullable=True)
    type = db.Column(db.String(100), nullable=True)
    price = db.Column(db.Float, nullable=True)  # For advanced filtering
    amenities = db.Column(db.Text, nullable=True)  # JSON string of amenities
    url = db.Column(db.String(500), nullable=True)  # Source URL
    email_validated = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        """Convert to dictionary"""
        amenities = []
        if self.amenities:
            try:
                amenities = json.loads(self.amenities)
            except:
                amenities = []

        return {
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'address': self.address,
            'type': self.type,
            'price': self.price,
            'amenities': amenities,
            'email_validated': self.email_validated
        }

class Statistics(db.Model):
    """Global statistics model"""
    __tablename__ = 'statistics'

    id = db.Column(db.Integer, primary_key=True)
    metric_name = db.Column(db.String(100), nullable=False, unique=True)
    metric_value = db.Column(db.Integer, default=0)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'metric_name': self.metric_name,
            'metric_value': self.metric_value,
            'last_updated': self.last_updated.isoformat()
        }
