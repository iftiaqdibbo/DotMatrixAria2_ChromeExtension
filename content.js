// Content script - captures download cookies and sends to background script
(function() {
  'use strict';
  
  if (window.aria2ExtensionInjected) return;
  window.aria2ExtensionInjected = true;
  
  console.log('[Aria2 Content] Script injected into', window.location.href);
  
  // Helper to check if hijacking is enabled
  async function isHijackEnabled() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_HIJACK_STATUS' }, (response) => {
        resolve(response && response.enabled);
      });
    });
  }
  
  // Helper to send download to background
  async function sendToAria2(url) {
    const cookies = document.cookie;
    console.log('[Aria2 Content] Sending to aria2:', url);
    console.log('[Aria2 Content] Cookies:', cookies);
    
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        type: 'ADD_DOWNLOAD', 
        url: url,
        referrer: window.location.href,
        cookies: cookies,
        userAgent: navigator.userAgent
      }, (response) => {
        console.log('[Aria2 Content] Response:', response);
        resolve(response);
      });
    });
  }
  
  // Hook fetch to catch download URLs and API responses
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    console.log('[Aria2 Content] Fetch intercepted:', url);
    
    // First, let the fetch proceed
    const response = await originalFetch.apply(this, args);
    
    // Then check if this is a go-file API call that returns a download URL
    if (typeof url === 'string' && url.includes('gofile.io')) {
      console.log('[Aria2 Content] Fetch to go-file:', url);
      
      // Clone the response so we can read it
      try {
        const clone = response.clone();
        const text = await clone.text();
        console.log('[Aria2 Content] Response text:', text.substring(0, 500));
        
        // Check if response contains a download URL
        const downloadMatch = text.match(/(https:\/\/store\d+\.gofile\.io\/download\/[^"']+)/);
        if (downloadMatch) {
          const downloadUrl = downloadMatch[1];
          console.log('[Aria2 Content] Found download URL in response:', downloadUrl);
          
          const enabled = await isHijackEnabled();
          if (enabled) {
            await sendToAria2(downloadUrl);
          }
        } else {
          console.log('[Aria2 Content] No download URL found in response');
        }
      } catch (e) {
        console.log('[Aria2 Content] Error parsing response:', e);
      }
    }
    
    return response;
  };
  
})();
