/**
 * 结算界面场景
 * 3 阶段动画：获得金额 tween → Bonus tween → 总计金额
 * 达标时显示 Bonus（剩余秒 × TIME_BONUS_PER_SECOND）
 * 失败时提供"重试本关"和"返回主菜单"两个选择
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState, TIME_BONUS_PER_SECOND } from '../core/Game';
import { drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { SoundType } from '../core/Audio';
import { clamp } from '../utils/math';

/** 各阶段持续时间（秒） */
const STAGE_EARNED_DURATION = 0.6;
const STAGE_BONUS_DURATION = 0.6;
const STAGE_TOTAL_DURATION = 0.4;

/** 结算阶段 */
enum ResultStage {
  EARNED = 'EARNED',     // 获得金额 tween
  BONUS = 'BONUS',       // Bonus tween
  TOTAL = 'TOTAL',       // 总计金额 tween
  DONE = 'DONE',         // 动画完成，按钮可点
}

export class ResultScene extends SceneBase {
  private game: Game;
  private earnedMoney: number;
  private targetMoney: number;
  private remainingTime: number;
  private bonusMoney: number;
  private totalMoney: number;
  private isPassed: boolean;

  /** 主操作按钮（通过=进入商店；失败=重试本关） */
  private primaryButton: Button;
  /** 次要按钮（仅失败时显示，返回主菜单） */
  private secondaryButton: Button | null = null;
  private buttonHandled: boolean = false;

  /** 当前动画阶段 */
  private stage: ResultStage = ResultStage.EARNED;
  /** 当前阶段已过时间 */
  private stageTimer: number = 0;
  /** 显示用：当前展示的金额（tween 中间值） */
  private displayEarned: number = 0;
  private displayBonus: number = 0;
  private displayTotal: number = 0;
  /** 是否已播放过 LEVEL_CLEAR 音效（避免重复） */
  private clearSoundPlayed: boolean = false;

  constructor(game: Game, earnedMoney: number, targetMoney: number, remainingTime: number = 0) {
    super();
    this.game = game;
    this.earnedMoney = earnedMoney;
    this.targetMoney = targetMoney;
    this.remainingTime = remainingTime;
    this.isPassed = earnedMoney >= targetMoney;
    // Bonus 只在达标时计算
    this.bonusMoney = this.isPassed ? Math.floor(remainingTime) * TIME_BONUS_PER_SECOND : 0;
    this.totalMoney = this.earnedMoney + this.bonusMoney;

    if (this.isPassed) {
      // 通过：单按钮居中
      this.primaryButton = new Button(330, 420, 140, 44, '进入商店');
    } else {
      // 失败：双按钮并排
      this.primaryButton = new Button(240, 420, 140, 44, '重试本关');
      this.secondaryButton = new Button(420, 420, 140, 44, '返回菜单');
    }
  }

  enter(): void {
    this.buttonHandled = false;
    this.stage = ResultStage.EARNED;
    this.stageTimer = 0;
    this.displayEarned = 0;
    this.displayBonus = 0;
    this.displayTotal = 0;
    this.clearSoundPlayed = false;

    // 通过即时存档：确保 Bonus 在玩家看到动画时就固化到自动槽位
    // 即使玩家此时关浏览器，下次启动仍能从这里继续（带 Bonus）
    if (this.isPassed) {
      this.game.commitLevelResult(this.totalMoney);
    } else {
      this.game.getAudio().play(SoundType.LEVEL_FAIL);
    }
  }

  exit(): void {}

