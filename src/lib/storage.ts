/* Shared chrome.storage.local promise wrappers.
   Single source of truth — import these instead of redefining. */

function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve as (result: Record<string, unknown>) => void);
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve as () => void);
  });
}

export { storageGet, storageSet };
