/**
 * 在线排行榜 DOM 弹窗（仿 CodexModal 形态，不新建游戏场景）
 *
 * 主菜单「排行榜」按钮触发；覆盖在 game canvas 之上。
 * 三个难度榜 Tab（normal / hard / expert）+ 登录用户「我的附近 ±5」高亮区。
 * 数据走 LeaderboardClient.fetchBoard（内置 30s 内存缓存 + X-Device-Id 限速标识）。
 *
 * 设计文档：docs/design/20260605_leaderboard-server-integration.md §6.1/§4.5
 */

import { STRINGS } from './strings';
import { LeaderboardClient, type BoardData, type BoardEntry } from '../core/LeaderboardClient';

/** Tab 定义：榜单 key + 难度显示名（与难度文案单一来源保持一致） */
const BOARD_TABS: readonly { key: string; label: string }[] = [
  { key: 'normal', label: STRINGS.difficulty.list.normal.name },
  { key: 'hard', label: STRINGS.difficulty.list.hard.name },
  { key: 'expert', label: STRINGS.difficulty.list.expert.name },
];

/** 拉榜条数（服务端默认 50、上限 200） */
const BOARD_TOP_N = 50;

const T = STRINGS.leaderboard.modal;

const STYLE_ID = 'leaderboard-modal-style';
const STYLE_CSS = `
.lb-modal-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(10, 14, 24, 0.78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  display: none;
  align-items: center; justify-content: center;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'PingFang SC', 'Microsoft YaHei', monospace;
  user-select: none;
}
.lb-modal-overlay.open { display: flex; }
.lb-modal-panel {
  width: 90vw; max-width: 640px; max-height: 86vh;
  background: linear-gradient(180deg, #1a1a2e 0%, #0f0f1e 100%);
  border: 2px solid #ffd700;
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 215, 0, 0.15) inset;
  display: flex; flex-direction: column; overflow: hidden;
  color: #eaeaea;
}
.lb-modal-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 215, 0, 0.25);
  background: rgba(255, 215, 0, 0.05);
}
.lb-modal-tab {
  background: transparent; border: 0; padding: 6px 14px;
  font: inherit; font-size: 15px; color: #aaa;
  cursor: pointer; border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.lb-modal-tab:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
.lb-modal-tab.active {
  color: #ffd700; background: rgba(255, 215, 0, 0.12);
  box-shadow: inset 0 -2px 0 #ffd700;
}
.lb-modal-close {
  margin-left: auto;
  background: transparent; border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ccc; cursor: pointer;
  width: 28px; height: 28px; border-radius: 4px;
  font-size: 16px; line-height: 1;
}
.lb-modal-close:hover { color: #fff; border-color: #ffd700; background: rgba(255, 215, 0, 0.1); }
.lb-modal-body {
  padding: 12px 18px 18px; overflow-y: auto; min-height: 200px;
  scrollbar-width: thin; scrollbar-color: #444 transparent;
}
.lb-modal-body::-webkit-scrollbar { width: 8px; }
.lb-modal-body::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
.lb-modal-footer {
  padding: 8px 18px; font-size: 12px; color: #666;
  border-top: 1px solid rgba(255, 215, 0, 0.15);
  text-align: center;
}
.lb-status { padding: 60px 0; text-align: center; color: #888; font-size: 15px; }
.lb-status.lb-error { color: #ff8888; }
.lb-retry-btn {
  display: inline-block; margin-top: 16px; padding: 6px 20px;
  font: inherit; font-size: 14px; color: #ffd700; cursor: pointer;
  background: rgba(255, 215, 0, 0.08); border: 1px solid #ffd700; border-radius: 4px;
  transition: background 0.15s;
}
.lb-retry-btn:hover { background: rgba(255, 215, 0, 0.18); }
.lb-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.lb-table th {
  text-align: left; color: #ffd700; font-weight: bold;
  padding: 6px 10px; border-bottom: 1px solid rgba(255, 215, 0, 0.25);
}
.lb-table td { padding: 6px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.lb-table .lb-num { text-align: right; font-variant-numeric: tabular-nums; }
.lb-rank-top { color: #ffd700; font-weight: bold; }
.lb-name { color: #fff; word-break: break-all; }
.lb-anon-tag {
  display: inline-block; margin-left: 6px; padding: 0 5px;
  font-size: 11px; color: #8fd0e0; border: 1px solid rgba(143, 208, 224, 0.4);
  border-radius: 3px; vertical-align: 1px;
}
.lb-around-header {
  padding: 14px 0 6px; text-align: center; color: #b4f0ff; font-size: 13px;
}
.lb-row-around td { background: rgba(180, 240, 255, 0.08); }
`;

function ensureStyleInjected(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_CSS;
  document.head.appendChild(style);
}

