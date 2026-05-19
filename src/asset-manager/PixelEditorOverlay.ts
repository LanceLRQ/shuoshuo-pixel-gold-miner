/**
 * 像素编辑器 Overlay
 *
 * 用 iframe 嵌入 public/tools/pixel-converter.html?embed=1，通过 postMessage
 * 双向通信：iframe ready → 推送初始 PixelMap；用户应用 → 回调写回。
 */

import type { PixelMap } from '../assets/types';
import { escapeHtml } from './domUtils';

export interface OpenOptions {
  spriteName: string;
  initialPixels?: PixelMap;
  onApply: (pixels: PixelMap) => void;
  onCancel?: () => void;
}

export class PixelEditorOverlay {
  private container: HTMLDivElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private messageHandler: ((ev: MessageEvent) => void) | null = null;
  private currentOpts: OpenOptions | null = null;

  open(opts: OpenOptions): void {
    if (this.container) {
      // 先关掉旧实例
      this.close();
    }
    this.currentOpts = opts;

    // 构建 overlay 容器
    const overlay = document.createElement('div');
    overlay.className = 'pixel-editor-overlay';
    overlay.innerHTML = `
      <div class="pixel-editor-header">
        <span>编辑 sprite: <strong>${escapeHtml(opts.spriteName)}</strong></span>
        <button class="pixel-editor-close" type="button" aria-label="关闭">×</button>
      </div>
      <iframe class="pixel-editor-iframe"
              src="/tools/pixel-converter.html?embed=1&sprite=${encodeURIComponent(opts.spriteName)}"
              title="像素编辑器"></iframe>
    `;
    document.body.appendChild(overlay);
    this.container = overlay;
    this.iframe = overlay.querySelector('iframe.pixel-editor-iframe');

    const closeBtn = overlay.querySelector<HTMLButtonElement>('.pixel-editor-close');
    closeBtn?.addEventListener('click', () => this.cancel());

    // postMessage 监听
    this.messageHandler = (ev: MessageEvent) => this.handleMessage(ev);
    window.addEventListener('message', this.messageHandler);
  }

  close(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.iframe = null;
    }
    this.currentOpts = null;
  }

  private cancel(): void {
    const opts = this.currentOpts;
    this.close();
    opts?.onCancel?.();
  }

  private handleMessage(ev: MessageEvent): void {
    if (ev.origin !== location.origin) return;
    const msg = ev.data;
    if (!msg || typeof msg.type !== 'string') return;
    const opts = this.currentOpts;
    if (!opts) return;

    switch (msg.type) {
      case 'ready': {
        // iframe 就绪：推送初始像素（如有）
        if (opts.initialPixels && this.iframe?.contentWindow) {
          this.iframe.contentWindow.postMessage(
            { type: 'init', pixels: opts.initialPixels },
            location.origin
          );
        }
        break;
      }
      case 'apply': {
        if (Array.isArray(msg.pixels)) {
          opts.onApply(msg.pixels as PixelMap);
        }
        this.close();
        break;
      }
      case 'cancel': {
        this.cancel();
        break;
      }
    }
  }
}

