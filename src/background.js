if (typeof ARIA2_DEFAULT_RPC_URL === "undefined") {
  importScripts("constants.js");
}

const BADGE_COLOR = "#ff1a1a";

const downloadItems = {};
const DOWNLOAD_ITEM_TTL = 60000;
const capturedIds = new Set();
const interceptedUrls = new Set();
const knownCompletedGids = new Set();
const retriedWithSafeMode = new Set();
const COMPLETED_TRACKING_MAX = 200;
const SESSION_KEY = "aria2_pending_downloads";

/** Has webRequest API (Chromium MV3) */
function hasWebRequest() {
  return typeof chrome.webRequest !== "undefined";
}

/** Chrome 122+ added downloads.onCreated - use it as an alternative */
function hasDownloadsOnCreated() {
  return typeof chrome.downloads.onCreated !== "undefined";
}

function isFirefox() {
  return typeof chrome.downloads.onDeterminingFilename !== "undefined";
}

// ---------------------------------------------------------------------------
// Storage helpers - fall back from session to local when session is absent
// (some Chromium forks don't fully implement chrome.storage.session)
// ---------------------------------------------------------------------------
async function setSessionStorage(key, value) {
  try {
    await chrome.storage.session.set({ [key]: value });
    return true;
  } catch {
    try {
      await chrome.storage.local.set({ ["_session_fb_" + key]: value });
      return true;
    } catch {}
    return false;
  }
}

async function getSessionStorage(key) {
  try {
    const data = await chrome.storage.session.get(key);
    if (data[key] !== undefined) return data[key];
  } catch {}
  try {
    const data = await chrome.storage.local.get("_session_fb_" + key);
    if (data["_session_fb_" + key] !== undefined) return data["_session_fb_" + key];
  } catch {}
  return undefined;
}

async function trackDownloadItem(id, item) {
  downloadItems[id] = item;
  setTimeout(() => {
    if (downloadItems[id]) {
      delete downloadItems[id];
    }
  }, DOWNLOAD_ITEM_TTL);

  const data = (await getSessionStorage(SESSION_KEY)) || {};
  data[id] = {
    url: item.url,
    referrer: item.referrer,
    filename: item.filename,
    finalUrl: item.finalUrl,
    _ts: Date.now(),
  };
  await setSessionStorage(SESSION_KEY, data);
}

async function recoverDownloadItem(id) {
  if (downloadItems[id]) return downloadItems[id];
  const data = (await getSessionStorage(SESSION_KEY)) || {};
  const raw = data[id];
  if (raw && Date.now() - raw._ts < DOWNLOAD_ITEM_TTL) {
    const item = { id, url: raw.url, referrer: raw.referrer, filename: raw.filename, finalUrl: raw.finalUrl };
    downloadItems[id] = item;
    return item;
  }
  return null;
}

function formatCookies(cookies) {
  if (!cookies) return "";
  return cookies.reduce((acc, cookie) => {
    return `${acc}${cookie.name}=${cookie.value};`;
  }, "");
}

async function getCookies(url, storeId) {
  return new Promise((resolve) => {
    if (!url || url === "about:blank") {
      resolve("");
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
      resolve("");
    }
  });
}

