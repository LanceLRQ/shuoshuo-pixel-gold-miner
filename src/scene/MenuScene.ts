/**
 * 主菜单场景
 * 游戏入口画面，显示标题、开始按钮、最高分
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { Storage } from '../core/Storage';
import { drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { renderBackground } from '../assets/background';

export class MenuScene extends SceneBase {
  private game: Game;
  private storage: Storage;
  private startButton: Button;
  private highScore: number;

  /** 标题动画时间 */
  private animTime: number = 0;

  constructor(game: Game) {
    super();
    this.game = game;
    this.storage = new Storage();
    this.highScore = this.storage.getHighScore();

    // 开始按钮（居中）
    this.startButton = new Button(165, 400, 150, 48, '开始游戏');
  }

  enter(): void {
    this.animTime = 0;
    this.highScore = this.storage.getHighScore();
  }

  exit(): void {}

  update(dt: number): void {
    this.animTime += dt;
  }

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();
      if (this.startButton.containsPoint(pos.x, pos.y)) {
        this.game.changeScene(GameState.PLAYING);
        return;
      }
    }
    // 空格也可开始
    if (input.isJustPressed('Space')) {
      this.game.changeScene(GameState.PLAYING);
    }
  }

  render(renderer: Renderer): void {
    // 绘制背景
    renderBackground(renderer, renderer.width, renderer.height);

    // 半透明遮罩
    renderer.fillRect(0, 0, renderer.width, renderer.height, 'rgba(0, 0, 0, 0.3)');

    // 标题（带动画浮动效果）
    const titleY = 150 + Math.sin(this.animTime * 2) * 8;
    drawTextCentered(renderer, '黄金矿工', titleY, '#FFD700', 'TITLE');
    drawTextCentered(renderer, 'H5', titleY + 45, '#FFA500', 'LARGE');

    // 最高分
    if (this.highScore > 0) {
      drawTextCentered(renderer, `最高分: $${this.highScore}`, 340, '#FFFFFF', 'MEDIUM');
    }

    // 操作提示
    drawTextCentered(renderer, '按空格或点击开始', 480, '#AAAAAA', 'SMALL');

    // 开始按钮
    this.startButton.render(renderer);
  }
}
