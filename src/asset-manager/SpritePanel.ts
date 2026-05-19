/**
 * Sprites tab：网格展示所有 sprite，点击打开像素编辑器
 */

import type { AssetsApp } from './AssetsApp';
import { spriteJsonToPixelMap, pixelMapToSpriteJson } from '../assets/themeLoader';
import { createSpriteCache } from '../assets/types';
import { PixelEditorOverlay } from './PixelEditorOverlay';
import { getSpriteLabel } from './spriteLabels';

const THUMBNAIL_SIZE = 96;

export class SpritePanel {
  private editor = new PixelEditorOverlay();
  private filter: string = '';

  constructor(private app: AssetsApp) {}

  render(root: HTMLElement): void {
    root.innerHTML = '';
    root.appendChild(this.renderSearchBar());

    const grid = document.createElement('div');
    grid.className = 'am-sprite-grid';
    root.appendChild(grid);

    const theme = this.app.getCurrentTheme();
    const readonly = this.app.isReadonly();
    const names = Object.keys(theme.sprites).sort();
    const keyword = this.filter.trim().toLowerCase();

    let shown = 0;
    for (const name of names) {
      if (keyword && !name.toLowerCase().includes(keyword)) continue;
      grid.appendChild(this.renderCard(name, readonly));
      shown++;
    }
    if (shown === 0) {
      const empty = document.createElement('div');
      empty.className = 'am-sprite-empty';
      empty.textContent = keyword ? '没有匹配的 sprite' : '当前主题没有 sprite';
      grid.appendChild(empty);
    }
  }

  private renderSearchBar(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'am-search-bar';
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = '搜索 sprite 名（如 GOLD、MINER）';
    input.value = this.filter;
    input.addEventListener('input', () => {
      this.filter = input.value;
      this.render(wrap.parentElement!);
      // 复位焦点
      const next = wrap.parentElement!.querySelector<HTMLInputElement>('.am-search-bar input');
      next?.focus();
      next?.setSelectionRange(input.value.length, input.value.length);
    });
    wrap.appendChild(input);
    return wrap;
  }

  private renderCard(name: string, readonly: boolean): HTMLElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `am-sprite-card ${readonly ? 'readonly' : ''}`;

    const thumb = document.createElement('div');
    thumb.className = 'am-sprite-thumb';
    const canvas = this.makeThumbnail(name);
    if (canvas) thumb.appendChild(canvas);
    card.appendChild(thumb);

    const label = document.createElement('div');
    label.className = 'am-sprite-name';
    label.textContent = name;
    card.appendChild(label);

    const cn = getSpriteLabel(name);
    if (cn) {
      const sub = document.createElement('div');
      sub.className = 'am-sprite-sub';
      sub.textContent = cn;
      card.appendChild(sub);
    }

    card.addEventListener('click', () => this.handleClick(name, readonly));
    return card;
  }

  /** 渲染单个 sprite 的缩略图到 96×96 canvas，等比 contain 适配 */
  private makeThumbnail(name: string): HTMLCanvasElement | null {
    const theme = this.app.getCurrentTheme();
    const sprite = theme.sprites[name];
    if (!sprite) return null;
    try {
      const pixels = spriteJsonToPixelMap(name, sprite);
      const cached = createSpriteCache(pixels, sprite.scale);
      const out = document.createElement('canvas');
      out.width = THUMBNAIL_SIZE;
      out.height = THUMBNAIL_SIZE;
      const ctx = out.getContext('2d');
      if (!ctx) return out;
      ctx.imageSmoothingEnabled = false;
      const scale = Math.min(THUMBNAIL_SIZE / cached.width, THUMBNAIL_SIZE / cached.height);
      const drawW = cached.width * scale;
      const drawH = cached.height * scale;
      const dx = (THUMBNAIL_SIZE - drawW) / 2;
      const dy = (THUMBNAIL_SIZE - drawH) / 2;
      ctx.drawImage(cached, dx, dy, drawW, drawH);
      return out;
    } catch (e) {
      console.warn(`sprite "${name}" 缩略图生成失败`, e);
      return null;
    }
  }

  private handleClick(name: string, readonly: boolean): void {
    if (readonly) {
      alert('系统主题只读，请先「复制」或「新建」一个自定义主题再编辑');
      return;
    }
    const theme = this.app.getCurrentTheme();
    const sprite = theme.sprites[name]!;
    let initialPixels;
    try {
      initialPixels = spriteJsonToPixelMap(name, sprite);
    } catch (e) {
      console.warn('sprite 解析失败，跳过初始像素', e);
    }
    this.editor.open({
      spriteName: name,
      initialPixels,
      onApply: (pixels) => {
        try {
          const newSprite = pixelMapToSpriteJson(pixels, sprite.scale);
          this.app.commitSprite(name, newSprite);
        } catch (e) {
          alert(`应用失败：${e instanceof Error ? e.message : String(e)}`);
        }
      },
    });
  }
}
