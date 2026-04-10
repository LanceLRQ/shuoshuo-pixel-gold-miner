/**
 * 结算界面场景
 * 显示本关得分，达标/未达标判定
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';

export class ResultScene extends SceneBase {
  private game: Game;
  private earnedMoney: number;
  private targetMoney: number;
  private isPassed: boolean;
  private continueButton: Button;
  private buttonHandled: boolean = false;

  constructor(game: Game, earnedMoney: number, targetMoney: number) {
    super();
    this.game = game;
    this.earnedMoney = earnedMoney;
    this.targetMoney = targetMoney;
    this.isPassed = earnedMoney >= targetMoney;

    // 继续按钮（横屏 800x480 居中）
    const btnLabel = this.isPassed ? '进入商店' : '重新开始';
    this.continueButton = new Button(330, 350, 140, 44, btnLabel);
  }

  enter(): void {
    this.buttonHandled = false;
  }

  exit(): void {}

  update(_dt: number): void {}

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();
      const clicked = this.continueButton.update(pos.x, pos.y, true);
      if (clicked && !this.buttonHandled) {
        this.buttonHandled = true;
        this.handleContinue();
      }
    } else {
      // 非点击时只更新悬停状态
      this.continueButton.update(0, 0, false);
    }

    // 空格键也可继续
    if (input.isJustPressed('Space') && !this.buttonHandled) {
      this.buttonHandled = true;
      this.handleContinue();
    }
  }

  render(renderer: Renderer): void {
    renderer.clear('#1a1a2e');

    // 标题
    drawTextCentered(renderer, '关卡结算', 70, '#FFFFFF', 'LARGE');

    // 结果
    const resultText = this.isPassed ? '恭喜达标！' : '未达标...';
    const resultColor = this.isPassed ? '#00FF00' : '#FF4444';
    drawTextCentered(renderer, resultText, 140, resultColor, 'LARGE');

    // 金额信息
    drawTextCentered(renderer, `获得金额: $${this.earnedMoney}`, 220, '#FFD700', 'MEDIUM');
    drawTextCentered(renderer, `目标金额: $${this.targetMoney}`, 260, '#AAAAAA', 'MEDIUM');

    // 继续/重试按钮
    this.continueButton.render(renderer);
  }

  /** 处理继续操作 */
  private handleContinue(): void {
    if (this.isPassed) {
      // 最后一关打完 → 游戏结束
      if (!this.game.getLevelManager().hasNextLevel()) {
        this.game.changeScene(GameState.GAME_OVER);
      } else {
        // 还有下一关 → 进入商店
        this.game.changeScene(GameState.SHOP);
      }
    } else {
      // 未达标返回菜单
      this.game.changeScene(GameState.MENU);
    }
  }
}
