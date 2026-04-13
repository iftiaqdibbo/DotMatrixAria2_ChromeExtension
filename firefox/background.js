const DEFAULT_RPC_URL = 'http://localhost:6800/jsonrpc';

const downloadItems = {};
const capturedIds = new Set();
const interceptedUrls = new Set();

const api = typeof browser !== 'undefined' ? browser : chrome;

function formatCookies(cookies) {
  return cookies.reduce((acc, cookie) => {
    return `${acc}${cookie.name}=${cookie.value};`;
  }, "");
}

async function getCookies(url, storeId) {
  if (!url || url === 'about:blank') {
    return '';
  }
  try {
    const details = { url: url };
    if (storeId) {
      details.storeId = storeId;
    }
    const cookies = await api.cookies.getAll(details);
    return formatCookies(cookies);
  } catch (e) {
    return '';
  }
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
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs.length > 0 ? tabs[0] : undefined;
}

function basename(filepath) {
  const isWindows = /^[a-zA-Z]:\\|^\\|^\.\.?\\/.test(filepath);
  const result = isWindows
    ? filepath.match(/[^\\]+$/)
    : filepath.match(/[^/]+$/);
  return result ? result[0] : filepath;
}

function dirname(filepath) {
  const isWindows = /^[a-zA-Z]:\\|^\\|^\.\.?\\/.test(filepath);
  if (isWindows) {
    const result = filepath.match(/^(.+)\\[^\\]+$/);
    return result ? result[1] : filepath;
  }
  const result = filepath.match(/^(.+)\/[^/]+$/);
  return result ? result[1] : filepath;
}

async function rpcCall(method, params) {
  const { aria2_rpc_url, aria2_rpc_secret } = await api.storage.local.get([
    'aria2_rpc_url', 'aria2_rpc_secret'
  ]);
  const rpcUrl = aria2_rpc_url || DEFAULT_RPC_URL;
  const secretToken = aria2_rpc_secret ? [`token:${aria2_rpc_secret}`] : [];

  const body = {
    jsonrpc: '2.0',
    id: Date.now().toString(),
    method: method,
    params: [...secretToken, ...params],
  };

  console.log('[Aria2] RPC call:', method, JSON.stringify(params, null, 2));

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  if (result.error) {
    console.error('[Aria2] RPC error:', JSON.stringify(result.error, null, 2));
    throw new Error(result.error.message);
  }
  return result.result;
}

async function addUriToAria2(url, referer, cookies, filename, directory, extraOptions) {
  if (interceptedUrls.has(url)) {
    console.log('[Aria2] Skipping duplicate URL:', url);
    return null;
  }
  interceptedUrls.add(url);
  setTimeout(() => interceptedUrls.delete(url), 30000);

  const options = {};
  options.header = [`Referer: ${referer}`, `Cookie: ${cookies}`];

  const { aria2_default_download_path } = await api.storage.local.get(['aria2_default_download_path']);
  if (directory) {
    options.dir = directory;
  } else if (aria2_default_download_path) {
    options.dir = aria2_default_download_path;
  }
  if (filename) {
    options.out = filename;
  }

  if (extraOptions) {
    Object.assign(options, extraOptions);
  }

  console.log('[Aria2] addUri - url:', url, 'referer:', referer, 'cookies length:', cookies.length);

  return rpcCall('aria2.addUri', [[url], options]);
}

async function captureURL(url, referer, cookies, filename, directory, extraOptions) {
  return addUriToAria2(url, referer, cookies, filename, directory, extraOptions);
}

function showNotification(title, message) {
  api.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
  }).catch(() => {});
}

const DEFAULT_SAFE_MODE_HOSTS = [
  'gofile.io', '1fichier.com', 'pixeldrain.com', 'mediafire.com',
  'mega.nz', 'ranoz.net', 'datanodes.to', 'bowfile.com',
  'dl.free.fr', 'swisstransfer.com', 'freedlink.me', 'fileditch.com',
  'uploadnow.io', 'wdho.ru', 'mixdrop.', 'chomikuj.pl',
  'vikingfile.com', 'dayuploads.com', 'downmediaload.com', 'hexload.com',
  '1cloudfile.com', 'usersdrive.com', 'megaup.net', 'clicknupload.org',
  'dailyuploads.net', 'rapidgator.net', 'nitroflare.com', 'filebin.net',
  'oshi.at',
];

api.runtime.onInstalled.addListener(async () => {
  api.contextMenus.create({
    id: 'downloadWithAria2',
    title: 'Download with aria2',
    contexts: ['link', 'selection'],
  });

  const result = await api.storage.local.get(['aria2_rpc_url', 'aria2_default_download_path', 'aria2_hijack_downloads', 'aria2_safe_mode', 'aria2_safe_mode_hosts']);
  const defaults = {};
  if (!result.aria2_rpc_url) {
    defaults.aria2_rpc_url = DEFAULT_RPC_URL;
  }
  if (result.aria2_hijack_downloads === undefined) {
    defaults.aria2_hijack_downloads = false;
  }
  if (result.aria2_safe_mode === undefined) {
    defaults.aria2_safe_mode = true;
  }
  if (result.aria2_safe_mode_hosts === undefined) {
    defaults.aria2_safe_mode_hosts = DEFAULT_SAFE_MODE_HOSTS;
  }
  if (Object.keys(defaults).length > 0) {
    await api.storage.local.set(defaults);
  }
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
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
      try {
        await captureURL(url, referer, cookies);
        showNotification('aria2', 'Download added successfully');
      } catch (err) {
        console.error('[Aria2] RPC error:', err);
        showNotification('aria2 Error', err.message);
      }
    }
  }
});

