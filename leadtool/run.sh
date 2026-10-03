#!/bin/bash
# Startup script for Junk Junkies Lead Generator

cd "$(dirname "$0")"
echo "🚀 Starting Junk Junkies Lead Generator..."

# Install dependencies if needed
if ! command -v pip &> /dev/null; then
    echo "❌ Python/pip not found. Please install Python 3.8+"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate 2>/dev/null || . venv/Scripts/activate 2>/dev/null

# Install requirements
echo "📦 Installing dependencies..."
pip install -q -r requirements.txt

# Create data directory if needed
mkdir -p data

# Start Flask application
echo "✅ Starting Flask server at http://localhost:5000"
echo "📝 Press Ctrl+C to stop"
python app.py
