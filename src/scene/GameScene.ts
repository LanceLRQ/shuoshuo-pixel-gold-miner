/**
 * 核心游戏场景
 * 整合矿工、钩爪、矿物、HUD，实现完整抓取循环
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import { GameState } from '../core/Game';
import type { Game } from '../core/Game';
import { GAME_CONFIG, MineralType } from '../entity/types';
import { Miner, MinerState } from '../entity/Miner';
import { Hook, HookState } from '../entity/Hook';
import { Mineral } from '../entity/Mineral';
import { HUD } from '../ui/HUD';
import { SoundType } from '../core/Audio';
import { renderBackground, GROUND_Y } from '../assets/background';
import type { SpriteCacheMap } from '../assets/types';
import type { LevelConfig } from '../level/levels';
import { ItemType } from '../scene/ShopScene';
import { drawTextCentered } from '../ui/PixelText';
import { randomInt, weightedRandom } from '../utils/random';

/** 暂停按钮点击区域（HUD 右上角） */
const PAUSE_BTN = { x: 756, y: 4, w: 36, h: 28 };

/** 矿物生成权重（决定各矿物出现概率） */
const MINERAL_WEIGHTS: number[] = [
  30, // GOLD_SMALL
  15, // GOLD_LARGE
  5,  // DIAMOND
  25, // STONE
  8,  // BOMB
  7,  // MYSTERY_BAG
  10, // BONE
];

/** 矿物类型列表（与权重一一对应） */
const MINERAL_TYPES: MineralType[] = [
  MineralType.GOLD_SMALL,
  MineralType.GOLD_LARGE,
  MineralType.DIAMOND,
  MineralType.STONE,
  MineralType.BOMB,
  MineralType.MYSTERY_BAG,
  MineralType.BONE,
];

export class GameScene extends SceneBase {
  private game: Game;
  private miner: Miner;
  private hook: Hook;
  private minerals: Mineral[] = [];
  private hud: HUD;
  private spriteCache: SpriteCacheMap;

  /** 关卡配置 */
  private levelConfig: LevelConfig;

  /** 关卡目标金额 */
  private targetMoney: number;

  /** 暂停状态 */
  private isPaused: boolean = false;

  constructor(game: Game, levelConfig: LevelConfig) {
    super();
    this.game = game;
    this.levelConfig = levelConfig;
    this.targetMoney = levelConfig.targetMoney;

    // 从主题管理器获取精灵缓存
    this.spriteCache = game.getThemeManager().getSpriteCache();

    // 初始化矿工和钩爪（钩爪锚点在矿工底部，即地面位置）
    this.miner = new Miner(GAME_CONFIG.MINER_X, GAME_CONFIG.MINER_Y, this.spriteCache);
    this.hook = new Hook(GAME_CONFIG.MINER_X, GROUND_Y, this.spriteCache);

    // 初始化 HUD
    this.hud = new HUD(this.spriteCache, this.targetMoney);

    // 力量药水：收回速度 +50%
    if (game.getOwnedItems().has(ItemType.STRENGTH_POTION)) {
      this.hook.reelSpeedMultiplier = 1.5;
    }

    // 设置钩爪收回回调
    this.hook.setOnComplete((mineral) => this.onHookComplete(mineral));
  }

  enter(): void {
    // 使用关卡配置生成矿物
    this.generateMinerals(this.levelConfig.mineralCount);
    // 使用关卡配置的时间限制
    this.hud.timeLeft = this.levelConfig.timeLimit;
    this.hud.money = 0;
    // 重置钩爪
    this.hook.reset();
  }

  exit(): void {
    // 清理
    this.minerals = [];
  }

  update(dt: number): void {
    if (this.isPaused) return;

    // 更新 HUD（倒计时）
    this.hud.update(dt);

    // 时间到，切换到结算
    if (this.hud.isTimeUp() && this.hook.state === HookState.SWINGING) {
      this.goToResult();
      return;
    }

    // 更新矿工
    this.miner.update(dt);

    // 更新钩爪
    this.hook.update(dt);

    // 钩爪延伸状态下检测碰撞
    if (this.hook.state === HookState.EXTENDING) {
      this.hook.checkCollision(this.minerals);
    }

    // 更新矿物（虽然静止，但保持接口一致）
    for (const mineral of this.minerals) {
      mineral.update(dt);
    }
  }

  handleInput(input: Input): void {
    // ESC 暂停/恢复
    if (input.isJustPressed('Escape')) {
      this.isPaused = !this.isPaused;
      return;
    }

    // 暂停状态：点击任意位置恢复
    if (this.isPaused) {
      if (input.wasTapped()) {
        this.isPaused = false;
      }
      return;
    }

    // 点击事件
    if (input.wasTapped()) {
      const pos = input.getTapPosition();

      // 暂停按钮优先检测
      if (this.isInPauseBtn(pos.x, pos.y)) {
        this.isPaused = true;
        return;
      }

      // 发射钩爪
      if (this.hook.state === HookState.SWINGING) {
        this.hook.fire();
        this.miner.setState(MinerState.PULL);
        this.game.getAudio().play(SoundType.HOOK_FIRE);
      }
      return;
    }

    // 空格键发射钩爪
    if (this.hook.state === HookState.SWINGING && input.isJustPressed('Space')) {
      this.hook.fire();
      this.miner.setState(MinerState.PULL);
      this.game.getAudio().play(SoundType.HOOK_FIRE);
    }
  }

