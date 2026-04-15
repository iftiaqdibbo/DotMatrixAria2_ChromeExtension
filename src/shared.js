(function() {
  const DEFAULT_RPC_URL = 'http://localhost:6800/jsonrpc';
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

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function storageSet(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set(values, resolve);
    });
  }

  async function getConfig() {
    const result = await storageGet([
      'aria2_rpc_url',
      'aria2_rpc_secret',
      'aria2_default_download_path',
      'aria2_hijack_downloads',
      'aria2_safe_mode',
      'aria2_safe_mode_hosts',
    ]);
    return {
      rpcUrl: result.aria2_rpc_url || DEFAULT_RPC_URL,
      secret: result.aria2_rpc_secret || '',
      downloadPath: result.aria2_default_download_path || '',
      hijackDownloads: result.aria2_hijack_downloads || false,
      safeMode: result.aria2_safe_mode !== false,
      safeModeHosts: result.aria2_safe_mode_hosts || [...DEFAULT_SAFE_MODE_HOSTS],
    };
  }

  async function saveConfig(config) {
    return storageSet({
      aria2_rpc_url: config.rpcUrl,
      aria2_rpc_secret: config.secret,
      aria2_default_download_path: config.downloadPath,
      aria2_hijack_downloads: config.hijackDownloads,
      aria2_safe_mode: config.safeMode,
    });
  }

  async function setHijackStatus(enabled) {
    return storageSet({ aria2_hijack_downloads: enabled });
  }

  async function callAria2(method, params = []) {
    const config = await getConfig();
    const secretToken = config.secret ? [`token:${config.secret}`] : [];
    const body = {
      jsonrpc: '2.0',
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      method,
      params: [...secretToken, ...params],
    };

    const response = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const parsed = await response.json();
    if (parsed.error) {
      throw new Error(parsed.error.message || 'aria2 RPC error');
    }
    return parsed.result;
  }

  async function testConnectionWithParams(rpcUrl, secret) {
    const secretToken = secret ? [`token:${secret}`] : [];
    const body = {
      jsonrpc: '2.0',
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      method: 'aria2.getVersion',
      params: secretToken,
    };
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = await response.json();
    if (parsed.error) {
      throw new Error(parsed.error.message || 'aria2 RPC error');
    }
    return parsed.result;
  }

  async function getAria2Status() {
    const tellKeys = [
      'gid', 'status', 'totalLength', 'completedLength',
      'downloadSpeed', 'uploadSpeed', 'files', 'connections',
    ];
    const [globalStat, active, waiting, stopped] = await Promise.all([
      callAria2('aria2.getGlobalStat'),
      callAria2('aria2.tellActive', [tellKeys]),
      callAria2('aria2.tellWaiting', [0, 100, tellKeys]),
      callAria2('aria2.tellStopped', [0, 100, tellKeys]),
    ]);
    return { globalStat, active, waiting, stopped };
  }

  function getFileName(download) {
    if (download.files && download.files.length > 0) {
      const path = download.files[0].path;
      return path.split('/').pop() || path || download.gid;
    }
    return download.gid;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatSpeed(bytesPerSecond) {
    return formatBytes(parseInt(bytesPerSecond, 10) || 0) + '/s';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  window.Aria2Shared = {
    DEFAULT_RPC_URL,
    DEFAULT_SAFE_MODE_HOSTS,
    getConfig,
    saveConfig,
    setHijackStatus,
    callAria2,
    testConnectionWithParams,
    getAria2Status,
    getFileName,
    formatBytes,
    formatSpeed,
    escapeHtml,
  };
})();
