/* Shared chrome.storage.local promise wrappers.
   Single source of truth — import these instead of redefining. */

function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        console.warn("[Aria2] storageGet error:", chrome.runtime.lastError);
      }
      resolve((result || {}) as Record<string, unknown>);
    });
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        console.warn("[Aria2] storageSet error:", chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

export { storageGet, storageSet };
