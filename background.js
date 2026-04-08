// Background service worker for aria2 extension
// Handles context menu, download interception, notifications, and background sync

// Default configuration
const DEFAULT_RPC_URL = 'http://localhost:6800/jsonrpc';

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

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'downloadWithAria2') {
    addDownloadToAria2(info.linkUrl);
  }
});

// Handle download interception - use onCreated to cancel early
chrome.downloads.onCreated.addListener((downloadItem) => {
  chrome.storage.local.get(['aria2_hijack_downloads'], (result) => {
    if (result.aria2_hijack_downloads) {
      // Cancel the browser download immediately
      chrome.downloads.cancel(downloadItem.id, () => {
        // Erase it from history
        chrome.downloads.erase({ id: downloadItem.id });
        
        // Add to aria2
        addDownloadToAria2(downloadItem.url, downloadItem.filename);
      });
    }
  });
});

// Add download to aria2
async function addDownloadToAria2(url, filename = null) {
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