#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"

echo "Installing dependencies..."
npm install

echo "Building Chrome extension with Vite..."
npm run build:chrome

echo ""
echo "Building Firefox extension with Vite..."
npm run build:firefox

echo ""
echo "Packaging Chrome extension..."
cd "$ROOT_DIR/dist/chrome" 2>/dev/null || { echo "dist/chrome not found, skipping"; exit 1; }
zip -r "$DIST_DIR/aria2-dashboard-chrome.zip" \
  . \
  -x "*.DS_Store"

echo "Packaging Firefox extension..."
cd "$ROOT_DIR/dist/firefox" 2>/dev/null || { echo "dist/firefox not found, skipping"; exit 1; }
zip -r "$DIST_DIR/aria2-dashboard-firefox.zip" \
  . \
  -x "*.DS_Store"

echo ""
echo "Done! Packages:"
ls -lh "$DIST_DIR/aria2-dashboard-chrome.zip" "$DIST_DIR/aria2-dashboard-firefox.zip"