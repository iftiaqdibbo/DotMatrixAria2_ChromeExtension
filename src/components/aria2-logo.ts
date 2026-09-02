import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";

export class Aria2Logo extends LitElement {
  @property({ type: Number }) size = 28;

  createRenderRoot() { return this; }

  render() {
    return html`
      <div class="logo">
        <svg viewBox="0 0 42 42" width="${this.size}" height="${this.size}">
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
    `;
  }
}

customElements.define("aria2-logo", Aria2Logo);