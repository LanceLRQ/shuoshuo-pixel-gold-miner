/**
 * 矿物图鉴 DOM 弹窗
 *
 * 玩家点击 HUD 右上角 ? 按钮触发；覆盖在 game canvas 之上。
 * 两个 Tab：
 *   - 操作说明（保留原 canvas 内 3 行文字）
 *   - 矿物图鉴（16 项网格：sprite + 中文名 + 价值 + 备注）
 *
 * 数据从 src/entity/types.ts 派生（保持单一来源真相）；sprite 缩略图直接
 * 从 ThemeManager.getSpriteCache() 取对应 canvas → 复制绘制到 DOM <canvas>。
 */

import type { ThemeManager } from '../assets/theme/ThemeManager';
import { MINERAL_CONFIGS, MineralType, STONE_VARIANTS } from '../entity/types';

type TabId = 'controls' | 'codex';

interface CodexEntry {
  /** sprite 缓存 key */
  sprite: string;
  /** 中文短名（图鉴展示） */
  name: string;
  /** 价值字符串（直接用于显示） */
  value: string;
  /** 价值文字颜色（默认金色，负值或危险用红色） */
  valueColor?: string;
  /** 备注（次要信息，可省略） */
  note?: string;
}

const HD = MINERAL_CONFIGS;

/** 矿物图鉴 16 项 — 按价值升序排列 */
function buildCodexEntries(): CodexEntry[] {
  return [
    { sprite: HD[MineralType.BONE].spriteName,        name: '骨头',     value: `$${HD[MineralType.BONE].value}`, note: '低价值垫场' },
    { sprite: STONE_VARIANTS[0]!.spriteName,          name: '小石头',   value: `$${STONE_VARIANTS[0]!.valueRange[0]}–$${STONE_VARIANTS[0]!.valueRange[1]}` },
    { sprite: STONE_VARIANTS[1]!.spriteName,          name: '中石头',   value: `$${STONE_VARIANTS[1]!.valueRange[0]}–$${STONE_VARIANTS[1]!.valueRange[1]}`, note: '石头书 ×3' },
    { sprite: STONE_VARIANTS[2]!.spriteName,          name: '大石头',   value: `$${STONE_VARIANTS[2]!.valueRange[0]}–$${STONE_VARIANTS[2]!.valueRange[1]}`, note: '石头书 ×3' },
    { sprite: HD[MineralType.MOUSE].spriteName,       name: '老鼠',     value: `$${HD[MineralType.MOUSE].value}`, note: '会移动 · 老鼠药 ×5' },
    { sprite: HD[MineralType.MOLE].spriteName,        name: '鼹鼠',     value: `$${HD[MineralType.MOLE].value}`, note: '会移动 · 30% 携带钻石' },
    { sprite: HD[MineralType.GOLD_SMALL].spriteName,  name: '小金块',   value: `$${HD[MineralType.GOLD_SMALL].value}` },
    { sprite: HD[MineralType.GOLD_MEDIUM].spriteName, name: '中金块',   value: `$${HD[MineralType.GOLD_MEDIUM].value}` },
    { sprite: HD[MineralType.CRYSTAL_ORE].spriteName, name: '水晶矿石', value: `$${HD[MineralType.CRYSTAL_ORE].value}`, note: 'Ch1 章节专属' },
    { sprite: HD[MineralType.GOLD_LARGE].spriteName,  name: '大金块',   value: `$${HD[MineralType.GOLD_LARGE].value}` },
    { sprite: HD[MineralType.DIAMOND].spriteName,     name: '钻石',     value: `$${HD[MineralType.DIAMOND].value}`, note: '钻石变色油 ×2' },
    { sprite: HD[MineralType.CRAB_SHELL].spriteName,  name: '水晶蟹甲', value: `$${HD[MineralType.CRAB_SHELL].value}`, note: 'Ch2 章节专属' },
    { sprite: HD[MineralType.PIGGY_GEM].spriteName,   name: '猪猪宝石', value: `$${HD[MineralType.PIGGY_GEM].value}`, note: 'Ch3 章节专属' },
    { sprite: HD[MineralType.MYSTERY_BAG].spriteName, name: '神秘袋',   value: '?', note: '现金 / 大力药剂 / 炸药' },
    { sprite: HD[MineralType.WOODEN_BOX].spriteName,  name: '木箱',     value: '?', note: '抽奖：钻石 / 金币 / 骷髅扣分' },
    { sprite: HD[MineralType.BOMB].spriteName,        name: '炸药桶',   value: '−$100', valueColor: '#ff6464', note: '⚠ 碰到爆炸，避开' },
  ];
}

