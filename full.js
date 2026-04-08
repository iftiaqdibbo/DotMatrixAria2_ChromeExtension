// API Layer - Uses chrome.storage.local for all settings
const DEFAULT_RPC_URL = 'http://localhost:6800/jsonrpc';

// Get config from chrome.storage.local
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'aria2_rpc_url',
      'aria2_rpc_secret',
      'aria2_default_download_path'
    ], (result) => {
      resolve({
        rpcUrl: result.aria2_rpc_url || DEFAULT_RPC_URL,
        secret: result.aria2_rpc_secret || '',
        downloadPath: result.aria2_default_download_path || '',
      });
    });
  });
}

// Save config to chrome.storage.local
function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      aria2_rpc_url: config.rpcUrl,
      aria2_rpc_secret: config.secret,
    }, resolve);
  });
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

async function testConnection() {
  return callAria2('aria2.getVersion');
}

async function addDownload(urls, options = {}) {
  const config = await getConfig();
  const params = [urls];
  if (config.downloadPath || options.dir) {
    params.push({ dir: options.dir || config.downloadPath, ...options });
  } else if (Object.keys(options).length > 0) {
    params.push(options);
  }
  return callAria2('aria2.addUri', params);
}

async function pauseDownload(gid) {
  return callAria2('aria2.pause', [gid]);
}

async function unpauseDownload(gid) {
  return callAria2('aria2.unpause', [gid]);
}

async function stopDownload(gid) {
  return callAria2('aria2.remove', [gid]);
}

async function removeDownload(gid) {
  try {
    await callAria2('aria2.forceRemove', [gid]);
  } catch {}
  return callAria2('aria2.removeDownloadResult', [gid]);
}

