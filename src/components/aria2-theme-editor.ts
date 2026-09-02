import { LitElement, html, nothing } from "lit";
import { property, state } from "lit/decorators.js";

export interface ThemeEditorData {
  name: string;
  accent: string;
  amber: string;
  green: string;
}

export class Aria2ThemeEditor extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) initialTheme: ThemeEditorData | null = null;
  @property({ type: Number }) editIndex: number | null = null;

  @state() private _name = "";
  @state() private _accent = "#ff1a1a";
  @state() private _amber = "#f59e0b";
  @state() private _green = "#00e676";

  createRenderRoot() { return this; }

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has("initialTheme") && this.initialTheme) {
      this._name = this.initialTheme.name;
      this._accent = this.initialTheme.accent;
      this._amber = this.initialTheme.amber;
      this._green = this.initialTheme.green;
    }
    if (changed.has("open") && this.open && !this.initialTheme) {
      this._name = "";
      this._accent = "#ff1a1a";
      this._amber = "#f59e0b";
      this._green = "#00e676";
    }
  }

  private _onSave() {
    const name = this._name.trim();
    if (!name) { alert("Please enter a theme name."); return; }
    this.dispatchEvent(new CustomEvent("theme-save", {
      detail: {
        name,
        accent: this._accent,
        amber: this._amber,
        green: this._green,
        index: this.editIndex,
      },
      bubbles: true,
    }));
  }

  private _onCancel() {
    this.dispatchEvent(new CustomEvent("theme-cancel", { bubbles: true }));
  }

  render() {
    if (!this.open) return nothing;

    const title = this.initialTheme ? "edit: " + this.initialTheme.name : "new custom theme";

    return html`
      <div class="divider" id="theme-editor-divider"></div>
      <section class="settings-section" id="theme-editor-section">
        <h2 class="section-title">
          <span class="dot-indicator"></span>
          <span id="theme-editor-title">${title}</span>
        </h2>

        <div class="form-group">
          <label for="theme-editor-name">Theme Name</label>
          <input type="text" id="theme-editor-name" class="input" placeholder="My Theme"
            .value=${this._name} @input=${(e: Event) => this._name = (e.target as HTMLInputElement).value}>
        </div>

        <div class="form-group">
          <label>Accent Color</label>
          <div class="theme-color-row">
            <input type="color" id="theme-editor-accent" class="theme-color-picker"
              .value=${this._accent} @input=${(e: Event) => { this._accent = (e.target as HTMLInputElement).value; }}>
            <input type="text" id="theme-editor-accent-hex" class="input theme-hex-input"
              .value=${this._accent} @input=${(e: Event) => {
                const val = (e.target as HTMLInputElement).value.trim();
                if (/^#[0-9a-f]{6}$/i.test(val)) this._accent = val;
              }}>
          </div>
        </div>

        <div class="form-group">
          <label>Amber (Warning) Color</label>
          <div class="theme-color-row">
            <input type="color" id="theme-editor-amber" class="theme-color-picker"
              .value=${this._amber} @input=${(e: Event) => { this._amber = (e.target as HTMLInputElement).value; }}>
            <input type="text" id="theme-editor-amber-hex" class="input theme-hex-input"
              .value=${this._amber} @input=${(e: Event) => {
                const val = (e.target as HTMLInputElement).value.trim();
                if (/^#[0-9a-f]{6}$/i.test(val)) this._amber = val;
              }}>
          </div>
        </div>

        <div class="form-group">
          <label>Green (Success) Color</label>
          <div class="theme-color-row">
            <input type="color" id="theme-editor-green" class="theme-color-picker"
              .value=${this._green} @input=${(e: Event) => { this._green = (e.target as HTMLInputElement).value; }}>
            <input type="text" id="theme-editor-green-hex" class="input theme-hex-input"
              .value=${this._green} @input=${(e: Event) => {
                const val = (e.target as HTMLInputElement).value.trim();
                if (/^#[0-9a-f]{6}$/i.test(val)) this._green = val;
              }}>
          </div>
        </div>

        <div class="theme-editor-preview" id="theme-editor-preview">
          <span class="theme-preview-dot" style="background:${this._accent}"></span>
          <span class="theme-preview-label">accent</span>
          <span class="theme-preview-dot" style="background:${this._amber}"></span>
          <span class="theme-preview-label">amber</span>
          <span class="theme-preview-dot" style="background:${this._green}"></span>
          <span class="theme-preview-label">green</span>
        </div>

        <div class="theme-editor-actions">
          <button class="btn btn-primary" @click=${this._onSave}>save theme</button>
          <button class="btn btn-secondary" @click=${this._onCancel}>cancel</button>
        </div>
      </section>
    `;
  }
}

customElements.define("aria2-theme-editor", Aria2ThemeEditor);