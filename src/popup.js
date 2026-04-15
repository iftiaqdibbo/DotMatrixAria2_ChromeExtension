(function() {
const {
  getConfig,
  setHijackStatus,
  callAria2,
  getAria2Status,
  getFileName,
  formatBytes,
  formatSpeed,
  escapeHtml,
} = window.Aria2Shared;

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

function PopupApp() {
  let pollTimeout;
  const POLL_FAST_MS = 1000;
  const POLL_IDLE_MS = 2500;
  const POLL_ERROR_MS = 5000;

  const container = document.createElement('div');
  container.className = 'app popup-mode';

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
        <span class="subtitle">dashboard</span>
      </div>
    </div>
    <div class="header-actions">
      <label class="toggle-switch header-toggle" title="Hijack browser downloads">
        <input type="checkbox" id="hijack-toggle">
        <span class="toggle-slider"></span>
      </label>
      <button class="btn-icon" id="open-options" title="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  `;

  const content = document.createElement('main');
  content.className = 'main popup-content';
  container.appendChild(header);
  container.appendChild(content);

  const footer = document.createElement('footer');
  footer.className = 'popup-footer';
  footer.innerHTML = `
    <a href="#" class="link-open-full" id="open-full">open full dashboard</a>
    <span class="connection-status" id="connection-status">checking...</span>
  `;
  container.appendChild(footer);

  function renderDashboard() {
    content.innerHTML = '';

    const topBar = document.createElement('div');
    topBar.className = 'popup-topbar';
    topBar.innerHTML = `
      <div class="compact-stats">
        <div class="compact-stat">
          <span class="compact-stat-value" id="stat-active">-</span>
          <span class="compact-stat-label">active</span>
        </div>
        <div class="compact-stat">
          <span class="compact-stat-value" id="stat-waiting">-</span>
          <span class="compact-stat-label">waiting</span>
        </div>
        <div class="compact-stat">
          <span class="compact-stat-value" id="stat-speed">-</span>
          <span class="compact-stat-label">speed</span>
        </div>
      </div>
    `;

    const downloadsSection = document.createElement('div');
    downloadsSection.className = 'downloads-section popup-downloads';
    downloadsSection.innerHTML = `
      <div class="downloads-list" id="downloads-list">
        <div class="empty-state">loading...</div>
      </div>
    `;

    content.appendChild(topBar);
    content.appendChild(downloadsSection);
  }

  async function loadData() {
    let nextDelay = POLL_IDLE_MS;
    try {
      const { globalStat, active, waiting, stopped } = await getAria2Status();
      const activeCount = parseInt(globalStat.numActive, 10) || 0;
      nextDelay = activeCount > 0 ? POLL_FAST_MS : POLL_IDLE_MS;
      
      const statActive = document.getElementById('stat-active');
      const statWaiting = document.getElementById('stat-waiting');
      const statSpeed = document.getElementById('stat-speed');
      
      if (statActive) statActive.textContent = globalStat.numActive;
      if (statWaiting) statWaiting.textContent = globalStat.numWaiting;
      if (statSpeed) statSpeed.textContent = formatSpeed(parseInt(globalStat.downloadSpeed));
      
      const listEl = document.getElementById('downloads-list');
      if (listEl) {
        const allDownloads = [...active, ...waiting.slice(0, 6)];
        
        if (allDownloads.length === 0) {
          listEl.innerHTML = `
            <div class="empty-downloads">
              <div class="empty-downloads-dots">
                <span class="dot dot--empty-anim" style="animation-delay: 0s"></span>
                <span class="dot dot--empty-anim" style="animation-delay: 0.15s"></span>
                <span class="dot dot--empty-anim" style="animation-delay: 0.3s"></span>
                <span class="dot dot--empty-anim" style="animation-delay: 0.45s"></span>
                <span class="dot dot--empty-anim" style="animation-delay: 0.6s"></span>
                <span class="dot dot--empty-anim" style="animation-delay: 0.75s"></span>
                <span class="dot dot--empty-anim" style="animation-delay: 0.9s"></span>
                <span class="dot dot--empty-anim" style="animation-delay: 1.05s"></span>
              </div>
              <div class="empty-downloads-text">idle</div>
            </div>`;
        } else {
          listEl.innerHTML = '';
          allDownloads.forEach((d, i) => {
            const waitingIndex = i - active.length;
            const isWaiting = d.status === 'waiting' || d.status === 'paused';
            listEl.appendChild(createDownloadRow(d, isWaiting ? waitingIndex : -1, waiting.length));
          });
        }
      }
      
      const connStatus = document.getElementById('connection-status');
      if (connStatus) {
        connStatus.textContent = 'connected';
        connStatus.className = 'connection-status connected';
      }
    } catch (err) {
      nextDelay = POLL_ERROR_MS;
      const connStatus = document.getElementById('connection-status');
      if (connStatus) {
        connStatus.textContent = 'disconnected';
        connStatus.className = 'connection-status disconnected';
      }
      const listEl = document.getElementById('downloads-list');
      if (listEl) {
        listEl.innerHTML = '<div class="empty-state error">' + escapeHtml(err.message) + '</div>';
      }
    }
    pollTimeout = setTimeout(loadData, nextDelay);
  }

  function createDownloadRow(download, waitingIndex, totalWaiting) {
    const total = parseInt(download.totalLength) || 1;
    const completed = parseInt(download.completedLength);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const canMoveUp = waitingIndex > 0;
    const canMoveDown = waitingIndex >= 0 && waitingIndex < totalWaiting - 1;
    
    const row = document.createElement('div');
    row.className = 'download-item popup-item';
    row.innerHTML = `
      <div class="download-row-content">
        <div class="download-info">
          <div class="download-name" title="${escapeHtml(getFileName(download))}">${escapeHtml(getFileName(download))}</div>
          <div class="download-meta">
            <span class="status-badge status-${download.status}">${download.status}</span>
            <span class="download-size">${formatBytes(completed)} / ${formatBytes(total)}</span>
          </div>
        </div>
        <div class="download-actions-compact">
          ${canMoveUp ? `
            <button class="btn-action-icon btn-move-up" data-gid="${download.gid}" title="Move up">▲</button>
          ` : ''}
          ${canMoveDown ? `
            <button class="btn-action-icon btn-move-down" data-gid="${download.gid}" title="Move down">▼</button>
          ` : ''}
          ${download.status === 'active' ? `
            <button class="btn-action-icon btn-pause" data-gid="${download.gid}" title="Pause">⏸</button>
          ` : ''}
          ${download.status === 'paused' ? `
            <button class="btn-action-icon btn-resume" data-gid="${download.gid}" title="Resume">▶</button>
          ` : ''}
          ${download.status === 'active' || download.status === 'waiting' || download.status === 'paused' ? `
            <button class="btn-action-icon btn-stop" data-gid="${download.gid}" title="Stop">⏹</button>
          ` : ''}
          ${download.status === 'complete' || download.status === 'error' || download.status === 'removed' ? `
            <button class="btn-action-icon btn-delete" data-gid="${download.gid}" title="Remove">🗑</button>
          ` : ''}
        </div>
      </div>
      <div class="download-progress">
        ${renderDotProgress(percent)}
        <span class="progress-text">${percent}%</span>
      </div>
    `;
    
    row.querySelectorAll('.btn-action-icon').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gid = btn.dataset.gid;
        try {
          if (btn.classList.contains('btn-pause')) await pauseDownload(gid);
          else if (btn.classList.contains('btn-resume')) await unpauseDownload(gid);
          else if (btn.classList.contains('btn-stop')) await stopDownload(gid);
          else if (btn.classList.contains('btn-delete')) await removeDownload(gid);
          else if (btn.classList.contains('btn-move-up')) await moveDownload(gid, -1, 'POS_SET');
          else if (btn.classList.contains('btn-move-down')) await moveDownload(gid, 1, 'POS_SET');
          await loadData();
        } catch (err) {
          console.error('Action failed:', err);
        }
      });
    });
    
    return row;
  }

  function renderDotProgress(percent) {
    const totalDots = 12;
    const filledDots = Math.round((percent / 100) * totalDots);
    let dots = '';
    for (let i = 0; i < totalDots; i++) {
      dots += `<span class="dot ${i < filledDots ? 'filled' : ''}"></span>`;
    }
    return `<div class="dot-progress mini">${dots}</div>`;
  }

  container.addEventListener('mount', async () => {
    const config = await getConfig();
    document.getElementById('hijack-toggle').checked = config.hijackDownloads;
    
    renderDashboard();
    loadData();
    
    document.getElementById('open-options').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    
    document.getElementById('open-full').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('src/full.html') });
    });
    
    document.getElementById('hijack-toggle').addEventListener('change', (e) => {
      setHijackStatus(e.target.checked);
    });
  });

  container.addEventListener('unmount', () => {
    if (pollTimeout) clearTimeout(pollTimeout);
  });

  return container;
}

const root = document.getElementById('root');
const app = PopupApp();
root.appendChild(app);
app.dispatchEvent(new Event('mount'));

window.addEventListener('unload', () => {
  app.dispatchEvent(new Event('unmount'));
});
})();
