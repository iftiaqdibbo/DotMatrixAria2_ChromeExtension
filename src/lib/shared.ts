import {
  ARIA2_DEFAULT_RPC_URL,
  ARIA2_DEFAULT_FILTER_EXTENSIONS,
  ARIA2_DEFAULT_SAFE_MODE_HOSTS,
  ARIA2_THEMES,
  ARIA2_CUSTOM_THEMES_KEY,
  CustomTheme,
  ThemeId,
} from "./constants";

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

export interface Aria2Config {
  rpcUrl: string;
  secret: string;
  downloadPath: string;
  hijackDownloads: boolean;
  safeMode: boolean;
  safeModeHosts: string[];
  completionNotifications: boolean;
  filterExtensions: string[];
  theme: ThemeId;
}

export async function getConfig(): Promise<Aria2Config> {
  const result = await storageGet([
    "aria2_rpc_url",
    "aria2_rpc_secret",
    "aria2_default_download_path",
    "aria2_hijack_downloads",
    "aria2_safe_mode",
    "aria2_safe_mode_hosts",
    "aria2_completion_notifications",
    "aria2_filter_extensions",
    "aria2_theme",
  ]) as Record<string, unknown>;

  return {
    rpcUrl: (result.aria2_rpc_url as string) || ARIA2_DEFAULT_RPC_URL,
    secret: (result.aria2_rpc_secret as string) || "",
    downloadPath: (result.aria2_default_download_path as string) || "",
    hijackDownloads: (result.aria2_hijack_downloads as boolean) || false,
    safeMode: result.aria2_safe_mode !== false,
    safeModeHosts: (result.aria2_safe_mode_hosts as string[]) || [...ARIA2_DEFAULT_SAFE_MODE_HOSTS],
    completionNotifications: result.aria2_completion_notifications !== false,
    filterExtensions: (result.aria2_filter_extensions as string[]) || [],
    theme: ((result.aria2_theme as string) || "original") as ThemeId,
  };
}

export async function saveConfig(config: Aria2Config): Promise<void> {
  return storageSet({
    aria2_rpc_url: config.rpcUrl,
    aria2_rpc_secret: config.secret,
    aria2_default_download_path: config.downloadPath,
    aria2_hijack_downloads: config.hijackDownloads,
    aria2_safe_mode: config.safeMode,
    aria2_safe_mode_hosts: config.safeModeHosts,
    aria2_completion_notifications: config.completionNotifications,
    aria2_filter_extensions: config.filterExtensions,
    aria2_theme: config.theme || "original",
  });
}

export async function setHijackStatus(enabled: boolean): Promise<void> {
  return storageSet({ aria2_hijack_downloads: enabled });
}

export async function callAria2(method: string, params: unknown[] = []): Promise<unknown> {
  const config = await getConfig();
  const secretToken = config.secret ? [`token:${config.secret}`] : [];
  const body = {
    jsonrpc: "2.0",
    id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)),
    method,
    params: [...secretToken, ...params],
  };

  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const parsed = await response.json();
  if (parsed.error) {
    throw new Error(parsed.error.message || "aria2 RPC error");
  }
  return parsed.result;
}

export async function testConnectionWithParams(rpcUrl: string, secret: string): Promise<unknown> {
  const secretToken = secret ? [`token:${secret}`] : [];
  const body = {
    jsonrpc: "2.0",
    id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)),
    method: "aria2.getVersion",
    params: secretToken,
  };
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json();
  if (parsed.error) {
    throw new Error(parsed.error.message || "aria2 RPC error");
  }
  return parsed.result;
}

export interface Aria2Download {
  gid: string;
  status: string;
  totalLength: string;
  completedLength: string;
  downloadSpeed: string;
  uploadSpeed: string;
  files: Array<{ path: string; uris: Array<{ uri: string }> }>;
  connections: string;
  completedTime?: string;
  errorCode?: string;
}

export interface Aria2GlobalStat {
  numActive: string;
  numWaiting: string;
  numStopped: string;
  downloadSpeed: string;
}

export interface Aria2Status {
  globalStat: Aria2GlobalStat;
  active: Aria2Download[];
  waiting: Aria2Download[];
  stopped: Aria2Download[];
}

export async function getAria2Status(): Promise<Aria2Status> {
  const tellKeys = [
    "gid", "status", "totalLength", "completedLength",
    "downloadSpeed", "uploadSpeed", "files", "connections",
    "completedTime",
  ];
  const [globalStat, active, waiting, stopped] = await Promise.all([
    callAria2("aria2.getGlobalStat"),
    callAria2("aria2.tellActive", [tellKeys]),
    callAria2("aria2.tellWaiting", [0, 100, tellKeys]),
    callAria2("aria2.tellStopped", [0, 100, tellKeys]),
  ]);
  return { globalStat, active, waiting, stopped } as Aria2Status;
}

export function getFileName(download: Aria2Download): string {
  if (download.files && download.files.length > 0) {
    const path = download.files[0].path;
    return path.split("/").pop() || path || download.gid;
  }
  return download.gid;
}

export function formatBytes(bytes: string | number): string {
  const n = parseInt(String(bytes), 10);
  if (isNaN(n) || n === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1);
  return parseFloat((n / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatSpeed(bytesPerSecond: string | number): string {
  return formatBytes(parseInt(String(bytesPerSecond), 10) || 0) + "/s";
}

export function escapeHtml(text: string | null | undefined): string {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}