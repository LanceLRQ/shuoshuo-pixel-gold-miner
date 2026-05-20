/**
 * 难度选择场景
 * 玩家在"新游戏"流程中选择难度，确定后调用 game.startNewGame() 进入 PLAYING
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawText, drawTextCentered, drawTextCenteredAt, FONT_SIZES, type FontSize } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { pointInRect } from '../utils/collision';
import {
  DIFFICULTY_CONFIGS,
  DIFFICULTY_DISPLAY_ORDER,
  type DifficultyConfig,
} from '../level/difficulty';

/** 卡片布局（横屏 800×540，5 张卡片横排） */
const CARD_LAYOUT = {
  width: 140,
  height: 320,
  gap: 12,
  startY: 110,
} as const;

const TITLE_Y = 40;
const RETURN_BTN = { x: 330, y: 470, w: 140, h: 36 } as const;

export class DifficultyScene extends SceneBase {
  private game: Game;
  /** 当前 hover 的卡片索引（-1 表示无） */
  private hoverIndex: number = -1;
  /** 返回按钮 */
  private returnButton: Button;

  constructor(game: Game) {
    super();
    this.game = game;
    this.returnButton = new Button(RETURN_BTN.x, RETURN_BTN.y, RETURN_BTN.w, RETURN_BTN.h, '返回主菜单');
  }

  enter(): void {}

  exit(): void {}

  update(_dt: number): void {}

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();

      // 检测难度卡片点击
      for (let i = 0; i < DIFFICULTY_DISPLAY_ORDER.length; i++) {
        const rect = this.getCardRect(i);
        if (pointInRect(pos.x, pos.y, rect)) {
          const difficulty = DIFFICULTY_DISPLAY_ORDER[i]!;
          this.game.startNewGame(difficulty);
          return;
        }
      }

