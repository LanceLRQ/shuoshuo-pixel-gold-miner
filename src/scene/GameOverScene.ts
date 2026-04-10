/**
 * 游戏结束场景
 * 显示最终得分、到达关卡、最高分
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { Storage } from '../core/Storage';
import { drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';

export class GameOverScene extends SceneBase {
  private game: Game;
  private score: number;
  private level: number;
  private storage: Storage;
  private button: Button;

  constructor(game: Game, score: number, level: number) {
    super();
    this.game = game;
    this.score = score;
    this.level = level;
    this.storage = new Storage();
    this.button = new Button(330, 400, 140, 44, '重新开始');
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

    // 标题
    drawTextCentered(renderer, '游戏结束', 80, '#FF4444', 'TITLE');

    // 最终得分
    drawTextCentered(renderer, `最终得分: $${this.score}`, 180, '#FFD700', 'LARGE');

    // 到达关卡
    drawTextCentered(renderer, `到达关卡: 第 ${this.level} 关`, 240, '#AAAAAA', 'MEDIUM');

    // 最高分
    const highScore = this.storage.getHighScore();
    if (highScore > 0) {
      drawTextCentered(renderer, `最高分: $${highScore}`, 300, '#FFFFFF', 'MEDIUM');
    }

    // 重新开始按钮
    this.button.render(renderer);
  }
}
