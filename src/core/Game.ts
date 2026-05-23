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
import { VictoryScene } from '../scene/VictoryScene';
import { VictoryEndScene } from '../scene/VictoryEndScene';
import { DifficultyScene } from '../scene/DifficultyScene';
import { SlotSelectScene } from '../scene/SlotSelectScene';
import { ChapterScene } from '../scene/ChapterScene';
import { Storage, type GameProgress, AUTO_SLOT_ID } from './Storage';
import { LevelManager } from '../level/LevelManager';
import { Audio } from './Audio';
import { ThemeManager } from '../assets/theme/ThemeManager';
import { Button } from '../ui/Button';
import { CLASSIC_THEME } from '../assets/theme/classic';
import { SHUOSHUO_CRYSTAL_THEME } from '../assets/theme/shuoshuo-crystal';
import { loadTheme } from '../assets/themeLoader';
import { initAnimation } from '../assets/animation';
import { ThemeStore } from '../asset-manager/ThemeStore';
import { Difficulty, DEFAULT_DIFFICULTY, getDifficultyConfig, type DifficultyConfig } from '../level/difficulty';
import { isChapterFirstLevel, getChapterByLevel } from '../level/levels';

/** 游戏全局状态枚举 */
export enum GameState {
  MENU = 'MENU',
  SLOT_SELECT = 'SLOT_SELECT',           // 槽位选择（Phase C 实现场景）
  DIFFICULTY_SELECT = 'DIFFICULTY_SELECT', // 难度选择（Phase C 实现场景）
  CHAPTER_TRANSITION = 'CHAPTER_TRANSITION', // 章节过场（Phase E #9，进入 L1/L8/L15 前）
  READY = 'READY',
  PLAYING = 'PLAYING',
  REELING = 'REELING',
  RESULT = 'RESULT',
  SHOP = 'SHOP',
  VICTORY = 'VICTORY',                    // 通关庆祝页（通关 L21 → 选「继续无尽」或「结算退出」）
  VICTORY_END = 'VICTORY_END',            // 通关终局结算页（VictoryScene 选「结算退出」后）
  GAME_OVER = 'GAME_OVER',
}


/** FPS 统计更新间隔（毫秒） */
const FPS_UPDATE_INTERVAL = 1000;

/** 是否显示 FPS */
let showFps = true;

export class Game {
  private renderer: Renderer;
  private input: Input;
  private storage: Storage;
  private themeManager: ThemeManager;
  private levelManager: LevelManager;
  private ownedItems: Set<ItemType> = new Set();
  /**
   * 限期道具剩余关数（仅限期 buff 有条目，永久道具不进 Map）
   * 与 ownedItems 协同维护：addOwnedItem 同步写入；clearLevelBuffs 倒计时；归零时双删
   */
  private itemDurations: Map<ItemType, number> = new Map();
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

  /** 外部 UI 弹窗（如矿物图鉴）打开时暂停游戏逻辑（仍保持渲染） */
  private pausedByExternal: boolean = false;

  /** 外部 UI 弹窗注入（main.ts 创建后调用 setCodexModal）— 用 unknown 避免 Game 强耦合 UI 层 */
  private codexModal: { open(): void; close(): void; toggle(): void; isOpened(): boolean } | null = null;

  /** 当前关卡的金额信息（用于场景间传递） */
  private lastEarnedMoney: number = 0;
  private lastTargetMoney: number = 200;
  private currentMoney: number = 0;

  /** 标记关卡结算是否已通过 commitLevelResult 累加，避免 SHOP 进入时重复加 */
  private bonusAlreadyCommitted: boolean = false;

  /** 失败重试标记：retryCurrentLevel 设置后 changeScene 跳过 nextLevel + 金额累加 + 章节过场 */
  private isRetrying: boolean = false;

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

    // 初始化主题管理器（默认 shuoshuo_crystal，详见 ThemeManager 默认值）
    this.themeManager = new ThemeManager();
    this.themeManager.register(CLASSIC_THEME);
    this.themeManager.register(SHUOSHUO_CRYSTAL_THEME);
    // 加载用户在素材管理页（/tools/assets.html）创建的自定义主题
    for (const json of new ThemeStore().loadCustom()) {
      try {
        this.themeManager.register(loadTheme(json));
      } catch (e) {
        console.error('[Game] 自定义主题加载失败', json.id, e);
      }
    }
    this.themeManager.restoreTheme();