const CONTROL_HINTS: { key: string; desc: string }[] = [
  { key: '空格 / 点击画面',  desc: '发射钩爪' },
  { key: 'F / ↑ 键',          desc: '引爆 TNT（需购买炸药）' },
  { key: 'ESC / 右上角按钮',  desc: '暂停游戏' },
];

const STYLE_ID = 'codex-modal-style';
const STYLE_CSS = `
.codex-modal-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(10, 14, 24, 0.78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: none;
  align-items: center; justify-content: center;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'PingFang SC', 'Microsoft YaHei', monospace;
  user-select: none;
}
.codex-modal-overlay.open { display: flex; }
.codex-modal-panel {
  width: 90vw; max-width: 820px; max-height: 86vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #0f0f1e 100%);
  border: 2px solid #ffd700;
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 215, 0, 0.15) inset;
  display: flex; flex-direction: column; overflow: hidden;
  color: #eaeaea;
}
.codex-modal-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 215, 0, 0.25);
  background: rgba(255, 215, 0, 0.05);
}
.codex-modal-tab {
  background: transparent; border: 0; padding: 6px 14px;
  font: inherit; font-size: 15px; color: #aaa;
  cursor: pointer; border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.codex-modal-tab:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
.codex-modal-tab.active {
  color: #ffd700; background: rgba(255, 215, 0, 0.12);
  box-shadow: inset 0 -2px 0 #ffd700;
}
.codex-modal-close {
  margin-left: auto;
  background: transparent; border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ccc; cursor: pointer;
  width: 28px; height: 28px; border-radius: 4px;
  font-size: 16px; line-height: 1;
}
.codex-modal-close:hover { color: #fff; border-color: #ffd700; background: rgba(255, 215, 0, 0.1); }
.codex-modal-body {
  padding: 18px 22px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #444 transparent;
}
.codex-modal-body::-webkit-scrollbar { width: 8px; }
.codex-modal-body::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
.codex-modal-footer {
  padding: 8px 18px; font-size: 12px; color: #666;
  border-top: 1px solid rgba(255, 215, 0, 0.15);
  text-align: center;
}
/* 操作说明 */
.codex-controls-list {
  display: flex; flex-direction: column; gap: 14px;
  font-size: 15px;
  padding: 12px 4px 4px;
}
.codex-controls-row { display: flex; gap: 16px; align-items: center; }
.codex-controls-key {
  flex-shrink: 0; min-width: 200px;
  color: #ffd700; font-weight: bold;
}
.codex-controls-desc { color: #ddd; }
/* 矿物图鉴 */
.codex-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.codex-card {
  display: flex; gap: 10px; align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 215, 0, 0.1);
  border-radius: 6px;
  padding: 10px;
  min-height: 78px;
}
.codex-card-sprite {
  flex-shrink: 0;
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  background:
    linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%) 0 0 / 12px 12px,
    linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.04) 75%) 6px 6px / 12px 12px;
  border-radius: 4px;
}
.codex-card-sprite canvas { image-rendering: pixelated; image-rendering: crisp-edges; }
.codex-card-info { flex: 1; min-width: 0; }
.codex-card-name { font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 3px; }
.codex-card-value { font-size: 13px; color: #ffd700; margin-bottom: 2px; }
.codex-card-note { font-size: 11px; color: #888; line-height: 1.3; }
@media (max-width: 720px) {
  .codex-grid { grid-template-columns: repeat(2, 1fr); }
  .codex-controls-key { min-width: 140px; }
}
`;

