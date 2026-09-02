import { LitElement, html, nothing } from "lit";
import { state, property } from "lit/decorators.js";
import { applyTheme } from "../lib/theme";
import {
  ARIA2_THEMES,
  ARIA2_DEFAULT_SAFE_MODE_HOSTS,
  ARIA2_DEFAULT_RPC_URL,
  CustomTheme,
  ThemeId,
} from "../lib/constants";
import {
  getConfig,
  saveConfig,
  testConnectionWithParams,
  escapeHtml,
} from "../lib/shared";
import { getCustomThemes, saveCustomThemes, getAllThemes } from "../lib/theme";
import "./aria2-logo";
import "./aria2-chip-list";
import "./aria2-theme-editor";

export class Aria2Options extends LitElement {
  @property({ type: Boolean }) embedded = false;
  @state() private _activeTab = "general";
  @state() private _rpcUrl = ARIA2_DEFAULT_RPC_URL;
  @state() private _rpcSecret = "";
  @state() private _downloadPath = "";
  @state() private _hijackEnabled = false;
  @state() private _safeModeEnabled = true;
  @state() private _notifEnabled = true;
  @state() private _hosts: string[] = [];
  @state() private _filters: string[] = [];
  @state() private _theme: ThemeId = "original";
  @state() private _newHost = "";
  @state() private _newFilter = "";
  @state() private _testResult = "";
  @state() private _testResultClass = "";
  @state() private _themeSelectOptions: Array<{ id: string; name: string; accent: string }> = [];
  @state() private _builtInThemes: typeof ARIA2_THEMES = ARIA2_THEMES;
  @state() private _customThemes: CustomTheme[] = [];
  @state() private _editorOpen = false;
  @state() private _editingTheme: { name: string; accent: string; amber: string; green: string } | null = null;
  @state() private _editingIndex: number | null = null;

  private _storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | null = null;

  createRenderRoot() { return this; }

  async connectedCallback() {
    super.connectedCallback();
    await this._loadSettings();
    this._storageListener = (changes, area) => {
      if (area !== "local") return;
      if (changes.aria2_safe_mode_hosts) {
        this._hosts = changes.aria2_safe_mode_hosts.newValue || [...ARIA2_DEFAULT_SAFE_MODE_HOSTS];
      }
      if (changes.aria2_filter_extensions) {
        this._filters = changes.aria2_filter_extensions.newValue || [];
      }
      if (changes.aria2_theme) {
        this._theme = (changes.aria2_theme.newValue || "original") as ThemeId;
        this._refreshThemeSelect();
      }
      if (changes.aria2_custom_themes) {
        this._refreshCustomThemes();
      }
    };
    chrome.storage.onChanged.addListener(this._storageListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._storageListener) {
      chrome.storage.onChanged.removeListener(this._storageListener);
    }
  }

  private async _loadSettings() {
    await applyTheme();
    const config = await getConfig();
    this._rpcUrl = config.rpcUrl;
    this._rpcSecret = config.secret;
    this._downloadPath = config.downloadPath;
    this._hijackEnabled = config.hijackDownloads;
    this._safeModeEnabled = config.safeMode;
    this._notifEnabled = config.completionNotifications;
    this._hosts = [...config.safeModeHosts];
    this._filters = [...config.filterExtensions];
    this._theme = config.theme;
    await this._refreshThemeSelect();
    await this._refreshCustomThemes();
  }

  private async _refreshThemeSelect() {
    const allThemes = await getAllThemes();
    this._themeSelectOptions = allThemes;
  }

  private async _refreshCustomThemes() {
    const customs = await getCustomThemes();
    this._customThemes = customs;
  }

  private _switchTab(tab: string) {
    this._activeTab = tab;
  }

  private async _testConnection() {
    this._testResult = "testing...";
    this._testResultClass = "testing";
    try {
      await testConnectionWithParams(this._rpcUrl, this._rpcSecret);
      this._testResult = "connected!";
      this._testResultClass = "success";
    } catch (err) {
      this._testResult = "failed: " + (err as Error).message;
      this._testResultClass = "error";
    }
  }

  private async _saveSettings() {
    await saveConfig({
      rpcUrl: this._rpcUrl,
      secret: this._rpcSecret,
      downloadPath: this._downloadPath,
      hijackDownloads: this._hijackEnabled,
      safeMode: this._safeModeEnabled,
      safeModeHosts: this._hosts,
      completionNotifications: this._notifEnabled,
      filterExtensions: this._filters,
      theme: this._theme,
    });
    await applyTheme(this._theme);
    this.dispatchEvent(new CustomEvent("settings-saved", { bubbles: true, composed: true }));
  }

