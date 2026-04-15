const {
  DEFAULT_SAFE_MODE_HOSTS,
  getConfig,
  saveConfig,
  testConnectionWithParams,
  escapeHtml,
} = window.Aria2Shared;

function OptionsApp(embedded) {
  let activeTab = 'general';
  let currentHosts = [];

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
    ${embedded ? '<button class="btn-icon" id="btn-close-options" title="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' : ''}
  `;

  const content = document.createElement('main');
  content.className = 'main options-content';

  const tabNav = document.createElement('div');
  tabNav.className = 'options-tabs';
  tabNav.innerHTML = `
    <button class="options-tab active" data-tab="general">
      <span class="tab-dot tab-dot--active"></span>
      general
    </button>
    <button class="options-tab" data-tab="safe-mode">
      <span class="tab-dot tab-dot--safe-mode"></span>
      safe mode
    </button>
  `;

  const tabContent = document.createElement('div');
  tabContent.className = 'options-tab-content';

  const generalPanel = document.createElement('div');
  generalPanel.className = 'tab-panel active';
  generalPanel.id = 'tab-general';
  generalPanel.innerHTML = `
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

  const safeModePanel = document.createElement('div');
  safeModePanel.className = 'tab-panel';
  safeModePanel.id = 'tab-safe-mode';
  safeModePanel.innerHTML = `
    <div class="settings-container">
      <section class="settings-section">
        <h2 class="section-title">
          <span class="dot-indicator"></span>
          safe mode
        </h2>
        
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
          <span class="input-hint">Prevents rate-limiting and connection drops on restrictive hosts by forcing single-connection downloads</span>
        </div>
      </section>

      <div class="divider"></div>

      <section class="settings-section">
        <h2 class="section-title">
          <span class="dot-indicator"></span>
          managed sites
        </h2>
        <span class="input-hint" style="margin-bottom: 12px; display: block;">Sites in this list will use single-connection downloads when safe mode is enabled</span>
        
        <div class="safe-mode-host-add">
          <input 
            type="text" 
            id="add-host-input" 
            class="input" 
            placeholder="e.g. example.com"
          >
          <button class="btn btn-primary" id="add-host-btn">add</button>
        </div>
        <div class="safe-mode-hosts-list" id="safe-mode-hosts-list"></div>
      </section>
    </div>
  `;

  tabContent.appendChild(generalPanel);
  tabContent.appendChild(safeModePanel);
  content.appendChild(tabNav);
  content.appendChild(tabContent);

  const footer = document.createElement('footer');
  footer.className = 'options-footer';
  footer.innerHTML = `
    <button class="btn btn-primary" id="save-settings">save settings</button>
  `;

  container.appendChild(header);
  container.appendChild(content);
  container.appendChild(footer);

  function renderHostsList() {
    const listEl = container.querySelector('#safe-mode-hosts-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (currentHosts.length === 0) {
      listEl.innerHTML = '<div class="empty-hosts">no sites configured</div>';
      return;
    }
    currentHosts.forEach((host, index) => {
      const chip = document.createElement('div');
      chip.className = 'host-chip';
      chip.innerHTML = `
        <span class="host-chip-name">${escapeHtml(host)}</span>
        <button class="host-chip-remove" data-index="${index}" title="Remove ${escapeHtml(host)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;
      listEl.appendChild(chip);
    });

    listEl.querySelectorAll('.host-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        currentHosts.splice(idx, 1);
        chrome.storage.local.set({ aria2_safe_mode_hosts: currentHosts });
        renderHostsList();
      });
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    tabNav.querySelectorAll('.options-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    tabContent.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === 'tab-' + tab);
    });
  }

  tabNav.querySelectorAll('.options-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  container.addEventListener('mount', async () => {
    const config = await getConfig();
    currentHosts = [...config.safeModeHosts];

    container.querySelector('#rpc-url').value = config.rpcUrl;
    container.querySelector('#rpc-secret').value = config.secret;
    container.querySelector('#download-path').value = config.downloadPath;
    container.querySelector('#hijack-toggle').checked = config.hijackDownloads;
    container.querySelector('#safe-mode-toggle').checked = config.safeMode;

    renderHostsList();

    const testBtn = container.querySelector('#test-connection');
    const testResult = container.querySelector('#test-result');
    const saveBtn = container.querySelector('#save-settings');
    const openDashboardBtn = container.querySelector('#open-dashboard');
    const addDownloadBtn = container.querySelector('#add-download');
    const addHostInput = container.querySelector('#add-host-input');
    const addHostBtn = container.querySelector('#add-host-btn');

    testBtn.addEventListener('click', async () => {
      testResult.textContent = 'testing...';
      testResult.className = 'test-result testing';
      
      try {
        const rpcUrl = container.querySelector('#rpc-url').value.trim();
        const secret = container.querySelector('#rpc-secret').value.trim();
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
        rpcUrl: container.querySelector('#rpc-url').value.trim(),
        secret: container.querySelector('#rpc-secret').value.trim(),
        downloadPath: container.querySelector('#download-path').value.trim(),
        hijackDownloads: container.querySelector('#hijack-toggle').checked,
        safeMode: container.querySelector('#safe-mode-toggle').checked,
      });
      
      testResult.textContent = 'settings saved!';
      testResult.className = 'test-result success';
      
      setTimeout(() => {
        testResult.textContent = '';
      }, 2000);
    });

    addHostBtn.addEventListener('click', () => {
      const host = addHostInput.value.trim().toLowerCase();
      if (!host) return;
      if (currentHosts.includes(host)) {
        addHostInput.value = '';
        return;
      }
      currentHosts.push(host);
      chrome.storage.local.set({ aria2_safe_mode_hosts: currentHosts });
      addHostInput.value = '';
      renderHostsList();
    });

    addHostInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addHostBtn.click();
      }
    });

    if (openDashboardBtn) {
      openDashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/full.html') });
      });
    }

    if (addDownloadBtn) {
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
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.aria2_safe_mode_hosts) {
        currentHosts = changes.aria2_safe_mode_hosts.newValue || [...DEFAULT_SAFE_MODE_HOSTS];
        renderHostsList();
      }
    });
  });

  return container;
}

if (document.title && document.title.includes('Options')) {
  const root = document.getElementById('root');
  const app = OptionsApp(false);
  root.appendChild(app);
  app.dispatchEvent(new Event('mount'));
}
