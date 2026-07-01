#!/bin/bash
# Build the React frontend and place the output in static/ for Flask to serve.
set -e

echo "Installing Node dependencies..."
cd "$(dirname "$0")/frontend"
npm install

echo "Building React app..."
npm run build
# Output goes to ../static/ (configured in vite.config.js)

cd ..
echo ""
echo "Build complete."
echo "To start the app: python app.py"
echo "Then open: http://localhost:5001"
