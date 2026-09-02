import { LitElement, html, nothing } from "lit";
import { property, state } from "lit/decorators.js";
import { escapeHtml } from "../lib/shared";

export interface ChipData {
  label: string;
  accent?: string;
  deletable?: boolean;
  editable?: boolean;
}

export class Aria2ChipList extends LitElement {
  @property({ type: Array }) chips: ChipData[] = [];
  @property({ type: String }) emptyText = "no items configured";
  @state() _editingIndex = -1;

  createRenderRoot() { return this; }

  render() {
    if (this.chips.length === 0) {
      return html`<div class="empty-hosts">${this.emptyText}</div>`;
    }
    return html`
      <div class="safe-mode-hosts-list">
        ${this.chips.map((chip, i) => html`
          <div class="host-chip theme-chip">
            ${chip.accent
              ? html`<span class="theme-chip-swatch" style="background:${chip.accent};box-shadow:0 0 4px ${chip.accent}66;"></span>`
              : nothing}
            <span class="host-chip-name">${escapeHtml(chip.label)}</span>
            ${chip.editable
              ? html`<button class="host-chip-remove theme-chip-edit" @click=${() => this._onEdit(i)} title="Edit">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                  </svg>
                </button>`
              : nothing}
            ${chip.deletable
              ? html`<button class="host-chip-remove theme-chip-delete" @click=${() => this._onDelete(i)} title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>`
              : nothing}
          </div>
        `)}
      </div>
    `;
  }

  private _onDelete(index: number) {
    this.dispatchEvent(new CustomEvent("chip-delete", { detail: { index } }));
  }

  private _onEdit(index: number) {
    this.dispatchEvent(new CustomEvent("chip-edit", { detail: { index } }));
  }
}

customElements.define("aria2-chip-list", Aria2ChipList);