async function getCookiesForUrls(urls, storeId) {
  const allCookies = await Promise.all(
    urls.map((url) => getCookies(url, storeId)),
  );
  const seen = new Set();
  let combined = "";
  for (const cookieStr of allCookies) {
    if (!cookieStr) continue;
    cookieStr.split(";").forEach((part) => {
      const trimmed = part.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        combined += trimmed + ";";
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

function basename(filepath) {
  if (!filepath) return "";
  const isWindows = /^[a-zA-Z]:\\|^\\|^\.\.?\\/.test(filepath);
  const result = isWindows
    ? filepath.match(/[^\\]+$/)
    : filepath.match(/[^/]+$/);
  return result ? result[0] : filepath;
}

function getFileExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)(?:$|[?#])/);
    return match ? "." + match[1].toLowerCase() : "";
  } catch {
    return "";
  }
}

async function isUrlFilteredByExtension(url) {
  if (!url) return false;
  const ext = getFileExtensionFromUrl(url);
  if (!ext) return false;
  const { aria2_filter_extensions } = await chrome.storage.local.get([
    "aria2_filter_extensions",
  ]);
  const filters = aria2_filter_extensions || ARIA2_DEFAULT_FILTER_EXTENSIONS;
  return filters.some((f) => f.toLowerCase() === ext);
}

function getFileExtensionFromPath(filepath) {
  const name = basename(filepath);
  if (!name) return "";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return name.slice(dotIndex).toLowerCase();
}

async function isFileFilteredByExtension(item) {
  const url = item.finalUrl || item.url;
  if (await isUrlFilteredByExtension(url)) return true;
  if (item.filename) {
    const ext = getFileExtensionFromPath(item.filename);
    if (!ext) return false;
    const { aria2_filter_extensions } = await chrome.storage.local.get([
      "aria2_filter_extensions",
    ]);
    const filters = aria2_filter_extensions || ARIA2_DEFAULT_FILTER_EXTENSIONS;
    return filters.some((f) => f.toLowerCase() === ext);
  }
  return false;
}

async function rpcCall(method, params) {
  const { aria2_rpc_url, aria2_rpc_secret } = await chrome.storage.local.get([
    "aria2_rpc_url",
    "aria2_rpc_secret",
  ]);
  const rpcUrl = aria2_rpc_url || ARIA2_DEFAULT_RPC_URL;
  const secretToken = aria2_rpc_secret ? [`token:${aria2_rpc_secret}`] : [];

  const body = {
    jsonrpc: "2.0",
    id: Date.now().toString(),
    method: method,
    params: [...secretToken, ...params],
  };

  console.log("[Aria2] RPC call:", method, JSON.stringify(params, null, 2));

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  if (result.error) {
    console.error("[Aria2] RPC error:", JSON.stringify(result.error, null, 2));
    throw new Error(result.error.message);
  }
  return result.result;
}

let badgePollTimeout;
async function updateBadgeFromAria2() {
  let nextDelayMs = 5000;
  try {
    const globalStat = await rpcCall("aria2.getGlobalStat", []);
    const activeCount = parseInt(globalStat.numActive, 10) || 0;
    chrome.action.setBadgeText({
      text: activeCount > 0 ? String(activeCount) : "",
    });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    nextDelayMs = activeCount > 0 ? 2000 : 5000;

    const tellKeys = [
      "gid", "status", "totalLength", "completedLength",
      "files", "completedTime", "errorCode",
    ];
    const stopped = await rpcCall("aria2.tellStopped", [0, 5, tellKeys]);
    const completed = stopped.filter((d) => d.status === "complete");
    for (const d of completed) {
      if (knownCompletedGids.has(d.gid)) continue;
      knownCompletedGids.add(d.gid);
      if (knownCompletedGids.size > COMPLETED_TRACKING_MAX) {
        const iterator = knownCompletedGids.values();
        knownCompletedGids.delete(iterator.next().value);
      }

      const { aria2_completion_notifications } = await chrome.storage.local.get([
        "aria2_completion_notifications",
      ]);
      if (aria2_completion_notifications !== false) {
        const filename = d.files?.[0]?.path
          ? basename(d.files[0].path)
          : d.gid;
        showNotification(
          "Download Complete",
          filename + " has finished downloading",
        );
      }
    }

    const failed = stopped.filter(
      (d) =>
        d.status === "error" &&
        d.errorCode &&
        d.errorCode !== "0" &&
        !retriedWithSafeMode.has(d.gid) &&
        d.files?.[0]?.uris?.[0]?.uri,
    );
    for (const d of failed) {
      retriedWithSafeMode.add(d.gid);
      const url = d.files[0].uris[0].uri;
      const filename = d.files[0].path ? basename(d.files[0].path) : d.gid;
      try {
        const options = {
          "max-connection-per-server": "1",
          split: "1",
          "enable-http-pipelining": "false",
        };
        const { aria2_default_download_path } = await chrome.storage.local.get([
          "aria2_default_download_path",
        ]);
        if (aria2_default_download_path) {
          options.dir = aria2_default_download_path;
        }
        await rpcCall("aria2.addUri", [[url], options]);
        showNotification(
          "aria2",
          "Retrying with safe mode: " + filename,
        );
      } catch (err) {
        console.error("Failed safe mode retry for", filename, err);
      }
    }
  } catch {
    nextDelayMs = 10000;
  }
  clearTimeout(badgePollTimeout);
  badgePollTimeout = setTimeout(updateBadgeFromAria2, nextDelayMs);
}

async function addUriToAria2(
  url,
  referer,
  cookies,
  filename,
  directory,
  extraOptions,
) {
  if (interceptedUrls.has(url)) {
    console.log("[Aria2] Skipping duplicate URL:", url);
    return null;
  }
  interceptedUrls.add(url);
  setTimeout(() => interceptedUrls.delete(url), 30000);

  const options = {};
  options.header = [`Referer: ${referer}`, `Cookie: ${cookies}`];

  const { aria2_default_download_path } = await chrome.storage.local.get([
    "aria2_default_download_path",
  ]);
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

  console.log(
    "[Aria2] addUri - url:",
    url,
    "referer:",
    referer,
    "cookies length:",
    cookies.length,
  );

  return rpcCall("aria2.addUri", [[url], options]);
}

function showNotification(title, message) {
  chrome.notifications
    .create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title,
      message: message,
    })
    .catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "downloadWithAria2",
    title: "Download with aria2",
    contexts: ["link", "selection"],
  });

  chrome.storage.local.get(
    [
      "aria2_rpc_url",
      "aria2_default_download_path",
      "aria2_hijack_downloads",
      "aria2_safe_mode",
      "aria2_safe_mode_hosts",
      "aria2_completion_notifications",
      "aria2_filter_extensions",
      "aria2_theme",
    ],
    (result) => {
      const defaults = {};
      if (!result.aria2_rpc_url) {
        defaults.aria2_rpc_url = ARIA2_DEFAULT_RPC_URL;
      }
      if (result.aria2_hijack_downloads === undefined) {
        defaults.aria2_hijack_downloads = false;
      }
      if (result.aria2_safe_mode === undefined) {
        defaults.aria2_safe_mode = true;
      }
      if (result.aria2_safe_mode_hosts === undefined) {
        defaults.aria2_safe_mode_hosts = ARIA2_DEFAULT_SAFE_MODE_HOSTS;
      }
      if (result.aria2_completion_notifications === undefined) {
        defaults.aria2_completion_notifications = true;
      }
      if (result.aria2_filter_extensions === undefined) {
        defaults.aria2_filter_extensions = ARIA2_DEFAULT_FILTER_EXTENSIONS;
      }
      if (!result.aria2_theme) {
        defaults.aria2_theme = "original";
      }
      if (Object.keys(defaults).length > 0) {
        chrome.storage.local.set(defaults);
      }
    },
  );
  updateBadgeFromAria2();
});

