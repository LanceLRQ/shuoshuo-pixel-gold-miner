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
import { STRINGS } from '../ui/strings';
import { pointInRect } from '../utils/collision';
import {
  DIFFICULTY_CONFIGS,
  DIFFICULTY_DISPLAY_ORDER,
  type DifficultyConfig,
} from '../level/difficulty';

/** 卡片布局（800×540，2:2:1 上下排列：4 张普通卡 + 1 张无尽长条卡） */
const TOP_CARD_W = 230;
const TOP_CARD_H = 130;
const GAP_X = 28;
const GAP_Y = 14;
const TOP_ROW1_Y = 92;
const TOP_ROW2_Y = TOP_ROW1_Y + TOP_CARD_H + GAP_Y; // 236
const BOTTOM_CARD_H = 64;
const BOTTOM_Y = TOP_ROW2_Y + TOP_CARD_H + GAP_Y;   // 380
const TOP_GRID_W = TOP_CARD_W * 2 + GAP_X;          // 488
const TOP_GRID_START_X = (800 - TOP_GRID_W) / 2;    // 156

const TITLE_Y = 40;
const RETURN_BTN = { x: 330, y: 460, w: 140, h: 36 } as const;

/** 把 valueScale 数值转成模糊词标签（颜色根据档位由绿→红渐变） */
function moneyLabel(v: number): { text: string; color: string } {
  if (v >= 1.2) return { text: STRINGS.difficulty.money.rich, color: '#88FF88' };
  if (v >= 0.7) return { text: STRINGS.difficulty.money.normal, color: '#FFD700' };
  if (v >= 0.3) return { text: STRINGS.difficulty.money.poor, color: '#FFA040' };
  return { text: STRINGS.difficulty.money.scarce, color: '#FF6464' };
}

/** 把 timeScale 数值转成模糊词标签 */
function timeLabel(v: number): { text: string; color: string } {
  if (v >= 1.2) return { text: STRINGS.difficulty.time.plenty, color: '#88FF88' };
  if (v >= 0.8) return { text: STRINGS.difficulty.time.normal, color: '#FFD700' };
  return { text: STRINGS.difficulty.time.tight, color: '#FF6464' };
}

export class DifficultyScene extends SceneBase {
  private game: Game;
  /** 当前 hover 的卡片索引（-1 表示无） */
  private hoverIndex: number = -1;
  /** 返回按钮 */
  private returnButton: Button;

  constructor(game: Game) {
    super();
    this.game = game;
    this.returnButton = new Button(RETURN_BTN.x, RETURN_BTN.y, RETURN_BTN.w, RETURN_BTN.h, STRINGS.common.backToMenu);
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

    drawTextCentered(renderer, STRINGS.difficulty.title, TITLE_Y, '#FFD700', 'LARGE');

    for (let i = 0; i < DIFFICULTY_DISPLAY_ORDER.length; i++) {
      const id = DIFFICULTY_DISPLAY_ORDER[i]!;
      const cfg = DIFFICULTY_CONFIGS[id];
      const rect = this.getCardRect(i);
      const isInfinite = i === DIFFICULTY_DISPLAY_ORDER.length - 1;
      this.renderCard(renderer, rect, cfg, i === this.hoverIndex, isInfinite);
    }

    this.returnButton.render(renderer);
  }

  /**
   * 计算第 i 张卡片的矩形区域
   *  - index 0~3：2×2 网格（230×130 卡片）
   *  - index 4 (INFINITE)：独占底部一行（488×64 长条卡）
   */
  private getCardRect(index: number): { x: number; y: number; w: number; h: number } {
    if (index < 4) {
      const row = Math.floor(index / 2);
      const col = index % 2;
      return {
        x: TOP_GRID_START_X + col * (TOP_CARD_W + GAP_X),
        y: row === 0 ? TOP_ROW1_Y : TOP_ROW2_Y,
        w: TOP_CARD_W,
        h: TOP_CARD_H,
      };
    }
    // INFINITE：长条独占底部一行
    return {
      x: TOP_GRID_START_X,
      y: BOTTOM_Y,
      w: TOP_GRID_W,
      h: BOTTOM_CARD_H,
    };
  }

  /** 渲染单张难度卡片：普通卡（230×130）走纵向布局；INFINITE 长条卡走横向布局 */
  private renderCard(
    renderer: Renderer,
    rect: { x: number; y: number; w: number; h: number },
    cfg: DifficultyConfig,
    hover: boolean,
    isInfinite: boolean,
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
    ctx.fillRect(rect.x + 4, rect.y + 4, rect.w - 8, 5);

    if (isInfinite) {
      this.renderInfiniteCardContent(renderer, rect, cfg);
    } else {
      this.renderNormalCardContent(renderer, rect, cfg);
    }
  }

  /** 普通卡内容（230×130 纵向布局：难度名 + 描述 + 关键参数行） */
  private renderNormalCardContent(
    renderer: Renderer,
    rect: { x: number; y: number; w: number; h: number },
    cfg: DifficultyConfig,
  ): void {
    const centerX = rect.x + rect.w / 2;
    // 难度名（大字）
    drawTextCenteredAt(renderer, cfg.name, centerX, rect.y + 18, '#FFFFFF', 'LARGE');
    // 描述（小字换行，2 行内）
    this.renderWrappedText(renderer, cfg.description, rect.x + 12, rect.y + 56, rect.w - 24, '#AAAAAA', 'SMALL');
    // 底部一行关键参数：用模糊词替代数字（玩家可凭颜色感知差异）
    const paramY = rect.y + rect.h - 22;
    const money = moneyLabel(cfg.valueScale);
    const time = timeLabel(cfg.timeScale);
    drawText(renderer, `${STRINGS.difficulty.moneyLabel} ${money.text}`, rect.x + 12, paramY, money.color, 'SMALL');
    drawText(renderer, `${STRINGS.difficulty.timeLabel} ${time.text}`, rect.x + 110, paramY, time.color, 'SMALL');
  }

  /** INFINITE 长条卡内容（488×64 横向布局：左 难度名 / 中 描述 / 右 标志） */
  private renderInfiniteCardContent(
    renderer: Renderer,
    rect: { x: number; y: number; w: number; h: number },
    cfg: DifficultyConfig,
  ): void {
    const midY = rect.y + rect.h / 2;
    // 左侧：难度名
    drawText(renderer, cfg.name, rect.x + 20, midY - 12, '#FFFFFF', 'LARGE');
    // 中部：描述
    drawText(renderer, cfg.description, rect.x + 170, midY - 6, '#CCCCCC', 'SMALL');
    // 右侧：道具无限标志
    drawText(renderer, cfg.infiniteItems ? STRINGS.difficulty.infiniteItemsBadge : '', rect.x + rect.w - 130, midY - 6, '#88FFFF', 'SMALL');
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
}
