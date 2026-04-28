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
import { Mineral, MysteryContent } from '../entity/Mineral';
import { HUD, HUD_HEIGHT } from '../ui/HUD';
import { SoundType } from '../core/Audio';
import { renderBackground, GROUND_Y } from '../assets/background';
import type { SpriteCacheMap } from '../assets/types';
import type { LevelConfig } from '../level/levels';
import { ItemType } from '../scene/ShopScene';
import { drawText, drawTextCentered } from '../ui/PixelText';
import { randomInt, weightedRandom } from '../utils/random';
import { pointInRect } from '../utils/collision';

/** 炸药桶爆炸半径 */
const BOMB_BLAST_RADIUS = 100;

/** 爆炸闪烁持续时间（秒） */
const EXPLOSION_FLASH_DURATION = 0.4;

/** 通知显示持续时间（秒） */
const NOTIFICATION_DURATION = 1.5;

/** 暂停按钮点击区域（HUD 右上角） */
const PAUSE_BTN = { x: 764, y: 4, w: 28, h: 28 };

/** 教程按钮点击区域（暂停按钮左边） */
const TUTORIAL_BTN = { x: 728, y: 4, w: 28, h: 28 };

/** 道具名称缩写映射 */
const ITEM_SHORT_NAMES: Record<string, string> = {
  [ItemType.DYNAMITE]: '炸药',
  [ItemType.STRENGTH_POTION]: '力量',
  [ItemType.LUCKY_CLOVER]: '幸运',
  [ItemType.STONE_BOOK]: '石书',
  [ItemType.MOUSE_POISON]: '鼠药',
  [ItemType.DIAMOND_OIL]: '钻油',
};

/** 矿物生成权重（决定各矿物出现概率） */
const MINERAL_WEIGHTS: number[] = [
  26, // GOLD_SMALL
  10, // GOLD_MEDIUM
  8,  // GOLD_LARGE
  5,  // DIAMOND
  20, // STONE
  6,  // BOMB
  7,  // MYSTERY_BAG
  8,  // BONE
  5,  // MOUSE
  5,  // MOLE
];

