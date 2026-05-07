/**
 * 结算界面场景
 * 显示本关得分，达标/未达标判定
 * 失败时提供"重试本关"和"返回主菜单"两个选择
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
  /** 主操作按钮（通过=进入商店；失败=重试本关） */
  private primaryButton: Button;
  /** 次要按钮（仅失败时显示，返回主菜单） */
  private secondaryButton: Button | null = null;
  private buttonHandled: boolean = false;

  constructor(game: Game, earnedMoney: number, targetMoney: number) {
    super();
    this.game = game;
    this.earnedMoney = earnedMoney;
    this.targetMoney = targetMoney;
    this.isPassed = earnedMoney >= targetMoney;

    if (this.isPassed) {
      // 通过：单按钮居中
      this.primaryButton = new Button(330, 360, 140, 44, '进入商店');
    } else {
      // 失败：双按钮并排
      this.primaryButton = new Button(240, 360, 140, 44, '重试本关');
      this.secondaryButton = new Button(420, 360, 140, 44, '返回菜单');
    }
  }

  enter(): void {
    this.buttonHandled = false;
  }

  exit(): void {}

  update(_dt: number): void {}

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();
      const primaryClicked = this.primaryButton.update(pos.x, pos.y, true);
      if (primaryClicked && !this.buttonHandled) {
        this.buttonHandled = true;
        this.handlePrimary();
        return;
      }
      if (this.secondaryButton) {
        const secondaryClicked = this.secondaryButton.update(pos.x, pos.y, true);
        if (secondaryClicked && !this.buttonHandled) {
          this.buttonHandled = true;
          this.handleSecondary();
          return;
        }
      }
    } else {
      // 非点击只更新悬停状态
      this.primaryButton.update(0, 0, false);
      if (this.secondaryButton) {
        this.secondaryButton.update(0, 0, false);
      }
    }

    // 空格键执行主操作
    if (input.isJustPressed('Space') && !this.buttonHandled) {
      this.buttonHandled = true;
      this.handlePrimary();
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

    // 按钮
    this.primaryButton.render(renderer);
    if (this.secondaryButton) {
      this.secondaryButton.render(renderer);
    }
  }

  /** 主按钮：通过=进入商店或通关；失败=重试本关 */
  private handlePrimary(): void {
    if (this.isPassed) {
      // 最后一关 → 通关结束
      if (!this.game.getLevelManager().hasNextLevel()) {
        this.game.changeScene(GameState.GAME_OVER);
      } else {
        // 还有下一关 → 进入商店
        this.game.changeScene(GameState.SHOP);
      }
    } else {
      // 失败 → 重试本关（保留累计金额和已购道具）
      this.game.retryCurrentLevel();
    }
  }

  /** 次按钮：失败时返回主菜单（清进度） */
  private handleSecondary(): void {
    this.game.clearProgress();
    this.game.changeScene(GameState.MENU);
  }
}
