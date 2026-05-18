/**
 * 游戏主控
 * 管理状态机、场景切换和游戏主循环
 */

import { Renderer } from './Renderer';
import { Input } from './Input';
import { SceneBase } from '../scene/SceneBase';
import { MenuScene } from '../scene/MenuScene';
import { GameScene } from '../scene/GameScene';
import { ResultScene } from '../scene/ResultScene';
import { ShopScene, ItemType, PERSISTENT_ITEM_TYPES } from '../scene/ShopScene';
import { GameOverScene } from '../scene/GameOverScene';
import { DifficultyScene } from '../scene/DifficultyScene';
import { SlotSelectScene } from '../scene/SlotSelectScene';
import { Storage, type GameProgress, AUTO_SLOT_ID } from './Storage';
import { LevelManager } from '../level/LevelManager';
import { Audio } from './Audio';
import { ThemeManager } from '../assets/theme/ThemeManager';
import { CLASSIC_THEME } from '../assets/theme/classic';
import { SHUOSHUO_CRYSTAL_THEME } from '../assets/theme/shuoshuo-crystal';
import { Difficulty, DEFAULT_DIFFICULTY, getDifficultyConfig, type DifficultyConfig } from '../level/difficulty';

/** 游戏全局状态枚举 */
export enum GameState {
  MENU = 'MENU',
  SLOT_SELECT = 'SLOT_SELECT',           // 槽位选择（Phase C 实现场景）
  DIFFICULTY_SELECT = 'DIFFICULTY_SELECT', // 难度选择（Phase C 实现场景）
  READY = 'READY',
  PLAYING = 'PLAYING',
  REELING = 'REELING',
  RESULT = 'RESULT',
  SHOP = 'SHOP',
  GAME_OVER = 'GAME_OVER',
}


/** FPS 统计更新间隔（毫秒） */
const FPS_UPDATE_INTERVAL = 1000;

/** 时间奖励：每剩余 1 秒折算的金币数（用于 ResultScene Bonus 计算） */
export const TIME_BONUS_PER_SECOND = 5;

/** 是否显示 FPS */
let showFps = true;

export class Game {
  private renderer: Renderer;
  private input: Input;
  private storage: Storage;
  private themeManager: ThemeManager;
  private levelManager: LevelManager;
  private ownedItems: Set<ItemType> = new Set();
  private audio: Audio;

  /** 当前游戏状态 */
  private state: GameState = GameState.MENU;

  /** 当前难度（影响金额/时间/重量/商店/道具等所有玩法参数） */
  private currentDifficulty: Difficulty = DEFAULT_DIFFICULTY;

  /** 当前活跃槽位（始终是自动槽位 AUTO_SLOT_ID；手动槽位被加载时会复制到自动槽位） */
  private activeSlot: number = AUTO_SLOT_ID;

  /** 已注册的场景映射 */
  private scenes: Map<GameState, SceneBase> = new Map();

  /** 当前活跃场景 */
  private currentScene: SceneBase | null = null;

  /** 上一帧时间戳 */
  private lastTime: number = 0;

  /** 动画帧 ID，用于取消主循环 */
  private animFrameId: number = 0;

  /** 当前关卡的金额信息（用于场景间传递） */
  private lastEarnedMoney: number = 0;
  private lastTargetMoney: number = 200;
  private currentMoney: number = 0;
  /** 上局剩余时间（用于 ResultScene 计算时间奖励） */
  private lastRemainingTime: number = 0;

  /** 标记 Bonus 是否已通过 commitLevelResult 累加，避免 SHOP 进入时重复加 */
  private bonusAlreadyCommitted: boolean = false;

  // FPS 统计
  private frameCount: number = 0;
  private fpsTime: number = 0;
  private fps: number = 0;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.storage = new Storage();
    this.levelManager = new LevelManager();
    this.audio = new Audio();
    this.input = new Input(
      renderer.getContext().canvas,
      renderer.width,
      renderer.height
    );