/** HTML 转义：display_name 等来自服务端的用户输入字段必须转义后再 innerHTML（防 XSS） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class LeaderboardModal {
  private root: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  private tabButtons: HTMLButtonElement[] = [];
  private isOpen = false;
  private currentBoard: string = BOARD_TABS[0]!.key;
  /** 拉榜请求序号：快速切 Tab 时丢弃过期响应 */
  private loadSeq = 0;
  /** 打开/关闭时回调，由调用方接通 Game 暂停 */
  onToggle?: (open: boolean) => void;

  constructor() {
    ensureStyleInjected();

    this.root = document.createElement('div');
    this.root.className = 'lb-modal-overlay';
    this.root.innerHTML = `
      <div class="lb-modal-panel" role="dialog" aria-modal="true" aria-label="${T.dialogLabel}">
        <div class="lb-modal-header">
          ${BOARD_TABS.map((t, i) => `<button type="button" class="lb-modal-tab${i === 0 ? ' active' : ''}" data-board="${t.key}">${t.label}</button>`).join('')}
          <button type="button" class="lb-modal-close" aria-label="${T.closeAria}">✕</button>
        </div>
        <div class="lb-modal-body"></div>
        <div class="lb-modal-footer">${T.footer}</div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.bodyEl = this.root.querySelector('.lb-modal-body') as HTMLDivElement;
    this.tabButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.lb-modal-tab'));
    for (const btn of this.tabButtons) {
      btn.addEventListener('click', () => this.setBoard(btn.dataset.board ?? BOARD_TABS[0]!.key));
    }
    this.root.querySelector<HTMLButtonElement>('.lb-modal-close')!
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
    void this.loadBoard(this.currentBoard);
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

  private setBoard(board: string): void {
    if (this.currentBoard === board) return;
    this.currentBoard = board;
    for (const btn of this.tabButtons) {
      btn.classList.toggle('active', btn.dataset.board === board);
    }
    void this.loadBoard(board);
  }

  /** 拉榜并渲染（协议层带 30s 缓存；失败展示可读文案，限速 5041016 已翻译） */
  private async loadBoard(board: string): Promise<void> {
    const seq = ++this.loadSeq;
    this.bodyEl.innerHTML = `<div class="lb-status">${T.loading}</div>`;
    try {
      const data = await LeaderboardClient.fetchBoard(board, BOARD_TOP_N);
      if (seq !== this.loadSeq || !this.isOpen) return; // 过期响应 / 已关闭
      this.renderBoard(data);
    } catch (e) {
      if (seq !== this.loadSeq) return;
      this.bodyEl.innerHTML = `
        <div class="lb-status lb-error">
          ${escapeHtml((e as Error).message)}
          <div><button type="button" class="lb-retry-btn">${T.retry}</button></div>
        </div>`;
      // 重试当前榜（缓存内拉榜失败不会写缓存，重试会重新发起请求）
      this.bodyEl.querySelector<HTMLButtonElement>('.lb-retry-btn')
        ?.addEventListener('click', () => void this.loadBoard(board));
    }
  }

  private renderBoard(data: BoardData): void {
    if (data.list.length === 0) {
      this.bodyEl.innerHTML = `<div class="lb-status">${T.empty}</div>`;
      return;
    }
    const header = `
      <tr>
        <th class="lb-num">${T.colRank}</th>
        <th>${T.colPlayer}</th>
        <th class="lb-num">${T.colMoney}</th>
        <th class="lb-num">${T.colLevel}</th>
      </tr>
    `;
    const topRows = data.list.map((e) => this.renderRow(e, false)).join('');
    // 登录用户附带「我的附近 ±5」：独立小标题 + 高亮行
    const aroundBlock = data.around.length > 0
      ? `<tr><td colspan="4" class="lb-around-header">${T.aroundHeader}</td></tr>`
        + data.around.map((e) => this.renderRow(e, true)).join('')
      : '';
    this.bodyEl.innerHTML = `<table class="lb-table"><thead>${header}</thead><tbody>${topRows}${aroundBlock}</tbody></table>`;
  }

  private renderRow(e: BoardEntry, isAround: boolean): string {
    const rankCls = e.rank <= 3 ? ' lb-rank-top' : '';
    const anonTag = e.anonymous ? `<span class="lb-anon-tag">${T.anonymousTag}</span>` : '';
    return `
      <tr${isAround ? ' class="lb-row-around"' : ''}>
        <td class="lb-num${rankCls}">${e.rank}</td>
        <td><span class="lb-name">${escapeHtml(e.displayName)}</span>${anonTag}</td>
        <td class="lb-num">$${e.metrics.rawMoney ?? 0}</td>
        <td class="lb-num">L${e.metrics.highestLevel ?? 0}</td>
      </tr>
    `;
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  };
}
