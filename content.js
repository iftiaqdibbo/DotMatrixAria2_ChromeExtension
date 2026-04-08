// Content script injected into pages to intercept downloads
// This runs in the context of the webpage and can access JS variables

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.aria2ExtensionInjected) return;
  window.aria2ExtensionInjected = true;
  
  // Intercept click events on download links
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a[href]');
    if (!link) return;
    
    // Check if it's a download link
    const href = link.href;
    const isDownload = link.download || 
                       href.match(/\.(zip|rar|7z|tar|gz|bz2|xz|exe|msi|dmg|pkg|deb|rpm|apk|ipa|pdf|doc|docx|xls|xlsx|ppt|pptx|mp3|mp4|avi|mkv|mov|wmv|flv|webm|m4v|m4a|flac|wav|aac|ogg|wma|jpg|jpeg|png|gif|bmp|webp|svg|ico|torrent|iso|img|bin|cue|nrg|dmg|vmdk|ova|ovf)$/i);
    
    if (isDownload) {
      // Check if hijacking is enabled
      chrome.runtime.sendMessage({ type: 'GET_HIJACK_STATUS' }, (response) => {
        if (response && response.enabled) {
          // Prevent default download
          e.preventDefault();
          e.stopPropagation();
          
          // Send to aria2
          chrome.runtime.sendMessage({ 
            type: 'ADD_DOWNLOAD', 
            url: href,
            referrer: window.location.href,
            cookies: document.cookie,
            userAgent: navigator.userAgent
          });
        }
      });
    }
  }, true);
  
  // Intercept form submissions (for sites that use forms for downloads)
  document.addEventListener('submit', function(e) {
    const form = e.target;
    const action = form.action || window.location.href;
    
    // Check if form leads to a download
    if (form.method === 'get' || form.method === 'GET') {
      chrome.runtime.sendMessage({ type: 'GET_HIJACK_STATUS' }, (response) => {
        if (response && response.enabled) {
          // Let form submit but also try to capture the response
          // This is complex - for now just let it through
        }
      });
    }
  }, true);
  
  // Hook into fetch API to capture download URLs
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    
    // Check if this looks like a download request
    if (typeof url === 'string') {
      const isDownloadUrl = url.match(/\.(zip|rar|7z|tar|gz|exe|msi|pdf|mp4|mp3|torrent|iso)$/i) ||
                           url.includes('download') ||
                           url.includes('file');
      
      if (isDownloadUrl) {
        // Check hijack status
        chrome.runtime.sendMessage({ type: 'GET_HIJACK_STATUS' }, (response) => {
          if (response && response.enabled) {
            // Try to intercept this download
            chrome.runtime.sendMessage({
              type: 'ADD_DOWNLOAD',
              url: url,
              referrer: window.location.href,
              cookies: document.cookie,
              userAgent: navigator.userAgent
            });
          }
        });
      }
    }
    
    return originalFetch.apply(this, args);
  };
  
  // Hook into XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    // Store URL for later checking
    this._aria2Url = url;
    return originalXHROpen.call(this, method, url, ...args);
  };
  
})();