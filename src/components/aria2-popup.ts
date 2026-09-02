import { LitElement, html, nothing } from "lit";
import { state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { applyTheme } from "../lib/theme";
import { getConfig, setHijackStatus, getAria2Status, callAria2, formatSpeed, escapeHtml, Aria2Status, Aria2Download } from "../lib/shared";
import "./aria2-logo";
import "./aria2-download-row";

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

export class Aria2Popup extends LitElement {
  @state() private _hijackEnabled = false;
  @state() private _activeCount = "-";
  @state() private _waitingCount = "-";
  @state() private _speed = "-";
  @state() private _downloads: Aria2Download[] = [];
  @state() private _recentCompleted: Aria2Download[] = [];
  @state() private _connectionStatus = "checking...";
  @state() private _connectionClass = "";
  @state() private _error: string | null = null;

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
    const config = await getConfig();
    this._hijackEnabled = config.hijackDownloads;
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
    let nextDelay = this._POLL_IDLE_MS;
    try {
      this._prevGids = this._knownGids;
      this._knownGids = new Set();

      const status: Aria2Status = await getAria2Status();
      const activeCount = parseInt(status.globalStat.numActive, 10) || 0;
      nextDelay = activeCount > 0 ? this._POLL_FAST_MS : this._POLL_IDLE_MS;

      this._activeCount = status.globalStat.numActive;
      this._waitingCount = status.globalStat.numWaiting;
      this._speed = formatSpeed(parseInt(status.globalStat.downloadSpeed));

      this._downloads = [...status.active, ...status.waiting.slice(0, 6)];
      this._recentCompleted = status.stopped
        .filter((d: Aria2Download) => d.status === "complete")
        .slice(0, 2);
      this._connectionStatus = "connected";
      this._connectionClass = "connected";
      this._error = null;

      for (const d of this._downloads) this._knownGids.add(d.gid);
      for (const d of this._recentCompleted) this._knownGids.add(d.gid);
    } catch (err) {
      nextDelay = this._POLL_ERROR_MS;
      this._connectionStatus = "disconnected";
      this._connectionClass = "disconnected";
      this._error = (err as Error).message;
    }
    this._pollTimeout = window.setTimeout(() => this._loadData(), nextDelay);
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

  private _onHijackChange(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    this._hijackEnabled = checked;
    setHijackStatus(checked);
  }

  private _openFull(e: Event) {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("src/entries/full.html") });
  }

  render() {
    const firstWaitingIdx = this._downloads.findIndex(d => d.status === "waiting");
    const waitingCount = this._downloads.filter(d => d.status === "waiting").length;

    return html`
      <div class="app popup-mode">
        <header class="header">
          <div class="logo-container">
            <aria2-logo size="28"></aria2-logo>
            <div>
              <h1 class="title">aria2</h1>
              <span class="subtitle">dashboard</span>
            </div>
          </div>
          <div class="header-actions">
            <label class="toggle-switch header-toggle" title="Hijack browser downloads">
              <input type="checkbox" ?checked=${this._hijackEnabled} @change=${this._onHijackChange}>
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-icon" @click=${this._openFull} title="Open full dashboard">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </header>

        <main class="main popup-content">
          <div class="popup-topbar">
            <div class="compact-stats">
              <div class="compact-stat">
                <span class="compact-stat-value">${this._activeCount}</span>
                <span class="compact-stat-label">active</span>
              </div>
              <div class="compact-stat">
                <span class="compact-stat-value">${this._waitingCount}</span>
                <span class="compact-stat-label">waiting</span>
              </div>
              <div class="compact-stat">
                <span class="compact-stat-value">${this._speed}</span>
                <span class="compact-stat-label">speed</span>
              </div>
            </div>
          </div>

          <div class="downloads-section popup-downloads">
            <div class="downloads-list" @download-action=${this._handleAction}>
              ${this._error
                ? html`<div class="empty-state error">${escapeHtml(this._error)}</div>`
                : this._downloads.length === 0 && this._recentCompleted.length === 0
                  ? html`
                    <div class="empty-downloads">
                      <div class="empty-downloads-dots">
                        ${Array.from({ length: 8 }, (_, i) => html`<span class="dot dot--empty-anim" style="--i:${i}"></span>`)}
                      </div>
                      <div class="empty-downloads-text">idle</div>
                    </div>`
                  : html`
                    ${repeat(this._downloads, (d) => d.gid, (d, i) => {
                      const isWaiting = d.status === "waiting" || (firstWaitingIdx >= 0 && i >= firstWaitingIdx);
                      const widx = isWaiting ? i - firstWaitingIdx : -1;
                      return html`
                        <aria2-download-row
                          .download=${d}
                          .compact=${true}
                          .waitingIndex=${widx}
                          .totalWaiting=${waitingCount}
                          style="animation-delay:${this._prevGids.has(d.gid) ? "0s" : i * 0.04 + "s"}"
                        ></aria2-download-row>`;
                    })}
                    ${this._recentCompleted.length > 0 ? html`
                      <div class="recent-header">
                        <span class="recent-header-dot"></span>recent<span class="recent-header-dot"></span>
                      </div>
                      ${repeat(this._recentCompleted, (d) => d.gid, (d, i) => html`
                        <aria2-download-row
                          .download=${d}
                          .compact=${true}
                          style="animation-delay:${this._prevGids.has(d.gid) ? "0s" : (this._downloads.length + i) * 0.04 + "s"}"
                        ></aria2-download-row>
                      `)}
                    ` : nothing}
                  `}
            </div>
          </div>
        </main>

        <footer class="popup-footer">
          <a href="#" class="link-open-full" @click=${this._openFull}>open full dashboard</a>
          <span class="connection-status ${this._connectionClass}">${this._connectionStatus}</span>
        </footer>
      </div>
    `;
  }
}

customElements.define("aria2-popup", Aria2Popup);

const root = document.getElementById("root");
if (root) {
  root.appendChild(document.createElement("aria2-popup"));
}