const DEFAULT_RPC_URL = 'http://localhost:6800/jsonrpc';

const downloadItems = {};
const capturedIds = new Set();

function isChromium() {
  return typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.onDeterminingFilename !== 'undefined';
}

function isFirefox() {
  return !isChromium();
}

function formatCookies(cookies) {
  return cookies.reduce((acc, cookie) => {
    return `${acc}${cookie.name}=${cookie.value};`;
  }, "");
}

async function getCookies(url, storeId) {
  return new Promise((resolve) => {
    if (!url || url === 'about:blank') {
      resolve('');
      return;
    }
    try {
      const details = { url: url };
      if (storeId) {
        details.storeId = storeId;
      }
      chrome.cookies.getAll(details, (cookies) => {
        resolve(formatCookies(cookies));
      });
    } catch (e) {
      resolve('');
    }
  });
}

async function getCookiesForUrls(urls, storeId) {
  const allCookies = await Promise.all(urls.map(url => getCookies(url, storeId)));
  const seen = new Set();
  let combined = '';
  for (const cookieStr of allCookies) {
    if (!cookieStr) continue;
    cookieStr.split(';').forEach(part => {
      const trimmed = part.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        combined += trimmed + ';';
      }
    });
  }
  return combined;
}

async function findCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs.length > 0 ? tabs[0] : undefined);
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'downloadWithAria2',
    title: 'Download with aria2',
    contexts: ['link', 'selection'],
  });

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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'downloadWithAria2') {
    const urls = [];
    if (info.linkUrl) {
      urls.push(info.linkUrl);
    } else if (info.selectionText) {
      urls.push(...info.selectionText.split(/\s+/));
    }
    const referer = tab?.url ?? "";
    const cookieStoreId = tab?.cookieStoreId;
    const cookies = await getCookiesForUrls([referer, ...urls], cookieStoreId);
    for (const url of urls) {
      await addDownloadToAria2(url, null, referer, cookies);
    }
  }
});

async function removeDownloadItemCompletely(downloadItem) {
  try {
    await chrome.downloads.cancel(downloadItem.id);
  } catch {
    await chrome.downloads.removeFile(downloadItem.id);
  } finally {
    await chrome.downloads.erase({ id: downloadItem.id });
  }
}

function downloadMustBeCaptured(item, referrer, settings) {
  if (!settings.aria2_hijack_downloads) {
    return false;
  }

  const excludedProtocols = ['blob:', 'data:', 'file:'];
  const url = item.finalUrl || item.url;

  try {
    const urlObj = new URL(url);
    if (excludedProtocols.includes(urlObj.protocol)) {
      return false;
    }
  } catch (e) {
    return false;
  }

  return true;
}

function basename(filepath) {
  const isWindows = /^[a-zA-Z]:\\|^\\|^\.\.?\\/.test(filepath);
  const result = isWindows
    ? filepath.match(/[^\\]+$/)
    : filepath.match(/[^/]+$/);
  return result ? result[0] : filepath;
}

async function addDownloadToAria2(url, filename, referer, cookies) {
  try {
    const { aria2_rpc_url, aria2_rpc_secret, aria2_default_download_path } =
      await chrome.storage.local.get(['aria2_rpc_url', 'aria2_rpc_secret', 'aria2_default_download_path']);

    const secretToken = aria2_rpc_secret ? [`token:${aria2_rpc_secret}`] : [];
    const options = {};

    options.header = [`Referer: ${referer}`, `Cookie: ${cookies}`];

    if (aria2_default_download_path) {
      options.dir = aria2_default_download_path;
    }
    if (filename) {
      options.out = filename;
    }

    const params = [...secretToken, [url], options];

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

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'aria2',
      message: filename ? `Download added: ${filename}` : 'Download added successfully',
    });

    return { success: true, gid: result.result };
  } catch (err) {
    console.error('[Aria2] RPC error:', err);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'aria2 Error',
      message: err.message,
    });
    return { success: false, error: err.message };
  }
}

async function captureDownloadItem(item, referer, cookies) {
  const url = item.finalUrl || item.url;
  const filename = basename(item.filename);
  await addDownloadToAria2(url, filename, referer, cookies);
}

async function handleDownload(downloadItem, handler) {
  if (capturedIds.has(downloadItem.id)) {
    return;
  }
  const settings = await chrome.storage.local.get(['aria2_hijack_downloads']);
  if (!downloadMustBeCaptured(downloadItem, downloadItem.referrer, settings)) {
    return;
  }

  capturedIds.add(downloadItem.id);

  let referrer = downloadItem.referrer ?? "";
  const currentTab = await findCurrentTab();
  if (referrer === "" || referrer === "about:blank") {
    referrer = currentTab?.url ?? "";
  }
  const cookieStoreId = currentTab?.cookieStoreId;
  const downloadUrl = downloadItem.finalUrl || downloadItem.url;
  const cookies = await getCookiesForUrls([referrer, downloadUrl], cookieStoreId);

  handler(downloadItem, referrer, cookies);
}

if (isChromium() && chrome.downloads.onChanged) {
  chrome.downloads.onChanged.addListener(async (downloadDelta) => {
    const downloadItem = downloadItems[downloadDelta.id];
    if (!downloadItem) {
      return;
    }

    if (downloadDelta.filename?.previous === "" && downloadDelta.filename.current) {
      downloadItem.filename = downloadDelta.filename.current;

      await handleDownload(downloadItem, async (item, referrer, cookies) => {
        await removeDownloadItemCompletely(item);
        try {
          await captureDownloadItem(item, referrer, cookies);
        } catch (err) {
          console.error('Failed to capture download:', err);
        }
        delete downloadItems[item.id];
      });
    }

    if (downloadDelta.state?.current === 'complete' && downloadItems[downloadDelta.id]) {
      delete downloadItems[downloadDelta.id];
    }
    if (downloadDelta.error?.current && downloadItems[downloadDelta.id]) {
      delete downloadItems[downloadDelta.id];
      capturedIds.delete(downloadDelta.id);
    }
  });
}

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (isFirefox()) {
    await handleDownload(downloadItem, async (item, referrer, cookies) => {
      await removeDownloadItemCompletely(item);
      try {
        await captureDownloadItem(item, referrer, cookies);
      } catch (err) {
        console.error('Failed to capture download:', err);
      }
    });
  } else {
    downloadItems[downloadItem.id] = downloadItem;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ADD_DOWNLOAD') {
    const referer = request.referrer ?? "";
    const urls = [request.url];
    getCookiesForUrls([referer, request.url])
      .then(cookies => addDownloadToAria2(request.url, null, referer, cookies))
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
