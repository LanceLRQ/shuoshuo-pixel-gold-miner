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
import { Miner, MinerState, type SpriteMetaProvider } from '../entity/Miner';
import { Hook, HookState } from '../entity/Hook';
import { Mineral, MysteryContent } from '../entity/Mineral';
import { HUD, HUD_HEIGHT } from '../ui/HUD';
import { SoundType } from '../core/Audio';
import { renderBackground, getChapterBackgroundColors, GROUND_Y } from '../assets/background';
import type { BackgroundColors } from '../assets/theme/types';
import type { SpriteCacheMap } from '../assets/types';
import type { LevelConfig } from '../level/levels';
import { ChapterId, getLevelEarning, isEndlessLevel, TOTAL_LEVELS } from '../level/levels';
import { ItemType, PERSISTENT_ITEM_TYPES } from '../scene/ShopScene';
import type { SlotMeta } from '../core/Storage';
import type { DifficultyConfig } from '../level/difficulty';
import { drawText, drawTextCentered, drawTextCenteredIn } from '../ui/PixelText';
import { STRINGS } from '../ui/strings';
import { randomInt, weightedRandom } from '../utils/random';
import { pointInRect } from '../utils/collision';
import {
  ParticleSystem,
  PRESET_GOLD_SPARKLE,
  PRESET_DIAMOND_SPARKLE,
  PRESET_STONE_DUST,
  PRESET_BOMB_SPARK,
} from '../effects/Particle';
import { FloatingTextSystem } from '../effects/FloatingText';
import { DecorationLayer } from '../effects/DecorationLayer';
import { createChapterAnimators } from '../assets/chapter-decoration';
import { Button } from '../ui/Button';

/** 炸药桶爆炸半径 */
const BOMB_BLAST_RADIUS = 100;

/** 爆炸闪烁持续时间（秒） */
const EXPLOSION_FLASH_DURATION = 0.4;

/** 通知显示持续时间（秒） */
const NOTIFICATION_DURATION = 1.5;

/** 暂停按钮尺寸常量（位置在运行时根据 renderer.width 动态计算） */
const PAUSE_BTN_W = 22;
const PAUSE_BTN_H = 28;
const PAUSE_BTN_Y = 4;
const PAUSE_BTN_RIGHT_OFFSET = 30; // 距右边距：22 + 8

/** 教程按钮尺寸常量（暂停按钮左侧） */
const TUTORIAL_BTN_W = 26;
const TUTORIAL_BTN_H = 28;
const TUTORIAL_BTN_Y = 4;
const TUTORIAL_BTN_RIGHT_OFFSET = 60; // 距右边距：暂停 + 间距 + 自身宽

/** 额外时间道具加成（秒） */
const EXTRA_TIME_BONUS = 10;

/** TNT 引爆键位（F 或 ↑，任一触发） */
const KEY_DETONATE_CODES = ['KeyF', 'ArrowUp'] as const;

/** 暂停菜单按钮动作类型 */
type PauseAction = 'resume' | 'saveAs' | 'menu';

/** 矿物抓取反馈分档（按价值决定语音/颜色/飘字大小） */
const VALUE_TIER = {
  /** 高价值阈值：触发 Happy 语音 + LARGE 飘字 */
  HIGH: 300,
  /** 顶级阈值：青色高亮飘字 */
  PREMIUM: 500,
  /** 中等阈值：金色飘字（低于则白色） */
  MEDIUM: 100,
} as const;

/** 矿物价值飘字配色 */
const VALUE_COLOR = {
  PREMIUM: '#00FFFF',
  MEDIUM: '#FFD700',
  LOW: '#FFFFFF',
  PENALTY: '#FF4444', // 负值（如木箱骷髅扣分）
} as const;

/** 按价值返回飘字颜色（负值=红色，正值按 PREMIUM/MEDIUM/LOW 三档） */
function pickValueColor(value: number): string {
  if (value < 0) return VALUE_COLOR.PENALTY;
  if (value >= VALUE_TIER.PREMIUM) return VALUE_COLOR.PREMIUM;
  if (value >= VALUE_TIER.MEDIUM) return VALUE_COLOR.MEDIUM;
  return VALUE_COLOR.LOW;
}

