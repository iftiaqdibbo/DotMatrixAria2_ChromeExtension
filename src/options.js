// API Layer - Uses chrome.storage.local for all settings
const DEFAULT_RPC_URL = 'http://localhost:6800/jsonrpc';

// Get config from chrome.storage.local
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'aria2_rpc_url',
      'aria2_rpc_secret',
      'aria2_default_download_path',
      'aria2_hijack_downloads',
      'aria2_safe_mode'
    ], (result) => {
      resolve({
        rpcUrl: result.aria2_rpc_url || DEFAULT_RPC_URL,
        secret: result.aria2_rpc_secret || '',
        downloadPath: result.aria2_default_download_path || '',
        hijackDownloads: result.aria2_hijack_downloads || false,
        safeMode: result.aria2_safe_mode || false,
      });
    });
  });
}

function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      aria2_rpc_url: config.rpcUrl,
      aria2_rpc_secret: config.secret,
      aria2_default_download_path: config.downloadPath,
      aria2_hijack_downloads: config.hijackDownloads,
      aria2_safe_mode: config.safeMode,
    }, resolve);
  });
}

// Save config to chrome.storage.local
function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      aria2_rpc_url: config.rpcUrl,
      aria2_rpc_secret: config.secret,
      aria2_default_download_path: config.downloadPath,
      aria2_hijack_downloads: config.hijackDownloads,
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

async function testConnection() {
  return callAria2('aria2.getVersion');
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

// Options App
function OptionsApp() {
  const container = document.createElement('div');
  container.className = 'app options-mode';

  const header = document.createElement('header');
  header.className = 'header';
  header.innerHTML = `
    <div class="logo-container">
      <div class="logo">
        <svg viewBox="0 0 42 42" width="28" height="28">
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
        <span class="subtitle">settings</span>
      </div>
    </div>
  `;

  const content = document.createElement('main');
  content.className = 'main options-content';

  content.innerHTML = `
    <div class="settings-container">
      <section class="settings-section">
        <h2 class="section-title">
          <span class="dot-indicator"></span>
          connection settings
        </h2>
        
        <div class="form-group">
          <label for="rpc-url">RPC URL</label>
          <input 
            type="text" 
            id="rpc-url" 
            class="input" 
            placeholder="http://localhost:6800/jsonrpc"
          >
          <span class="input-hint">aria2 RPC endpoint URL</span>
        </div>

        <div class="form-group">
          <label for="rpc-secret">Secret Token</label>
          <input 
            type="password" 
            id="rpc-secret" 
            class="input" 
            placeholder="optional"
          >
          <span class="input-hint">RPC secret token (if configured)</span>
        </div>

        <div class="form-actions">
          <button class="btn btn-secondary" id="test-connection">test connection</button>
          <span class="test-result" id="test-result"></span>
        </div>
      </section>

      <div class="divider"></div>

      <section class="settings-section">
        <h2 class="section-title">
          <span class="dot-indicator"></span>
          download settings
        </h2>
        
        <div class="form-group">
          <label for="download-path">Default Download Path</label>
          <input 
            type="text" 
            id="download-path" 
            class="input" 
            placeholder="/path/to/downloads"
          >
          <span class="input-hint">Default directory for new downloads (optional)</span>
        </div>
      </section>

      <div class="divider"></div>

      <section class="settings-section">
        <h2 class="section-title">
          <span class="dot-indicator"></span>
          browser integration
        </h2>
        
        <div class="form-group">
          <div class="hijack-toggle-row" style="margin-bottom: 8px;">
            <div class="hijack-info">
              <span class="hijack-label">Hijack Browser Downloads</span>
              <span class="hijack-desc">Intercept all browser downloads and send to aria2</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="hijack-toggle">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <span class="input-hint">When enabled, all file downloads will be redirected to aria2</span>
        </div>

        <div class="form-group">
          <div class="hijack-toggle-row" style="margin-bottom: 8px;">
            <div class="hijack-info">
              <span class="hijack-label">Safe Mode</span>
              <span class="hijack-desc">Force single connection for known file hosting sites</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="safe-mode-toggle">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <span class="input-hint">Prevents rate-limiting and connection drops on restrictive hosts (1Fichier, Gofile, RapidGator, etc.)</span>
        </div>
      </section>

      <div class="divider"></div>

      <section class="settings-section">
        <h2 class="section-title">
          <span class="dot-indicator"></span>
          quick actions
        </h2>
        
        <div class="quick-actions">
          <button class="btn btn-primary" id="open-dashboard">open full dashboard</button>
          <button class="btn btn-secondary" id="add-download">add download</button>
        </div>
      </section>
    </div>
  `;

  const footer = document.createElement('footer');
  footer.className = 'options-footer';
  footer.innerHTML = `
    <button class="btn btn-primary" id="save-settings">save settings</button>
  `;

  container.appendChild(header);
  container.appendChild(content);
  container.appendChild(footer);

  container.addEventListener('mount', async () => {
    // Load current settings
    const config = await getConfig();
    document.getElementById('rpc-url').value = config.rpcUrl;
    document.getElementById('rpc-secret').value = config.secret;
    document.getElementById('download-path').value = config.downloadPath;
    document.getElementById('hijack-toggle').checked = config.hijackDownloads;
    document.getElementById('safe-mode-toggle').checked = config.safeMode;

    const testBtn = document.getElementById('test-connection');
    const testResult = document.getElementById('test-result');
    const saveBtn = document.getElementById('save-settings');
    const openDashboardBtn = document.getElementById('open-dashboard');
    const addDownloadBtn = document.getElementById('add-download');

    testBtn.addEventListener('click', async () => {
      testResult.textContent = 'testing...';
      testResult.className = 'test-result testing';
      
      try {
        // Test with current input values, not saved settings
        const rpcUrl = document.getElementById('rpc-url').value.trim();
        const secret = document.getElementById('rpc-secret').value.trim();
        await testConnectionWithParams(rpcUrl, secret);
        testResult.textContent = 'connected!';
        testResult.className = 'test-result success';
      } catch (err) {
        testResult.textContent = 'failed: ' + err.message;
        testResult.className = 'test-result error';
      }
    });

    saveBtn.addEventListener('click', async () => {
      await saveConfig({
        rpcUrl: document.getElementById('rpc-url').value.trim(),
        secret: document.getElementById('rpc-secret').value.trim(),
        downloadPath: document.getElementById('download-path').value.trim(),
        hijackDownloads: document.getElementById('hijack-toggle').checked,
        safeMode: document.getElementById('safe-mode-toggle').checked,
      });
      
      testResult.textContent = 'settings saved!';
      testResult.className = 'test-result success';
      
      setTimeout(() => {
        testResult.textContent = '';
      }, 2000);
    });

    openDashboardBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/full.html') });
    });

    addDownloadBtn.addEventListener('click', () => {
      const url = prompt('Enter download URL:');
      if (url) {
        chrome.runtime.sendMessage({ type: 'ADD_DOWNLOAD', url }, (response) => {
          if (response && response.success) {
            alert('Download added!');
          } else {
            alert('Failed: ' + (response?.error || 'Unknown error'));
          }
        });
      }
    });
  });

  return container;
}

const root = document.getElementById('root');
const app = OptionsApp();
root.appendChild(app);
app.dispatchEvent(new Event('mount'));