  update(dt: number): void {
    if (this.stage === ResultStage.DONE) return;
    this.stageTimer += dt;

    switch (this.stage) {
      case ResultStage.EARNED: {
        const p = clamp(this.stageTimer / STAGE_EARNED_DURATION, 0, 1);
        this.displayEarned = Math.floor(this.earnedMoney * p);
        if (p >= 1) {
          this.displayEarned = this.earnedMoney;
          if (this.isPassed && this.bonusMoney > 0) {
            this.stage = ResultStage.BONUS;
            this.stageTimer = 0;
          } else if (this.isPassed) {
            // 通过但无 Bonus（时间到达标），直接 DONE
            this.stage = ResultStage.DONE;
            this.playClearSoundOnce();
          } else {
            // 失败直接 DONE
            this.stage = ResultStage.DONE;
          }
        }
        break;
      }
      case ResultStage.BONUS: {
        const p = clamp(this.stageTimer / STAGE_BONUS_DURATION, 0, 1);
        this.displayBonus = Math.floor(this.bonusMoney * p);
        // 每 0.1s 播放一次金币音
        if (Math.floor(this.stageTimer * 10) > Math.floor((this.stageTimer - dt) * 10)) {
          this.game.getAudio().play(SoundType.COIN);
        }
        if (p >= 1) {
          this.displayBonus = this.bonusMoney;
          this.stage = ResultStage.TOTAL;
          this.stageTimer = 0;
        }
        break;
      }
      case ResultStage.TOTAL: {
        const p = clamp(this.stageTimer / STAGE_TOTAL_DURATION, 0, 1);
        this.displayTotal = Math.floor(this.totalMoney * p);
        if (p >= 1) {
          this.displayTotal = this.totalMoney;
          this.stage = ResultStage.DONE;
          this.playClearSoundOnce();
        }
        break;
      }
    }
  }

  handleInput(input: Input): void {
    // 动画未完成时，点击或空格跳过动画
    if (this.stage !== ResultStage.DONE) {
      if (input.wasTapped() || input.isJustPressed('Space')) {
        this.skipAnimation();
      }
      return;
    }

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
    drawTextCentered(renderer, '关卡结算', 60, '#FFFFFF', 'LARGE');

    // 结果
    const resultText = this.isPassed ? '恭喜达标！' : '未达标...';
    const resultColor = this.isPassed ? '#00FF00' : '#FF4444';
    drawTextCentered(renderer, resultText, 120, resultColor, 'LARGE');

    // 获得金额（动画 tween）
    drawTextCentered(renderer, `获得金额: $${this.displayEarned}`, 190, '#FFD700', 'MEDIUM');
    drawTextCentered(renderer, `目标金额: $${this.targetMoney}`, 225, '#AAAAAA', 'SMALL');

    // Bonus（达标且 stage 进入 BONUS 后显示）
    if (this.isPassed && this.bonusMoney > 0 && this.stage !== ResultStage.EARNED) {
      const bonusY = 270;
      drawTextCentered(
        renderer,
        `时间奖励: ${Math.floor(this.remainingTime)}s × $${TIME_BONUS_PER_SECOND} = $${this.displayBonus}`,
        bonusY,
        '#88FF88',
        'MEDIUM'
      );
    }

    // 总计（动画完成后显示）
    if (this.isPassed && (this.stage === ResultStage.TOTAL || this.stage === ResultStage.DONE)) {
      const totalDisplay = this.stage === ResultStage.TOTAL ? this.displayTotal : this.totalMoney;
      drawTextCentered(renderer, `总计: $${totalDisplay}`, 330, '#FFFF00', 'LARGE');
    }

    // 按钮（动画完成后才显示）
    if (this.stage === ResultStage.DONE) {
      this.primaryButton.render(renderer);
      if (this.secondaryButton) {
        this.secondaryButton.render(renderer);
      }
    } else {
      // 动画进行中提示"点击跳过"
      drawTextCentered(renderer, '点击跳过动画 ▶', 480, '#888888', 'SMALL');
    }
  }

  /** 跳过动画，直接到 DONE */
  private skipAnimation(): void {
    this.displayEarned = this.earnedMoney;
    this.displayBonus = this.bonusMoney;
    this.displayTotal = this.totalMoney;
    this.stage = ResultStage.DONE;
    if (this.isPassed) this.playClearSoundOnce();
  }

  /** 播放通关音效（避免重复） */
  private playClearSoundOnce(): void {
    if (this.clearSoundPlayed) return;
    this.clearSoundPlayed = true;
    this.game.getAudio().play(SoundType.LEVEL_CLEAR);
  }

  /** 获取最终金额（含 Bonus），供 Game 累加 currentMoney 使用 */
  getTotalEarned(): number {
    return this.totalMoney;
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