      // 返回按钮
      if (this.returnButton.update(pos.x, pos.y, true)) {
        this.game.changeScene(GameState.MENU);
      }
    } else {
      // 非点击：更新 hover 状态
      const pos = input.getTapPosition();
      this.hoverIndex = -1;
      for (let i = 0; i < DIFFICULTY_DISPLAY_ORDER.length; i++) {
        const rect = this.getCardRect(i);
        if (pointInRect(pos.x, pos.y, rect)) {
          this.hoverIndex = i;
          break;
        }
      }
      this.returnButton.update(pos.x, pos.y, false);
    }

    // ESC 返回
    if (input.isJustPressed('Escape')) {
      this.game.changeScene(GameState.MENU);
    }
  }

  render(renderer: Renderer): void {
    renderer.clear('#1a1a2e');

    drawTextCentered(renderer, '选择难度', TITLE_Y, '#FFD700', 'LARGE');
    drawTextCentered(renderer, '不同难度影响金额倍率、时间长度、重量影响、商店与道具机制', TITLE_Y + 38, '#888899', 'SMALL');

    for (let i = 0; i < DIFFICULTY_DISPLAY_ORDER.length; i++) {
      const id = DIFFICULTY_DISPLAY_ORDER[i]!;
      const cfg = DIFFICULTY_CONFIGS[id];
      const rect = this.getCardRect(i);
      this.renderCard(renderer, rect, cfg, i === this.hoverIndex);
    }

    this.returnButton.render(renderer);
  }

  /** 计算第 i 张卡片的矩形区域（5 张横排居中） */
  private getCardRect(index: number): { x: number; y: number; w: number; h: number } {
    const totalCount = DIFFICULTY_DISPLAY_ORDER.length;
    const totalWidth = CARD_LAYOUT.width * totalCount + CARD_LAYOUT.gap * (totalCount - 1);
    const startX = (800 - totalWidth) / 2;
    return {
      x: startX + index * (CARD_LAYOUT.width + CARD_LAYOUT.gap),
      y: CARD_LAYOUT.startY,
      w: CARD_LAYOUT.width,
      h: CARD_LAYOUT.height,
    };
  }

  /** 渲染单张难度卡片 */
  private renderCard(
    renderer: Renderer,
    rect: { x: number; y: number; w: number; h: number },
    cfg: DifficultyConfig,
    hover: boolean,
  ): void {
    const ctx = renderer.getContext();
    const bgColor = hover ? '#2a2a4a' : '#1f1f33';
    const borderWidth = hover ? 3 : 2;

    // 背景 + 边框（边框使用难度色）
    ctx.fillStyle = bgColor;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);

    // 顶部色带（难度色）
    ctx.fillStyle = cfg.color;
    ctx.fillRect(rect.x + 4, rect.y + 4, rect.w - 8, 6);

    // 难度名（大字）
    const centerX = rect.x + rect.w / 2;
    drawTextCenteredAt(renderer, cfg.name, centerX, rect.y + 24, '#FFFFFF', 'LARGE');

    // 描述（小字两行）
    this.renderWrappedText(renderer, cfg.description, rect.x + 10, rect.y + 70, rect.w - 20, '#AAAAAA', 'SMALL');

    // 参数列表
    const paramY = rect.y + 130;
    const lineHeight = 22;
    drawText(renderer, `金额:`, rect.x + 12, paramY, '#888899', 'SMALL');
    drawText(renderer, this.formatScale(cfg.valueScale, 'x'), rect.x + rect.w - 50, paramY, '#FFD700', 'SMALL');

    drawText(renderer, `时间:`, rect.x + 12, paramY + lineHeight, '#888899', 'SMALL');
    drawText(renderer, this.formatScale(cfg.timeScale, 'x'), rect.x + rect.w - 50, paramY + lineHeight, '#FFD700', 'SMALL');

    drawText(renderer, `重量:`, rect.x + 12, paramY + lineHeight * 2, '#888899', 'SMALL');
    drawText(renderer, cfg.weightFactorScale === 0 ? '无' : `${cfg.weightFactorScale}x`, rect.x + rect.w - 50, paramY + lineHeight * 2, '#FFD700', 'SMALL');

    drawText(renderer, `商店:`, rect.x + 12, paramY + lineHeight * 3, '#888899', 'SMALL');
    drawText(renderer, cfg.shopEnabled ? '开放' : '禁用', rect.x + rect.w - 50, paramY + lineHeight * 3, cfg.shopEnabled ? '#88FF88' : '#FF6464', 'SMALL');

    drawText(renderer, `道具:`, rect.x + 12, paramY + lineHeight * 4, '#888899', 'SMALL');
    drawText(renderer, cfg.infiniteItems ? '无限' : '需买', rect.x + rect.w - 50, paramY + lineHeight * 4, cfg.infiniteItems ? '#88FFFF' : '#FFD700', 'SMALL');

    // 底部"开始"提示
    const startY = rect.y + rect.h - 40;
    ctx.fillStyle = hover ? cfg.color : '#444466';
    ctx.fillRect(rect.x + 10, startY, rect.w - 20, 28);
    drawTextCenteredAt(renderer, hover ? '点击开始' : '选择', centerX, startY + 6, hover ? '#000000' : '#CCCCCC', 'MEDIUM');
  }

  /** 在指定区域内换行渲染文本（按字符宽度估算） */
  private renderWrappedText(
    renderer: Renderer,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    color: string,
    size: FontSize,
  ): void {
    const ctx = renderer.getContext();
    const fontSize = FONT_SIZES[size];
    ctx.font = `bold ${fontSize}px monospace`;
    const lineHeight = fontSize + 4;

    const chars = text.split('');
    let line = '';
    let curY = y;
    for (const ch of chars) {
      const testLine = line + ch;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        drawText(renderer, line, x, curY, color, size);
        line = ch;
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) drawText(renderer, line, x, curY, color, size);
  }

  /** 格式化倍率（如 2 → "2x" / 0.5 → "0.5x"） */
  private formatScale(value: number, suffix: string): string {
    return `${value}${suffix}`;
  }
}
