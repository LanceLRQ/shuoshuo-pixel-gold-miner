/**
 * 游戏结束场景
 * 显示最终得分、到达关卡、最高分
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { STRINGS } from '../ui/strings';
import { isEndlessLevel, TOTAL_LEVELS } from '../level/levels';

export class GameOverScene extends SceneBase {
  private game: Game;
  private score: number;
  private button: Button;
  /** 标题文案：无尽模式失败用"无尽挑战结束"（constructor 一次性算，避免 render 重复构造字符串） */
  private readonly title: string;
  /** 关卡显示文案：无尽模式显示"坚持到无尽第 N 关"，普通显示"到达关卡: 第 N 关" */
  private readonly levelText: string;

  constructor(game: Game, score: number, level: number) {
    super();
    this.game = game;
    this.score = score;
    this.button = new Button(330, 400, 140, 44, STRINGS.gameOver.restart);
    const endless = isEndlessLevel(level);
    this.title = endless ? STRINGS.gameOver.titleEndless : STRINGS.gameOver.title;
    this.levelText = endless
      ? `坚持到无尽第 ${level - TOTAL_LEVELS} 关`
      : `到达关卡: 第 ${level} 关`;
  }

  enter(): void {}

  exit(): void {}

  update(_dt: number): void {}

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();
      if (this.button.containsPoint(pos.x, pos.y)) {
        this.game.changeScene(GameState.MENU);
        return;
      }
    }
    if (input.isJustPressed('Space')) {
      this.game.changeScene(GameState.MENU);
    }
  }

  render(renderer: Renderer): void {
    renderer.clear('#1a1a2e');

    // 标题 + 关卡显示（文案在 constructor 已算好，render 直读字段）
    drawTextCentered(renderer, this.title, 80, '#FF4444', 'TITLE');
    drawTextCentered(renderer, `最终得分: $${this.score}`, 180, '#FFD700', 'LARGE');
    drawTextCentered(renderer, this.levelText, 240, '#AAAAAA', 'MEDIUM');

    // 最高分
    const highScore = this.game.getStorage().getHighScore();
    if (highScore > 0) {
      drawTextCentered(renderer, `最高分: $${highScore}`, 300, '#FFFFFF', 'MEDIUM');
    }

    // 重新开始按钮
    this.button.render(renderer);
  }
}
