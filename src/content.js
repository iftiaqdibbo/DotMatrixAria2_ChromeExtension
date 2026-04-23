// Content script - intercepts download URLs from fetch/XHR responses
// Only catches URLs that wouldn't be captured by the browser's Downloads API
// (e.g. JS-initiated downloads with token URLs hidden in API responses)
(function () {
  "use strict";

  if (window.aria2ExtensionInjected) return;
  window.aria2ExtensionInjected = true;

  console.log("[Aria2 Content] Script injected into", window.location.href);

  const siteInterceptors = [
    {
      pattern: /(https:\/\/store\d+\.gofile\.io\/download\/[^"'}\s]+)/g,
      name: "Gofile",
    },
    {
      pattern: /(https:\/\/file-[a-z\-]+\d*\.gofile\.io\/download\/[^"'}\s]+)/g,
      name: "Gofile",
    },
    { pattern: /(https:\/\/1fichier\.com\/[^\s"'}]+)/g, name: "1Fichier" },
    {
      pattern: /(https:\/\/pixeldrain\.com\/api\/file\/[^\s"'}]+)/g,
      name: "Pixeldrain",
    },
    {
      pattern: /(https:\/\/mediafire\.com\/file\/[^\s"'}]+)/g,
      name: "MediaFire",
    },
    {
      pattern: /(https:\/\/download\d*\.mediafire\.com\/[^\s"'}]+)/g,
      name: "MediaFire",
    },
    { pattern: /(https:\/\/[^.]+\.mega\.nz\/[^\s"'}]+)/g, name: "MEGA" },
    { pattern: /(https:\/\/mega\.nz\/[^\s"'}]+)/g, name: "MEGA" },
    { pattern: /(https:\/\/ranoz\.net\/[^\s"'}]+)/g, name: "Ranoz" },
    { pattern: /(https:\/\/datanodes\.to\/[^\s"'}]+)/g, name: "DataNodes" },
    { pattern: /(https:\/\/bowfile\.com\/[^\s"'}]+)/g, name: "Bowfile" },
    { pattern: /(https:\/\/dl\.free\.fr\/[^\s"'}]+)/g, name: "DLFree" },
    {
      pattern: /(https:\/\/swisstransfer\.com\/[^\s"'}]+)/g,
      name: "SwissTransfer",
    },
    {
      pattern: /(https:\/\/[a-z0-9]+\.swisstransfer\.com\/[^\s"'}]+)/g,
      name: "SwissTransfer",
    },
    { pattern: /(https:\/\/freedlink\.me\/[^\s"'}]+)/g, name: "FreedLink" },
    { pattern: /(https:\/\/fileditch\.com\/[^\s"'}]+)/g, name: "FileDitch" },
    { pattern: /(https:\/\/uploadnow\.io\/[^\s"'}]+)/g, name: "UploadNow" },
    { pattern: /(https:\/\/wdho\.ru\/[^\s"'}]+)/g, name: "WDHO" },
    { pattern: /(https:\/\/mixdrop\.[a-z]+\/[^\s"'}]+)/g, name: "MixDrop" },
    { pattern: /(https:\/\/chomikuj\.pl\/[^\s"'}]+)/g, name: "Chomikuj" },
    { pattern: /(https:\/\/vikingfile\.com\/[^\s"'}]+)/g, name: "VikingFile" },
    { pattern: /(https:\/\/dayuploads\.com\/[^\s"'}]+)/g, name: "DayUploads" },
    {
      pattern: /(https:\/\/downmediaload\.com\/[^\s"'}]+)/g,
      name: "DownMediaLoad",
    },
    { pattern: /(https:\/\/hexload\.com\/[^\s"'}]+)/g, name: "HexLoad" },
    { pattern: /(https:\/\/1cloudfile\.com\/[^\s"'}]+)/g, name: "1CloudFile" },
    { pattern: /(https:\/\/usersdrive\.com\/[^\s"'}]+)/g, name: "UsersDrive" },
    { pattern: /(https:\/\/megaup\.net\/[^\s"'}]+)/g, name: "MegaUp" },
    {
      pattern: /(https:\/\/clicknupload\.org\/[^\s"'}]+)/g,
      name: "ClickNUpload",
    },
    {
      pattern: /(https:\/\/dailyuploads\.net\/[^\s"'}]+)/g,
      name: "DailyUploads",
    },
    { pattern: /(https:\/\/rapidgator\.net\/[^\s"'}]+)/g, name: "RapidGator" },
    { pattern: /(https:\/\/nitroflare\.com\/[^\s"'}]+)/g, name: "NitroFlare" },
    { pattern: /(https:\/\/filebin\.net\/[^\s"'}]+)/g, name: "FileBin" },
    { pattern: /(https:\/\/tmpfiles\.org\/[^\s"'}]+)/g, name: "Tmpfiles" },
    { pattern: /(https:\/\/oshi\.at\/[^\s"'}]+)/g, name: "Oshi.at" },
    { pattern: /(https:\/\/f\.ppy\.sh\/[^\s"'}]+)/g, name: "osu!ppy" },
  ];

  const jsonSiteInterceptors = [
    {
      urlPattern: /pixeldrain\.com\/api\/file/,
      jsonPath: "download_url",
      name: "Pixeldrain",
    },
  ];

  const alreadySent = new Set();

  async function isHijackEnabled() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_HIJACK_STATUS" }, (response) => {
        resolve(response && response.enabled);
      });
    });
  }

  async function sendToAria2(url, siteName) {
    if (!url || !url.startsWith("http")) return;
    if (alreadySent.has(url)) {
      console.log("[Aria2 Content] Already sent, skipping:", url);
      return;
    }
    alreadySent.add(url);
    if (alreadySent.size > 100) {
      alreadySent.delete(alreadySent.keys().next().value);
    }

    console.log("[Aria2 Content] " + siteName + ": Sending to aria2:", url);

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "ADD_DOWNLOAD_INTERCEPT",
          url: url,
          referrer: window.location.href,
          siteName: siteName,
        },
        (response) => {
          console.log("[Aria2 Content] " + siteName + ": Response:", response);
          resolve(response);
        },
      );
    });
  }

  function extractUrlsFromText(text) {
    const found = [];
    for (const interceptor of siteInterceptors) {
      let match;
      while ((match = interceptor.pattern.exec(text)) !== null) {
        found.push({ url: match[1], site: interceptor.name });
      }
      interceptor.pattern.lastIndex = 0;
    }
    return found;
  }

  function extractUrlsFromJson(text, responseUrl) {
    const found = [];
    try {
      const json = JSON.parse(text);
      for (const interceptor of jsonSiteInterceptors) {
        if (interceptor.urlPattern.test(responseUrl)) {
          const url = json[interceptor.jsonPath];
          if (url && typeof url === "string") {
            found.push({ url: url, site: interceptor.name });
          }
        }
      }
    } catch (e) {
      // JSON parse error - not a JSON response
    }
    return found;
  }

  function scanResponse(text, responseUrl, source) {
    const textMatches = extractUrlsFromText(text);
    const jsonMatches = extractUrlsFromJson(text, responseUrl);
    const allMatches = textMatches.concat(jsonMatches);

    for (const match of allMatches) {
      console.log(
        "[Aria2 Content] " +
          match.site +
          ": Found download URL in " +
          source +
          ":",
        match.url,
      );
      sendToAria2(match.url, match.site);
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url =
      typeof args[0] === "string"
        ? args[0]
        : args[0] instanceof Request
          ? args[0].url
          : "";
    const response = await originalFetch.apply(this, args);

    if (!url) return response;

    (async () => {
      try {
        const enabled = await isHijackEnabled();
        if (enabled) {
          const contentType = response.headers.get("content-type") || "";
          if (
            contentType &&
            !contentType.includes("application/json") &&
            !contentType.includes("text/") &&
            !contentType.includes("application/javascript") &&
            !contentType.includes("application/xml")
          ) {
            return;
          }

          const contentLength = response.headers.get("content-length");
          if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
            return;
          }

          const clone = response.clone();
          const text = await clone.text();
          scanResponse(text, url, "fetch");
        }
      } catch (e) {
        console.log("[Aria2 Content] Error scanning fetch response:", e);
      }
    })();

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._aria2Url = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (
          this.responseType &&
          this.responseType !== "text" &&
          this.responseType !== "json"
        ) {
          return;
        }
        let text = "";
        if (this.responseType === "json") {
          try {
            text = JSON.stringify(this.response);
          } catch (e) {}
        } else {
          text = this.responseText;
        }
        if (!text || typeof this._aria2Url !== "string") return;
        isHijackEnabled().then(
          function (enabled) {
            if (enabled) {
              scanResponse(text, this._aria2Url, "XHR");
            }
          }.bind(this),
        );
      } catch (e) {
        console.log("[Aria2 Content] Error scanning XHR response:", e);
      }
    });
    return originalSend.apply(this, args);
  };
})();