/** 道具名称缩写映射 */
const ITEM_SHORT_NAMES: Record<string, string> = {
  [ItemType.DYNAMITE]: STRINGS.game.itemNamesShort.dynamite,
  [ItemType.STRENGTH_POTION]: STRINGS.game.itemNamesShort.strength,
  [ItemType.LUCKY_CLOVER]: STRINGS.game.itemNamesShort.lucky,
  [ItemType.STONE_BOOK]: STRINGS.game.itemNamesShort.stoneBook,
  [ItemType.MOUSE_POISON]: STRINGS.game.itemNamesShort.ratPoison,
  [ItemType.DIAMOND_OIL]: STRINGS.game.itemNamesShort.diamondGloss,
  [ItemType.EXTRA_TIME]: '+时间',
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

/**
 * 价值升级链（用于矿物预算生成器）
 * 升级时跳过 BOMB/MYSTERY_BAG/DIAMOND，避免破坏随机感
 * 按价值升序：BONE(5) → STONE(15) → MOUSE(20) → MOLE(50) → GOLD_SMALL(50) → GOLD_MEDIUM(250) → GOLD_LARGE(500)
 */
const VALUE_UPGRADE_CHAIN: MineralType[] = [
  MineralType.BONE,
  MineralType.STONE,
  MineralType.MOUSE,
  MineralType.MOLE,
  MineralType.GOLD_SMALL,
  MineralType.GOLD_MEDIUM,
  MineralType.GOLD_LARGE,
];

/** 矿物预算降级 / 金块保底循环最大迭代次数（防死循环） */
const BUDGET_UPGRADE_MAX_ATTEMPTS = 50;

/**
 * 金块保底阶段最多追加金块数（场地容量安全上界）
 * 估算：最大 baseCount 约 25-30，再加保底空间，30 足够覆盖最差 HARD/EXPERT 关
 * 当 tryPlaceMineral 找不到空位时也会提前返回，本上限只防数据异常死循环
 */
const GOLD_BUDGET_MAX_APPEND = 30;

/**
 * 金块（仅 GOLD_SMALL/MEDIUM/LARGE，不含钻石）
 * 顺序必须与 pickGoldVariant 的权重数组 [pSmall, pMedium, pLarge] 一一对应
 * 复用 VALUE_UPGRADE_CHAIN 末三项确保单一真值源
 */
const GOLD_TYPES: readonly MineralType[] = VALUE_UPGRADE_CHAIN.slice(-3);

/**
 * MEDIUM 金块的权重系数（× largeWeightScale）
 * 用于在 SMALL(=1) 与 LARGE(=lws) 之间形成梯度过渡，1.5 经模拟器调试得出
 */
const GOLD_MEDIUM_WEIGHT_FACTOR = 1.5;

/** 章节末关插入章节专属收藏品的概率（详见 docs/design/20260519_chapter-system.md §四） */
const CHAPTER_COLLECTIBLE_CHANCE = 0.3;

/** 章节 → 专属收藏品矿物类型 */
const CHAPTER_COLLECTIBLE_MAP: Record<ChapterId, MineralType> = {
  [ChapterId.CRYSTAL_MINE]: MineralType.CRYSTAL_ORE,
  [ChapterId.CRAB_BAY]: MineralType.CRAB_SHELL,
  [ChapterId.PIGGY_THRONE]: MineralType.PIGGY_GEM,
};

/** 木箱抽奖箱的最小关卡（前几关玩家还在学基础玩法，不放抽奖箱） */
const WOODEN_BOX_MIN_LEVEL = 5;

/** 矿工进入 STRAIN 用力态的矿物重量阈值（基础矿物 weight 范围 0.2-1.5，0.8 让大金/石头/骨头都触发） */
const STRAIN_WEIGHT_THRESHOLD = 0.8;

export class GameScene extends SceneBase {
  private game: Game;
  private miner: Miner;
  private hook: Hook;
  private minerals: Mineral[] = [];
  private hud: HUD;
  /** 难度配置缓存（构造时一次性读取，热路径避免每帧调 getDifficultyConfig()） */
  private readonly difficulty: DifficultyConfig;
  /** 章节背景色板缓存（构造时一次性合成，避免每帧 spread 临时对象） */
  private readonly chapterColors: BackgroundColors;
  private spriteCache: SpriteCacheMap;
  /** sprite 动画元数据查询函数，复用给 Miner / Hook / Mineral */
  private spriteMetaProvider!: SpriteMetaProvider;

  /** 关卡配置 */
  private levelConfig: LevelConfig;

  /** 关卡目标金额（累计目标） */
  private targetMoney: number;

  /** 本关起步金额：进入关卡时玩家已累计的金额（HUD.money 初始值，用于推算本关入账） */
  private levelStartMoney: number;

  /** 暂停状态 */
  private isPaused: boolean = false;

  /** 暂停层子状态：none=主菜单 / saveAs=另存为弹窗 */
  private pauseSubState: 'none' | 'saveAs' = 'none';

  /** SaveAs 子层激活时缓存的手动槽位列表（避免每帧 localStorage I/O） */
  private cachedManualSlots: SlotMeta[] | null = null;

  /** 二次确认对话框（覆盖另存为弹窗） */
  private confirmOverwrite: { slotId: number } | null = null;

  /** 保存成功 toast 剩余时间 */
  private saveToastTimer: number = 0;

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

  /** 粒子系统 */
  private particles: ParticleSystem = new ParticleSystem();

  /** 飘字系统 */
  private floatingTexts: FloatingTextSystem = new FloatingTextSystem();

  /** 章节背景装饰图层（动画装饰：火把火星 / 气泡 / 花瓣 等） */
  private readonly decorationLayer: DecorationLayer;

  /** 提前结算按钮（仅在达标后显示） */
  private finishButton: Button;

  /** 上一帧达标状态：用于检测 false→true 上升沿，触发"叮咚"提示音（#18） */
  private wasTargetReached: boolean = false;

  /** 上一帧钩爪是否在 REELING 系列状态：用于启停金属摩擦循环音（#16） */
  private wasReeling: boolean = false;

  constructor(game: Game, levelConfig: LevelConfig) {
    super();
    this.game = game;
    this.levelConfig = levelConfig;
    this.targetMoney = levelConfig.targetMoney;

    // 累计模式：本关起步金额 = 玩家进关时已累计的金额（含商店花费扣除后）
    this.levelStartMoney = game.getCurrentMoney();

    // 从主题管理器获取精灵缓存 + sprite 动画元数据查询函数
    const themeManager = game.getThemeManager();
    this.spriteCache = themeManager.getSpriteCache();
    this.spriteMetaProvider = (name: string) => themeManager.getSpriteMeta(name);

    // 初始化矿工和钩爪（钩爪锚点在矿工底部，即地面位置）
    this.miner = new Miner(GAME_CONFIG.MINER_X, GAME_CONFIG.MINER_Y, this.spriteCache, this.spriteMetaProvider);
    this.hook = new Hook(GAME_CONFIG.MINER_X, GROUND_Y, this.spriteCache, this.spriteMetaProvider);

    // 初始化 HUD（HUD.money 起步值 = levelStartMoney，使其与累计目标在同一参照系）
    this.hud = new HUD(this.spriteCache, this.targetMoney, this.levelConfig.timeLimit, this.spriteMetaProvider);
    this.hud.money = this.levelStartMoney;

    // 难度联动：缓存配置 + 注入重量影响系数倍率 + HUD 标签
    this.difficulty = game.getDifficultyConfig();
    this.hook.weightFactorScale = this.difficulty.weightFactorScale;

    // 章节背景色板：构造时一次性合成（同关章节固定，避免每帧 spread 临时对象）
    this.chapterColors = getChapterBackgroundColors(
      this.levelConfig.chapter,
      game.getThemeManager().getBackgroundColors(),
    );

    // 章节装饰动画图层：按当前章节实例化（独立粒子池，与击中特效池隔离）
    this.decorationLayer = new DecorationLayer(createChapterAnimators(this.levelConfig.chapter));
    // HUD 标签优先级：INFINITE 难度 > 无尽关卡（L22+）> 普通难度
    // 注：INFINITE 难度玩家进 L22+ 仍显示"🔥 无限火力"（难度模式优先于关卡模式）
    const inEndlessChapter = isEndlessLevel(this.levelConfig.level);
    if (this.difficulty.infiniteItems) {
      this.hud.difficultyLabel = `🔥 ${this.difficulty.name}`;
    } else if (inEndlessChapter) {
      this.hud.difficultyLabel = `⚡ 无尽 L${this.levelConfig.level - TOTAL_LEVELS}`;
    } else {
      this.hud.difficultyLabel = `难度: ${this.difficulty.name}`;
    }

    // INFINITE 模式：开局自动加全部 persistent buff
    // 消耗品（DYNAMITE/EXTRA_TIME）由 infiniteItems flag 在使用时拦截，不自动持有
    if (this.difficulty.infiniteItems) {
      for (const itemType of PERSISTENT_ITEM_TYPES) {
        game.addOwnedItem(itemType);
      }
      // 炸药作为常用消耗品，INFINITE 模式默认携带（不消耗）
      game.addOwnedItem(ItemType.DYNAMITE);
    }

    // 力量药水：收回速度 +50%
    if (game.getOwnedItems().has(ItemType.STRENGTH_POTION)) {
      this.hook.reelSpeedMultiplier = 1.5;
    }

    // 设置钩爪收回回调
    this.hook.setOnComplete((mineral) => this.onHookComplete(mineral));

    // 设置炸药桶爆炸回调
    this.hook.setOnBombExplode((x, y) => this.onBombExplode(x, y));

    // 提前结算按钮（HUD 正下方右上角，避免挡住下方的道具）
    this.finishButton = new Button(
      GAME_CONFIG.CANVAS_WIDTH - 130,
      HUD_HEIGHT + 8,
      120,
      36,
      STRINGS.game.finishEarly
    );
  }

  enter(): void {
    // 检查是否首次游玩
    this.showTutorial = !this.game.getStorage().loadTutorialShown();
    // 使用关卡配置生成矿物
    this.generateMinerals(this.levelConfig.mineralCount);

    // 难度联动：基础关卡时间 × 难度时间倍率，再加道具额外时间
    let timeLimit = this.levelConfig.timeLimit * this.difficulty.timeScale;
    // 额外时间是一次性消耗品（与 DYNAMITE 同语义）：开局生效后即消耗
    // INFINITE 模式因 ResultScene 跳过商店且 clearLevelBuffs 跳过，玩家不会主动买这道具，无需特判
    const ownedItems = this.game.getOwnedItems();
    if (ownedItems.has(ItemType.EXTRA_TIME)) {
      timeLimit += EXTRA_TIME_BONUS;
      ownedItems.delete(ItemType.EXTRA_TIME);
    }
    this.hud.timeLeft = timeLimit;
    this.hud.money = this.levelStartMoney; // 与 ctor 一致：HUD 起步累计金额（防御性重置）
    this.hook.reset();
  }

  exit(): void {
    // 清理
    this.minerals = [];
    this.particles.clear();
    this.floatingTexts.clear();
    this.decorationLayer.clear();
    // 场景退出时停止钩绳循环音，防止泄漏到下一场景
    this.game.getAudio().stopRopeFriction();
  }

  update(dt: number): void {
    if (this.saveToastTimer > 0) this.saveToastTimer -= dt;
    if (this.isPaused) {
      // 暂停时主动停止钩绳循环音（恢复后 detectStateTransitionSfx 会重新启动）
      if (this.wasReeling) {
        this.game.getAudio().stopRopeFriction();
        this.wasReeling = false;
      }
      return;
    }

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

    this.particles.update(dt);
    this.floatingTexts.update(dt);
    this.decorationLayer.update(dt);

    // 状态变化反馈：达标"叮咚"上升沿 + 钩绳金属摩擦循环音启停
    this.detectStateTransitionSfx();

    // 同步提前结算按钮禁用状态：钩爪不在摆动时禁用（避免抓取中途结算的歧义）
    this.finishButton.disabled = this.hook.state !== HookState.SWINGING;
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

    // ESC 暂停/恢复（saveAs 子层下 ESC 返回菜单层）
    if (input.isJustPressed('Escape')) {
      if (this.isPaused && this.pauseSubState === 'saveAs') {
        this.pauseSubState = 'none';
        this.confirmOverwrite = null;
        this.cachedManualSlots = null;
      } else {
        this.isPaused = !this.isPaused;
        this.pauseSubState = 'none';
        this.cachedManualSlots = null;
      }
      return;
    }

    // 暂停状态：交互式菜单
    if (this.isPaused) {
      this.handlePauseInput(input);
      return;
    }

    // 键盘事件先于点击分支处理（点击分支末尾 return 会吞掉同帧按键）
    if (KEY_DETONATE_CODES.some(code => input.isJustPressed(code))) {
      this.tryDetonate();
    }

    // 摇晃饮料：钩爪伸出过程中按 ←/→ 微调角度（仅持有道具且难度允许）
    this.tryShakeAdjust(input);

    // 点击事件
    if (input.wasTapped()) {
      const pos = input.getTapPosition();

      const rw = this.game.getRenderer().width;
      const pauseRect = { x: rw - PAUSE_BTN_RIGHT_OFFSET, y: PAUSE_BTN_Y, w: PAUSE_BTN_W, h: PAUSE_BTN_H };
      const tutorialRect = { x: rw - TUTORIAL_BTN_RIGHT_OFFSET, y: TUTORIAL_BTN_Y, w: TUTORIAL_BTN_W, h: TUTORIAL_BTN_H };

      // 暂停按钮优先检测
      if (pointInRect(pos.x, pos.y, pauseRect)) {
        this.isPaused = true;
        return;
      }

      // 帮助按钮 → 打开矿物图鉴 DOM 弹窗（操作说明 + 矿物图鉴 Tab）
      if (pointInRect(pos.x, pos.y, tutorialRect)) {
        this.game.getCodexModal()?.open();
        return;
      }

      // 提前结算按钮（仅达标时响应；Button.disabled 在钩爪非摆动时拦截点击）
      if (this.hud.isTargetReached()) {
        if (this.finishButton.update(pos.x, pos.y, true)) {
          this.goToResult();
          return;
        }
      }

      // 发射钩爪（Hook.fire() 内部已检查 SWINGING 状态）
      this.tryFireHook();
      return;
    } else {
      // 非点击时更新按钮 hover 状态
      if (this.hud.isTargetReached()) {
        const pos = input.getTapPosition();
        this.finishButton.update(pos.x, pos.y, false);
      }
    }

    // 空格键发射钩爪
    if (input.isJustPressed('Space')) {
      this.tryFireHook();
    }
  }

  /** 尝试发射钩爪（仅当摆动状态生效） */
  private tryFireHook(): void {
    if (this.hook.state !== HookState.SWINGING) return;
    this.hook.fire();
    this.miner.setState(MinerState.PULL);
    this.game.getAudio().play(SoundType.HOOK_FIRE);
  }

  /** 摇晃饮料：钩爪伸出中持续按住 ←/→ 微调角度（难度门控 + 道具门控） */
  private tryShakeAdjust(input: Input): void {
    // 硬核难度强制失效（设计意图：纯硬核体验），用缓存避免每帧 getDifficultyConfig
    if (this.difficulty.isHardcore) return;
    if (!this.game.getOwnedItems().has(ItemType.SHAKE_DRINK)) return;

    if (input.isPressed('ArrowLeft')) {
      this.hook.tryAdjustAngle(-1);
    }
    if (input.isPressed('ArrowRight')) {
      this.hook.tryAdjustAngle(1);
    }
  }

  /** 尝试主动引爆当前钩着的矿物（消耗一次 DYNAMITE 道具） */
  private tryDetonate(): void {
    const items = this.game.getOwnedItems();
    if (!items.has(ItemType.DYNAMITE)) return;

    const mineral = this.hook.tryDetonate();
    if (!mineral) return;

    this.minerals = this.minerals.filter(m => m !== mineral);
    this.particles.emit({ ...PRESET_BOMB_SPARK, x: mineral.x, y: mineral.y });
    this.floatingTexts.emit(mineral.x, mineral.y - 10, STRINGS.game.floatingText.bombDestroyed, '#FF6600', 'MEDIUM');
    // INFINITE 模式道具永久不消耗
    if (!this.difficulty.infiniteItems) {
      items.delete(ItemType.DYNAMITE);
    }

    this.game.getAudio().play(SoundType.GRAB_BOMB);
    this.miner.setState(MinerState.HAPPY);
  }

  render(renderer: Renderer): void {
    // 清空画面
    renderer.clear('#000000');

    // 绘制背景（用构造时缓存的章节色板 + 当前章节，叠加章节静态装饰）
    renderBackground(renderer, renderer.width, renderer.height, this.chapterColors, this.levelConfig.chapter);

    // 章节装饰动画图层（背景之上、矿物之下）
    this.decorationLayer.render(renderer);

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

    // 绘制粒子（在矿工/钩爪之上）
    this.particles.render(renderer);

    // 绘制飘字（在粒子之上）
    this.floatingTexts.render(renderer);

    // 绘制爆炸效果
    if (this.explosionTimer > 0) {
      this.renderExplosion(renderer);
    }

    // 提前结算按钮（仅达标时显示）
    if (this.hud.isTargetReached() && !this.isPaused && !this.showTutorial) {
      this.finishButton.render(renderer);
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

    // 暂停层渲染（含主菜单层 / 另存为子层 / 覆盖确认）
    if (this.isPaused) {
      this.renderPauseOverlay(renderer);
    }

    // 保存成功 toast
    if (this.saveToastTimer > 0) {
      const ctx = renderer.getContext();
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.saveToastTimer / 0.3);
      drawTextCentered(renderer, '✓ 已保存到槽位', 100, '#88FF88', 'MEDIUM');
      ctx.restore();
    }

    // 教程引导覆盖层
    if (this.showTutorial) {
      const ctx = renderer.getContext();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      drawTextCentered(renderer, STRINGS.game.tutorial.title, 100, '#FFD700', 'TITLE');
      drawTextCentered(renderer, STRINGS.game.tutorial.shoot, 180, '#FFFFFF', 'MEDIUM');
      drawTextCentered(renderer, 'F / ↑ 键 - 引爆 TNT（需购买炸药）', 220, '#FFFFFF', 'MEDIUM');
      drawTextCentered(renderer, 'ESC / 右上角按钮 - 暂停', 260, '#FFFFFF', 'MEDIUM');
      drawTextCentered(renderer, STRINGS.game.tutorial.goal, 320, '#AAAAAA', 'SMALL');
      drawTextCentered(renderer, STRINGS.game.tutorial.clickToStart, 390, '#FFD700', 'MEDIUM');
    }
  }

  /** 暂停层 - 主菜单按钮区域 */
  private getPauseMenuButtons(): { rect: { x: number; y: number; w: number; h: number }; label: string; action: PauseAction }[] {
    const btnW = 240, btnH = 44, gap = 12;
    const startY = 220;
    const x = (this.game.getRenderer().width - btnW) / 2;
    return [
      { rect: { x, y: startY, w: btnW, h: btnH }, label: STRINGS.common.continueGame, action: 'resume' },
      { rect: { x, y: startY + (btnH + gap), w: btnW, h: btnH }, label: STRINGS.game.saveAs, action: 'saveAs' },
      { rect: { x, y: startY + (btnH + gap) * 2, w: btnW, h: btnH }, label: STRINGS.common.backToMenu, action: 'menu' },
    ];
  }

  /** 暂停层 - 另存为子层的 10 个槽位卡片矩形 */
  private getSaveAsCardRect(index: number): { x: number; y: number; w: number; h: number } {
    const cardW = 132, cardH = 96, gapX = 8, gapY = 10;
    const cols = 5;
    const totalW = cardW * cols + gapX * (cols - 1);
    const startX = (this.game.getRenderer().width - totalW) / 2;
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: startX + col * (cardW + gapX),
      y: 200 + row * (cardH + gapY),
      w: cardW,
      h: cardH,
    };
  }

  /** 暂停层 - 取消按钮（saveAs 子层） */
  private getSaveAsCancelRect(): { x: number; y: number; w: number; h: number } {
    return { x: (this.game.getRenderer().width - 140) / 2, y: 460, w: 140, h: 32 };
  }

  /** 覆盖确认对话框按钮坐标（0=覆盖, 1=取消） */
  private getConfirmOverwriteButtonRect(idx: 0 | 1): { x: number; y: number; w: number; h: number } {
    const xs = [280, 420];
    return { x: xs[idx]!, y: 295, w: 100, h: 32 };
  }

  /** 暂停层输入处理（含 SaveAs 子层 + 覆盖确认） */
  private handlePauseInput(input: Input): void {
    if (!input.wasTapped()) return;
    const pos = input.getTapPosition();

    // 覆盖确认对话框置顶
    if (this.confirmOverwrite) {
      const yesRect = this.getConfirmOverwriteButtonRect(0);
      const noRect = this.getConfirmOverwriteButtonRect(1);
      if (pointInRect(pos.x, pos.y, yesRect)) {
        const slotId = this.confirmOverwrite.slotId;
        this.confirmOverwrite = null;
        this.doSaveAsManualSlot(slotId);
      } else if (pointInRect(pos.x, pos.y, noRect)) {
        this.confirmOverwrite = null;
      }
      return;
    }

    if (this.pauseSubState === 'saveAs') {
      // 取消按钮
      if (pointInRect(pos.x, pos.y, this.getSaveAsCancelRect())) {
        this.pauseSubState = 'none';
        this.cachedManualSlots = null;
        return;
      }
      // 槽位卡片
      for (let i = 0; i < 10; i++) {
        const slotId = i + 1;
        const rect = this.getSaveAsCardRect(i);
        if (pointInRect(pos.x, pos.y, rect)) {
          // 非空槽位需要二次确认
          if (this.game.getStorage().isSlotOccupied(slotId)) {
            this.confirmOverwrite = { slotId };
          } else {
            this.doSaveAsManualSlot(slotId);
          }
          return;
        }
      }
      return;
    }

    // 主菜单层
    for (const btn of this.getPauseMenuButtons()) {
      if (pointInRect(pos.x, pos.y, btn.rect)) {
        if (btn.action === 'resume') {
          this.isPaused = false;
        } else if (btn.action === 'saveAs') {
          this.pauseSubState = 'saveAs';
          // 进入子层时一次性缓存槽位列表，避免每帧 I/O
          this.cachedManualSlots = this.game.getStorage().listManualSlots();
        } else if (btn.action === 'menu') {
          this.game.changeScene(GameState.MENU);
        }
        return;
      }
    }
  }

  /** 执行另存为操作 */
  private doSaveAsManualSlot(slotId: number): void {
    const ok = this.game.saveAsManualSlot(slotId);
    if (ok) {
      this.saveToastTimer = 1.5;
      this.pauseSubState = 'none';
      this.cachedManualSlots = null;
      this.isPaused = false; // 保存成功后自动继续游戏
    }
  }

  /** 暂停层渲染（含主菜单层 / SaveAs 子层 / 覆盖确认） */
  private renderPauseOverlay(renderer: Renderer): void {
    const ctx = renderer.getContext();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    if (this.pauseSubState === 'saveAs') {
      this.renderSaveAsLayer(renderer);
    } else {
      this.renderPauseMenuLayer(renderer);
    }

    if (this.confirmOverwrite) {
      this.renderConfirmOverwriteDialog(renderer);
    }
  }

  /** 暂停层 - 主菜单层渲染 */
  private renderPauseMenuLayer(renderer: Renderer): void {
    const ctx = renderer.getContext();
    drawTextCentered(renderer, STRINGS.game.paused, 130, '#FFFFFF', 'TITLE');
    drawTextCentered(renderer, STRINGS.game.pauseHint, 180, '#888899', 'SMALL');

    for (const btn of this.getPauseMenuButtons()) {
      ctx.fillStyle = '#FF6FA8';
      ctx.fillRect(btn.rect.x, btn.rect.y, btn.rect.w, btn.rect.h);
      ctx.fillStyle = '#FF8FC0';
      ctx.fillRect(btn.rect.x, btn.rect.y, btn.rect.w, 2);
      drawTextCenteredIn(renderer, btn.label, btn.rect, '#FFFFFF', 'MEDIUM');
    }
  }

  /** 暂停层 - SaveAs 子层渲染（10 槽位卡片） */
  private renderSaveAsLayer(renderer: Renderer): void {
    const ctx = renderer.getContext();
    drawTextCentered(renderer, STRINGS.game.saveAsTitle, 140, '#FFD700', 'LARGE');
    drawTextCentered(renderer, STRINGS.game.overwriteWarning, 180, '#888899', 'SMALL');

    // 用缓存（进入子层时已 listManualSlots 一次）
    const slots = this.cachedManualSlots ?? [];
    for (let i = 0; i < 10; i++) {
      const meta = slots[i];
      if (!meta) continue;
      const rect = this.getSaveAsCardRect(i);
      const empty = meta.empty;

      ctx.fillStyle = empty ? '#1a1a2a' : '#3a2a3a';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = empty ? '#666688' : '#FFAA66';
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

      drawText(renderer, `#${i + 1}`, rect.x + 8, rect.y + 8, '#FFD700', 'SMALL');

      if (empty) {
        drawText(renderer, '[空]', rect.x + 8, rect.y + 36, '#666688', 'SMALL');
        drawText(renderer, STRINGS.game.saveAsClickPrompt, rect.x + 8, rect.y + 60, '#88FF88', 'SMALL');
      } else {
        drawText(renderer, `第 ${meta.currentLevel} 关`, rect.x + 8, rect.y + 30, '#FFFFFF', 'SMALL');
        drawText(renderer, `$${meta.currentMoney}`, rect.x + 8, rect.y + 50, '#FFD700', 'SMALL');
        drawText(renderer, '⚠ 覆盖', rect.x + 8, rect.y + 72, '#FF8888', 'SMALL');
      }
    }

    // 取消按钮
    const cancel = this.getSaveAsCancelRect();
    ctx.fillStyle = '#444466';
    ctx.fillRect(cancel.x, cancel.y, cancel.w, cancel.h);
    drawText(renderer, STRINGS.common.cancel, cancel.x + 52, cancel.y + 8, '#FFFFFF', 'MEDIUM');
  }

  /** 覆盖二次确认对话框 */
  private renderConfirmOverwriteDialog(renderer: Renderer): void {
    if (!this.confirmOverwrite) return;
    const ctx = renderer.getContext();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    const dx = 250, dy = 200, dw = 300, dh = 160;
    ctx.fillStyle = '#22223a';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);

    drawTextCentered(renderer, STRINGS.game.overwriteTitle, dy + 30, '#FFFFFF', 'LARGE');
    drawTextCentered(renderer, `槽位 #${this.confirmOverwrite.slotId} 已有存档`, dy + 70, '#FF8888', 'SMALL');
    drawTextCentered(renderer, STRINGS.common.undoWarning, dy + 90, '#FF8888', 'SMALL');

    // 是/否按钮
    const yesRect = this.getConfirmOverwriteButtonRect(0);
    const noRect = this.getConfirmOverwriteButtonRect(1);
    ctx.fillStyle = '#883333';
    ctx.fillRect(yesRect.x, yesRect.y, yesRect.w, yesRect.h);
    drawText(renderer, STRINGS.game.overwrite, yesRect.x + 30, yesRect.y + 8, '#FFFFFF', 'MEDIUM');

    ctx.fillStyle = '#444466';
    ctx.fillRect(noRect.x, noRect.y, noRect.w, noRect.h);
    drawText(renderer, STRINGS.common.cancel, noRect.x + 30, noRect.y + 8, '#FFFFFF', 'MEDIUM');
  }

  /** 绘制右上角按钮组（暂停 + 教程） */
  private renderTopButtons(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const rw = renderer.width;

    // 暂停按钮（两条竖线）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(rw - 22, 13, 3, 10);
    ctx.fillRect(rw - 15, 13, 3, 10);

    // 教程按钮（问号像素画 6x9）
    const qx = rw - 50;
    const qy = 12;
    const QM = [
      [0,1,1,1,1,0],
      [1,0,0,0,0,1],
      [0,0,0,0,0,1],
      [0,0,0,0,1,0],
      [0,0,0,1,0,0],
      [0,0,1,0,0,0],
      [0,1,1,0,0,0],
      [0,0,0,0,0,0],
      [0,1,1,0,0,0],
    ];
    for (let r = 0; r < QM.length; r++) {
      for (let c = 0; c < QM[r]!.length; c++) {
        if (QM[r]![c]) ctx.fillRect(qx + c, qy + r, 1, 1);
      }
    }
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

    const padX = 8;
    const padY = 3;
    const itemH = 16;
    const gap = 3;
    const marginR = 8;
    const boxW = maxW + padX * 2 + 4; // +4 给左侧金线留位
    const panelH = itemArray.length * itemH + (itemArray.length - 1) * gap + padY * 2;
    const startX = renderer.width - boxW - marginR;
    const startY = HUD_HEIGHT + 10;
    const panelY = startY - padY;

    // 整体半透明背景面板
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.roundRect(startX - 4, panelY, boxW + 8, panelH, 4);
    ctx.fill();

    for (let i = 0; i < itemArray.length; i++) {
      const itemType = itemArray[i]!;
      const name = ITEM_SHORT_NAMES[itemType];
      if (!name) continue;
      const y = startY + i * (itemH + gap);

      // 道具背景条
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(startX, y, boxW, itemH);
      // 左侧金色边线
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(startX, y, 2, itemH);
      // 道具文字
      drawText(renderer, name, startX + padX + 2, y + padY, '#FFD700', 'SMALL');
    }
  }

  /** 钩爪收回完成回调（含道具效果） */
  private onHookComplete(mineral: Mineral | null): void {
    if (mineral) {
      const items = this.game.getOwnedItems();
      // 矿物收回点（用于粒子特效定位，约在矿工头顶）
      const px = GAME_CONFIG.MINER_X;
      const py = GAME_CONFIG.MINER_Y + 10;

      // 神秘袋特殊处理
      if (mineral.config.type === MineralType.MYSTERY_BAG && mineral.mysteryContent) {
        this.handleMysteryBag(mineral);
        return;
      }

      // 木箱抽奖处理
      if (mineral.config.type === MineralType.WOODEN_BOX) {
        this.handleWoodenBox(mineral);
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

      // 难度联动：金额按 valueScale 缩放后入账（玩家最终看到的就是这个值）
      value = Math.round(value * this.difficulty.valueScale);

      this.hud.money += value;

      const isHighValue = value >= VALUE_TIER.HIGH;
      if (mineral.config.type === MineralType.DIAMOND) {
        this.game.getAudio().play(SoundType.GRAB_DIAMOND);
        this.particles.emit({ ...PRESET_DIAMOND_SPARKLE, x: px, y: py });
      } else if (mineral.config.type === MineralType.STONE) {
        this.game.getAudio().play(SoundType.GRAB_STONE);
        this.particles.emit({ ...PRESET_STONE_DUST, x: px, y: py });
      } else {
        this.game.getAudio().play(SoundType.GRAB_GOLD);
        this.particles.emit({ ...PRESET_GOLD_SPARKLE, x: px, y: py });
      }

      this.floatingTexts.emit(
        px, py - 20,
        `+$${value}`,
        pickValueColor(value),
        isHighValue ? 'LARGE' : 'MEDIUM'
      );
      this.playValueFeedback(value);
    } else {
      this.game.getAudio().play(SoundType.HOOK_REEL);
    }
  }

  /** 按金额档位播放矿工表情 + 音效（高价/正向/扣分三档，多处复用） */
  private playValueFeedback(value: number): void {
    if (value >= VALUE_TIER.HIGH) {
      this.game.getAudio().play(SoundType.MINER_HAPPY);
      this.miner.setState(MinerState.HAPPY);
    } else if (value > 0) {
      this.game.getAudio().play(SoundType.MINER_NORMAL);
      this.miner.setState(MinerState.HAPPY);
    } else {
      this.game.getAudio().play(SoundType.MINER_SAD);
      this.miner.setState(MinerState.SAD);
    }
  }

  /** 处理神秘袋内容 */
  private handleMysteryBag(mineral: Mineral): void {
    const content = mineral.mysteryContent!;
    const px = GAME_CONFIG.MINER_X;
    const py = GAME_CONFIG.MINER_Y + 10;

    if (content === MysteryContent.CASH_SMALL || content === MysteryContent.CASH_LARGE) {
      // 难度联动：神秘袋现金也按 valueScale 缩放
      const value = Math.round(mineral.value * this.difficulty.valueScale);
      this.hud.money += value;
      this.showNotification(`${mineral.mysteryLabel}: +$${value}`);
      const isHigh = value >= VALUE_TIER.HIGH;
      this.floatingTexts.emit(
        px, py - 20,
        `+$${value}`,
        pickValueColor(value),
        isHigh ? 'LARGE' : 'MEDIUM'
      );
      this.game.getAudio().play(SoundType.GRAB_GOLD);
      this.playValueFeedback(value);
    } else if (content === MysteryContent.STRENGTH_POTION) {
      // 大力药剂：本关收回速度永久 +80%
      this.hook.reelSpeedMultiplier = Math.max(this.hook.reelSpeedMultiplier, 1.8);
      this.showNotification(STRINGS.game.notifications.strengthPotionMsg);
      this.floatingTexts.emit(px, py - 20, STRINGS.game.floatingText.strengthPotion, '#88FF88', 'MEDIUM');
      this.game.getAudio().play(SoundType.COIN);
      this.game.getAudio().play(SoundType.MINER_HAPPY);
      this.miner.setState(MinerState.HAPPY);
    } else if (content === MysteryContent.DYNAMITE) {
      // 炸药：直接炸毁场上随机一个矿物（优先炸石头）
      const stones = this.minerals.filter(m => !m.grabbed && m.config.type === MineralType.STONE);
      const targets = stones.length > 0 ? stones : this.minerals.filter(m => !m.grabbed);
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)]!;
        // 直接从列表中移除即可，无需额外设置 grabbed
        this.minerals = this.minerals.filter(m => m !== target);
        // 顺手撒点炸药粒子，反馈更明显
        this.particles.emit({
          x: target.x,
          y: target.y,
          count: 12,
          colors: ['#FF6600', '#FFAA00', '#FFFFFF'],
          speedMin: 60,
          speedMax: 150,
          lifeMin: 0.3,
          lifeMax: 0.6,
          sizeMin: 2,
          sizeMax: 3,
          gravity: 80,
        });
        this.showNotification(STRINGS.game.notifications.bombDestroy);
        this.floatingTexts.emit(px, py - 20, STRINGS.game.floatingText.bombBoom, '#FF6600', 'MEDIUM');
      } else {
        this.showNotification(STRINGS.game.notifications.bombEmpty);
        this.floatingTexts.emit(px, py - 20, STRINGS.game.floatingText.bombMissed, '#888888', 'MEDIUM');
      }
      this.game.getAudio().play(SoundType.GRAB_BOMB);
      this.game.getAudio().play(SoundType.MINER_SAD);
      this.miner.setState(MinerState.SAD);
    }
  }

  /** 处理木箱抽奖结果 */
  private handleWoodenBox(mineral: Mineral): void {
    const px = GAME_CONFIG.MINER_X;
    const py = GAME_CONFIG.MINER_Y + 10;

    // 难度联动：木箱开出的金额也按 valueScale 缩放（含负值）
    const value = Math.round(mineral.value * this.difficulty.valueScale);
    this.hud.money += value;

    // 飘字：开盒结果 label（pickValueColor 已支持负值返回 PENALTY 红色）
    this.floatingTexts.emit(px, py - 20, mineral.boxLabel, pickValueColor(value), 'MEDIUM');
    this.showNotification(`木箱: ${mineral.boxLabel}`);

    // grab 音效 + 粒子按 value 档位（事后才知道价值的特殊场景）
    if (value >= VALUE_TIER.HIGH) {
      this.game.getAudio().play(SoundType.GRAB_DIAMOND);
      this.particles.emit({ ...PRESET_DIAMOND_SPARKLE, x: px, y: py });
    } else if (value > 0) {
      this.game.getAudio().play(SoundType.GRAB_GOLD);
      this.particles.emit({ ...PRESET_GOLD_SPARKLE, x: px, y: py });
    } else {
      this.game.getAudio().play(SoundType.GRAB_STONE);
      this.particles.emit({ ...PRESET_STONE_DUST, x: px, y: py });
    }
    this.playValueFeedback(value);
  }

  /** 显示通知文字 */
  private showNotification(text: string): void {
    this.notificationText = text;
    this.notificationTimer = NOTIFICATION_DURATION;
  }

  /**
   * 矿物生成（金块保底驱动）
   * 1. 按关卡权重 + largeWeightScale 抑制大件，生成基础 count 个矿物
   * 2. 计算金块保底 goldBudget = levelEarning × mineralBudgetRatio / valueScale
   * 3. 金块保底：循环追加金块（按 largeWeightScale 加权选品种）直到金块总值 ≥ goldBudget
   * 4. cap 降级：总价值溢出时沿升级链反向降级最高价矿物
   * 5. 应用幸运草等 buff
   */
  private generateMinerals(count: number): void {
    this.minerals = [];
    const weights = this.levelConfig.mineralWeights ?? MINERAL_WEIGHTS;

    // 1) 基础加权生成 — 应用 largeWeightScale 削弱大件（GOLD_MEDIUM/LARGE/DIAMOND）
    // MINERAL_TYPES 顺序：GOLD_SMALL(0), GOLD_MEDIUM(1), GOLD_LARGE(2), DIAMOND(3), ...
    const lws = this.difficulty.largeWeightScale;
    const adjustedWeights = weights.map((w, i) => {
      if (i === 1 || i === 2 || i === 3) return Math.max(0, Math.round(w * lws));
      return w;
    });
    for (let i = 0; i < count; i++) {
      const typeIndex = weightedRandom(adjustedWeights);
      const type = MINERAL_TYPES[typeIndex]!;
      const placed = this.tryPlaceMineral(type);
      if (placed) {
        this.minerals.push(placed);
      }
    }

    // 2) 计算金块保底预算
    //    累计模式：预算按"本关增量"算（不是累计目标），否则预算会无意义地放大
    //    除以 valueScale 是因为玩家最终看到的金额会再乘 valueScale
    const levelEarning = getLevelEarning(this.levelConfig.level);
    const goldBudget = (levelEarning * this.difficulty.mineralBudgetRatio) / this.difficulty.valueScale;

    // 3) 金块保底：场上金块总额不足时按 largeWeightScale 加权追加 GOLD_SMALL/MEDIUM/LARGE
    this.ensureGoldBudget(goldBudget);

    // 4) 金块过富时降级最大金块（不破坏金块保底，只在金块品种间降级）
    this.downgradeGoldToReachCap(goldBudget * this.difficulty.mineralBudgetCap);

    // 5) 章节末关：30% 概率插入章节专属收藏品（独立于预算系统的彩蛋）
    this.tryAddChapterCollectible();

    // 6) 木箱：L5+ 关卡保证 1 个抽奖箱（不进预算系统）
    this.tryAddWoodenBox();

    // 7) 幸运草：神秘袋最低 $200
    const items = this.game.getOwnedItems();
    if (items.has(ItemType.LUCKY_CLOVER)) {
      for (const mineral of this.minerals) {
        if (mineral.config.type === MineralType.MYSTERY_BAG) {
          mineral.value = Math.max(mineral.value, 200);
        }
      }
    }
  }

  /** 章节末关倾斜：30% 概率追加 1 个章节专属收藏品 */
  private tryAddChapterCollectible(): void {
    if (!this.levelConfig.isChapterFinale) return;
    if (Math.random() >= CHAPTER_COLLECTIBLE_CHANCE) return;
    this.tryAddBonusMineral(CHAPTER_COLLECTIBLE_MAP[this.levelConfig.chapter]);
  }

  /** L5+ 关卡每关追加 1 个木箱（保证有抽奖机会） */
  private tryAddWoodenBox(): void {
    if (this.levelConfig.level < WOODEN_BOX_MIN_LEVEL) return;
    this.tryAddBonusMineral(MineralType.WOODEN_BOX);
  }

  /** 追加独立于预算系统的彩蛋矿物（收藏品/木箱等，找不到空位则静默放弃） */
  private tryAddBonusMineral(type: MineralType): void {
    const placed = this.tryPlaceMineral(type);
    if (placed) {
      this.minerals.push(placed);
    }
  }

  /** 场上金块（GOLD_SMALL/MEDIUM/LARGE，不含钻石）的原始总价值 */
  private getCurrentGoldTotal(): number {
    return this.minerals
      .filter((m) => GOLD_TYPES.includes(m.config.type))
      .reduce((sum, m) => sum + m.value, 0);
  }

  /**
   * 按 largeWeightScale 加权随机选金块品种（NOVICE 偏 LARGE，HARD/EXPERT 偏 SMALL）
   * 权重数组 [pSmall, pMedium, pLarge] 顺序与 GOLD_TYPES 一一对应
   * pMedium = lws × 1.5：让 MEDIUM 在 SMALL 与 LARGE 之间形成平滑梯度，避免高难度突变到全 SMALL
   */
  private pickGoldVariant(): MineralType {
    const lws = this.difficulty.largeWeightScale;
    const pLarge = Math.max(0, Math.min(1, lws));
    const pMedium = Math.max(0, Math.min(1, lws * GOLD_MEDIUM_WEIGHT_FACTOR));
    const pSmall = 1.0;
    const idx = weightedRandom([pSmall, pMedium, pLarge]);
    return GOLD_TYPES[idx]!;
  }

  /** 金块保底：循环追加金块直到金块总值满足 goldBudget 或达到上限 */
  private ensureGoldBudget(goldBudget: number): void {
    for (let i = 0; i < GOLD_BUDGET_MAX_APPEND; i++) {
      if (this.getCurrentGoldTotal() >= goldBudget) return;
      const placed = this.tryPlaceMineral(this.pickGoldVariant());
      if (!placed) return; // 找不到空位
      this.minerals.push(placed);
    }
  }

  /**
   * 金块过富时降级：场上金块总值超过 goldBudget × cap 时，将最大金块降一级
   * 只在金块品种之间降级（GOLD_LARGE → MEDIUM → SMALL），不降到非金块
   * 防止"刚好卡过线"难度被偶发生成的过多大金块破坏
   */
  private downgradeGoldToReachCap(goldCap: number): void {
    const goldChainStart = VALUE_UPGRADE_CHAIN.indexOf(MineralType.GOLD_SMALL);
    for (let attempt = 0; attempt < BUDGET_UPGRADE_MAX_ATTEMPTS; attempt++) {
      if (this.getCurrentGoldTotal() <= goldCap) return;

      // 找到当前价值最高的可降级金块（仅 GOLD_MEDIUM/LARGE 可降）
      let candidateIdx = -1;
      let candidateChainIdx = -1;
      let candidateValue = -Infinity;
      for (let i = 0; i < this.minerals.length; i++) {
        const m = this.minerals[i]!;
        const chainIdx = VALUE_UPGRADE_CHAIN.indexOf(m.config.type);
        if (chainIdx <= goldChainStart) continue;  // 已是 GOLD_SMALL 或非金块
        if (m.value > candidateValue) {
          candidateValue = m.value;
          candidateIdx = i;
          candidateChainIdx = chainIdx;
        }
      }
      if (candidateIdx < 0) return;  // 所有金块都已是 GOLD_SMALL

      const oldMineral = this.minerals[candidateIdx]!;
      const prevType = VALUE_UPGRADE_CHAIN[candidateChainIdx - 1]!;
      const newMineral = new Mineral(oldMineral.x, oldMineral.y, prevType, this.spriteCache, this.spriteMetaProvider);
      if (oldMineral.vx !== 0) {
        newMineral.vx = oldMineral.vx;
        newMineral.moveLeft = oldMineral.moveLeft;
        newMineral.moveRight = oldMineral.moveRight;
      }
      this.minerals[candidateIdx] = newMineral;
    }
  }

  /** 尝试在不重叠的位置放置矿物 */
  private tryPlaceMineral(type: MineralType, maxAttempts: number = 20): Mineral | null {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = randomInt(GAME_CONFIG.MINERAL_AREA_LEFT, GAME_CONFIG.MINERAL_AREA_RIGHT);
      const y = randomInt(GAME_CONFIG.MINERAL_AREA_TOP, GAME_CONFIG.MINERAL_AREA_BOTTOM);
      const mineral = new Mineral(x, y, type, this.spriteCache, this.spriteMetaProvider);

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

    // 爆炸火花粒子
    this.particles.emit({ ...PRESET_BOMB_SPARK, x, y });

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
    // 退出时确保钩绳循环音停止
    this.game.getAudio().stopRopeFriction();
    // 将金额传递给 Game，由 Game 传递给 ResultScene
    this.game.changeScene(GameState.RESULT);
  }

  /**
   * 状态变化反馈：检测达标上升沿（叮咚音）+ 钩爪 REELING 状态切换（金属摩擦循环音启停）
   * 在 update 末尾调用一次，比对当前状态与上一帧字段
   */
  private detectStateTransitionSfx(): void {
    // #18 达标"叮咚"：false → true 上升沿瞬间触发一次
    const reached = this.hud.isTargetReached();
    if (reached && !this.wasTargetReached) {
      this.game.getAudio().play(SoundType.TARGET_REACHED);
    }
    this.wasTargetReached = reached;

    // #16 钩绳金属摩擦音：进入 REELING 系列状态时启动，退出时停止
    const reeling = this.hook.state === HookState.REELING_WITH_MINERAL
                 || this.hook.state === HookState.REELING_EMPTY;
    if (reeling && !this.wasReeling) {
      this.game.getAudio().startRopeFriction();
    } else if (!reeling && this.wasReeling) {
      this.game.getAudio().stopRopeFriction();
    }
    this.wasReeling = reeling;

    // #15 矿工 STRAIN 用力态：拉重物时切到 STRAIN，松手或切到 HAPPY/SAD 时回 IDLE
    // HAPPY/SAD 持续 1.5s 自动 reset 后会被这里覆盖到 STRAIN（如果仍在拉重物），符合预期
    const pullingHeavy = this.hook.isPullingHeavy(STRAIN_WEIGHT_THRESHOLD);
    if (pullingHeavy && this.miner.state !== MinerState.STRAIN) {
      this.miner.setState(MinerState.STRAIN);
    } else if (!pullingHeavy && this.miner.state === MinerState.STRAIN) {
      this.miner.setState(MinerState.IDLE);
    }
  }

  /** 获取当前金额（累计模式下 = 本关起步累计 + 本关入账） */
  getMoney(): number {
    return this.hud.money;
  }

  /** 本关入账（hud.money - levelStartMoney），用于 ResultScene 显示和 commitLevelResult 累加 */
  getEarnedThisLevel(): number {
    return this.hud.money - this.levelStartMoney;
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
}
