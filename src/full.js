(function() {
const {
  getConfig,
  callAria2,
  getAria2Status,
  getFileName,
  formatBytes,
  formatSpeed,
  escapeHtml,
} = window.Aria2Shared;

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

async function moveDownload(gid, pos, how) {
  return callAria2('aria2.changePosition', [gid, pos, how]);
}

function FullApp() {
  const POLL_FAST_MS = 1000;
  const POLL_IDLE_MS = 2500;
  const POLL_ERROR_MS = 5000;
  let lastDataSignature = '';
  let state = {
    activeTab: 'active',
    downloads: { active: [], waiting: [], stopped: [] },
    globalStat: null,
    loading: true,
    error: null,
    showSettings: false,
    pollTimeout: null,
  };

  // DOM element references for updates
  let uiRefs = {
    statActive: null,
    statWaiting: null,
    statStopped: null,
    statSpeed: null,
    tabButtons: {},
    downloadList: null,
  };

  const container = document.createElement('div');
  container.className = 'app full-mode';

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

  const bodyEl = document.createElement('div');
  bodyEl.className = 'full-body';
  container.appendChild(bodyEl);

  const footer = document.createElement('footer');
  footer.innerHTML = `<p class="footer-text">aria2 dashboard</p>`;
  container.appendChild(footer);

  function initDashboard() {
    bodyEl.innerHTML = '';

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
            <p id="stat-active">0</p>
          </div>
        </div>
      </div>
      <div class="status-card">
        <div class="status-card-inner">
          <div class="status-dot status-dot--waiting"></div>
          <div>
            <h2>waiting</h2>
            <p id="stat-waiting">0</p>
          </div>
        </div>
      </div>
      <div class="status-card">
        <div class="status-card-inner">
          <div class="status-dot status-dot--stopped"></div>
          <div>
            <h2>stopped</h2>
            <p id="stat-stopped">0</p>
          </div>
        </div>
      </div>
      <div class="status-card">
        <div class="status-card-inner">
          <div class="status-dot status-dot--speed"></div>
          <div>
            <h2>download</h2>
            <p id="stat-speed" class="speed-value speed--zero">0 B/s</p>
          </div>
        </div>
      </div>
    `;
    uiRefs.statActive = sidebar.querySelector('#stat-active');
    uiRefs.statWaiting = sidebar.querySelector('#stat-waiting');
    uiRefs.statStopped = sidebar.querySelector('#stat-stopped');
    uiRefs.statSpeed = sidebar.querySelector('#stat-speed');

    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';

    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    ['active', 'waiting', 'stopped'].forEach(tab => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `tab ${state.activeTab === tab ? 'tab--active' : ''}`;
      tabBtn.dataset.tab = tab;
      tabBtn.innerHTML = `
        <span class="tab-dot tab-dot--${tab}"></span>
        ${tab}
        <span class="tab-count">0</span>
      `;
      tabBtn.addEventListener('click', () => {
        state.activeTab = tab;
        updateTabs();
        updateDownloadList();
      });
      tabs.appendChild(tabBtn);
      uiRefs.tabButtons[tab] = tabBtn;
    });

    const downloadList = document.createElement('div');
    downloadList.className = 'download-list';
    uiRefs.downloadList = downloadList;

    mainContent.appendChild(tabs);
    mainContent.appendChild(downloadList);

    dashboard.appendChild(sidebar);
    dashboard.appendChild(mainContent);
    bodyEl.appendChild(dashboard);
  }

  function updateStats() {
    if (!uiRefs.statActive) return;
    const speed = parseInt(state.globalStat?.downloadSpeed || 0);
    uiRefs.statActive.textContent = state.globalStat?.numActive || 0;
    uiRefs.statWaiting.textContent = state.globalStat?.numWaiting || 0;
    uiRefs.statStopped.textContent = state.globalStat?.numStopped || 0;
    uiRefs.statSpeed.textContent = formatSpeed(speed);
    uiRefs.statSpeed.className = `speed-value ${speed > 0 ? 'speed--active' : 'speed--zero'}`;
  }

  function updateTabs() {
    ['active', 'waiting', 'stopped'].forEach(tab => {
      const btn = uiRefs.tabButtons[tab];
      const count = state.downloads[tab]?.length || 0;
      btn.className = `tab ${state.activeTab === tab ? 'tab--active' : ''}`;
      btn.querySelector('.tab-count').textContent = count;
    });
  }

  function updateDownloadList() {
    const downloads = state.downloads[state.activeTab] || [];
    const listEl = uiRefs.downloadList;
    if (!listEl) return;

    if (downloads.length === 0) {
      if (listEl.dataset.empty !== 'true') {
        listEl.innerHTML = `
          <div class="empty-downloads-full">
            <svg class="empty-logo" viewBox="0 0 42 42" width="64" height="64">
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
            <div class="empty-downloads-full-title">no ${state.activeTab} downloads</div>
            <div class="empty-downloads-full-dots">
              <span class="dot dot--empty-anim"></span>
              <span class="dot dot--empty-anim"></span>
              <span class="dot dot--empty-anim"></span>
              <span class="dot dot--empty-anim"></span>
              <span class="dot dot--empty-anim"></span>
            </div>
          </div>`;
        listEl.dataset.empty = 'true';
      }
      return;
    }

    // Clear empty state if present
    if (listEl.dataset.empty === 'true') {
      listEl.innerHTML = '';
    }
    listEl.dataset.empty = 'false';

    // Get existing rows
    const existingRows = Array.from(listEl.querySelectorAll('.download-row'));
    const existingGids = new Map(existingRows.map(row => [row.dataset.gid, row]));
    const newGids = new Set(downloads.map(d => d.gid));

    // Remove rows that no longer exist
    existingRows.forEach(row => {
      if (!newGids.has(row.dataset.gid)) {
        row.remove();
      }
    });

    // Add or update rows
    downloads.forEach((download, index) => {
      const existingRow = existingGids.get(download.gid);
      if (existingRow) {
        // Update existing row in place
        updateDownloadRow(existingRow, download, index, downloads.length);
      } else {
        // Create new row
        const row = createDownloadRow(download, index, downloads.length);
        row.style.animationDelay = `${index * 0.04}s`;
        listEl.appendChild(row);
      }
    });
  }

  function updateDownloadRow(row, download, index, totalInTab) {
    const total = parseInt(download.totalLength) || 1;
    const completed = parseInt(download.completedLength);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const speed = parseInt(download.downloadSpeed) || 0;

    // Update text content
    row.querySelector('.download-title').textContent = getFileName(download);
    row.querySelector('.status-badge').textContent = download.status;
    row.querySelector('.status-badge').className = `status-badge status-badge--${download.status}`;

    const details = row.querySelector('.download-details');
    details.innerHTML = `
      <span><strong>${formatBytes(completed)}</strong> / ${formatBytes(total)}</span>
      <span>speed: <strong>${formatSpeed(speed)}</strong></span>
      <span>connections: <strong>${download.connections}</strong></span>
    `;

    // Update progress bar
    const progressBar = row.querySelector('.dot-progress');
    const dots = progressBar.querySelectorAll('.dot');
    const filledCount = Math.round((percent / 100) * dots.length);
    dots.forEach((dot, i) => {
      dot.className = `dot ${i < filledCount ? 'dot--filled' : ''}`;
    });
    row.querySelector('.progress-text').textContent = `${percent}%`;

    // Update active state
    row.className = 'download-row' + (download.status === 'active' ? ' row--active' : '');

    // Update action buttons visibility
    const actionsDiv = row.querySelector('.download-actions');
    const canMoveUp = state.activeTab === 'waiting' && index > 0;
    const canMoveDown = state.activeTab === 'waiting' && index < totalInTab - 1;

    // Only rebuild actions if the button configuration changed
    const hasMoveUp = !!actionsDiv.querySelector('.btn-move-up');
    const hasMoveDown = !!actionsDiv.querySelector('.btn-move-down');
    const hasPause = !!actionsDiv.querySelector('.btn-pause');
    const hasResume = !!actionsDiv.querySelector('.btn-resume');
    const hasStop = !!actionsDiv.querySelector('.btn-stop');
    const hasDelete = !!actionsDiv.querySelector('.btn-delete');

    const needsMoveUp = canMoveUp;
    const needsMoveDown = canMoveDown;
    const needsPause = download.status === 'active';
    const needsResume = download.status === 'paused';
    const needsStop = download.status === 'active' || download.status === 'waiting' || download.status === 'paused';
    const needsDelete = download.status === 'complete' || download.status === 'error' || download.status === 'removed';

    if (hasMoveUp !== needsMoveUp || hasMoveDown !== needsMoveDown ||
        hasPause !== needsPause || hasResume !== needsResume ||
        hasStop !== needsStop || hasDelete !== needsDelete) {
      actionsDiv.innerHTML = '';
      if (needsMoveUp) actionsDiv.appendChild(createActionButton('btn-move-up', download.gid, '▲ up', 'btn-dot-move'));
      if (needsMoveDown) actionsDiv.appendChild(createActionButton('btn-move-down', download.gid, '▼ down', 'btn-dot-move'));
      if (needsPause) actionsDiv.appendChild(createActionButton('btn-pause', download.gid, 'pause', 'btn-dot-pause'));
      if (needsResume) actionsDiv.appendChild(createActionButton('btn-resume', download.gid, 'resume', 'btn-dot-resume'));
      if (needsStop) actionsDiv.appendChild(createActionButton('btn-stop', download.gid, 'stop', 'btn-dot-stop'));
      if (needsDelete) actionsDiv.appendChild(createActionButton('btn-delete', download.gid, 'remove', 'btn-dot-delete'));
    }
  }

  function renderBody() {
    bodyEl.innerHTML = '';
    uiRefs = { statActive: null, statWaiting: null, statStopped: null, statSpeed: null, tabButtons: {}, downloadList: null };

    if (state.showSettings) {
      const settingsPanel = document.createElement('div');
      settingsPanel.className = 'embedded-options-panel';
      const optionsApp = OptionsApp(true);
      settingsPanel.appendChild(optionsApp);
      optionsApp.dispatchEvent(new Event('mount'));

      const closeBtn = optionsApp.querySelector('#btn-close-options');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          state.showSettings = false;
          initDashboard();
          updateStats();
          updateTabs();
          updateDownloadList();
          startPolling();
        });
      }

      bodyEl.appendChild(settingsPanel);
      return;
    }

    if (state.loading && !state.globalStat) {
      const loading = document.createElement('div');
      loading.className = 'loading-state';
      loading.innerHTML = `
        <div class="dot-progress">
          ${Array(10).fill(0).map((_, i) => `<span class="dot ${i < 3 ? 'dot--filled' : ''}" style="animation: pulse-dot 1s ease-in-out ${i * 0.1}s infinite"></span>`).join('')}
        </div>
        <span>connecting to aria2...</span>
      `;
      bodyEl.appendChild(loading);
      return;
    }

    if (state.error && !state.globalStat) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error';
      errorDiv.textContent = state.error;
      bodyEl.appendChild(errorDiv);
      return;
    }

    initDashboard();
    updateStats();
    updateTabs();
    updateDownloadList();
  }

  function createDownloadRow(download, index, totalInTab) {
    const total = parseInt(download.totalLength) || 1;
    const completed = parseInt(download.completedLength);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const speed = parseInt(download.downloadSpeed) || 0;
    const canMoveUp = state.activeTab === 'waiting' && index > 0;
    const canMoveDown = state.activeTab === 'waiting' && index < totalInTab - 1;

    const row = document.createElement('div');
    row.className = 'download-row' + (download.status === 'active' ? ' row--active' : '');
    row.dataset.gid = download.gid;

    const progressBar = document.createElement('div');
    progressBar.className = 'dot-progress';
    const dotCount = 20;
    for (let i = 0; i < dotCount; i++) {
      const dot = document.createElement('span');
      dot.className = `dot ${i < Math.round((percent / 100) * dotCount) ? 'dot--filled' : ''}`;
      progressBar.appendChild(dot);
    }

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
    `;

    const progressWrapper = document.createElement('div');
    progressWrapper.className = 'download-progress-full';

    const percentText = document.createElement('span');
    percentText.className = 'progress-text';
    percentText.textContent = `${percent}%`;

    progressWrapper.appendChild(progressBar);
    progressWrapper.appendChild(percentText);
    row.appendChild(progressWrapper);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'download-actions';

    if (canMoveUp) {
      actionsDiv.appendChild(createActionButton('btn-move-up', download.gid, '▲ up', 'btn-dot-move'));
    }
    if (canMoveDown) {
      actionsDiv.appendChild(createActionButton('btn-move-down', download.gid, '▼ down', 'btn-dot-move'));
    }

    if (download.status === 'active') {
      actionsDiv.appendChild(createActionButton('btn-pause', download.gid, 'pause', 'btn-dot-pause'));
    }
    if (download.status === 'paused') {
      actionsDiv.appendChild(createActionButton('btn-resume', download.gid, 'resume', 'btn-dot-resume'));
    }
    if (download.status === 'active' || download.status === 'waiting' || download.status === 'paused') {
      actionsDiv.appendChild(createActionButton('btn-stop', download.gid, 'stop', 'btn-dot-stop'));
    }
    if (download.status === 'complete' || download.status === 'error' || download.status === 'removed') {
      actionsDiv.appendChild(createActionButton('btn-delete', download.gid, 'remove', 'btn-dot-delete'));
    }

    row.appendChild(actionsDiv);
    return row;
  }

  function createActionButton(className, gid, label, dotClass) {
    const btn = document.createElement('button');
    btn.className = `btn btn-action ${className}`;
    btn.dataset.gid = gid;
    btn.innerHTML = `<span class="btn-dot-indicator ${dotClass}"></span>${label}`;
    btn.addEventListener('click', async () => {
      try {
        if (className === 'btn-pause') await pauseDownload(gid);
        else if (className === 'btn-resume') await unpauseDownload(gid);
        else if (className === 'btn-stop') await stopDownload(gid);
        else if (className === 'btn-delete') await removeDownload(gid);
        else if (className === 'btn-move-up') await moveDownload(gid, -1, 'POS_SET');
        else if (className === 'btn-move-down') await moveDownload(gid, 1, 'POS_SET');
        await loadData();
      } catch (err) {
        console.error('Action failed:', err);
      }
    });
    return btn;
  }

  function attachHeaderListeners() {
    container.querySelector('#btn-settings').addEventListener('click', () => {
      state.showSettings = !state.showSettings;
      if (state.showSettings) {
        stopPolling();
      }
      renderBody();
      if (!state.showSettings) {
        startPolling();
      }
    });

    container.querySelector('#btn-refresh').addEventListener('click', loadData);

    container.querySelector('#btn-add').addEventListener('click', () => {
      const url = prompt('Enter download URL:');
      if (url) {
        addDownload([url]).then(() => loadData()).catch(err => alert('Failed: ' + err.message));
      }
    });
  }

  async function loadData() {
    try {
      const data = await getAria2Status();
      state.downloads = {
        active: data.active,
        waiting: data.waiting,
        stopped: data.stopped,
      };
      state.globalStat = data.globalStat;
      state.loading = false;
      state.error = null;
    } catch (err) {
      state.error = err.message;
      state.loading = false;
    }

    // Only full re-render on initial load or tab/settings change
    // Otherwise do selective updates
    const dataSignature = JSON.stringify({
      active: state.downloads.active.map(d => d.gid),
      waiting: state.downloads.waiting.map(d => d.gid),
      stopped: state.downloads.stopped.map(d => d.gid),
    });

    const needsFullRender = !uiRefs.statActive || dataSignature !== lastDataSignature;

    if (needsFullRender) {
      lastDataSignature = dataSignature;
      renderBody();
    } else {
      // Selective updates - no DOM rebuild
      updateStats();
      updateTabs();
      updateDownloadList();
    }

    if (!state.showSettings) {
      const activeCount = parseInt(state.globalStat?.numActive || '0', 10) || 0;
      const delay = state.error ? POLL_ERROR_MS : (activeCount > 0 ? POLL_FAST_MS : POLL_IDLE_MS);
      state.pollTimeout = setTimeout(loadData, delay);
    }
  }

  function startPolling() {
    loadData();
  }

  function stopPolling() {
    if (state.pollTimeout) {
      clearTimeout(state.pollTimeout);
      state.pollTimeout = null;
    }
  }

  container.addEventListener('mount', () => {
    attachHeaderListeners();
    startPolling();
  });

  container.addEventListener('unmount', () => {
    stopPolling();
  });

  renderBody();
  return container;
}

const root = document.getElementById('root');
const app = FullApp();
root.appendChild(app);
app.dispatchEvent(new Event('mount'));

window.addEventListener('beforeunload', () => {
  app.dispatchEvent(new Event('unmount'));
});
})();
