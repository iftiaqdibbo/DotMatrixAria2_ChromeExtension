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
  let lastRenderSignature = '';
  let state = {
    activeTab: 'active',
    downloads: { active: [], waiting: [], stopped: [] },
    globalStat: null,
    loading: true,
    error: null,
    showSettings: false,
    pollTimeout: null,
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

  function renderBody() {
    bodyEl.innerHTML = '';

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
          renderBody();
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
        renderBody();
      });
      tabs.appendChild(tabBtn);
    });

    const downloadList = document.createElement('div');
    downloadList.className = 'download-list';

    const downloads = state.downloads[state.activeTab] || [];
    if (downloads.length === 0) {
      downloadList.innerHTML = `
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
    } else {
      downloads.forEach((download, i) => {
        downloadList.appendChild(createDownloadRow(download, i, downloads.length));
      });
    }

    mainContent.appendChild(tabs);
    mainContent.appendChild(downloadList);

    dashboard.appendChild(sidebar);
    dashboard.appendChild(mainContent);
    bodyEl.appendChild(dashboard);
  }

  function createDownloadRow(download, index, totalInTab) {
    const total = parseInt(download.totalLength) || 1;
    const completed = parseInt(download.completedLength);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const speed = parseInt(download.downloadSpeed) || 0;
    const canMoveUp = state.activeTab === 'waiting' && index > 0;
    const canMoveDown = state.activeTab === 'waiting' && index < totalInTab - 1;

    const row = document.createElement('div');
    row.className = 'download-row';
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
    const previousSignature = JSON.stringify({
      activeTab: state.activeTab,
      showSettings: state.showSettings,
      error: state.error,
      globalStat: state.globalStat,
      active: state.downloads.active.map(d => [d.gid, d.status, d.completedLength, d.downloadSpeed, d.connections]),
      waiting: state.downloads.waiting.map(d => [d.gid, d.status, d.completedLength, d.downloadSpeed, d.connections]),
      stopped: state.downloads.stopped.map(d => [d.gid, d.status, d.completedLength]),
    });
    if (state.loading && state.globalStat) {
    } else {
      state.loading = true;
    }

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
    const nextSignature = JSON.stringify({
      activeTab: state.activeTab,
      showSettings: state.showSettings,
      error: state.error,
      globalStat: state.globalStat,
      active: state.downloads.active.map(d => [d.gid, d.status, d.completedLength, d.downloadSpeed, d.connections]),
      waiting: state.downloads.waiting.map(d => [d.gid, d.status, d.completedLength, d.downloadSpeed, d.connections]),
      stopped: state.downloads.stopped.map(d => [d.gid, d.status, d.completedLength]),
    });
    if (nextSignature !== previousSignature || nextSignature !== lastRenderSignature) {
      lastRenderSignature = nextSignature;
      renderBody();
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
