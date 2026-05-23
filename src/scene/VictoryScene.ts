/**
 * 通关庆祝场景（VictoryScene）
 *
 * 触发：非 INFINITE 难度通关 L21（TOTAL_LEVELS）后，从 ResultScene 主按钮进入。
 *
 * 玩家二选一：
 *   ① 挑战无尽 ⚡   → 进 L22 PLAYING，保留金额 / 道具 / 难度（changeScene VICTORY→PLAYING 推进 nextLevel）
 *   ② 立即结算 🏆   → 进入 VictoryEndScene 终局结算（提交排行榜 + 清自动存档）
 *
 * 与 GameOverScene 完全解耦：独立标题、独立装饰、独立按钮布局。
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { STRINGS } from '../ui/strings';
import { getDifficultyConfig } from '../level/difficulty';
import { TOTAL_LEVELS } from '../level/levels';

/** 装饰粒子数量 */
const SPARKLE_COUNT = 24;

/** 装饰粒子：缓动闪烁的星点 */
interface Sparkle {
  x: number;
  y: number;
  phase: number;       // 闪烁相位（0~2π）
  speed: number;       // 闪烁角速度
  radius: number;      // 像素方块半径
  color: string;
}

export class VictoryScene extends SceneBase {
  private game: Game;

  /** 进入时快照（避免 render 时再读取 game 状态） */
  private readonly cumulativeMoney: number;
  private readonly highScore: number;
  private readonly difficultyName: string;

  /** 两个分支按钮 */
  private endlessButton: Button;
  private settleButton: Button;
  private buttonHandled: boolean = false;

  /** 时间轴（用于装饰动画） */
  private elapsed: number = 0;
  /** 装饰粒子（enter 时一次性生成） */
  private sparkles: Sparkle[] = [];

  constructor(game: Game) {
    super();
    this.game = game;
    this.cumulativeMoney = game.getCurrentMoney();
    this.highScore = game.getStorage().getHighScore();
    this.difficultyName = getDifficultyConfig(game.getDifficulty()).name;

    // 两个按钮并排（逻辑分辨率 800×540）：每按钮 180w、间距 40、整体居中 → x: 200 / 420
    this.endlessButton = new Button(200, 440, 180, 48, STRINGS.victory.endlessButton);
    this.settleButton = new Button(420, 440, 180, 48, STRINGS.victory.settleButton);
  }

  enter(): void {
    this.buttonHandled = false;
    this.elapsed = 0;

    // 生成 24 颗闪烁星点，分散在标题区周围（避免遮挡文字）
    const palette = ['#FFD700', '#FFEC8B', '#FFFFFF', '#FFB74D', '#FFE082'];
    this.sparkles = [];
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      this.sparkles.push({
        x: 40 + Math.random() * 720,
        y: 30 + Math.random() * 380,
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 2.5,
        radius: 1 + Math.floor(Math.random() * 2),
        color: palette[Math.floor(Math.random() * palette.length)]!,
      });
    }
  }

  exit(): void {}

  update(dt: number): void {
    this.elapsed += dt;
  }

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();
      if (!this.buttonHandled && this.endlessButton.update(pos.x, pos.y, true)) {
        this.buttonHandled = true;
        this.handleEndless();
        return;
      }
      if (!this.buttonHandled && this.settleButton.update(pos.x, pos.y, true)) {
        this.buttonHandled = true;
        this.handleSettle();
        return;
      }
    } else {
      // 悬停态
      this.endlessButton.update(0, 0, false);
      this.settleButton.update(0, 0, false);
    }
    // 空格键默认走「立即结算」（保守选项：榜单写入不可撤销，但 Endless 决策应由玩家点击表达）
    if (input.isJustPressed('Space') && !this.buttonHandled) {
      this.buttonHandled = true;
      this.handleSettle();
    }
  }

  render(renderer: Renderer): void {
    // 深紫蓝渐变底，烘托庆祝气氛（用纯色 + 顶部装饰带）
    renderer.clear('#15102a');
    this.renderTopBanner(renderer);

    // 装饰星点（在文字之前，避免遮挡）
    this.renderSparkles(renderer);

    // 标题 + 副标题
    drawTextCentered(renderer, STRINGS.victory.title, 60, '#FFD700', 'TITLE');
    drawTextCentered(renderer, STRINGS.victory.subtitle, 110, '#FFFFFF', 'MEDIUM');
    drawTextCentered(renderer, STRINGS.victory.flavor, 142, '#C9B6FF', 'SMALL');

    // 统计面板（半透明深色框）
    this.renderStatsPanel(renderer);

    // 按钮 + 提示
    this.endlessButton.render(renderer);
    this.settleButton.render(renderer);
    drawTextCentered(renderer, STRINGS.victory.endlessHint, 504, '#9DD6FF', 'SMALL');
    drawTextCentered(renderer, STRINGS.victory.settleHint, 522, '#FFD27C', 'SMALL');
  }

  /** 顶部金色横幅，强化通关仪式感 */
  private renderTopBanner(renderer: Renderer): void {
    const ctx = renderer.getContext();
    // 金色渐变带
    const grad = ctx.createLinearGradient(0, 0, 0, 30);
    grad.addColorStop(0, '#5A3A0A');
    grad.addColorStop(1, '#15102a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, renderer.width, 30);
    // 底部金边
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(0, 28, renderer.width, 2);
  }

  /** 统计面板：金色描边 + 4 行数据（800×540 居中） */
  private renderStatsPanel(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const w = 420, h = 210;
    const x = (renderer.width - w) / 2;
    const y = 180;

    // 外框（金色）
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    // 内底（深色）
    ctx.fillStyle = '#1f1a3a';
    ctx.fillRect(x, y, w, h);

    // 标头
    drawTextCentered(renderer, STRINGS.victory.statsHeader, y + 18, '#FFD700', 'MEDIUM');

    // 数据行（4 行均匀）
    const lineY = [y + 58, y + 92, y + 126, y + 168];
    drawTextCentered(renderer, `${STRINGS.victory.statsMoney}${this.cumulativeMoney}`, lineY[0]!, '#FFEC8B', 'MEDIUM');
    drawTextCentered(renderer, `${STRINGS.victory.statsHighScore}${this.highScore}`, lineY[1]!, '#FFFFFF', 'MEDIUM');
    drawTextCentered(renderer, `${STRINGS.victory.statsDifficulty}${this.difficultyName}`, lineY[2]!, '#B4F0FF', 'MEDIUM');
    drawTextCentered(
      renderer,
      `${STRINGS.victory.statsLevelPrefix}${TOTAL_LEVELS}${STRINGS.victory.statsLevelSuffix}`,
      lineY[3]!,
      '#C9B6FF',
      'MEDIUM',
    );
  }

  /** 装饰星点：sin 相位闪烁 */
  private renderSparkles(renderer: Renderer): void {
    const ctx = renderer.getContext();
    for (const s of this.sparkles) {
      const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.elapsed * s.speed + s.phase));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.radius, s.radius);
    }
    ctx.globalAlpha = 1;
  }

  /** 「挑战无尽」：进 PLAYING（changeScene 内 VICTORY→PLAYING 分支会 nextLevel 推到 L22） */
  private handleEndless(): void {
    this.game.changeScene(GameState.PLAYING);
  }

  /** 「立即结算」：进入独立终局结算页（VICTORY_END 内提交排行榜 + 清自动存档，不可撤销） */
  private handleSettle(): void {
    this.game.changeScene(GameState.VICTORY_END);
  }
}
