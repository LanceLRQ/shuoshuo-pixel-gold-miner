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
import { Audio, SoundType } from '../core/Audio';
import { renderBackground, GROUND_Y } from '../assets/background';
import type { SpriteCacheMap } from '../assets/types';
import { randomInt, weightedRandom } from '../utils/random';

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

/** 默认关卡目标金额 */
const DEFAULT_TARGET_MONEY = 200;

/** 默认矿物数量（横屏加大） */
const DEFAULT_MINERAL_COUNT = 15;

export class GameScene extends SceneBase {
  private game: Game;
  private miner: Miner;
  private hook: Hook;
  private minerals: Mineral[] = [];
  private hud: HUD;
  private spriteCache: SpriteCacheMap;
  private audio: Audio;

  /** 关卡目标金额 */
  private targetMoney: number;

  constructor(game: Game, targetMoney: number = DEFAULT_TARGET_MONEY) {
    super();
    this.game = game;
    this.targetMoney = targetMoney;

    // 从主题管理器获取精灵缓存
    this.spriteCache = game.getThemeManager().getSpriteCache();

    // 初始化矿工和钩爪（钩爪锚点在矿工底部，即地面位置）
    this.miner = new Miner(GAME_CONFIG.MINER_X, GAME_CONFIG.MINER_Y, this.spriteCache);
    this.hook = new Hook(GAME_CONFIG.MINER_X, GROUND_Y, this.spriteCache);

    // 初始化 HUD
    this.hud = new HUD(this.spriteCache, this.targetMoney);

    // 初始化音效系统
    this.audio = new Audio();

    // 设置钩爪收回回调
    this.hook.setOnComplete((mineral) => this.onHookComplete(mineral));
  }

  enter(): void {
    // 生成矿物
    this.generateMinerals(DEFAULT_MINERAL_COUNT);
    // 重置 HUD
    this.hud.timeLeft = GAME_CONFIG.LEVEL_TIME_LIMIT;
    this.hud.money = 0;
    // 重置钩爪
    this.hook.reset();
  }

  exit(): void {
    // 清理
    this.minerals = [];
  }

  update(dt: number): void {
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
    // 空格键或点击发射钩爪
    if (
      this.hook.state === HookState.SWINGING &&
      (input.isJustPressed('Space') || input.wasTapped())
    ) {
      this.hook.fire();
      this.miner.setState(MinerState.PULL);
      this.audio.play(SoundType.HOOK_FIRE);
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
  }

  /** 钩爪收回完成回调 */
  private onHookComplete(mineral: Mineral | null): void {
    if (mineral) {
      // 计分
      this.hud.money += mineral.value;
      // 播放对应音效
      if (mineral.config.type === MineralType.DIAMOND) {
        this.audio.play(SoundType.GRAB_DIAMOND);
      } else if (mineral.config.type === MineralType.BOMB) {
        this.audio.play(SoundType.GRAB_BOMB);
      } else if (mineral.config.type === MineralType.STONE) {
        this.audio.play(SoundType.GRAB_STONE);
      } else {
        this.audio.play(SoundType.GRAB_GOLD);
      }
      // 设置矿工表情
      if (mineral.value > 0) {
        this.miner.setState(MinerState.HAPPY);
      } else {
        this.miner.setState(MinerState.SAD);
      }
    } else {
      this.audio.play(SoundType.HOOK_REEL);
    }
    this.miner.setState(MinerState.IDLE);
  }

  /** 随机生成矿物（检测重叠，最多重试 20 次后放弃） */
  private generateMinerals(count: number): void {
    this.minerals = [];
    for (let i = 0; i < count; i++) {
      const typeIndex = weightedRandom(MINERAL_WEIGHTS);
      const type = MINERAL_TYPES[typeIndex]!;

      // 随机放置，尝试避开已有矿物
      const placed = this.tryPlaceMineral(type);
      if (placed) {
        this.minerals.push(placed);
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
}
