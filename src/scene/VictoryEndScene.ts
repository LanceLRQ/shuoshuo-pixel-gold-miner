/**
 * 通关终局结算场景（VictoryEndScene）
 *
 * 触发：玩家在 VictoryScene 选择「立即结算 🏆」后进入。
 * 与 GameOverScene 完全解耦：独立标题、独立配色、独立布局，
 * 主要差异是「通关成功」语境下的勋章式结算，而非「游戏结束」基调。
 *
 * 注：排行榜提交、最高分更新、自动槽位清理在 Game.changeScene(VICTORY_END) 时完成，
 * 本场景只负责呈现 + 返回菜单按钮。
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { STRINGS } from '../ui/strings';
import { getDifficultyConfig, type Difficulty } from '../level/difficulty';
import { TOTAL_LEVELS } from '../level/levels';

export class VictoryEndScene extends SceneBase {
  private game: Game;

  /** 进入时快照（避免 render 时重复读取） */
  private readonly finalMoney: number;
  private readonly highScore: number;
  private readonly difficultyName: string;

  private backButton: Button;
  private buttonHandled: boolean = false;

  /** 入场动画：奖牌从下方弹起 + 标题渐入 */
  private elapsed: number = 0;

  constructor(game: Game, finalMoney: number, difficulty: Difficulty) {
    super();
    this.game = game;
    this.finalMoney = finalMoney;
    this.highScore = game.getStorage().getHighScore();
    this.difficultyName = getDifficultyConfig(difficulty).name;

    // 800×540 居中：x = (800-140)/2 = 330
    this.backButton = new Button(330, 470, 140, 44, STRINGS.victoryEnd.backToMenu);
  }

  enter(): void {
    this.buttonHandled = false;
    this.elapsed = 0;
  }

  exit(): void {}

  update(dt: number): void {
    this.elapsed += dt;
  }

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();
      if (!this.buttonHandled && this.backButton.update(pos.x, pos.y, true)) {
        this.buttonHandled = true;
        this.handleBack();
        return;
      }
    } else {
      this.backButton.update(0, 0, false);
    }
    if (input.isJustPressed('Space') && !this.buttonHandled) {
      this.buttonHandled = true;
      this.handleBack();
    }
  }

  render(renderer: Renderer): void {
    renderer.clear('#0d0a1f');

    // 奖牌（弹起动画：从屏幕下方位移到中央位置）— 800×540 居中
    // medalT=0 → cy=340（屏外），medalT=1 → cy=230（最终位，避开标题与统计区）
    const medalT = Math.min(this.elapsed / 0.6, 1);
    const medalY = 340 - 110 * easeOutCubic(medalT);
    this.renderMedal(renderer, renderer.width / 2, medalY);

    // 标题（奖牌之后渐入）
    const titleAlpha = clamp01((this.elapsed - 0.3) / 0.4);
    if (titleAlpha > 0) {
      const ctx = renderer.getContext();
      ctx.globalAlpha = titleAlpha;
      drawTextCentered(renderer, STRINGS.victoryEnd.title, 60, '#FFD700', 'TITLE');
      drawTextCentered(renderer, STRINGS.victoryEnd.subtitle, 108, '#FFFFFF', 'MEDIUM');
      drawTextCentered(renderer, STRINGS.victoryEnd.flavor, 134, '#C9B6FF', 'SMALL');
      ctx.globalAlpha = 1;
    }

    // 统计数据（再延后渐入）
    const statsAlpha = clamp01((this.elapsed - 0.7) / 0.4);
    if (statsAlpha > 0) {
      const ctx = renderer.getContext();
      ctx.globalAlpha = statsAlpha;
      drawTextCentered(renderer, `${STRINGS.victoryEnd.finalScore}${this.finalMoney}`, 300, '#FFEC8B', 'LARGE');
      drawTextCentered(renderer, `${STRINGS.victoryEnd.highScore}${this.highScore}`, 350, '#FFFFFF', 'MEDIUM');
      drawTextCentered(renderer, `${STRINGS.victoryEnd.difficulty}${this.difficultyName}`, 384, '#B4F0FF', 'MEDIUM');
      drawTextCentered(renderer, `${STRINGS.victoryEnd.clearedPrefix}${TOTAL_LEVELS}`, 418, '#C9B6FF', 'MEDIUM');
      ctx.globalAlpha = 1;
    }

    this.backButton.render(renderer);
  }

  /** 简易像素奖牌：金色圆盘 + 红色绶带 + ★ 字符 */
  private renderMedal(renderer: Renderer, cx: number, cy: number): void {
    const ctx = renderer.getContext();

    // 绶带（红色三角片）
    ctx.fillStyle = '#C62828';
    ctx.beginPath();
    ctx.moveTo(cx - 28, cy - 40);
    ctx.lineTo(cx,      cy);
    ctx.lineTo(cx - 14, cy - 60);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 28, cy - 40);
    ctx.lineTo(cx,      cy);
    ctx.lineTo(cx + 14, cy - 60);
    ctx.closePath();
    ctx.fill();

    // 圆盘外圈（深金）
    ctx.fillStyle = '#5A3A0A';
    ctx.beginPath();
    ctx.arc(cx, cy, 36, 0, Math.PI * 2);
    ctx.fill();
    // 圆盘内圈（亮金）
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    // 内圈高光
    ctx.fillStyle = '#FFEC8B';
    ctx.beginPath();
    ctx.arc(cx - 8, cy - 8, 8, 0, Math.PI * 2);
    ctx.fill();

    // 中央 ★ 字符（用粗字符即可）
    ctx.fillStyle = '#5A3A0A';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy + 2);
    ctx.textAlign = 'start';
  }

  /** 返回菜单：进度已在 changeScene(VICTORY_END) 时清掉 */
  private handleBack(): void {
    this.game.changeScene(GameState.MENU);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