  private _addHost() {
    const host = this._newHost.trim().toLowerCase();
    if (!host || this._hosts.includes(host)) {
      this._newHost = "";
      return;
    }
    this._hosts = [...this._hosts, host];
    chrome.storage.local.set({ aria2_safe_mode_hosts: this._hosts });
    this._newHost = "";
  }

  private _removeHost(index: number) {
    const hosts = [...this._hosts];
    hosts.splice(index, 1);
    this._hosts = hosts;
    chrome.storage.local.set({ aria2_safe_mode_hosts: this._hosts });
  }

  private _addFilter() {
    let ext = this._newFilter.trim();
    if (!ext) return;
    if (ext.startsWith(".")) ext = ext.toLowerCase();
    else ext = "." + ext.toLowerCase();
    if (this._filters.includes(ext)) {
      this._newFilter = "";
      return;
    }
    this._filters = [...this._filters, ext];
    chrome.storage.local.set({ aria2_filter_extensions: this._filters });
    this._newFilter = "";
  }

  private _removeFilter(index: number) {
    const filters = [...this._filters];
    filters.splice(index, 1);
    this._filters = filters;
    chrome.storage.local.set({ aria2_filter_extensions: this._filters });
  }

  private async _onThemeChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value as ThemeId;
    this._theme = val;
    await applyTheme(val);
  }

  private async _selectThemeById(id: string) {
    this._theme = id as ThemeId;
    await applyTheme(id as ThemeId);
  }

  private _openCreateTheme() {
    this._editingTheme = null;
    this._editingIndex = null;
    this._editorOpen = true;
  }

  private _openEditTheme(index: number) {
    const t = this._customThemes[index];
    this._editingTheme = { name: t.name, accent: t.accent, amber: t.amber, green: t.green };
    this._editingIndex = index;
    this._editorOpen = true;
  }

  private async _onThemeSave(e: CustomEvent) {
    const { name, accent, amber, green, index } = e.detail;
    let themes = await getCustomThemes();
    let newThemeId: ThemeId;
    if (index !== null) {
      themes[index] = { ...themes[index], name, accent, amber, green };
      newThemeId = ("custom:" + themes[index].id) as ThemeId;
    } else {
      const id = "custom_" + Date.now();
      themes.push({ id, name, accent, amber, green });
      newThemeId = ("custom:" + id) as ThemeId;
    }
    await saveCustomThemes(themes);
    this._editorOpen = false;
    this._editingTheme = null;
    this._editingIndex = null;
    await this._refreshCustomThemes();
    await this._refreshThemeSelect();
    this._theme = newThemeId;
    await applyTheme(newThemeId);
  }

  private _onThemeCancel() {
    this._editorOpen = false;
    this._editingTheme = null;
    this._editingIndex = null;
  }

  private async _deleteCustomTheme(index: number) {
    const themes = await getCustomThemes();
    themes.splice(index, 1);
    await saveCustomThemes(themes);
    await this._refreshThemeSelect();
    await this._refreshCustomThemes();
  }

  private _themeSwatchColor(): string {
    const found = this._themeSelectOptions.find(t => t.id === this._theme);
    return found ? found.accent : "#ff1a1a";
  }

  render() {
    return html`
      <div class="options-tabs">
        <button class="options-tab ${this._activeTab === "general" ? "active" : ""}" data-tab="general" @click=${() => this._switchTab("general")}>
          <span class="tab-dot tab-dot--active"></span>
          general
        </button>
        <button class="options-tab ${this._activeTab === "safe-mode" ? "active" : ""}" data-tab="safe-mode" @click=${() => this._switchTab("safe-mode")}>
          <span class="tab-dot tab-dot--safe-mode"></span>
          safe mode
        </button>
        <button class="options-tab ${this._activeTab === "filters" ? "active" : ""}" data-tab="filters" @click=${() => this._switchTab("filters")}>
          <span class="tab-dot tab-dot--filters"></span>
          filters
        </button>
        <button class="options-tab ${this._activeTab === "themes" ? "active" : ""}" data-tab="themes" @click=${() => this._switchTab("themes")}>
          <span class="tab-dot tab-dot--themes"></span>
          themes
        </button>
      </div>

      <div class="options-tab-content">
        <div class="tab-panel ${this._activeTab === "general" ? "active" : ""}" id="tab-general">
          <div class="settings-container">
            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>connection settings</h2>
              <div class="form-group">
                <label for="rpc-url">RPC URL</label>
                <input type="text" id="rpc-url" class="input" placeholder="http://localhost:6800/jsonrpc"
                  .value=${this._rpcUrl} @input=${(e: Event) => this._rpcUrl = (e.target as HTMLInputElement).value}>
                <span class="input-hint">aria2 RPC endpoint URL</span>
              </div>
              <div class="form-group">
                <label for="rpc-secret">Secret Token</label>
                <input type="password" id="rpc-secret" class="input" placeholder="optional"
                  .value=${this._rpcSecret} @input=${(e: Event) => this._rpcSecret = (e.target as HTMLInputElement).value}>
                <span class="input-hint">RPC secret token (if configured)</span>
              </div>
              <div class="form-actions">
                <button class="btn btn-secondary" @click=${this._testConnection}>test connection</button>
                <span class="test-result ${this._testResultClass}">${this._testResult}</span>
              </div>
            </section>

            <div class="divider"></div>

            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>download settings</h2>
              <div class="form-group">
                <label for="download-path">Default Download Path</label>
                <input type="text" id="download-path" class="input" placeholder="/path/to/downloads"
                  .value=${this._downloadPath} @input=${(e: Event) => this._downloadPath = (e.target as HTMLInputElement).value}>
                <span class="input-hint">Default directory for new downloads (optional)</span>
              </div>
              <div class="form-group">
                <div class="hijack-toggle-row">
                  <div class="hijack-info">
                    <span class="hijack-label">Completion Notifications</span>
                    <span class="hijack-desc">Show notification when a download finishes</span>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" ?checked=${this._notifEnabled} @change=${(e: Event) => this._notifEnabled = (e.target as HTMLInputElement).checked}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <span class="input-hint">When enabled, a desktop notification will appear for each completed download</span>
              </div>
            </section>

            <div class="divider"></div>

            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>browser integration</h2>
              <div class="form-group">
                <div class="hijack-toggle-row">
                  <div class="hijack-info">
                    <span class="hijack-label">Hijack Browser Downloads</span>
                    <span class="hijack-desc">Intercept all browser downloads and send to aria2</span>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" ?checked=${this._hijackEnabled} @change=${(e: Event) => this._hijackEnabled = (e.target as HTMLInputElement).checked}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <span class="input-hint">When enabled, all file downloads will be redirected to aria2</span>
              </div>
            </section>

            <div class="divider"></div>

            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>theme</h2>
              <div class="form-group">
                <label for="theme-select">Color Scheme</label>
                <div class="theme-select-wrapper">
                  <select id="theme-select" class="input theme-select" @change=${this._onThemeChange}>
                    ${this._themeSelectOptions.map(t => html`
                      <option value=${t.id} ?selected=${t.id === this._theme}>${escapeHtml(t.name)}</option>
                    `)}
                  </select>
                  <div class="theme-swatch" style="background:${this._themeSwatchColor()}"></div>
                </div>
                <span class="input-hint">Changes apply instantly on selection</span>
              </div>
            </section>

            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>quick actions</h2>
              <div class="form-actions">
                <button class="btn btn-primary" @click=${this._saveSettings}>save settings</button>
              </div>
            </section>
          </div>
        </div>

        <div class="tab-panel ${this._activeTab === "safe-mode" ? "active" : ""}" id="tab-safe-mode">
          <div class="settings-container">
            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>safe mode</h2>
              <div class="form-group">
                <div class="hijack-toggle-row">
                  <div class="hijack-info">
                    <span class="hijack-label">Safe Mode</span>
                    <span class="hijack-desc">Force single connection for known file hosting sites</span>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" ?checked=${this._safeModeEnabled} @change=${(e: Event) => this._safeModeEnabled = (e.target as HTMLInputElement).checked}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <span class="input-hint">Prevents rate-limiting and connection drops on restrictive hosts by forcing single-connection downloads</span>
              </div>
            </section>

            <div class="divider"></div>

            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>managed sites</h2>
              <span class="input-hint input-hint--block">Sites in this list will use single-connection downloads when safe mode is enabled</span>
              <div class="safe-mode-host-add">
                <input type="text" class="input" placeholder="e.g. example.com"
                  .value=${this._newHost} @input=${(e: Event) => this._newHost = (e.target as HTMLInputElement).value}
                  @keydown=${(e: Event) => { if ((e as KeyboardEvent).key === "Enter") this._addHost(); }}>
                <button class="btn btn-primary" @click=${this._addHost}>add</button>
              </div>
              <div class="safe-mode-hosts-list">
                ${this._hosts.length === 0
                  ? html`<div class="empty-hosts">no sites configured</div>`
                  : this._hosts.map((host, i) => html`
                    <div class="host-chip">
                      <span class="host-chip-name">${escapeHtml(host)}</span>
                      <button class="host-chip-remove" @click=${() => this._removeHost(i)} title="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  `)}
              </div>
            </section>
          </div>
        </div>

        <div class="tab-panel ${this._activeTab === "filters" ? "active" : ""}" id="tab-filters">
          <div class="settings-container">
            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>file extension filters</h2>
              <div class="form-group">
                <span class="input-hint input-hint--block">Downloads with matching file extensions will be ignored. Add extensions like <strong>.torrent</strong> or <strong>.exe</strong> to prevent them from being sent to aria2.</span>
                <div class="safe-mode-host-add">
                  <input type="text" class="input" placeholder="e.g. .torrent"
                    .value=${this._newFilter} @input=${(e: Event) => this._newFilter = (e.target as HTMLInputElement).value}
                    @keydown=${(e: Event) => { if ((e as KeyboardEvent).key === "Enter") this._addFilter(); }}>
                  <button class="btn btn-primary" @click=${this._addFilter}>add</button>
                </div>
                <div class="safe-mode-hosts-list" id="filters-list">
                  ${this._filters.length === 0
                    ? html`<div class="empty-hosts">no filters configured</div>`
                    : this._filters.map((ext, i) => html`
                      <div class="host-chip">
                        <span class="host-chip-name">${escapeHtml(ext)}</span>
<button class="host-chip-remove" @click=${() => this._removeFilter(i)} title="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                      </div>
                    `)}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div class="tab-panel ${this._activeTab === "themes" ? "active" : ""}" id="tab-themes">
          <div class="settings-container">
            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>built-in themes</h2>
              <div class="themes-builtin-list">
                ${this._builtInThemes.map(t => html`
                  <div class="host-chip theme-chip${t.id === this._theme ? " theme-chip--active" : ""}" @click=${() => this._selectThemeById(t.id)}>
                    <span class="theme-chip-swatch" style="background:${t.accent};box-shadow:0 0 4px ${t.accent}66;"></span>
                    <span class="host-chip-name">${escapeHtml(t.name)}</span>
                  </div>
                `)}
              </div>
            </section>

            <div class="divider"></div>

            <section class="settings-section">
              <h2 class="section-title"><span class="dot-indicator"></span>custom themes</h2>
              <div class="themes-custom-list">
                ${this._customThemes.length === 0
                  ? html`<div class="empty-hosts">no custom themes yet</div>`
                  : this._customThemes.map((t, i) => html`
                    <div class="host-chip theme-chip${("custom:" + t.id) === this._theme ? " theme-chip--active" : ""}" @click=${() => this._selectThemeById("custom:" + t.id)}>
                      <span class="theme-chip-swatch" style="background:${escapeHtml(t.accent)};box-shadow:0 0 4px ${escapeHtml(t.accent)}66;"></span>
                      <span class="host-chip-name">${escapeHtml(t.name)}</span>
                      <button class="host-chip-remove theme-chip-edit" @click=${(e: Event) => { e.stopPropagation(); this._openEditTheme(i); }} title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                      </button>
                      <button class="host-chip-remove theme-chip-delete" @click=${(e: Event) => { e.stopPropagation(); this._deleteCustomTheme(i); }} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  `)}
              </div>
              <button class="btn btn-primary btn--top-margin" @click=${this._openCreateTheme}>create custom theme</button>
            </section>

            <aria2-theme-editor
              .open=${this._editorOpen}
              .initialTheme=${this._editingTheme}
              .editIndex=${this._editingIndex}
              @theme-save=${this._onThemeSave}
              @theme-cancel=${this._onThemeCancel}
            ></aria2-theme-editor>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("aria2-options", Aria2Options);