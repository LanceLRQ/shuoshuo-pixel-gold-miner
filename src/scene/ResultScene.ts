/**
 * 结算界面场景
 * 2 阶段动画：本关入账金额 tween → DONE（显示累计达成 + 按钮）
 * 失败时提供"重试本关"和"返回主菜单"两个选择
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { STRINGS } from '../ui/strings';
import { SoundType } from '../core/Audio';
import { clamp } from '../utils/math';

/** 入账动画持续时间（秒） */
const STAGE_EARNED_DURATION = 0.6;

/** 结算阶段 */
enum ResultStage {
  EARNED = 'EARNED',     // 本关入账金额 tween
  DONE = 'DONE',         // 动画完成，按钮可点
}

export class ResultScene extends SceneBase {
  private game: Game;
  private earnedMoney: number;
  private targetMoney: number;
  private isPassed: boolean;
  /** 本关起步前的累计金额（用于显示"累计达成 X/Y"） */
  private cumulativeBeforeLevel: number;

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
  /** 是否已播放过 LEVEL_CLEAR 音效（避免重复） */
  private clearSoundPlayed: boolean = false;

  constructor(game: Game, earnedMoney: number, targetMoney: number) {
    super();
    this.game = game;
    this.earnedMoney = earnedMoney;
    this.targetMoney = targetMoney;
    // 累计模式：判断本关起步累计 + 本关入账 >= 累计目标
    this.cumulativeBeforeLevel = game.getCurrentMoney();
    this.isPassed = (this.cumulativeBeforeLevel + earnedMoney) >= targetMoney;

    if (this.isPassed) {
      // 通过：单按钮居中
      this.primaryButton = new Button(330, 420, 140, 44, STRINGS.result.enterShop);
    } else {
      // 失败：双按钮并排
      this.primaryButton = new Button(240, 420, 140, 44, STRINGS.result.retry);
      this.secondaryButton = new Button(420, 420, 140, 44, STRINGS.common.backToMenuShort);
    }
  }

  enter(): void {
    this.buttonHandled = false;
    this.stage = ResultStage.EARNED;
    this.stageTimer = 0;
    this.displayEarned = 0;
    this.clearSoundPlayed = false;

    // 通过即时存档：达标时立刻把本关入账固化到自动槽位
    if (this.isPassed) {
      this.game.commitLevelResult(this.earnedMoney);
    } else {
      this.game.getAudio().play(SoundType.LEVEL_FAIL);
    }
  }

  exit(): void {}

  update(dt: number): void {
    if (this.stage === ResultStage.DONE) return;
    this.stageTimer += dt;

    const p = clamp(this.stageTimer / STAGE_EARNED_DURATION, 0, 1);
    this.displayEarned = Math.floor(this.earnedMoney * p);
    if (p >= 1) {
      this.displayEarned = this.earnedMoney;
      this.stage = ResultStage.DONE;
      if (this.isPassed) this.playClearSoundOnce();
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
    drawTextCentered(renderer, STRINGS.result.title, 60, '#FFFFFF', 'LARGE');

    // 结果
    const resultText = this.isPassed ? STRINGS.result.success : STRINGS.result.failure;
    const resultColor = this.isPassed ? '#00FF00' : '#FF4444';
    drawTextCentered(renderer, resultText, 120, resultColor, 'LARGE');

    // 本关入账（动画 tween）+ 累计目标
    drawTextCentered(renderer, `本关入账: +$${this.displayEarned}`, 190, '#FFD700', 'MEDIUM');
    drawTextCentered(renderer, `累计目标: $${this.targetMoney}`, 225, '#AAAAAA', 'SMALL');

    // 累计达成（动画完成后显示）
    if (this.isPassed && this.stage === ResultStage.DONE) {
      const cumulative = this.cumulativeBeforeLevel + this.earnedMoney;
      drawTextCentered(renderer, `累计达成: $${cumulative} / $${this.targetMoney}`, 330, '#FFD27C', 'MEDIUM');
    }

    // 未达标时显示差距
    if (!this.isPassed && this.stage === ResultStage.DONE) {
      const cumulative = this.cumulativeBeforeLevel + this.earnedMoney;
      const gap = this.targetMoney - cumulative;
      drawTextCentered(renderer, `累计: $${cumulative} / $${this.targetMoney}`, 330, '#FF4444', 'MEDIUM');
      drawTextCentered(renderer, `还差 $${gap}`, 365, '#FF8888', 'SMALL');
    }

    // 按钮（动画完成后才显示）
    if (this.stage === ResultStage.DONE) {
      this.primaryButton.render(renderer);
      if (this.secondaryButton) {
        this.secondaryButton.render(renderer);
      }
    } else {
      // 动画进行中提示"点击跳过"
      drawTextCentered(renderer, STRINGS.result.skipAnimation, 480, '#888888', 'SMALL');
    }
  }

  /** 跳过动画，直接到 DONE */
  private skipAnimation(): void {
    this.displayEarned = this.earnedMoney;
    this.stage = ResultStage.DONE;
    if (this.isPassed) this.playClearSoundOnce();
  }

  /** 播放通关音效（避免重复） */
  private playClearSoundOnce(): void {
    if (this.clearSoundPlayed) return;
    this.clearSoundPlayed = true;
    this.game.getAudio().play(SoundType.LEVEL_CLEAR);
  }

  /** 获取最终金额，供 Game 累加 currentMoney 使用 */
  getTotalEarned(): number {
    return this.earnedMoney;
  }

  /** 主按钮：通过=进入商店或通关；失败=重试本关 */
  private handlePrimary(): void {
    if (this.isPassed) {
      // 最后一关 → 通关结束
      if (!this.game.getLevelManager().hasNextLevel()) {
        this.game.changeScene(GameState.GAME_OVER);
        return;
      }
      // INFINITE 模式跳过商店，直接进下一关
      if (!this.game.getDifficultyConfig().shopEnabled) {
        this.game.changeScene(GameState.PLAYING);
      } else {
        this.game.changeScene(GameState.SHOP);
      }
    } else {
      this.game.retryCurrentLevel();
    }
  }

  /** 次按钮：失败时返回主菜单（清进度） */
  private handleSecondary(): void {
    this.game.clearProgress();
    this.game.changeScene(GameState.MENU);
  }
}