    // 初始化主题管理器
    this.themeManager = new ThemeManager();
    this.themeManager.register(CLASSIC_THEME);
    this.themeManager.register(SHUOSHUO_CRYSTAL_THEME);
    this.themeManager.restoreTheme();
    // 默认使用说说Crystal主题
    if (!localStorage.getItem('goldminer_theme')) {
      this.themeManager.setTheme('shuoshuo_crystal');
    }

    // 加载用户音频设置
    const settings = this.storage.loadSettings();
    this.audio.setVolume(settings.volume);
    this.audio.setMuted(settings.muted);
    this.audio.setBgmEnabled(settings.bgmEnabled);

    // 切后台自动暂停
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.currentScene instanceof GameScene) {
        this.currentScene.pause();
      }
    });
  }

  /** 注册场景到指定状态 */
  registerScene(state: GameState, scene: SceneBase): void {
    this.scenes.set(state, scene);
  }

  /** 切换到指定状态对应的场景 */
  changeScene(state: GameState): void {
    // 退出当前场景
    if (this.currentScene) {
      // 如果从 GameScene 退出，记录本关金额（不在此处累加，等进入商店/通关时才算）
      if (this.state === GameState.PLAYING && this.currentScene instanceof GameScene) {
        this.lastEarnedMoney = this.currentScene.getMoney();
        this.lastTargetMoney = this.currentScene.getTargetMoney();
        this.lastRemainingTime = this.currentScene.getRemainingTime();
        this.clearLevelBuffs();
      }
      // 如果从 ShopScene 退出，同步剩余金额
      if (this.state === GameState.SHOP && this.currentScene instanceof ShopScene) {
        this.currentMoney = this.currentScene.getMoney();
      }
      // 如果从 ResultScene 退出（达标后进入 SHOP/GAME_OVER），用含 Bonus 的最终金额覆盖
      if (this.state === GameState.RESULT && this.currentScene instanceof ResultScene) {
        this.lastEarnedMoney = this.currentScene.getTotalEarned();
      }
      this.currentScene.exit();
    }

    // 记录来源状态（用于关卡流转判断）
    const previousState = this.state;

    // 切换状态
    this.state = state;

    // 进入 PLAYING 时停 BGM（避免干扰），其他场景由场景自身决定是否启动
    if (state === GameState.PLAYING) {
      this.audio.stopBgm();
    }

    // 根据状态创建对应场景（动态创建，传递数据）
    let scene: SceneBase | null = null;

    switch (state) {
      case GameState.MENU:
        scene = new MenuScene(this);
        this.currentMoney = 0;
        this.levelManager.reset();
        this.ownedItems.clear();
        break;
      case GameState.DIFFICULTY_SELECT:
        scene = new DifficultyScene(this);
        break;
      case GameState.SLOT_SELECT:
        scene = new SlotSelectScene(this);
        break;
      case GameState.PLAYING:
        if (previousState === GameState.SHOP) {
          // 商店分支：金额已在 SHOP case 累加，仅推进关卡
          this.bonusAlreadyCommitted = false;
          this.levelManager.nextLevel();
          this.persistProgress();
        } else if (previousState === GameState.RESULT) {
          // INFINITE 跳商店分支：此处补累加本关金额（若 Bonus 未即时提交）
          if (!this.bonusAlreadyCommitted) {
            this.currentMoney += this.lastEarnedMoney;
          }
          this.bonusAlreadyCommitted = false;
          this.levelManager.nextLevel();
          this.persistProgress();
        }
        scene = new GameScene(this, this.levelManager.getCurrentConfig());
        break;
      case GameState.RESULT:
        scene = new ResultScene(this, this.lastEarnedMoney, this.lastTargetMoney, this.lastRemainingTime);
        break;
      case GameState.SHOP:
        // 通关进商店：若 Bonus 已在 ResultScene 即时提交则不重复累加
        if (!this.bonusAlreadyCommitted) {
          this.currentMoney += this.lastEarnedMoney;
        }
        this.bonusAlreadyCommitted = false;
        scene = new ShopScene(this, this.currentMoney);
        this.persistProgress();
        break;
      case GameState.GAME_OVER:
        if (!this.bonusAlreadyCommitted) {
          this.currentMoney += this.lastEarnedMoney;
        }
        this.bonusAlreadyCommitted = false;
        this.storage.updateAllHighScores(this.currentDifficulty, this.currentMoney);
        this.storage.resetAutoSlot();
        scene = new GameOverScene(this, this.currentMoney, this.levelManager.currentLevel);
        break;
    }

    if (scene) {
      // 先移除旧场景
      this.scenes.delete(state);
      this.scenes.set(state, scene);
      this.currentScene = scene;
      scene.enter();
    } else {
      this.currentScene = null;
    }
  }

  /** 获取当前游戏状态 */
  getState(): GameState {
    return this.state;
  }

  /** 获取输入系统实例 */
  getInput(): Input {
    return this.input;
  }

  /** 获取渲染器实例 */
  getRenderer(): Renderer {
    return this.renderer;
  }

  /** 获取主题管理器 */
  getThemeManager(): ThemeManager {
    return this.themeManager;
  }

  /** 获取关卡管理器 */
  getLevelManager(): LevelManager {
    return this.levelManager;
  }

  /** 获取已购买道具集合 */
  getOwnedItems(): Set<ItemType> {
    return this.ownedItems;
  }

  /** 添加已购买道具 */
  addOwnedItem(item: ItemType): void {
    this.ownedItems.add(item);
  }

  /** 清空已购买道具 */
  clearOwnedItems(): void {
    this.ownedItems.clear();
  }

  /**
   * 关卡结束清理 buff（按难度门控）
   * - INFINITE：保留所有道具（道具永久开启）
   * - HARD/EXPERT：清除所有 persistent 道具（每关从零开始 buff）
   * - NOVICE/NORMAL：保留 persistent 道具（跨关投资型决策）
   */
  private clearLevelBuffs(): void {
    const cfg = this.getDifficultyConfig();
    if (cfg.infiniteItems) return; // 无限火力不清

    if (cfg.isHardcore) {
      for (const itemType of PERSISTENT_ITEM_TYPES) {
        this.ownedItems.delete(itemType);
      }
    }
    // 新手/一般：保留 persistent，消耗品在使用时已 delete
  }

  /** 构造当前进度快照 */
  private buildProgress(): GameProgress {
    return {
      currentMoney: this.currentMoney,
      currentLevel: this.levelManager.currentLevel,
      ownedItems: Array.from(this.ownedItems).map(item => item as string),
    };
  }

  /** 自动存档到自动槽位（关键事件触发） */
  private persistProgress(): void {
    this.storage.autoSave(this.buildProgress(), this.currentDifficulty);
  }

  /**
   * 关卡通过即时存档（确保 Bonus 不丢失）
   * 由 ResultScene.enter() 在动画开始前调用
   */
  commitLevelResult(totalEarned: number): void {
    this.currentMoney += totalEarned;
    this.persistProgress();
    this.storage.updateAllHighScores(this.currentDifficulty, this.currentMoney);
    // 记录给后续场景使用（避免 SHOP 进入时再次累加）
    this.lastEarnedMoney = totalEarned;
    this.bonusAlreadyCommitted = true;
  }

  /** 从自动槽位恢复进度并直接进入游戏 */
  restoreProgress(): boolean {
    const save = this.storage.loadAutoSlot();
    if (!save) return false;
    this.currentMoney = save.progress.currentMoney;
    this.currentDifficulty = save.meta.difficulty;
    this.levelManager.setLevel(save.progress.currentLevel);
    this.ownedItems.clear();
    for (const itemStr of save.progress.ownedItems) {
      this.ownedItems.add(itemStr as ItemType);
    }
    this.activeSlot = AUTO_SLOT_ID;
    this.state = GameState.MENU; // 临时设回 MENU，让 changeScene 内部 previousState 为 MENU 不触发 nextLevel
    this.changeScene(GameState.PLAYING);
    return true;
  }

  /**
   * 开新游戏（选定难度后调用）
   * 重置自动槽位 + 设置难度 + 进入 PLAYING
   */
  startNewGame(difficulty: Difficulty): void {
    this.storage.resetAutoSlot();
    this.currentDifficulty = difficulty;
    this.currentMoney = 0;
    this.levelManager.reset();
    this.ownedItems.clear();
    this.activeSlot = AUTO_SLOT_ID;
    this.state = GameState.MENU;
    this.changeScene(GameState.PLAYING);
  }

  /**
   * 玩家"另存为"：把自动槽位当前内容复制到指定手动槽位
   * 返回是否成功
   */
  saveAsManualSlot(slotId: number): boolean {
    return this.storage.saveToManualSlot(slotId) !== null;
  }

  /**
   * 玩家加载手动槽位：复制到自动槽位 + 恢复内存状态 + 进入游戏
   * 返回是否成功
   */
  loadFromManualSlot(slotId: number): boolean {
    const save = this.storage.loadManualSlot(slotId);
    if (!save) return false;
    this.currentMoney = save.progress.currentMoney;
    this.currentDifficulty = save.meta.difficulty;
    this.levelManager.setLevel(save.progress.currentLevel);
    this.ownedItems.clear();
    for (const itemStr of save.progress.ownedItems) {
      this.ownedItems.add(itemStr as ItemType);
    }
    this.activeSlot = AUTO_SLOT_ID;
    this.state = GameState.MENU;
    this.changeScene(GameState.PLAYING);
    return true;
  }

  /** 清除进度存档（用于"清除存档"按钮，清自动槽位） */
  clearProgress(): void {
    this.storage.resetAutoSlot();
  }

  /** 获取当前难度 */
  getDifficulty(): Difficulty {
    return this.currentDifficulty;
  }

  /** 获取当前难度配置 */
  getDifficultyConfig(): DifficultyConfig {
    return getDifficultyConfig(this.currentDifficulty);
  }

  /** 设置难度（在 DifficultyScene 选择后调用） */
  setDifficulty(d: Difficulty): void {
    this.currentDifficulty = d;
  }

  /** 获取当前活跃槽位 */
  getActiveSlot(): number {
    return this.activeSlot;
  }

  /** 失败重试当前关卡（保留累计金额和已购道具） */
  retryCurrentLevel(): void {
    // 重置本关金额记录，避免污染
    this.lastEarnedMoney = 0;
    this.changeScene(GameState.PLAYING);
  }

  /** 获取全局音效实例 */
  getAudio(): Audio {
    return this.audio;
  }

  /** 获取存档系统实例 */
  getStorage(): Storage {
    return this.storage;
  }

  /** 启动游戏主循环 */
  start(): void {
    this.changeScene(GameState.MENU);

    this.lastTime = performance.now();
    this.fpsTime = this.lastTime;
    this.loop(this.lastTime);
  }

  /** 停止游戏主循环 */
  stop(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  /** 切换 FPS 显示 */
  toggleFps(visible: boolean): void {
    showFps = visible;
  }

  /** 游戏主循环 */
  private loop = (timestamp: number): void => {
    // 计算 deltaTime（秒），上限 50ms 防止大跳帧
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    // FPS 统计
    this.frameCount++;
    if (timestamp - this.fpsTime >= FPS_UPDATE_INTERVAL) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = timestamp;
    }

    // 更新当前场景
    if (this.currentScene) {
      this.currentScene.handleInput(this.input);
      this.currentScene.update(dt);
      this.currentScene.render(this.renderer);
    }

    // FPS 显示
    if (showFps) {
      this.renderFps();
    }

    // 清除本帧输入状态
    this.input.update();

    // 下一帧
    this.animFrameId = requestAnimationFrame(this.loop);
  };

  /** 渲染 FPS 信息 */
  private renderFps(): void {
    this.renderer.fillText(
      `FPS: ${this.fps}`,
      this.renderer.width - 80,
      this.renderer.height - 20,
      '#00FF0088',
      '12px monospace'
    );
  }
}