updateBadgeFromAria2();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "downloadWithAria2") {
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
      if (await isUrlFilteredByExtension(url)) {
        console.log("[Aria2] Skipping filtered URL from context menu:", url);
        continue;
      }
      try {
        await addUriToAria2(url, referer, cookies);
        showNotification("aria2", "Download added successfully");
      } catch (err) {
        console.error("[Aria2] RPC error:", err);
        showNotification("aria2 Error", err.message);
      }
    }
  }
});

async function removeDownloadItemCompletely(downloadItem) {
  try {
    await chrome.downloads.cancel(downloadItem.id);
  } catch {
    try {
      await chrome.downloads.removeFile(downloadItem.id);
    } catch {}
  }
  try {
    await chrome.downloads.erase({ id: downloadItem.id });
  } catch {}
}

async function downloadMustBeCaptured(item, referrer, settings) {
  if (!settings.aria2_hijack_downloads) {
    return false;
  }

  const url = item.finalUrl || item.url;

  if (await isFileFilteredByExtension(item)) {
    console.log(
      "[Aria2] Skipping download - file extension is filtered:",
      url,
    );
    return false;
  }

  try {
    const urlObj = new URL(url);
    const excludedProtocols = ["blob:", "data:", "file:"];
    if (excludedProtocols.includes(urlObj.protocol)) {
      return false;
    }
  } catch (e) {
    return false;
  }

  if (interceptedUrls.has(url)) {
    console.log(
      "[Aria2] Skipping download - already intercepted by content script:",
      url,
    );
    return false;
  }

  return true;
}

function hostMatchesUrl(host, url) {
  try {
    const hostname = new URL(url).hostname;
    if (host.endsWith(".")) {
      const prefix = host.slice(0, -1);
      return hostname === prefix || hostname.endsWith("." + prefix);
    }
    return hostname === host || hostname.endsWith("." + host);
  } catch {
    return url.includes(host);
  }
}

async function getSafeModeOptions(url) {
  const settings = await chrome.storage.local.get([
    "aria2_safe_mode",
    "aria2_safe_mode_hosts",
  ]);
  if (!settings.aria2_safe_mode) {
    return null;
  }
  const safeModeHosts =
    settings.aria2_safe_mode_hosts || ARIA2_DEFAULT_SAFE_MODE_HOSTS;
  const needsSafeMode = safeModeHosts.some((host) => hostMatchesUrl(host, url));
  if (!needsSafeMode) {
    return null;
  }
  return {
    "max-connection-per-server": "1",
    split: "1",
    "enable-http-pipelining": "false",
  };
}