function ensureStyleInjected(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

export class CodexModal {
  private root: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  private tabButtons: Record<TabId, HTMLButtonElement>;
  private themeManager: ThemeManager;
  private isOpen = false;
  private currentTab: TabId = 'controls';
  /** 打开/关闭时回调，由调用方接通 Game 暂停 */
  onToggle?: (open: boolean) => void;

  constructor(themeManager: ThemeManager) {
    this.themeManager = themeManager;
    ensureStyleInjected();

    this.root = document.createElement('div');
    this.root.className = 'codex-modal-overlay';
    this.root.innerHTML = `
      <div class="codex-modal-panel" role="dialog" aria-modal="true" aria-label="游戏帮助">
        <div class="codex-modal-header">
          <button type="button" class="codex-modal-tab active" data-tab="controls">操作说明</button>
          <button type="button" class="codex-modal-tab" data-tab="codex">矿物图鉴</button>
          <button type="button" class="codex-modal-close" aria-label="关闭">✕</button>
        </div>
        <div class="codex-modal-body"></div>
        <div class="codex-modal-footer">按 ESC 关闭 · 点击遮罩关闭 · 上方切换 Tab</div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.bodyEl = this.root.querySelector('.codex-modal-body') as HTMLDivElement;
    const tabBtns = this.root.querySelectorAll<HTMLButtonElement>('.codex-modal-tab');
    this.tabButtons = { controls: tabBtns[0]!, codex: tabBtns[1]! };

    // 事件绑定
    this.tabButtons.controls.addEventListener('click', () => this.setTab('controls'));
    this.tabButtons.codex.addEventListener('click', () => this.setTab('codex'));
    this.root.querySelector<HTMLButtonElement>('.codex-modal-close')!
      .addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      // 点击遮罩（root 本身）关闭；点 panel 内部不关闭
      if (e.target === this.root) this.close();
    });
    window.addEventListener('keydown', this.onKey, true);
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.classList.add('open');
    this.renderBody();
    this.onToggle?.(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    this.onToggle?.(false);
  }

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  isOpened(): boolean {
    return this.isOpen;
  }

  private setTab(tab: TabId): void {
    if (this.currentTab === tab) return;
    this.currentTab = tab;
    this.tabButtons.controls.classList.toggle('active', tab === 'controls');
    this.tabButtons.codex.classList.toggle('active', tab === 'codex');
    this.renderBody();
  }

  private renderBody(): void {
    if (this.currentTab === 'controls') {
      this.renderControls();
    } else {
      this.renderCodex();
    }
  }

  private renderControls(): void {
    const html = `
      <div class="codex-controls-list">
        ${CONTROL_HINTS.map(h => `
          <div class="codex-controls-row">
            <div class="codex-controls-key">${h.key}</div>
            <div class="codex-controls-desc">— ${h.desc}</div>
          </div>
        `).join('')}
      </div>
    `;
    this.bodyEl.innerHTML = html;
  }

  private renderCodex(): void {
    const entries = buildCodexEntries();
    const grid = document.createElement('div');
    grid.className = 'codex-grid';
    for (const entry of entries) {
      grid.appendChild(this.createCard(entry));
    }
    this.bodyEl.innerHTML = '';
    this.bodyEl.appendChild(grid);
  }

  private createCard(entry: CodexEntry): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'codex-card';

    const spriteBox = document.createElement('div');
    spriteBox.className = 'codex-card-sprite';
    const canvas = this.renderSpriteToCanvas(entry.sprite, 56, 56);
    if (canvas) spriteBox.appendChild(canvas);

    const info = document.createElement('div');
    info.className = 'codex-card-info';
    info.innerHTML = `
      <div class="codex-card-name">${entry.name}</div>
      <div class="codex-card-value" style="${entry.valueColor ? `color:${entry.valueColor}` : ''}">${entry.value}</div>
      ${entry.note ? `<div class="codex-card-note">${entry.note}</div>` : ''}
    `;

    card.appendChild(spriteBox);
    card.appendChild(info);
    return card;
  }

  /** 把 spriteCache 中对应 canvas 复制画到新 <canvas>（按 displayWidth/Height 等比缩放到 maxW×maxH 内） */
  private renderSpriteToCanvas(spriteName: string, maxW: number, maxH: number): HTMLCanvasElement | null {
    const cache = this.themeManager.getSpriteCache();
    const source = cache.get(spriteName);
    if (!source) return null;
    const meta = this.themeManager.getSpriteMeta(spriteName);
    const frameCount = meta?.frameCount && meta.frameCount > 1 ? meta.frameCount : 1;
    // 动画 sprite 只画第一帧
    const frameW = source.width / frameCount;
    const frameH = source.height;
    // 按 displayWidth/Height 比例（缺省 = 源帧尺寸）
    const targetW = meta?.displayWidth ?? frameW;
    const targetH = meta?.displayHeight ?? frameH;
    const scale = Math.min(maxW / targetW, maxH / targetH);
    const drawW = Math.max(1, Math.round(targetW * scale));
    const drawH = Math.max(1, Math.round(targetH * scale));

    const out = document.createElement('canvas');
    out.width = drawW;
    out.height = drawH;
    out.style.width = `${drawW}px`;
    out.style.height = `${drawH}px`;
    const ctx = out.getContext('2d');
    if (!ctx) return out;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, frameW, frameH, 0, 0, drawW, drawH);
    return out;
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this.setTab(this.currentTab === 'controls' ? 'codex' : 'controls');
    }
  };
}
