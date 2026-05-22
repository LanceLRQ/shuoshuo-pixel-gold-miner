/**
 * 存档槽位选择场景
 * 布局：第一行自动槽位（宽卡），下面 2×5 网格 10 个手动槽位
 * 详见 docs/design/20260518_save-slot-system.md §6.2
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawText, drawTextCentered, drawTextCenteredIn } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { STRINGS } from '../ui/strings';
import { pointInRect } from '../utils/collision';
import { AUTO_SLOT_ID, SlotKind, type SlotMeta } from '../core/Storage';
import { DIFFICULTY_CONFIGS } from '../level/difficulty';

const TITLE_Y = 16;
const AUTO_SLOT_RECT = { x: 60, y: 56, w: 680, h: 72 } as const;
const MANUAL_GRID = {
  startX: 60,
  startY: 152,
  cardW: 132,
  cardH: 170,
  gapX: 8,
  gapY: 10,
  cols: 5,
  rows: 2,
} as const;
const RETURN_BTN = { x: 330, y: 502, w: 140, h: 32 } as const;

/** 简易二次确认对话框 */
interface ConfirmDialog {
  title: string;
  onConfirm: () => void;
}

export class SlotSelectScene extends SceneBase {
  private game: Game;
  private returnButton: Button;
  private confirmDialog: ConfirmDialog | null = null;
  /** 缓存的槽位元数据列表（enter 时刷新） */
  private slots: SlotMeta[] = [];

  constructor(game: Game) {
    super();
    this.game = game;
    this.returnButton = new Button(RETURN_BTN.x, RETURN_BTN.y, RETURN_BTN.w, RETURN_BTN.h, STRINGS.common.backToMenu);
  }

  enter(): void {
    this.refreshSlots();
    this.confirmDialog = null;
  }

  exit(): void {}

  update(_dt: number): void {}

  handleInput(input: Input): void {
    // 优先处理对话框
    if (this.confirmDialog) {
      this.handleDialogInput(input);
      return;
    }

    if (input.wasTapped()) {
      const pos = input.getTapPosition();

      // 自动槽位继续按钮（仅非空时响应）
      const autoMeta = this.slots[0];
      if (autoMeta && !autoMeta.empty) {
        const autoContinueRect = this.getAutoContinueButtonRect();
        if (pointInRect(pos.x, pos.y, autoContinueRect)) {
          // 加载自动槽位状态 + 进入 PLAYING
          this.game.restoreProgress();
          return;
        }
      }

      // 手动槽位卡片按钮
      for (let i = 0; i < 10; i++) {
        const slotId = i + 1;
        const meta = this.slots[i + 1];
        if (!meta) continue;
        const cardRect = this.getManualCardRect(i);

        if (!meta.empty) {
          // 载入按钮
          const loadRect = this.getCardActionRect(cardRect, 0);
          if (pointInRect(pos.x, pos.y, loadRect)) {
            this.game.loadFromManualSlot(slotId);
            return;
          }
          // 删除按钮
          const delRect = this.getCardActionRect(cardRect, 1);
          if (pointInRect(pos.x, pos.y, delRect)) {
            this.showConfirm(`删除槽位 #${slotId}？`, () => {
              this.game.getStorage().deleteManualSlot(slotId);
              this.refreshSlots();
            });
            return;
          }
        }
      }

      // 返回按钮
      if (this.returnButton.update(pos.x, pos.y, true)) {
        this.game.changeScene(GameState.MENU);
      }
    } else {
      this.returnButton.update(0, 0, false);
    }

    if (input.isJustPressed('Escape')) {
      this.game.changeScene(GameState.MENU);
    }
  }

  render(renderer: Renderer): void {
    renderer.clear('#1a1a2e');

    drawTextCentered(renderer, STRINGS.slotSelect.title, TITLE_Y, '#FFD700', 'LARGE');

    // 自动槽位卡片
    const autoMeta = this.slots[0];
    if (autoMeta) {
      this.renderAutoSlot(renderer, autoMeta);
    }

    // 分隔提示
    drawText(renderer, STRINGS.slotSelect.manualSlotsDivider, 200, 132, '#666688', 'SMALL');

    // 手动槽位网格
    for (let i = 0; i < 10; i++) {
      const meta = this.slots[i + 1];
      if (!meta) continue;
      this.renderManualSlot(renderer, this.getManualCardRect(i), meta, i + 1);
    }

    this.returnButton.render(renderer);

    // 对话框置顶
    if (this.confirmDialog) {
      this.renderDialog(renderer);
    }
  }