    // 把 ThemeManager 提供给 Button 类用于 sprite 渲染（无 sprite 时自动 fallback 几何）
    Button.setSpriteProvider(this.themeManager);

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
      // 如果从 GameScene 退出，记录本关入账（不含起步累计，避免后续 += 时重复加）
      if (this.state === GameState.PLAYING && this.currentScene instanceof GameScene) {
        this.lastEarnedMoney = this.currentScene.getEarnedThisLevel();
        this.lastTargetMoney = this.currentScene.getTargetMoney();
        this.clearLevelBuffs();
      }
      // 如果从 ShopScene 退出，同步剩余金额
      if (this.state === GameState.SHOP && this.currentScene instanceof ShopScene) {
        this.currentMoney = this.currentScene.getMoney();
      }
      // 如果从 ResultScene 退出（达标后进入 SHOP/GAME_OVER），用最终金额覆盖
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
        this.itemDurations.clear();
        break;
      case GameState.DIFFICULTY_SELECT:
        scene = new DifficultyScene(this);
        break;
      case GameState.SLOT_SELECT:
        scene = new SlotSelectScene(this);
        break;
      case GameState.PLAYING: {
        const retrying = this.isRetrying;
        this.isRetrying = false;
        if (retrying) {
          // 失败重试：保持当前关卡，本关入账不并入 currentMoney
          this.bonusAlreadyCommitted = false;
        } else if (previousState === GameState.SHOP) {
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
        } else if (previousState === GameState.VICTORY) {
          // 通关庆祝页选「挑战无尽」：金额已在 ResultScene.commitLevelResult 累加，
          // 此处仅推进关卡到 L22（L21+1），并持久化用于断点续玩
          this.bonusAlreadyCommitted = false;
          this.levelManager.nextLevel();
          this.persistProgress();
        }
        // CHAPTER_TRANSITION 回流：金额/关卡已在首次进入时处理过，直接创建 GameScene
        // 章节首关守卫：非 INFINITE 模式 + 非重试 时，进入 L1/L8/L15 走 ChapterScene 过场
        if (!retrying
            && previousState !== GameState.CHAPTER_TRANSITION
            && !this.getDifficultyConfig().infiniteItems
            && isChapterFirstLevel(this.levelManager.currentLevel)) {
          this.state = GameState.CHAPTER_TRANSITION;
          scene = new ChapterScene(this, getChapterByLevel(this.levelManager.currentLevel));
          break;
        }
        scene = new GameScene(this, this.levelManager.getCurrentConfig());
        break;
      }
      case GameState.RESULT:
        scene = new ResultScene(this, this.lastEarnedMoney, this.lastTargetMoney);
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
      case GameState.VICTORY:
        // 通关庆祝页：金额已在 ResultScene.commitLevelResult 累加 / 持久化，
        // 此处不动 currentMoney、不清自动槽位、不提交排行榜（玩家可能继续无尽冲榜）
        scene = new VictoryScene(this);
        break;
      case GameState.VICTORY_END:
        // 通关终局结算：提交最高分 + 排行榜（INFINITE 跳过）+ 清自动槽位
        this.storage.updateAllHighScores(this.currentDifficulty, this.currentMoney);
        if (this.currentDifficulty !== Difficulty.INFINITE) {
          this.storage.commitLeaderboardEntry(this.currentMoney, this.currentDifficulty, this.levelManager.currentLevel);
        }
        this.storage.resetAutoSlot();
        scene = new VictoryEndScene(this, this.currentMoney, this.currentDifficulty);
        break;
      case GameState.GAME_OVER:
        if (!this.bonusAlreadyCommitted) {
          this.currentMoney += this.lastEarnedMoney;
        }
        this.bonusAlreadyCommitted = false;
        this.storage.updateAllHighScores(this.currentDifficulty, this.currentMoney);
        // INFINITE 难度为本地纯娱乐玩法，不上榜
        if (this.currentDifficulty !== Difficulty.INFINITE) {
          this.storage.commitLeaderboardEntry(this.currentMoney, this.currentDifficulty, this.levelManager.currentLevel);
        }
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

  /**
   * 添加已购买道具
   * @param durationLevels 限期 buff 的可用关数；undefined 表示永久
   */
  addOwnedItem(item: ItemType, durationLevels?: number): void {
    this.ownedItems.add(item);
    if (durationLevels !== undefined) {
      this.itemDurations.set(item, durationLevels);
    }
  }

  /** 清空已购买道具 */
  clearOwnedItems(): void {
    this.ownedItems.clear();
    this.itemDurations.clear();
  }

  /**
   * 查询限期 buff 的剩余关数。null = 永久（未记入 itemDurations）
   */
  getItemRemainingLevels(item: ItemType): number | null {
    return this.itemDurations.get(item) ?? null;
  }

