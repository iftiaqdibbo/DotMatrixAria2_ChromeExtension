// Background service worker for aria2 extension
// Handles context menu, download interception, notifications, and background sync

// Default configuration
const DEFAULT_RPC_URL = 'http://localhost:6800/jsonrpc';

// Sites that don't work well with hijacking (Cloudflare, JS challenges, etc.)
const PROBLEMATIC_DOMAINS = [
  'go-file.io',
  'gofile.io',
  'mega.nz',
  'mediafire.com',
  'zippyshare.com',
  'uploadhaven.com',
  'cloudflare',
];

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for downloading links
  chrome.contextMenus.create({
    id: 'downloadWithAria2',
    title: 'Download with aria2',
    contexts: ['link'],
  });

  // Set default values
  chrome.storage.local.get(['aria2_rpc_url', 'aria2_default_download_path', 'aria2_hijack_downloads'], (result) => {
    const defaults = {};
    if (!result.aria2_rpc_url) {
      defaults.aria2_rpc_url = DEFAULT_RPC_URL;
    }
    if (result.aria2_hijack_downloads === undefined) {
      defaults.aria2_hijack_downloads = false;
    }
    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
});

// Check if URL is from a problematic domain
function isProblematicUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return PROBLEMATIC_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'downloadWithAria2') {
    addDownloadToAria2(info.linkUrl, null, tab?.id);
  }
});

// Handle download interception - use onCreated to cancel early
chrome.downloads.onCreated.addListener((downloadItem) => {
  chrome.storage.local.get(['aria2_hijack_downloads'], (result) => {
    if (result.aria2_hijack_downloads) {
      // Check if this is a problematic site
      if (isProblematicUrl(downloadItem.url)) {
        // Let browser handle it - don't intercept
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'aria2',
          message: 'Letting browser handle protected download...',
        });
        return;
      }
      
      // Cancel the browser download immediately
      chrome.downloads.cancel(downloadItem.id, () => {
        // Erase it from history
        chrome.downloads.erase({ id: downloadItem.id });
        
        // Get the tab that initiated the download to extract cookies/headers
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          addDownloadToAria2(downloadItem.url, downloadItem.filename, tab?.id);
        });
      });
    }
  });
});

// Add download to aria2
async function addDownloadToAria2(url, filename = null, tabId = null) {
  try {
    const { aria2_rpc_url, aria2_rpc_secret, aria2_default_download_path } = 
      await chrome.storage.local.get(['aria2_rpc_url', 'aria2_rpc_secret', 'aria2_default_download_path']);

    const secretToken = aria2_rpc_secret ? [`token:${aria2_rpc_secret}`] : [];
    const params = [...secretToken, [url]];
    
    const options = {};
    if (aria2_default_download_path) {
      options.dir = aria2_default_download_path;
    }
    if (filename) {
      options.out = filename;
    }
    
    // Try to get cookies and headers from the tab
    if (tabId) {
      try {
        // Get cookies for the URL
        const urlObj = new URL(url);
        const cookies = await chrome.cookies.getAll({ domain: urlObj.hostname });
        if (cookies && cookies.length > 0) {
          const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          options.header = options.header || [];
          options.header.push(`Cookie: ${cookieHeader}`);
        }
      } catch (e) {
        // Cookies not available, continue without them
      }
    }
    
    // Add common headers to avoid bot detection
    options.header = options.header || [];
    options.header.push('User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    options.header.push('Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
    options.header.push('Accept-Language: en-US,en;q=0.5');
    options.header.push('Accept-Encoding: gzip, deflate, br');
    options.header.push('DNT: 1');
    options.header.push('Connection: keep-alive');
    options.header.push('Upgrade-Insecure-Requests: 1');
    options.header.push('Sec-Fetch-Dest: document');
    options.header.push('Sec-Fetch-Mode: navigate');
    options.header.push('Sec-Fetch-Site: none');
    options.header.push('Sec-Fetch-User: ?1');
    
    // Add referrer if available
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.url) {
          options.referrer = tab.url;
        }
      } catch (e) {
        // Tab not available
      }
    }
    
    if (Object.keys(options).length > 0) {
      params.push(options);
    }

    const response = await fetch(aria2_rpc_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method: 'aria2.addUri',
        params,
      }),
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    // Show success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'aria2',
      message: filename ? `Download added: ${filename}` : 'Download added successfully',
    });
    
    return { success: true, gid: result.result };
  } catch (err) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'aria2 Error',
      message: err.message,
    });
    return { success: false, error: err.message };
  }
}

// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ADD_DOWNLOAD') {
    addDownloadToAria2(request.url)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (request.type === 'GET_HIJACK_STATUS') {
    chrome.storage.local.get(['aria2_hijack_downloads'], (result) => {
      sendResponse({ enabled: result.aria2_hijack_downloads || false });
    });
    return true;
  }
  
  if (request.type === 'SET_HIJACK_STATUS') {
    chrome.storage.local.set({ aria2_hijack_downloads: request.enabled }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});