async function captureDownloadItem(item, referer, cookies) {
  const url = item.finalUrl || item.url;
  const filename = basename(item.filename);
  const extraOptions = await getSafeModeOptions(url);
  await addUriToAria2(url, referer, cookies, filename, null, extraOptions);
}

async function handleDownload(downloadItem, handler) {
  if (capturedIds.has(downloadItem.id)) {
    return;
  }
  const settings = await chrome.storage.local.get(["aria2_hijack_downloads"]);
  if (!(await downloadMustBeCaptured(downloadItem, downloadItem.referrer, settings))) {
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
  const cookies = await getCookiesForUrls(
    [referrer, downloadUrl],
    cookieStoreId,
  );

  handler(downloadItem, referrer, cookies);
}

chrome.downloads.onChanged.addListener(async (downloadDelta) => {
    let downloadItem = downloadItems[downloadDelta.id];
    if (!downloadItem) {
      downloadItem = await recoverDownloadItem(downloadDelta.id);
    }
    if (!downloadItem && !isFirefox()) {
      try {
        const results = await chrome.downloads.search({ id: downloadDelta.id });
        if (results.length > 0) {
          downloadItem = results[0];
        }
      } catch {}
    }
    if (!downloadItem) {
      return;
    }

    if (
      downloadDelta.filename?.previous === "" &&
      downloadDelta.filename.current
    ) {
      downloadItem.filename = downloadDelta.filename.current;

      await handleDownload(downloadItem, async (item, referrer, cookies) => {
        await removeDownloadItemCompletely(item);
        try {
          await captureDownloadItem(item, referrer, cookies);
          showNotification(
            "aria2",
            "Download captured: " + basename(item.filename),
          );
        } catch (err) {
          console.error("Failed to capture download:", err);
          showNotification("aria2 Error", err.message);
        }
        delete downloadItems[item.id];
      });
    }

    if (
      downloadDelta.state?.current === "complete" &&
      downloadItems[downloadDelta.id]
    ) {
      delete downloadItems[downloadDelta.id];
      capturedIds.delete(downloadDelta.id);
    }
    if (downloadDelta.error?.current && downloadItems[downloadDelta.id]) {
      delete downloadItems[downloadDelta.id];
      capturedIds.delete(downloadDelta.id);
    }
  });

// ---------------------------------------------------------------------------
// webRequest fallback: intercept Content-Disposition: attachment headers.
// This catches downloads that would otherwise be missed by onChanged
// (e.g. Vivaldi, Brave with custom download managers) or when the
// Downloads API doesn't fire the filename transition event reliably.
// ---------------------------------------------------------------------------
if (hasWebRequest()) {
  chrome.webRequest.onHeadersReceived.addListener(
    async (details) => {
      // Only intercept if hijack mode is enabled
      const settings = await chrome.storage.local.get(["aria2_hijack_downloads"]);
      if (!settings.aria2_hijack_downloads) return;

      const url = details.url;

      // Skip non-downloadable protocols and filtered URLs
      if (await isUrlFilteredByExtension(url)) return;
      try {
        const urlObj = new URL(url);
        const excludedProtocols = ["blob:", "data:", "file:", "chrome:", "chrome-extension:", "about:"];
        if (excludedProtocols.includes(urlObj.protocol)) return;
      } catch { return; }

      // Deduplicate
      if (interceptedUrls.has(url)) return;
      interceptedUrls.add(url);
      setTimeout(() => interceptedUrls.delete(url), 30000);

      // Check if any response header triggers a download
      const contentDisposition = (details.responseHeaders || [])
        .find((h) => h.name.toLowerCase() === "content-disposition");
      const contentType = (details.responseHeaders || [])
        .find((h) => h.name.toLowerCase() === "content-type");

      const dispValue = contentDisposition?.value || "";
      const typeValue = contentType?.value || "";

      // Only intercept when the server explicitly says "attachment"
      // (skip "inline" which is meant for in-browser display)
      const isAttachment =
        dispValue.toLowerCase().includes("attachment") ||
        dispValue.toLowerCase().includes("filename=");

      // Also catch octet-stream which often triggers a download
      const isBinaryStream =
        typeValue.includes("application/octet-stream") ||
        typeValue.includes("application/download") ||
        typeValue.includes("application/force-download");

      if (!isAttachment && !isBinaryStream) return;

      console.log(
        "[Aria2] webRequest: detected download trigger for",
        url,
        "Content-Disposition:",
        dispValue,
      );

      // Extract filename from Content-Disposition if possible
      let filename = "";
      const fnMatch = dispValue.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (fnMatch) {
        filename = fnMatch[1].replace(/['"]/g, "").trim();
      }

      const referrer = details.originUrl || details.documentUrl || details.initiator || "";
      const cookieStoreId = details.cookieStoreId || details.tabId;
      const cookies = await getCookiesForUrls([referrer, url], cookieStoreId);
      const extraOptions = await getSafeModeOptions(url);

      try {
        await addUriToAria2(url, referrer, cookies, filename, null, extraOptions);
        console.log("[Aria2] webRequest: download sent to aria2:", url);
      } catch (err) {
        console.error("[Aria2] webRequest: failed to send to aria2:", err);
      }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"],
  );
}

// ---------------------------------------------------------------------------
// Chrome 122+ download capture via onCreated (alternative to onChanged)
// Chromium added chrome.downloads.onCreated starting in Chrome 122.
// This provides a more reliable capture path for Chromium forks because
// it fires immediately when a download is initiated, before the filename
// transition that onChanged depends on.
// ---------------------------------------------------------------------------
if (hasDownloadsOnCreated() && !isFirefox()) {
  chrome.downloads.onCreated.addListener(async (downloadItem) => {
    await handleDownload(downloadItem, async (item, referrer, cookies) => {
      await removeDownloadItemCompletely(item);
      try {
        await captureDownloadItem(item, referrer, cookies);
        showNotification(
          "aria2",
          "Download captured: " + basename(item.filename),
        );
      } catch (err) {
        console.error("Failed to capture download:", err);
        showNotification("aria2 Error", err.message);
      }
    });
  });
}

// Firefox uses its own onCreated (via the onDeterminingFilename path)
if (isFirefox()) {
  chrome.downloads.onCreated.addListener(async (downloadItem) => {
    await handleDownload(downloadItem, async (item, referrer, cookies) => {
      await removeDownloadItemCompletely(item);
      try {
        await captureDownloadItem(item, referrer, cookies);
        showNotification(
          "aria2",
          "Download captured: " + basename(item.filename),
        );
      } catch (err) {
        console.error("Failed to capture download:", err);
        showNotification("aria2 Error", err.message);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ADD_DOWNLOAD") {
    const referer = request.referrer ?? "";
    const url = request.url;
    isUrlFilteredByExtension(url)
      .then((filtered) => {
        if (filtered) {
          sendResponse({ success: false, error: "File extension is filtered" });
          return;
        }
        return getCookiesForUrls([referer, url]).then((cookies) =>
          addUriToAria2(url, referer, cookies),
        );
      })
      .then((result) => {
        if (result) sendResponse({ success: true, gid: result });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === "ADD_DOWNLOAD_INTERCEPT") {
    const referer = request.referrer ?? sender.tab?.url ?? "";
    const url = request.url;
    const cookieStoreId = sender.tab?.cookieStoreId;
    const siteName = request.siteName || "";
    console.log(
      "[Aria2] ADD_DOWNLOAD_INTERCEPT - url:",
      url,
      "referer:",
      referer,
      "site:",
      siteName,
    );

    isUrlFilteredByExtension(url)
      .then((filtered) => {
        if (filtered) {
          console.log("[Aria2] Skipping filtered URL:", url);
          sendResponse({ success: false, error: "File extension is filtered" });
          return;
        }
        return getSafeModeOptions(url).then((extraOptions) =>
          getCookiesForUrls([referer, url], cookieStoreId).then((cookies) =>
            addUriToAria2(url, referer, cookies, null, null, extraOptions),
          ),
        );
      })
      .then((result) => {
        if (result) sendResponse({ success: true, gid: result });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === "GET_HIJACK_STATUS") {
    chrome.storage.local.get(["aria2_hijack_downloads"], (result) => {
      sendResponse({ enabled: result.aria2_hijack_downloads || false });
    });
    return true;
  }

  if (request.type === "SET_HIJACK_STATUS") {
    chrome.storage.local.set(
      { aria2_hijack_downloads: request.enabled },
      () => {
        sendResponse({ success: true });
      },
    );
    return true;
  }
});