  /**
   * 关卡结束清理 buff（按难度门控）
   * - INFINITE：保留所有道具（道具永久开启）
   * - HARD/EXPERT：清除所有 persistent 道具（每关从零开始 buff）
   * - NOVICE/NORMAL：限期 buff 倒计时 1 关，归零时移除；永久 buff 不动
   *
   * 注：PLAYING→RESULT 退出时调用一次，失败/通关都会走到（与 HARD/EXPERT 一致）。
   * 因此失败关卡同样消耗 1 关限期 buff——设计取舍：buff 在本关已生效则计入消耗。
   */
  private clearLevelBuffs(): void {
    const cfg = this.getDifficultyConfig();
    if (cfg.infiniteItems) return; // 无限火力不清

    if (cfg.isHardcore) {
      for (const itemType of PERSISTENT_ITEM_TYPES) {
        this.ownedItems.delete(itemType);
        this.itemDurations.delete(itemType);
      }
      return;
    }

    // 新手/一般：限期 buff 倒计时；归零时同步移除 ownedItems
    for (const [type, remaining] of this.itemDurations) {
      const next = remaining - 1;
      if (next <= 0) {
        this.ownedItems.delete(type);
        this.itemDurations.delete(type);
      } else {
        this.itemDurations.set(type, next);
      }
    }
  }

  /** 构造当前进度快照 */
  private buildProgress(): GameProgress {
    const progress: GameProgress = {
      currentMoney: this.currentMoney,
      currentLevel: this.levelManager.currentLevel,
      ownedItems: Array.from(this.ownedItems).map(item => item as string),
    };
    // 仅限期 buff 写入 ownedItemLevels；空 Map 时省略字段以保持旧存档兼容
    if (this.itemDurations.size > 0) {
      progress.ownedItemLevels = Object.fromEntries(this.itemDurations);
    }
    return progress;
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

  /**
   * 从存档载入 ownedItems + itemDurations（用于 restore/load）
   * 旧存档无 ownedItemLevels 字段 → 限期 buff Map 保持空 → 已拥有道具视为永久（兼容老玩家）
   */
  private loadOwnedItemsFromProgress(progress: GameProgress): void {
    this.ownedItems.clear();
    this.itemDurations.clear();
    for (const itemStr of progress.ownedItems) {
      this.ownedItems.add(itemStr as ItemType);
    }
    if (progress.ownedItemLevels) {
      for (const [key, val] of Object.entries(progress.ownedItemLevels)) {
        if (typeof val === 'number' && val > 0) {
          this.itemDurations.set(key as ItemType, val);
        }
      }
    }
  }

  /** 从自动槽位恢复进度并直接进入游戏 */
  restoreProgress(): boolean {
    const save = this.storage.loadAutoSlot();
    if (!save) return false;
    this.currentMoney = save.progress.currentMoney;
    this.currentDifficulty = save.meta.difficulty;
    this.levelManager.setLevel(save.progress.currentLevel);
    this.loadOwnedItemsFromProgress(save.progress);
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
    this.itemDurations.clear();
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
    this.loadOwnedItemsFromProgress(save.progress);
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

  /** 获取当前累计金额（用于 GameScene 初始化 HUD + ResultScene 判断累计达标） */
  getCurrentMoney(): number {
    return this.currentMoney;
  }

  /** 外部 UI（DOM 弹窗）暂停游戏逻辑 */
  setPausedByExternal(paused: boolean): void {
    this.pausedByExternal = paused;
  }

  /** 注入外部 UI 弹窗（main.ts 启动时调用一次） */
  setCodexModal(modal: { open(): void; close(): void; toggle(): void; isOpened(): boolean }): void {
    this.codexModal = modal;
  }

  /** 获取已注入的图鉴弹窗（GameScene 在 ? 按钮点击时调用） */
  getCodexModal(): { open(): void; close(): void; toggle(): void; isOpened(): boolean } | null {
    return this.codexModal;
  }

  /**
   * 直接设置累计金额，并同步当前活跃场景的 HUD（god mode 调试用）。
   * GameScene 时立即在 HUD 上看到变化；其他场景下只更新底层累计金额。
   */
  setCurrentMoney(n: number): void {
    this.currentMoney = Math.max(0, Math.floor(n));
    const scene = this.currentScene as unknown as { hud?: { money: number } };
    if (scene && scene.hud && typeof scene.hud.money === 'number') {
      scene.hud.money = this.currentMoney;
    }
  }

  /** 设置难度（在 DifficultyScene 选择后调用） */
  setDifficulty(d: Difficulty): void {
    this.currentDifficulty = d;
  }

  /** 获取当前活跃槽位 */
  getActiveSlot(): number {
    return this.activeSlot;
  }

  /** 失败重试当前关卡（保留累计金额和已购道具，本关入账丢弃） */
  retryCurrentLevel(): void {
    // 本关入账作废 + 设置 isRetrying 标记，让 changeScene 跳过 nextLevel/累加/章节过场
    this.lastEarnedMoney = 0;
    this.bonusAlreadyCommitted = false;
    this.isRetrying = true;
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
    // 全局动画 sprite 时间基准，所有动画从同一原点开始
    initAnimation(this.lastTime);
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

    // 更新当前场景（外部 UI 弹窗暂停时只渲染、不接收输入和更新逻辑）
    if (this.currentScene) {
      if (!this.pausedByExternal) {
        this.currentScene.handleInput(this.input);
        this.currentScene.update(dt);
      }
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