  render(renderer: Renderer): void {
    // 清空画面
    renderer.clear('#000000');

    // 绘制背景（使用当前主题颜色）
    renderBackground(renderer, renderer.width, renderer.height, this.game.getThemeManager().getBackgroundColors());

    // 绘制矿物
    for (const mineral of this.minerals) {
      mineral.render(renderer);
    }

    // 绘制绳索和钩爪
    this.hook.render(renderer);

    // 绘制矿工
    this.miner.render(renderer);

    // 绘制 HUD
    this.hud.render(renderer);

    // 暂停按钮（HUD 右上角两条竖线）
    this.renderPauseBtn(renderer);

    // 暂停遮罩
    if (this.isPaused) {
      const ctx = renderer.getContext();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      drawTextCentered(renderer, '暂停', 230, '#FFFFFF', 'TITLE');
      drawTextCentered(renderer, '点击或按 ESC 继续', 310, '#AAAAAA', 'SMALL');
    }
  }

  /** 绘制暂停按钮（两条竖线图标） */
  private renderPauseBtn(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const x = renderer.width - 30;
    const y = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, 4, 18);
    ctx.fillRect(x + 10, y, 4, 18);
  }

  /** 钩爪收回完成回调（含道具效果） */
  private onHookComplete(mineral: Mineral | null): void {
    if (mineral) {
      const items = this.game.getOwnedItems();

      // 炸药：抓到石头自动炸毁，不加钱
      if (mineral.config.type === MineralType.STONE && items.has(ItemType.DYNAMITE)) {
        this.game.getAudio().play(SoundType.GRAB_BOMB);
        return;
      }

      // 计算实际价值
      let value = mineral.value;

      // 石头书：石头价值 ×3
      if (mineral.config.type === MineralType.STONE && items.has(ItemType.STONE_BOOK)) {
        value = mineral.value * 3;
      }

      this.hud.money += value;

      // 播放对应音效
      if (mineral.config.type === MineralType.DIAMOND) {
        this.game.getAudio().play(SoundType.GRAB_DIAMOND);
      } else if (mineral.config.type === MineralType.BOMB) {
        this.game.getAudio().play(SoundType.GRAB_BOMB);
      } else if (mineral.config.type === MineralType.STONE) {
        this.game.getAudio().play(SoundType.GRAB_STONE);
      } else {
        this.game.getAudio().play(SoundType.GRAB_GOLD);
      }

      // 设置矿工表情
      if (value > 0) {
        this.miner.setState(MinerState.HAPPY);
      } else {
        this.miner.setState(MinerState.SAD);
      }
    } else {
      this.game.getAudio().play(SoundType.HOOK_REEL);
    }
  }

  /** 随机生成矿物（使用关卡配置的权重和数量） */
  private generateMinerals(count: number): void {
    this.minerals = [];
    // 使用关卡自定义权重或默认权重
    const weights = this.levelConfig.mineralWeights ?? MINERAL_WEIGHTS;

    for (let i = 0; i < count; i++) {
      const typeIndex = weightedRandom(weights);
      const type = MINERAL_TYPES[typeIndex]!;

      // 随机放置，尝试避开已有矿物
      const placed = this.tryPlaceMineral(type);
      if (placed) {
        this.minerals.push(placed);
      }
    }

    // 幸运草：神秘袋最低 $200
    const items = this.game.getOwnedItems();
    if (items.has(ItemType.LUCKY_CLOVER)) {
      for (const mineral of this.minerals) {
        if (mineral.config.type === MineralType.MYSTERY_BAG) {
          mineral.value = Math.max(mineral.value, 200);
        }
      }
    }
  }

  /** 尝试在不重叠的位置放置矿物 */
  private tryPlaceMineral(type: MineralType, maxAttempts: number = 20): Mineral | null {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = randomInt(GAME_CONFIG.MINERAL_AREA_LEFT, GAME_CONFIG.MINERAL_AREA_RIGHT);
      const y = randomInt(GAME_CONFIG.MINERAL_AREA_TOP, GAME_CONFIG.MINERAL_AREA_BOTTOM);
      const mineral = new Mineral(x, y, type, this.spriteCache);

      if (!this.isOverlapping(mineral)) {
        return mineral;
      }
    }
    return null;
  }

  /** 检查新矿物是否与已有矿物重叠 */
  private isOverlapping(mineral: Mineral): boolean {
    for (const existing of this.minerals) {
      const dx = mineral.x - existing.x;
      const dy = mineral.y - existing.y;
      const minDist = mineral.radius + existing.radius + 4; // 4px 间距
      if (dx * dx + dy * dy < minDist * minDist) {
        return true;
      }
    }
    return false;
  }

  /** 跳转到结算场景 */
  private goToResult(): void {
    // 将金额传递给 Game，由 Game 传递给 ResultScene
    this.game.changeScene(GameState.RESULT);
  }

  /** 获取当前金额 */
  getMoney(): number {
    return this.hud.money;
  }

  /** 获取目标金额 */
  getTargetMoney(): number {
    return this.targetMoney;
  }

  /** 暂停游戏 */
  pause(): void {
    this.isPaused = true;
  }

  /** 恢复游戏 */
  resume(): void {
    this.isPaused = false;
  }

  /** 判断点是否在暂停按钮区域内 */
  private isInPauseBtn(x: number, y: number): boolean {
    return x >= PAUSE_BTN.x && x <= PAUSE_BTN.x + PAUSE_BTN.w &&
           y >= PAUSE_BTN.y && y <= PAUSE_BTN.y + PAUSE_BTN.h;
  }
}
