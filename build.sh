#!/bin/bash
set -e

DIST_DIR="dist"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

rm -rf "$ROOT_DIR/$DIST_DIR"
mkdir -p "$ROOT_DIR/$DIST_DIR"

echo "Packaging Chrome extension..."
cd "$ROOT_DIR"
zip -r "$DIST_DIR/aria2-dashboard-chrome.zip" \
  manifest.json \
  background.js \
  content.js \
  popup.html popup.js \
  full.html full.js \
  options.html options.js \
  style.css \
  icons/ \
  -x "*.DS_Store"

echo "Packaging Firefox extension..."
cd "$ROOT_DIR/firefox"
zip -r "$ROOT_DIR/$DIST_DIR/aria2-dashboard-firefox.zip" \
  manifest.json \
  background.js \
  content.js \
  popup.html popup.js \
  full.html full.js \
  options.html options.js \
  style.css \
  icons/ \
  -x "*.DS_Store"

echo "Done! Packages in $DIST_DIR/:"
ls -lh "$ROOT_DIR/$DIST_DIR/"
