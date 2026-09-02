import { LitElement, html, nothing } from "lit";
import { property } from "lit/decorators.js";
import { Aria2Download, getFileName, formatBytes, formatSpeed, escapeHtml } from "../lib/shared";

function formatCompletedTime(unixSeconds: string): string {
  const date = new Date(parseInt(unixSeconds, 10) * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "yesterday " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays < 7) return diffDays + "d ago";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export class Aria2DownloadRow extends LitElement {
  @property({ type: Object }) download: Aria2Download | null = null;
  @property({ type: Boolean }) compact = false;
  @property({ type: Number }) waitingIndex = -1;
  @property({ type: Number }) totalWaiting = 0;
  @property({ type: Number }) listIndex = 0;
  @property({ type: Number }) totalInTab = 0;

  createRenderRoot() { return this; }

  private _dispatch(action: string) {
    this.dispatchEvent(new CustomEvent("download-action", {
      detail: { action, gid: this.download?.gid },
      bubbles: true,
    }));
  }

  render() {
    const d = this.download;
    if (!d) return nothing;

    if (this.compact) return this._renderCompact(d);
    return this._renderFull(d);
  }

  private _renderCompact(d: Aria2Download) {
    const total = parseInt(d.totalLength) || 1;
    const completed = parseInt(d.completedLength);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const canMoveUp = this.waitingIndex > 0;
    const canMoveDown = this.waitingIndex >= 0 && this.waitingIndex < this.totalWaiting - 1;
    const isRecent = d.status === "complete";

    if (isRecent) return this._renderRecentCompact(d, total, percent);

    return html`
      <div class="download-item popup-item ${d.status === "active" ? "row--active" : ""}">
        <div class="download-row-content">
          <div class="download-info">
            <div class="download-name" title="${escapeHtml(getFileName(d))}">${escapeHtml(getFileName(d))}</div>
            <div class="download-meta">
              <span class="status-badge status-${d.status}">${d.status}</span>
              <span class="download-size">${formatBytes(completed)} / ${formatBytes(total)}</span>
            </div>
          </div>
          <div class="download-actions-compact">
            ${canMoveUp ? html`<button class="btn-action-icon btn-move-up" @click=${() => this._dispatch("move-up")} title="Move up">▲</button>` : nothing}
            ${canMoveDown ? html`<button class="btn-action-icon btn-move-down" @click=${() => this._dispatch("move-down")} title="Move down">▼</button>` : nothing}
            ${d.status === "active" ? html`<button class="btn-action-icon btn-pause" @click=${() => this._dispatch("pause")} title="Pause">⏸</button>` : nothing}
            ${d.status === "paused" ? html`<button class="btn-action-icon btn-resume" @click=${() => this._dispatch("resume")} title="Resume">▶</button>` : nothing}
            ${d.status === "active" || d.status === "waiting" || d.status === "paused" ? html`<button class="btn-action-icon btn-stop" @click=${() => this._dispatch("stop")} title="Stop">⏹</button>` : nothing}
          </div>
        </div>
        <div class="download-progress">
          ${this._renderDotProgressMini(percent)}
          <span class="progress-text">${percent}%</span>
        </div>
      </div>
    `;
  }

  private _renderRecentCompact(d: Aria2Download, total: number, percent: number) {
    const completedTime = d.completedTime ? formatCompletedTime(d.completedTime) : "";

    return html`
      <div class="download-item popup-item">
        <div class="download-row-content">
          <div class="download-info">
            <div class="download-name" title="${escapeHtml(getFileName(d))}">${escapeHtml(getFileName(d))}</div>
            <div class="download-meta">
              <span class="status-badge status-complete">complete</span>
              ${completedTime ? html`<span class="recent-time">${completedTime}</span>` : nothing}
              <span class="download-size">${formatBytes(total)}</span>
            </div>
          </div>
          <div class="download-actions-compact">
            <button class="btn-action-icon btn-delete" @click=${() => this._dispatch("remove")} title="Remove">🗑</button>
          </div>
        </div>
        <div class="download-progress">
          ${this._renderDotProgressMini(percent)}
          <span class="progress-text">${percent}%</span>
        </div>
      </div>
    `;
  }

  private _renderFull(d: Aria2Download) {
    const total = parseInt(d.totalLength) || 1;
    const completed = parseInt(d.completedLength);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const speed = parseInt(d.downloadSpeed) || 0;
    const canMoveUp = this.listIndex > 0;
    const canMoveDown = this.listIndex < this.totalInTab - 1;

    const completedTime = d.completedTime ? formatCompletedTime(d.completedTime) : null;

    let detailsHTML = html`<span><strong>${formatBytes(completed)}</strong> / ${formatBytes(total)}</span>`;
    if (d.status === "active") {
      detailsHTML = html`${detailsHTML}
        <span>speed: <strong>${formatSpeed(speed)}</strong></span>
        <span>connections: <strong>${d.connections}</strong></span>`;
    }
    if (completedTime) {
      detailsHTML = html`${detailsHTML}
        <span>completed: <strong>${completedTime}</strong></span>`;
    }

    const dotCount = 20;
    const filledDots = Math.round((percent / 100) * dotCount);
    const dots = Array.from({ length: dotCount }, (_, i) =>
      html`<span class="dot ${i < filledDots ? "dot--filled" : ""}" style="--i:${i}"></span>`
    );

    return html`
      <div class="download-row ${d.status === "active" ? "row--active" : ""}" data-gid=${d.gid}>
        <div class="download-row-header">
          <span class="download-title">${escapeHtml(getFileName(d))}</span>
          <span class="status-badge status-badge--${d.status}">${d.status}</span>
        </div>
        <div class="download-details">
          ${detailsHTML}
        </div>
        <div class="download-progress-full">
          <div class="dot-progress">${dots}</div>
          <span class="progress-text">${percent}%</span>
        </div>
        <div class="download-actions">
          ${canMoveUp ? html`<button class="btn btn-action btn-move-up" @click=${() => this._dispatch("move-up")}><span class="btn-dot-indicator btn-dot-move"></span>▲ up</button>` : nothing}
          ${canMoveDown ? html`<button class="btn btn-action btn-move-down" @click=${() => this._dispatch("move-down")}><span class="btn-dot-indicator btn-dot-move"></span>▼ down</button>` : nothing}
          ${d.status === "active" ? html`<button class="btn btn-action btn-pause" @click=${() => this._dispatch("pause")}><span class="btn-dot-indicator btn-dot-pause"></span>pause</button>` : nothing}
          ${d.status === "paused" ? html`<button class="btn btn-action btn-resume" @click=${() => this._dispatch("resume")}><span class="btn-dot-indicator btn-dot-resume"></span>resume</button>` : nothing}
          ${d.status === "active" || d.status === "waiting" || d.status === "paused" ? html`<button class="btn btn-action btn-stop" @click=${() => this._dispatch("stop")}><span class="btn-dot-indicator btn-dot-stop"></span>stop</button>` : nothing}
          ${d.status === "complete" || d.status === "error" || d.status === "removed" ? html`<button class="btn btn-action btn-delete" @click=${() => this._dispatch("remove")}><span class="btn-dot-indicator btn-dot-delete"></span>remove</button>` : nothing}
        </div>
      </div>
    `;
  }

  private _renderDotProgressMini(percent: number) {
    return html`
      <div class="dot-progress mini">
        ${Array.from({ length: 12 }, (_, i) =>
          html`<span class="dot ${i < Math.round((percent / 100) * 12) ? "filled" : ""}" style="--i:${i}"></span>`
        )}
      </div>
    `;
  }
}

customElements.define("aria2-download-row", Aria2DownloadRow);