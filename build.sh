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
  src/ \
  icons/ \
  -x "*.DS_Store"

echo "Packaging Firefox extension..."
TMP_DIR=$(mktemp -d)
cp "$ROOT_DIR/firefox/manifest.json" "$TMP_DIR/"
cp "$ROOT_DIR/firefox/background.js" "$TMP_DIR/"
cp -r "$ROOT_DIR/src" "$TMP_DIR/src"
cp -r "$ROOT_DIR/firefox/icons" "$TMP_DIR/icons"
cd "$TMP_DIR"
zip -r "$ROOT_DIR/$DIST_DIR/aria2-dashboard-firefox.zip" \
  manifest.json \
  background.js \
  src/ \
  icons/ \
  -x "*.DS_Store"
rm -rf "$TMP_DIR"

echo "Done! Packages in $DIST_DIR/:"
ls -lh "$ROOT_DIR/$DIST_DIR/"