  // ============== 自动槽位渲染 ==============

  private renderAutoSlot(renderer: Renderer, meta: SlotMeta): void {
    const ctx = renderer.getContext();
    const rect = AUTO_SLOT_RECT;
    const empty = meta.empty;

    ctx.fillStyle = empty ? '#1f1f33' : '#2a3a4a';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);

    drawText(renderer, STRINGS.slotSelect.autoSlotLabel, rect.x + 12, rect.y + 10, '#FFD700', 'MEDIUM');

    if (empty) {
      drawText(renderer, STRINGS.slotSelect.autoSlotEmpty, rect.x + 12, rect.y + 40, '#888899', 'SMALL');
      drawText(renderer, STRINGS.slotSelect.emptyHint, rect.x + 12, rect.y + 55, '#666688', 'SMALL');
    } else {
      const cfg = DIFFICULTY_CONFIGS[meta.difficulty];
      drawText(renderer, `${STRINGS.slotSelect.fieldDifficulty}${cfg.name}`, rect.x + 180, rect.y + 12, cfg.color, 'SMALL');
      drawText(renderer, `${STRINGS.slotSelect.fieldLevelPrefix}${meta.currentLevel}${STRINGS.slotSelect.fieldLevelSuffix}`, rect.x + 320, rect.y + 12, '#FFFFFF', 'SMALL');
      drawText(renderer, `$${meta.currentMoney}`, rect.x + 420, rect.y + 12, '#FFD700', 'SMALL');
      drawText(renderer, `${STRINGS.slotSelect.fieldLastPlayed}${formatTime(meta.lastPlayedAt)}`, rect.x + 12, rect.y + 40, '#888899', 'SMALL');
      drawText(renderer, `${STRINGS.slotSelect.fieldHighScore}${meta.highScore}`, rect.x + 12, rect.y + 55, '#88FF88', 'SMALL');

      // 继续按钮
      const btn = this.getAutoContinueButtonRect();
      ctx.fillStyle = '#5DC4DD';
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      drawTextCenteredIn(renderer, STRINGS.common.continueGame, btn, '#000000', 'MEDIUM');
    }
  }

  private getAutoContinueButtonRect(): { x: number; y: number; w: number; h: number } {
    return { x: AUTO_SLOT_RECT.x + AUTO_SLOT_RECT.w - 130, y: AUTO_SLOT_RECT.y + 36, w: 120, h: 28 };
  }

  // ============== 手动槽位渲染 ==============

  private renderManualSlot(
    renderer: Renderer,
    rect: { x: number; y: number; w: number; h: number },
    meta: SlotMeta,
    slotId: number,
  ): void {
    const ctx = renderer.getContext();
    const empty = meta.empty;

    ctx.fillStyle = empty ? '#1a1a2a' : '#26263a';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = empty ? '#444466' : '#6688AA';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    // 槽位编号
    drawText(renderer, `#${slotId}`, rect.x + 8, rect.y + 6, '#888899', 'SMALL');

    if (empty) {
      drawTextCenteredIn(renderer, STRINGS.slotSelect.manualSlotEmpty, { x: rect.x, y: rect.y + rect.h / 2 - 10, w: rect.w, h: 20 }, '#666688', 'SMALL');
    } else {
      const cfg = DIFFICULTY_CONFIGS[meta.difficulty];
      drawText(renderer, cfg.name, rect.x + 8, rect.y + 26, cfg.color, 'SMALL');
      drawText(renderer, `${STRINGS.slotSelect.fieldLevelPrefix}${meta.currentLevel}${STRINGS.slotSelect.fieldLevelSuffix}`, rect.x + 8, rect.y + 46, '#FFFFFF', 'SMALL');
      drawText(renderer, `$${meta.currentMoney}`, rect.x + 8, rect.y + 66, '#FFD700', 'SMALL');
      drawText(renderer, formatTime(meta.lastPlayedAt), rect.x + 8, rect.y + 86, '#888899', 'SMALL');

      // 载入按钮
      const loadRect = this.getCardActionRect(rect, 0);
      ctx.fillStyle = '#5DC4DD';
      ctx.fillRect(loadRect.x, loadRect.y, loadRect.w, loadRect.h);
      drawTextCenteredIn(renderer, STRINGS.slotSelect.load, loadRect, '#000000', 'SMALL');

      // 删除按钮
      const delRect = this.getCardActionRect(rect, 1);
      ctx.fillStyle = '#883333';
      ctx.fillRect(delRect.x, delRect.y, delRect.w, delRect.h);
      drawTextCenteredIn(renderer, STRINGS.slotSelect.delete, delRect, '#FFFFFF', 'SMALL');
    }
  }

  private getManualCardRect(index: number): { x: number; y: number; w: number; h: number } {
    const col = index % MANUAL_GRID.cols;
    const row = Math.floor(index / MANUAL_GRID.cols);
    return {
      x: MANUAL_GRID.startX + col * (MANUAL_GRID.cardW + MANUAL_GRID.gapX),
      y: MANUAL_GRID.startY + row * (MANUAL_GRID.cardH + MANUAL_GRID.gapY),
      w: MANUAL_GRID.cardW,
      h: MANUAL_GRID.cardH,
    };
  }

  /** 卡片底部 2 个按钮：0=载入 / 1=删除 */
  private getCardActionRect(
    card: { x: number; y: number; w: number; h: number },
    btnIndex: number,
  ): { x: number; y: number; w: number; h: number } {
    const btnH = 24;
    const btnY = card.y + card.h - btnH - 6;
    const btnW = (card.w - 18) / 2;
    return {
      x: card.x + 6 + btnIndex * (btnW + 6),
      y: btnY,
      w: btnW,
      h: btnH,
    };
  }

  // ============== 对话框 ==============

  private showConfirm(title: string, onConfirm: () => void): void {
    this.confirmDialog = { title, onConfirm };
  }

  private handleDialogInput(input: Input): void {
    if (!input.wasTapped()) return;
    const pos = input.getTapPosition();

    const yesRect = this.getDialogButtonRect(0);
    const noRect = this.getDialogButtonRect(1);

    if (pointInRect(pos.x, pos.y, yesRect)) {
      this.confirmDialog?.onConfirm();
      this.confirmDialog = null;
    } else if (pointInRect(pos.x, pos.y, noRect)) {
      this.confirmDialog = null;
    }
  }

  private renderDialog(renderer: Renderer): void {
    if (!this.confirmDialog) return;
    const ctx = renderer.getContext();

    // 遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    // 对话框
    const dx = 280, dy = 200, dw = 240, dh = 140;
    ctx.fillStyle = '#1f1f33';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);

    drawTextCentered(renderer, this.confirmDialog.title, dy + 30, '#FFFFFF', 'MEDIUM');
    drawTextCentered(renderer, STRINGS.common.undoWarning, dy + 65, '#FF8888', 'SMALL');

    const yesRect = this.getDialogButtonRect(0);
    const noRect = this.getDialogButtonRect(1);

    ctx.fillStyle = '#883333';
    ctx.fillRect(yesRect.x, yesRect.y, yesRect.w, yesRect.h);
    drawTextCenteredIn(renderer, STRINGS.slotSelect.confirmDeleteTitle, yesRect, '#FFFFFF', 'MEDIUM');

    ctx.fillStyle = '#444466';
    ctx.fillRect(noRect.x, noRect.y, noRect.w, noRect.h);
    drawTextCenteredIn(renderer, STRINGS.common.cancel, noRect, '#FFFFFF', 'MEDIUM');
  }

  private getDialogButtonRect(idx: number): { x: number; y: number; w: number; h: number } {
    const dx = 280, dy = 200, dw = 240;
    const btnW = 100, btnH = 32;
    const gap = 20;
    const totalW = btnW * 2 + gap;
    const startX = dx + (dw - totalW) / 2;
    return {
      x: startX + idx * (btnW + gap),
      y: dy + 95,
      w: btnW,
      h: btnH,
    };
  }

  // ============== 工具 ==============

  private refreshSlots(): void {
    this.slots = this.game.getStorage().listAllSlots();
    // 确保索引 0=自动槽位，1-10=手动槽位
    this.slots.sort((a, b) => a.slotId - b.slotId);
  }
}

/** 时间戳格式化（如 "刚刚" / "5 分钟前" / "昨天 14:30"） */
function formatTime(ts: number): string {
  if (!ts) return STRINGS.slotSelect.neverPlayed;
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return STRINGS.slotSelect.justNow;
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 同步导出便于 Game 引用
export { AUTO_SLOT_ID, SlotKind };
