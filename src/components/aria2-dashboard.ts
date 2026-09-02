import { LitElement, html, nothing } from "lit";
import { state, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { applyTheme } from "../lib/theme";
import {
  getConfig,
  getAria2Status,
  callAria2,
  getFileName,
  formatSpeed,
  escapeHtml,
  Aria2Status,
  Aria2Download,
  Aria2GlobalStat,
} from "../lib/shared";
import "./aria2-logo";
import "./aria2-download-row";
import "./aria2-options";

async function addDownload(urls: string[], options: Record<string, string> = {}) {
  const config = await getConfig();
  const params: unknown[] = [urls];
  if (config.downloadPath || options.dir) {
    params.push({ dir: options.dir || config.downloadPath, ...options });
  } else if (Object.keys(options).length > 0) {
    params.push(options);
  }
  return callAria2("aria2.addUri", params);
}

async function pauseDownload(gid: string) {
  return callAria2("aria2.pause", [gid]);
}

async function unpauseDownload(gid: string) {
  return callAria2("aria2.unpause", [gid]);
}

async function stopDownload(gid: string) {
  return callAria2("aria2.remove", [gid]);
}

async function removeDownload(gid: string) {
  try { await callAria2("aria2.forceRemove", [gid]); } catch {}
  return callAria2("aria2.removeDownloadResult", [gid]);
}

async function moveDownload(gid: string, pos: number, how: string) {
  return callAria2("aria2.changePosition", [gid, pos, how]);
}

interface DashboardDownloads {
  active: Aria2Download[];
  waiting: Aria2Download[];
  stopped: Aria2Download[];
}

declare global {
  interface Window {
    FullApp: () => HTMLElement;
  }
}

export class Aria2Dashboard extends LitElement {
  @property({ type: Boolean }) embedded = false;
  @state() private _showSettings = false;
  @state() private _globalStat: Aria2GlobalStat | null = null;
  @state() private _downloads: DashboardDownloads = { active: [], waiting: [], stopped: [] };
  @state() private _activeTab: keyof DashboardDownloads = "active";
  @state() private _searchQuery = "";
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _showAddDialog = false;
  @state() private _addUrl = "";
  @state() private _addError = "";

  private _pollTimeout: number | null = null;
  private _POLL_FAST_MS = 1000;
  private _POLL_IDLE_MS = 2500;
  private _POLL_ERROR_MS = 5000;
  private _knownGids = new Set<string>();
  private _prevGids = new Set<string>();

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    await applyTheme();
    this._startPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopPolling();
  }

  private _startPolling() {
    this._loadData();
  }

  private _stopPolling() {
    if (this._pollTimeout !== null) {
      clearTimeout(this._pollTimeout);
      this._pollTimeout = null;
    }
  }

  private async _loadData() {
    try {
      this._prevGids = this._knownGids;
      this._knownGids = new Set();

      const data: Aria2Status = await getAria2Status();
      this._downloads = { active: data.active, waiting: data.waiting, stopped: data.stopped };
      this._globalStat = data.globalStat;
      this._loading = false;
      this._error = null;

      for (const list of Object.values(this._downloads)) {
        for (const d of list) this._knownGids.add(d.gid);
      }
    } catch (err) {
      this._error = (err as Error).message;
      this._loading = false;
    }

      if (!this._showSettings) {
        const activeCount = parseInt(this._globalStat?.numActive || "0", 10) || 0;
        const delay = this._error ? this._POLL_ERROR_MS : activeCount > 0 ? this._POLL_FAST_MS : this._POLL_IDLE_MS;
        this._pollTimeout = window.setTimeout(() => this._loadData(), delay);
      }
  }

  private async _handleAction(e: CustomEvent) {
    const { action, gid } = e.detail;
    try {
      switch (action) {
        case "pause": await pauseDownload(gid); break;
        case "resume": await unpauseDownload(gid); break;
        case "stop": await stopDownload(gid); break;
        case "remove": await removeDownload(gid); break;
        case "move-up": await moveDownload(gid, -1, "POS_CUR"); break;
        case "move-down": await moveDownload(gid, 1, "POS_CUR"); break;
      }
      await this._loadData();
    } catch (err) {
      console.error("Action failed:", err);
    }
  }

  private _addDownload() {
    this._addUrl = "";
    this._addError = "";
    this._showAddDialog = true;
  }

  private async _confirmAddDownload() {
    const url = this._addUrl.trim();
    if (!url) return;
    try {
      await addDownload([url]);
      this._showAddDialog = false;
      this._addUrl = "";
      this._addError = "";
      await this._loadData();
    } catch (err) {
      this._addError = (err as Error).message;
    }
  }

  private _cancelAddDownload() {
    this._showAddDialog = false;
    this._addUrl = "";
    this._addError = "";
  }

  private _refresh() {
    this._loadData();
  }

  private _toggleSettings() {
    this._showSettings = !this._showSettings;
    if (this._showSettings) {
      this._stopPolling();
    } else {
      this._startPolling();
    }
  }

  private _onSettingsSaved() {
    this._toggleSettings();
  }

  get _filteredDownloads(): Aria2Download[] {
    let downloads = this._downloads[this._activeTab] || [];
    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      downloads = downloads.filter((d) => getFileName(d).toLowerCase().includes(q));
    }
    return downloads;
  }

  render() {
    if (this._showSettings) {
      return html`
        <div class="app full-mode">
          <header class="header">
            <div class="logo-container">
              <aria2-logo size="32"></aria2-logo>
              <div>
                <h1 class="title">aria2</h1>
                <span class="subtitle">settings</span>
              </div>
            </div>
            <div class="header-actions">
              <button class="btn-icon" @click=${this._toggleSettings} title="Close Settings">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </header>
          <div class="main options-content">
            <aria2-options
              @settings-saved=${this._onSettingsSaved}
            ></aria2-options>
          </div>
        </div>
      `;
    }

    if (this._loading && !this._globalStat) {
      return html`
        <div class="app full-mode">
          <header class="header">
            <div class="logo-container">
              <aria2-logo size="32"></aria2-logo>
              <div>
                <h1 class="title">aria2</h1>
                <span class="subtitle">dashboard</span>
              </div>
            </div>
            <div class="header-actions">
              <button class="btn-icon" @click=${this._toggleSettings} title="Settings">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </div>
          </header>
          <div class="loading-state">
            <div class="dot-progress">
              ${Array.from({ length: 10 }, (_, i) =>
                html`<span class="dot ${i < 3 ? "dot--filled" : ""}" style="animation: pulse-dot 1s ease-in-out ${i * 0.1}s infinite"></span>`
              )}
            </div>
            <span>connecting to aria2...</span>
          </div>
          <footer><p class="footer-text">aria2 dashboard</p></footer>
        </div>
      `;
    }

    if (this._error && !this._globalStat) {
      return html`
        <div class="app full-mode">
          <header class="header">
            <div class="logo-container">
              <aria2-logo size="32"></aria2-logo>
              <div>
                <h1 class="title">aria2</h1>
                <span class="subtitle">dashboard</span>
              </div>
            </div>
            <div class="header-actions">
              <button class="btn-icon" @click=${this._toggleSettings} title="Settings">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </div>
          </header>
          <div class="error">${escapeHtml(this._error)}</div>
          <footer><p class="footer-text">aria2 dashboard</p></footer>
        </div>
      `;
    }

    const speed = parseInt(this._globalStat?.downloadSpeed || "0", 10);
    const filtered = this._filteredDownloads;

    return html`
      <div class="app full-mode">
        <header class="header">
          <div class="logo-container">
            <aria2-logo size="32"></aria2-logo>
            <div>
              <h1 class="title">aria2</h1>
              <span class="subtitle">dashboard</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="btn-icon" @click=${this._toggleSettings} title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <button class="btn-icon" @click=${this._addDownload} title="Add Download">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button class="btn-icon" @click=${this._refresh} title="Refresh">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          </div>
        </header>

        <div class="dashboard-layout">
          <div class="sidebar">
            <div class="status-card">
              <div class="status-card-inner">
                <div class="status-dot status-dot--active"></div>
                <div>
                  <h2>active</h2>
                  <p>${this._globalStat?.numActive || 0}</p>
                </div>
              </div>
            </div>
            <div class="status-card">
              <div class="status-card-inner">
                <div class="status-dot status-dot--waiting"></div>
                <div>
                  <h2>waiting</h2>
                  <p>${this._globalStat?.numWaiting || 0}</p>
                </div>
              </div>
            </div>
            <div class="status-card">
              <div class="status-card-inner">
                <div class="status-dot status-dot--stopped"></div>
                <div>
                  <h2>stopped</h2>
                  <p>${this._globalStat?.numStopped || 0}</p>
                </div>
              </div>
            </div>
            <div class="status-card">
              <div class="status-card-inner">
                <div class="status-dot status-dot--speed"></div>
                <div>
                  <h2>download</h2>
                  <p class="speed-value ${speed > 0 ? "speed--active" : "speed--zero"}">${formatSpeed(speed)}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="main-content">
            <div class="search-bar">
              <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" class="search-input" placeholder="filter downloads..."
                .value=${this._searchQuery} @input=${(e: Event) => this._searchQuery = (e.target as HTMLInputElement).value}>
            </div>

            <div class="tabs">
              ${(["active", "waiting", "stopped"] as const).map(tab => html`
                <button class="tab ${this._activeTab === tab ? "tab--active" : ""}" @click=${() => { this._activeTab = tab; }}>
                  <span class="tab-dot tab-dot--${tab}"></span>
                  ${tab}
                  <span class="tab-count">${(this._downloads[tab] || []).length}</span>
                </button>
              `)}
            </div>

            <div class="download-list" @download-action=${this._handleAction}>
              ${filtered.length === 0
                ? html`
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
                    <div class="empty-downloads-full-title">no ${this._activeTab} downloads</div>
                    <div class="empty-downloads-full-dots">
                      ${Array.from({ length: 5 }, (_, i) => html`<span class="dot dot--empty-anim" style="--i:${i}"></span>`)}
                    </div>
                  </div>`
                : repeat(filtered, (d) => d.gid, (d, i) => html`
                  <aria2-download-row
                    .download=${d}
                    .compact=${false}
                    .listIndex=${i}
                    .totalInTab=${filtered.length}
                    style="animation-delay:${this._prevGids.has(d.gid) ? "0s" : i * 0.04 + "s"}"
                  ></aria2-download-row>
                `)}
            </div>
          </div>
        </div>

        <footer><p class="footer-text">aria2 dashboard</p></footer>
      </div>

      ${this._showAddDialog ? html`
        <div class="modal-overlay" @click=${this._cancelAddDownload}>
          <div class="modal-dialog" @click=${(e: Event) => e.stopPropagation()}>
            <h3 class="modal-title">add download</h3>
            <input type="text" class="input modal-input" placeholder="Enter download URL"
              .value=${this._addUrl} @input=${(e: Event) => this._addUrl = (e.target as HTMLInputElement).value}
              @keydown=${(e: Event) => { if ((e as KeyboardEvent).key === "Enter") this._confirmAddDownload(); }}>
            ${this._addError ? html`<div class="modal-error">${escapeHtml(this._addError)}</div>` : nothing}
            <div class="modal-actions">
              <button class="btn btn-primary" @click=${this._confirmAddDownload}>add</button>
              <button class="btn btn-secondary" @click=${this._cancelAddDownload}>cancel</button>
            </div>
          </div>
        </div>` : nothing}
    `;
  }
}

customElements.define("aria2-dashboard", Aria2Dashboard);

window.FullApp = () => document.createElement("aria2-dashboard");