async function removeDownloadItemCompletely(downloadItem) {
  try {
    await api.downloads.cancel(downloadItem.id);
  } catch {
    try {
      await api.downloads.removeFile(downloadItem.id);
    } catch {}
  }
  try {
    await api.downloads.erase({ id: downloadItem.id });
  } catch {}
}

function downloadMustBeCaptured(item, referrer, settings) {
  if (!settings.aria2_hijack_downloads) {
    return false;
  }

  const url = item.finalUrl || item.url;

  try {
    const urlObj = new URL(url);
    const excludedProtocols = ['blob:', 'data:', 'file:'];
    if (excludedProtocols.includes(urlObj.protocol)) {
      return false;
    }
  } catch (e) {
    return false;
  }

  if (interceptedUrls.has(url)) {
    console.log('[Aria2] Skipping download - already intercepted by content script:', url);
    return false;
  }

  return true;
}

function hostMatchesUrl(host, url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === host || hostname.endsWith('.' + host);
  } catch {
    return url.includes(host);
  }
}

async function getSafeModeOptions(url) {
  const settings = await api.storage.local.get(['aria2_safe_mode', 'aria2_safe_mode_hosts']);
  if (!settings.aria2_safe_mode) {
    return null;
  }
  const safeModeHosts = settings.aria2_safe_mode_hosts || DEFAULT_SAFE_MODE_HOSTS;
  const needsSafeMode = safeModeHosts.some(host => hostMatchesUrl(host, url));
  if (!needsSafeMode) {
    return null;
  }
  return { 'max-connection-per-server': '1', 'split': '1', 'enable-http-pipelining': 'false' };
}

async function captureDownloadItem(item, referer, cookies) {
  const url = item.finalUrl || item.url;
  const filename = item.filename ? basename(item.filename) : '';
  const extraOptions = await getSafeModeOptions(url);
  await captureURL(url, referer, cookies, filename, null, extraOptions);
}

async function handleDownload(downloadItem, handler) {
  if (capturedIds.has(downloadItem.id)) {
    return;
  }
  const settings = await api.storage.local.get(['aria2_hijack_downloads']);
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

api.downloads.onChanged.addListener(async (downloadDelta) => {
  const downloadItem = downloadItems[downloadDelta.id];
  if (!downloadItem) {
    return;
  }

  if (downloadDelta.filename?.current) {
    downloadItem.filename = downloadDelta.filename.current;
  }

  if (downloadDelta.state?.current === 'complete' && downloadItems[downloadDelta.id]) {
    delete downloadItems[downloadDelta.id];
  }
  if (downloadDelta.error?.current && downloadItems[downloadDelta.id]) {
    delete downloadItems[downloadDelta.id];
    capturedIds.delete(downloadDelta.id);
  }
});

api.downloads.onCreated.addListener(async (downloadItem) => {
  downloadItems[downloadItem.id] = { ...downloadItem };

  await handleDownload(downloadItem, async (item, referrer, cookies) => {
    await removeDownloadItemCompletely(item);
    try {
      await captureDownloadItem(item, referrer, cookies);
      showNotification('aria2', 'Download captured: ' + (item.filename ? basename(item.filename) : item.url));
    } catch (err) {
      console.error('Failed to capture download:', err);
      showNotification('aria2 Error', err.message);
    }
    delete downloadItems[item.id];
  });
});

api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ADD_DOWNLOAD') {
    const referer = request.referrer ?? "";
    const url = request.url;
    (async () => {
      try {
        const cookies = await getCookiesForUrls([referer, url]);
        const result = await captureURL(url, referer, cookies);
        sendResponse({ success: true, gid: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (request.type === 'ADD_DOWNLOAD_INTERCEPT') {
    const referer = request.referrer ?? sender.tab?.url ?? "";
    const url = request.url;
    const cookieStoreId = sender.tab?.cookieStoreId;
    const siteName = request.siteName || '';
    console.log('[Aria2] ADD_DOWNLOAD_INTERCEPT - url:', url, 'referer:', referer, 'site:', siteName);
    
    (async () => {
      try {
        const extraOptions = await getSafeModeOptions(url);
        const cookies = await getCookiesForUrls([referer, url], cookieStoreId);
        const result = await captureURL(url, referer, cookies, null, null, extraOptions);
        sendResponse({ success: true, gid: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (request.type === 'GET_HIJACK_STATUS') {
    (async () => {
      const result = await api.storage.local.get(['aria2_hijack_downloads']);
      sendResponse({ enabled: result.aria2_hijack_downloads || false });
    })();
    return true;
  }

  if (request.type === 'SET_HIJACK_STATUS') {
    (async () => {
      await api.storage.local.set({ aria2_hijack_downloads: request.enabled });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.type === 'UPDATE_BADGE') {
    const count = request.activeCount || 0;
    api.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    api.action.setBadgeBackgroundColor({ color: '#ff1a1a' });
    sendResponse({ success: true });
    return true;
  }
});