/** 矿物类型列表（与权重一一对应） */
const MINERAL_TYPES: MineralType[] = [
  MineralType.GOLD_SMALL,
  MineralType.GOLD_MEDIUM,
  MineralType.GOLD_LARGE,
  MineralType.DIAMOND,
  MineralType.STONE,
  MineralType.BOMB,
  MineralType.MYSTERY_BAG,
  MineralType.BONE,
  MineralType.MOUSE,
  MineralType.MOLE,
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

  /** 教程引导状态 */
  private showTutorial: boolean = false;

  /** 爆炸效果：位置X */
  private explosionX: number = 0;
  /** 爆炸效果：位置Y */
  private explosionY: number = 0;
  /** 爆炸效果：剩余时间 */
  private explosionTimer: number = 0;

  /** 通知文字 */
  private notificationText: string = '';
  /** 通知剩余时间 */
  private notificationTimer: number = 0;

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

    // 设置炸药桶爆炸回调
    this.hook.setOnBombExplode((x, y) => this.onBombExplode(x, y));
  }

  enter(): void {
    // 检查是否首次游玩
    this.showTutorial = !this.game.getStorage().loadTutorialShown();
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

    // 更新爆炸效果计时器
    if (this.explosionTimer > 0) {
      this.explosionTimer -= dt;
    }

    // 更新通知计时器
    if (this.notificationTimer > 0) {
      this.notificationTimer -= dt;
    }

    // 钩爪延伸状态下检测碰撞
    if (this.hook.state === HookState.EXTENDING) {
      this.hook.checkCollision(this.minerals);
    }

    // 更新移动矿物
    for (const mineral of this.minerals) {
      mineral.update(dt);
    }
  }

  handleInput(input: Input): void {
    // 教程引导：点击/空格关闭
    if (this.showTutorial) {
      if (input.wasTapped() || input.isJustPressed('Space')) {
        this.showTutorial = false;
        this.game.getStorage().saveTutorialShown();
      }
      return;
    }

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

      // 教程按钮
      if (this.isInBtn(pos, TUTORIAL_BTN)) {
        this.showTutorial = true;
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

    // 绘制爆炸效果
    if (this.explosionTimer > 0) {
      this.renderExplosion(renderer);
    }

    // 绘制通知
    if (this.notificationTimer > 0) {
      const alpha = Math.min(1, this.notificationTimer / 0.3);
      const ctx = renderer.getContext();
      ctx.save();
      ctx.globalAlpha = alpha;
      drawTextCentered(renderer, this.notificationText, 200, '#FFD700', 'LARGE');
      ctx.restore();
    }

    // 暂停按钮和教程按钮
    this.renderTopButtons(renderer);

    // 当前生效道具显示
    this.renderActiveItems(renderer);

    // 暂停遮罩
    if (this.isPaused) {
      const ctx = renderer.getContext();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      drawTextCentered(renderer, '暂停', 230, '#FFFFFF', 'TITLE');
      drawTextCentered(renderer, '点击或按 ESC 继续', 310, '#AAAAAA', 'SMALL');
    }

    // 教程引导覆盖层
    if (this.showTutorial) {
      const ctx = renderer.getContext();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      drawTextCentered(renderer, '操作说明', 100, '#FFD700', 'TITLE');
      drawTextCentered(renderer, '空格 / 点击画面 - 发射钩爪', 190, '#FFFFFF', 'MEDIUM');
      drawTextCentered(renderer, 'ESC / 右上角按钮 - 暂停', 240, '#FFFFFF', 'MEDIUM');
      drawTextCentered(renderer, '抓取矿物达到目标金额即可过关', 300, '#AAAAAA', 'SMALL');
      drawTextCentered(renderer, '点击任意位置开始', 380, '#FFD700', 'MEDIUM');
    }
  }

  /** 绘制右上角按钮组（暂停 + 教程） */
  private renderTopButtons(renderer: Renderer): void {
    const ctx = renderer.getContext();

    // 暂停按钮（两条竖线）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(renderer.width - 26, 10, 4, 18);
    ctx.fillRect(renderer.width - 16, 10, 4, 18);

    // 教程按钮（问号，使用像素字体）
    drawText(renderer, '?', renderer.width - 56, 8, '#FFFFFF', 'MEDIUM');
  }

  /** 绘制当前生效道具列表 */
  private renderActiveItems(renderer: Renderer): void {
    const items = this.game.getOwnedItems();
    if (items.size === 0) return;

    const ctx = renderer.getContext();
    const itemArray = Array.from(items);
    // 计算道具文字最大宽度
    ctx.font = 'bold 12px monospace';
    let maxW = 0;
    for (const type of itemArray) {
      const name = ITEM_SHORT_NAMES[type];
      if (name) {
        maxW = Math.max(maxW, ctx.measureText(name).width);
      }
    }

    const padX = 6;
    const padY = 2;
    const itemH = 14;
    const gap = 4;
    const boxW = maxW + padX * 2;
    const startX = renderer.width - boxW - 4;
    const startY = HUD_HEIGHT + 6;

    for (let i = 0; i < itemArray.length; i++) {
      const itemType = itemArray[i]!;
      const name = ITEM_SHORT_NAMES[itemType];
      if (!name) continue;
      const y = startY + i * (itemH + gap);

      // 道具背景条
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(startX, y, boxW, itemH);
      // 左侧金色边线
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(startX, y, 2, itemH);
      // 道具文字
      drawText(renderer, name, startX + padX + 2, y + padY, '#FFD700', 'SMALL');
    }
  }

  /** 判断点是否在指定矩形区域内 */
  private isInBtn(pos: { x: number; y: number }, btn: { x: number; y: number; w: number; h: number }): boolean {
    return pointInRect(pos.x, pos.y, btn);
  }

  /** 钩爪收回完成回调（含道具效果） */
  private onHookComplete(mineral: Mineral | null): void {
    if (mineral) {
      const items = this.game.getOwnedItems();

      // 炸药道具：抓到石头自动炸毁，不加钱
      if (mineral.config.type === MineralType.STONE && items.has(ItemType.DYNAMITE)) {
        this.game.getAudio().play(SoundType.GRAB_BOMB);
        this.showNotification('炸药摧毁石头');
        return;
      }

      // 神秘袋特殊处理
      if (mineral.config.type === MineralType.MYSTERY_BAG && mineral.mysteryContent) {
        this.handleMysteryBag(mineral);
        return;
      }

      // 计算实际价值
      let value = mineral.value;

      // 石头书：石头价值 ×3
      if (mineral.config.type === MineralType.STONE && items.has(ItemType.STONE_BOOK)) {
        value = mineral.value * 3;
      }

      // 老鼠药：老鼠价值 ×5
      if (mineral.config.type === MineralType.MOUSE && items.has(ItemType.MOUSE_POISON)) {
        value = mineral.value * 5;
      }

      // 鼹鼠带钻石额外加钱
      if (mineral.config.type === MineralType.MOLE && mineral.hasDiamond) {
        value += 600;
      }

      // 钻石变色油：钻石价值 ×2
      if (mineral.config.type === MineralType.DIAMOND && items.has(ItemType.DIAMOND_OIL)) {
        value = mineral.value * 2;
      }

      this.hud.money += value;

      // 播放对应音效
      if (mineral.config.type === MineralType.DIAMOND) {
        this.game.getAudio().play(SoundType.GRAB_DIAMOND);
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

  /** 处理神秘袋内容 */
  private handleMysteryBag(mineral: Mineral): void {
    const content = mineral.mysteryContent!;

    if (content === MysteryContent.CASH_SMALL || content === MysteryContent.CASH_LARGE) {
      let value = mineral.value;
      this.hud.money += value;
      this.showNotification(`${mineral.mysteryLabel}: +$${value}`);
      this.game.getAudio().play(SoundType.GRAB_GOLD);
      this.miner.setState(MinerState.HAPPY);
    } else if (content === MysteryContent.STRENGTH_POTION) {
      // 大力药剂：本关收回速度永久 +80%
      this.hook.reelSpeedMultiplier = Math.max(this.hook.reelSpeedMultiplier, 1.8);
      this.showNotification('大力药剂: 收回加速!');
      this.game.getAudio().play(SoundType.COIN);
      this.miner.setState(MinerState.HAPPY);
    } else if (content === MysteryContent.DYNAMITE) {
      // 炸药：直接炸毁场上随机一个矿物（优先炸石头）
      const stones = this.minerals.filter(m => !m.grabbed && m.config.type === MineralType.STONE);
      const targets = stones.length > 0 ? stones : this.minerals.filter(m => !m.grabbed);
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)]!;
        target.grabbed = true;
        this.minerals = this.minerals.filter(m => m !== target);
        this.showNotification('炸药: 摧毁了一个矿物!');
      } else {
        this.showNotification('炸药: 场上没有可炸的...');
      }
      this.game.getAudio().play(SoundType.GRAB_BOMB);
      this.miner.setState(MinerState.SAD);
    }
  }

  /** 显示通知文字 */
  private showNotification(text: string): void {
    this.notificationText = text;
    this.notificationTimer = NOTIFICATION_DURATION;
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

      // 移动矿物设置速度和边界
      if (type === MineralType.MOUSE || type === MineralType.MOLE) {
        const speed = type === MineralType.MOUSE ? 120 : 60;
        mineral.vx = Math.random() > 0.5 ? speed : -speed;
        mineral.moveLeft = GAME_CONFIG.MINERAL_AREA_LEFT;
        mineral.moveRight = GAME_CONFIG.MINERAL_AREA_RIGHT;
      }

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

  /** 炸药桶爆炸处理：清除范围内矿物 */
  private onBombExplode(x: number, y: number): void {
    this.explosionX = x;
    this.explosionY = y;
    this.explosionTimer = EXPLOSION_FLASH_DURATION;

    // 清除爆炸范围内的矿物
    this.minerals = this.minerals.filter(mineral => {
      if (mineral.grabbed) return true;
      const dx = mineral.x - x;
      const dy = mineral.y - y;
      return dx * dx + dy * dy > BOMB_BLAST_RADIUS * BOMB_BLAST_RADIUS;
    });

    this.game.getAudio().play(SoundType.GRAB_BOMB);
    this.miner.setState(MinerState.SAD);
  }

  /** 渲染爆炸效果（橙色扩散圆 + 白色闪光） */
  private renderExplosion(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const progress = 1 - this.explosionTimer / EXPLOSION_FLASH_DURATION;
    const radius = BOMB_BLAST_RADIUS * Math.min(progress * 2, 1);
    const alpha = Math.max(0, 1 - progress);

    // 橙色扩散圆
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = '#FF6600';
    ctx.beginPath();
    ctx.arc(this.explosionX, this.explosionY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 白色闪光核心
    if (progress < 0.3) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(this.explosionX, this.explosionY, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
    return pointInRect(x, y, PAUSE_BTN);
  }
}