// Full Dashboard App
function FullApp() {
  let state = {
    activeTab: 'active',
    downloads: { active: [], waiting: [], stopped: [] },
    globalStat: null,
    loading: true,
    error: null,
    showSettings: false,
    pollInterval: null,
    config: null,
  };

  const container = document.createElement('div');
  container.className = 'app full-mode';

  async function render() {
    container.innerHTML = '';
    
    // Load config if not loaded
    if (!state.config) {
      state.config = await getConfig();
    }
    
    const header = document.createElement('header');
    header.className = 'header';
    header.innerHTML = `
      <div class="logo-container">
        <div class="logo">
          <svg viewBox="0 0 42 42" width="32" height="32">
            <rect x="6" y="6" width="4" height="4" fill="currentColor"/>
            <rect x="12" y="6" width="4" height="4" fill="currentColor"/>
            <rect x="18" y="6" width="4" height="4" fill="currentColor"/>
            <rect x="6" y="12" width="4" height="4" fill="currentColor"/>
            <rect x="18" y="12" width="4" height="4" fill="currentColor"/>
            <rect x="24" y="12" width="4" height="4" fill="currentColor"/>
            <rect x="30" y="12" width="4" height="4" fill="currentColor"/>
            <rect x="6" y="18" width="4" height="4" fill="currentColor"/>
            <rect x="12" y="18" width="4" height="4" fill="currentColor"/>
            <rect x="18" y="18" width="4" height="4" fill="currentColor"/>
            <rect x="24" y="18" width="4" height="4" fill="currentColor"/>
            <rect x="30" y="18" width="4" height="4" fill="currentColor"/>
            <rect x="6" y="24" width="4" height="4" fill="currentColor"/>
            <rect x="18" y="24" width="4" height="4" fill="currentColor"/>
            <rect x="30" y="24" width="4" height="4" fill="currentColor"/>
            <rect x="6" y="30" width="4" height="4" fill="currentColor"/>
            <rect x="12" y="30" width="4" height="4" fill="currentColor"/>
            <rect x="18" y="30" width="4" height="4" fill="currentColor"/>
            <rect x="24" y="30" width="4" height="4" fill="currentColor"/>
            <rect x="30" y="30" width="4" height="4" fill="currentColor"/>
          </svg>
        </div>
        <div>
          <h1 class="title">aria2</h1>
          <span class="subtitle">dashboard</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn-icon" id="btn-settings" title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button class="btn-icon" id="btn-add" title="Add Download">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="btn-icon" id="btn-refresh" title="Refresh">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>
    `;
    container.appendChild(header);

    if (state.showSettings) {
      const settingsPanel = document.createElement('div');
      settingsPanel.className = 'settings-panel';
      settingsPanel.innerHTML = `
        <h2>connection settings</h2>
        <div class="settings-fields">
          <div>
            <label>RPC URL</label>
            <input type="text" id="setting-rpc-url" value="${state.config.rpcUrl}" placeholder="http://localhost:6800/jsonrpc">
          </div>
          <div>
            <label>Secret Token</label>
            <input type="password" id="setting-secret" value="${state.config.secret}" placeholder="optional">
          </div>
        </div>
        <div class="settings-actions">
          <button class="btn btn-primary" id="btn-save-settings">save</button>
          <button class="btn btn-secondary" id="btn-test-connection">test</button>
          <button class="btn btn-secondary" id="btn-cancel-settings">cancel</button>
        </div>
        <div id="test-result"></div>
      `;
      container.appendChild(settingsPanel);
    }

    if (state.loading) {
      const loading = document.createElement('div');
      loading.className = 'loading-state';
      loading.innerHTML = `
        <div class="dot-progress">
          ${Array(10).fill(0).map((_, i) => `<span class="dot ${i < 3 ? 'dot--filled' : ''}" style="animation: pulse-dot 1s ease-in-out ${i * 0.1}s infinite"></span>`).join('')}
        </div>
        <span>connecting to aria2...</span>
      `;
      container.appendChild(loading);
    } else if (state.error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error';
      errorDiv.textContent = state.error;
      container.appendChild(errorDiv);
    } else {
      const dashboard = document.createElement('div');
      dashboard.className = 'dashboard-layout';
      
      const sidebar = document.createElement('div');
      sidebar.className = 'sidebar';
      sidebar.innerHTML = `
        <div class="status-card">
          <div class="status-card-inner">
            <div class="status-dot status-dot--active"></div>
            <div>
              <h2>active</h2>
              <p>${state.globalStat?.numActive || 0}</p>
            </div>
          </div>
        </div>
        <div class="status-card">
          <div class="status-card-inner">
            <div class="status-dot status-dot--waiting"></div>
            <div>
              <h2>waiting</h2>
              <p>${state.globalStat?.numWaiting || 0}</p>
            </div>
          </div>
        </div>
        <div class="status-card">
          <div class="status-card-inner">
            <div class="status-dot status-dot--stopped"></div>
            <div>
              <h2>stopped</h2>
              <p>${state.globalStat?.numStopped || 0}</p>
            </div>
          </div>
        </div>
        <div class="status-card">
          <div class="status-card-inner">
            <div class="status-dot status-dot--speed"></div>
            <div>
              <h2>download</h2>
              <p class="speed-value">${formatSpeed(state.globalStat?.downloadSpeed)}</p>
            </div>
          </div>
        </div>
      `;
      
      const mainContent = document.createElement('div');
      mainContent.className = 'main-content';
      
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      ['active', 'waiting', 'stopped'].forEach(tab => {
        const count = state.downloads[tab]?.length || 0;
        const isActive = state.activeTab === tab;
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab ${isActive ? 'tab--active' : ''}`;
        tabBtn.innerHTML = `
          <span class="tab-dot tab-dot--${tab}"></span>
          ${tab}
          <span class="tab-count">${count}</span>
        `;
        tabBtn.addEventListener('click', () => {
          state.activeTab = tab;
          render();
        });
        tabs.appendChild(tabBtn);
      });
      
      const downloadList = document.createElement('div');
      downloadList.className = 'download-list';
      
      const downloads = state.downloads[state.activeTab] || [];
      if (downloads.length === 0) {
        downloadList.innerHTML = `<div class="empty-state">no ${state.activeTab} downloads</div>`;
      } else {
        downloads.forEach(download => {
          const row = createDownloadRow(download);
          downloadList.appendChild(row);
        });
      }
      
      mainContent.appendChild(tabs);
      mainContent.appendChild(downloadList);
      
      dashboard.appendChild(sidebar);
      dashboard.appendChild(mainContent);
      container.appendChild(dashboard);
    }

    const footer = document.createElement('footer');
    footer.innerHTML = `<p class="footer-text">aria2 dashboard</p>`;
    container.appendChild(footer);

    attachEventListeners();
  }

  function createDownloadRow(download) {
    const total = parseInt(download.totalLength) || 1;
    const completed = parseInt(download.completedLength);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const speed = parseInt(download.downloadSpeed) || 0;
    
    const row = document.createElement('div');
    row.className = 'download-row';
    row.innerHTML = `
      <div class="download-row-header">
        <span class="download-title">${escapeHtml(getFileName(download))}</span>
        <span class="status-badge status-badge--${download.status}">${download.status}</span>
      </div>
      <div class="download-details">
        <span><strong>${formatBytes(completed)}</strong> / ${formatBytes(total)}</span>
        <span>speed: <strong>${formatSpeed(speed)}</strong></span>
        <span>connections: <strong>${download.connections}</strong></span>
      </div>
      <div class="dot-progress">
        ${Array(20).fill(0).map((_, i) => {
          const filled = i < Math.round((percent / 100) * 20);
          return `<span class="dot ${filled ? 'dot--filled' : ''}"></span>`;
        }).join('')}
      </div>
      <div class="download-actions">
        ${download.status === 'active' ? `
          <button class="btn btn-action btn-pause" data-gid="${download.gid}">
            <span class="btn-dot-indicator btn-dot-pause"></span>
            pause
          </button>
        ` : ''}
        ${download.status === 'paused' ? `
          <button class="btn btn-action btn-resume" data-gid="${download.gid}">
            <span class="btn-dot-indicator btn-dot-resume"></span>
            resume
          </button>
        ` : ''}
        ${download.status === 'active' || download.status === 'waiting' || download.status === 'paused' ? `
          <button class="btn btn-action btn-stop" data-gid="${download.gid}">
            <span class="btn-dot-indicator btn-dot-stop"></span>
            stop
          </button>
        ` : ''}
        ${download.status === 'complete' || download.status === 'error' || download.status === 'removed' ? `
          <button class="btn btn-action btn-delete" data-gid="${download.gid}">
            <span class="btn-dot-indicator btn-dot-delete"></span>
            remove
          </button>
        ` : ''}
      </div>
    `;
    
    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const gid = e.currentTarget.dataset.gid;
        try {
          if (btn.classList.contains('btn-pause')) await pauseDownload(gid);
          else if (btn.classList.contains('btn-resume')) await unpauseDownload(gid);
          else if (btn.classList.contains('btn-stop')) await stopDownload(gid);
          else if (btn.classList.contains('btn-delete')) await removeDownload(gid);
          await loadData();
        } catch (err) {
          console.error('Action failed:', err);
        }
      });
    });
    
    return row;
  }

  function attachEventListeners() {
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      state.showSettings = !state.showSettings;
      render();
    });
    
    document.getElementById('btn-cancel-settings')?.addEventListener('click', () => {
      state.showSettings = false;
      render();
    });
    
    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
      const rpcUrl = document.getElementById('setting-rpc-url').value;
      const secret = document.getElementById('setting-secret').value;
      await saveConfig({ rpcUrl, secret });
      state.config = { rpcUrl, secret, downloadPath: state.config.downloadPath };
      state.showSettings = false;
      loadData();
    });
    
    document.getElementById('btn-test-connection')?.addEventListener('click', async () => {
      const resultEl = document.getElementById('test-result');
      resultEl.className = '';
      resultEl.textContent = 'testing...';
      try {
        await testConnection();
        resultEl.className = 'test-success';
        resultEl.textContent = 'connection successful!';
      } catch (err) {
        resultEl.className = 'test-fail';
        resultEl.textContent = 'connection failed: ' + err.message;
      }
    });
    
    document.getElementById('btn-refresh')?.addEventListener('click', loadData);
    
    document.getElementById('btn-add')?.addEventListener('click', () => {
      const url = prompt('Enter download URL:');
      if (url) {
        addDownload([url]).then(() => loadData()).catch(err => alert('Failed: ' + err.message));
      }
    });
  }

  async function loadData() {
    state.loading = true;
    state.error = null;
    await render();
    
    try {
      const data = await getAria2Status();
      state.downloads = {
        active: data.active,
        waiting: data.waiting,
        stopped: data.stopped,
      };
      state.globalStat = data.globalStat;
      state.loading = false;
    } catch (err) {
      state.error = err.message;
      state.loading = false;
    }
    await render();
  }

  function startPolling() {
    loadData();
    state.pollInterval = setInterval(loadData, 3000);
  }

  function stopPolling() {
    if (state.pollInterval) {
      clearInterval(state.pollInterval);
      state.pollInterval = null;
    }
  }

  container.addEventListener('mount', () => {
    startPolling();
  });

  container.addEventListener('unmount', () => {
    stopPolling();
  });

  render();
  return container;
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
  const speed = parseInt(bytesPerSecond) || 0;
  return formatBytes(speed) + '/s';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const root = document.getElementById('root');
const app = FullApp();
root.appendChild(app);
app.dispatchEvent(new Event('mount'));

window.addEventListener('beforeunload', () => {
  app.dispatchEvent(new Event('unmount'));
});