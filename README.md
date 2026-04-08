# Aria2 Dashboard

A Chrome extension for managing aria2 downloads with a sleek dot-matrix aesthetic.

![Aria2 Dashboard Popup](Screenshot1.png)

![Aria2 Dashboard Full](Screenshot2.png)

## Features

- **Download Management**: View, pause, resume, stop, and remove downloads
- **Browser Integration**: Hijack browser downloads and send them directly to aria2
- **Multiple Views**: Popup panel, full dashboard, and options page
- **Dot-Matrix Aesthetic**: Clean dark theme with monospace fonts and red accents
- **Toggleable Hijacking**: Enable/disable browser download interception
- **RPC Authentication**: Support for aria2 secret tokens

## Installation

### From Source

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

### Icons Setup

If icons don't appear, convert the SVG to PNG:

```bash
cd icons
./convert.sh
```

Requires Inkscape or ImageMagick.

## Configuration

1. Make sure aria2 is running with RPC enabled:
   ```bash
   aria2c --enable-rpc --rpc-listen-port=6800
   ```

2. Click the extension icon and open Options
3. Set your RPC URL (default: `http://localhost:6800/jsonrpc`)
4. Enter your secret token if configured
5. Test the connection

## Usage

### Popup Panel
- Quick view of active downloads
- Compact stats (active, waiting, speed)
- Toggle download hijacking
- Action buttons for each download

### Full Dashboard
- Complete download management
- Tabbed interface (active/waiting/stopped)
- Settings panel for RPC configuration
- Real-time updates

### Download Hijacking
Enable "Hijack Downloads" to intercept browser downloads and send them to aria2 automatically.

**How it works:**
- Content script injects into pages to capture download clicks
- Hooks fetch/XHR to intercept dynamic download URLs
- Passes cookies, referrer, and User-Agent to aria2
- Works with JavaScript-protected sites (Cloudflare, etc.)

## File Structure

```
├── manifest.json      # Extension manifest
├── background.js      # Service worker for download interception
├── content.js         # Content script for page integration
├── popup.html/js      # Popup panel
├── options.html/js    # Options page
├── full.html/js       # Full dashboard
├── style.css          # Styles (dot-matrix theme)
└── icons/             # Extension icons
```

## Permissions

- `storage`: Save settings
- `activeTab`: Browser integration
- `contextMenus`: Right-click download option
- `notifications`: Download status notifications
- `downloads`: Download interception
- `cookies`: Access cookies for authenticated downloads
- `host_permissions`: Connect to aria2 RPC
- `<all_urls>`: Content script injection for download capture

## License

MIT

## Troubleshooting

### Downloads failing on certain sites
The extension uses a content script to capture download URLs from the page's JavaScript context. If a site still fails:
- The site may use complex obfuscation
- Try using the context menu (right-click → "Download with aria2")
- Some sites require browser cookies which are passed automatically

### aria2 not connecting
- Ensure aria2 is running with RPC enabled: `aria2c --enable-rpc`
- Check the RPC URL in extension options (default: `http://localhost:6800/jsonrpc`)
- Verify firewall settings allow connections to the RPC port

## Credits

- Fonts: Space Mono, Space Grotesk (Google Fonts)