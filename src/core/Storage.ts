/**
 * 存档系统（11 槽位版）
 * - 1 个自动槽位（slotId=0）：游戏自动写入最新进度
 * - 10 个手动槽位（slotId=1-10）：玩家显式"另存为"才写入
 *
 * 详见 docs/design/save-slot-system.md
 */

import { Difficulty, DEFAULT_DIFFICULTY } from '../level/difficulty';

/** 当前存档版本号（数据结构变更时递增） */
const SAVE_VERSION = 3;

/** 自动槽位编号 */
export const AUTO_SLOT_ID = 0;

/** 手动槽位编号范围（含两端） */
export const MANUAL_SLOT_MIN = 1;
export const MANUAL_SLOT_MAX = 10;

/** 槽位类型 */
export enum SlotKind {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

/** 游戏进度数据 */
export interface GameProgress {
  /** 累计金额 */
  currentMoney: number;
  /** 当前关卡（1-based） */
  currentLevel: number;
  /** 已购买的道具 type 字符串数组 */
  ownedItems: string[];
}

/** 槽位元数据（用于槽位列表展示） */
export interface SlotMeta {
  slotId: number;
  kind: SlotKind;
  empty: boolean;
  difficulty: Difficulty;
  currentLevel: number;
  currentMoney: number;
  highScore: number;
  createdAt: number;
  lastPlayedAt: number;
}

/** 槽位完整存档 */
export interface SlotSave {
  meta: SlotMeta;
  progress: GameProgress;
}

/** 用户设置（音量、BGM 开关等） */
export interface UserSettings {
  volume: number;
  bgmEnabled: boolean;
  muted: boolean;
}

/** 全局数据（跨槽位共享） */
interface GlobalData {
  version: number;
  /** 跨所有槽位+难度的最高分 */
  globalHighScore: number;
  /** 按难度分组的跨槽位最高分 */
  highScoresByDifficulty: Partial<Record<Difficulty, number>>;
}

/** 旧版（v2 及之前）主存档结构 */
interface LegacySaveData {
  version?: number;
  highScore?: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  volume: 0.5,
  bgmEnabled: true,
  muted: false,
};

// ====== localStorage key 定义 ======
const TUTORIAL_KEY = 'goldminer_tutorial_shown';
const SETTINGS_KEY = 'goldminer_h5_settings';
const GLOBAL_KEY = 'goldminer_h5_global';
const ACTIVE_SLOT_KEY = 'goldminer_h5_active_slot';
const slotMetaKey = (id: number) => `goldminer_h5_slot_${id}_meta`;
const slotProgressKey = (id: number) => `goldminer_h5_slot_${id}_progress`;

// 旧 key（迁移用）
const LEGACY_STORAGE_KEY = 'goldminer_h5_save';
const LEGACY_PROGRESS_KEY = 'goldminer_h5_progress';

/** 判断槽位编号合法性 */
function isValidSlotId(id: number): boolean {
  return id === AUTO_SLOT_ID || (id >= MANUAL_SLOT_MIN && id <= MANUAL_SLOT_MAX);
}

/** 判断是否手动槽位编号 */
function isManualSlotId(id: number): boolean {
  return id >= MANUAL_SLOT_MIN && id <= MANUAL_SLOT_MAX;
}

export class Storage {
  constructor() {
    // 启动时尝试旧存档迁移（仅当自动槽位为空时执行）
    this.migrateLegacyIfNeeded();
  }

  // ============== 槽位列表 ==============

  /** 获取全部 11 个槽位的元数据（含空槽位） */
  listAllSlots(): SlotMeta[] {
    const slots: SlotMeta[] = [];
    slots.push(this.getOrCreateEmptyMeta(AUTO_SLOT_ID, SlotKind.AUTO));
    for (let i = MANUAL_SLOT_MIN; i <= MANUAL_SLOT_MAX; i++) {
      slots.push(this.getOrCreateEmptyMeta(i, SlotKind.MANUAL));
    }
    return slots;
  }

  /** 仅获取手动槽位列表（用于"另存为"对话框） */
  listManualSlots(): SlotMeta[] {
    const slots: SlotMeta[] = [];
    for (let i = MANUAL_SLOT_MIN; i <= MANUAL_SLOT_MAX; i++) {
      slots.push(this.getOrCreateEmptyMeta(i, SlotKind.MANUAL));
    }
    return slots;
  }

  /** 获取指定槽位元数据（不存在返回空槽位结构） */
  getSlotMeta(slotId: number): SlotMeta | null {
    if (!isValidSlotId(slotId)) return null;
    const kind = slotId === AUTO_SLOT_ID ? SlotKind.AUTO : SlotKind.MANUAL;
    return this.getOrCreateEmptyMeta(slotId, kind);
  }

  /** 判断槽位是否非空 */
  isSlotOccupied(slotId: number): boolean {
    const meta = this.readMeta(slotId);
    return meta !== null && !meta.empty;
  }

  // ============== 自动槽位 API ==============

  /** 自动保存进度到自动槽位（关键事件触发） */
  autoSave(progress: GameProgress, difficulty: Difficulty): void {
    this.writeSlot(AUTO_SLOT_ID, SlotKind.AUTO, progress, difficulty);
  }

  /** 加载自动槽位（"继续上次"按钮使用） */
  loadAutoSlot(): SlotSave | null {
    return this.readSlot(AUTO_SLOT_ID);
  }

  /** 重置自动槽位（新游戏开始时清空） */
  resetAutoSlot(): void {
    localStorage.removeItem(slotMetaKey(AUTO_SLOT_ID));
    localStorage.removeItem(slotProgressKey(AUTO_SLOT_ID));
  }

  // ============== 手动槽位 API ==============

  /**
   * 另存为：将自动槽位当前内容复制到指定手动槽位
   * 不影响自动槽位
   */
  saveToManualSlot(slotId: number): SlotMeta | null {
    if (!isManualSlotId(slotId)) return null;
    const autoSave = this.loadAutoSlot();
    if (!autoSave) return null;

    const now = Date.now();
    const existing = this.readMeta(slotId);
    const meta: SlotMeta = {
      slotId,
      kind: SlotKind.MANUAL,
      empty: false,
      difficulty: autoSave.meta.difficulty,
      currentLevel: autoSave.progress.currentLevel,
      currentMoney: autoSave.progress.currentMoney,
      highScore: autoSave.meta.highScore,
      createdAt: existing?.createdAt ?? now,
      lastPlayedAt: now,
    };
    localStorage.setItem(slotMetaKey(slotId), JSON.stringify(meta));
    localStorage.setItem(slotProgressKey(slotId), JSON.stringify(autoSave.progress));
    return meta;
  }

  /**
   * 加载手动槽位：把该槽位的快照复制到自动槽位
   * 返回加载后的存档（含 meta + progress）
   */
  loadManualSlot(slotId: number): SlotSave | null {
    if (!isManualSlotId(slotId)) return null;
    const save = this.readSlot(slotId);
    if (!save) return null;

    // 复制到自动槽位
    this.writeSlot(AUTO_SLOT_ID, SlotKind.AUTO, save.progress, save.meta.difficulty, save.meta.highScore);
    return save;
  }

  /** 删除手动槽位（自动槽位不可删） */
  deleteManualSlot(slotId: number): void {
    if (!isManualSlotId(slotId)) return;
    localStorage.removeItem(slotMetaKey(slotId));
    localStorage.removeItem(slotProgressKey(slotId));
  }

  // ============== 活跃槽位 ==============

  setActiveSlot(slotId: number): void {
    if (!isValidSlotId(slotId)) return;
    localStorage.setItem(ACTIVE_SLOT_KEY, String(slotId));
  }

  getActiveSlot(): number | null {
    const raw = localStorage.getItem(ACTIVE_SLOT_KEY);
    if (raw === null) return null;
    const id = Number(raw);
    return isValidSlotId(id) ? id : null;
  }

  clearActiveSlot(): void {
    localStorage.removeItem(ACTIVE_SLOT_KEY);
  }

  // ============== 全局数据 / 高分 ==============

  /** 全局最高分（跨所有槽位+难度） */
  getGlobalHighScore(): number {
    return this.loadGlobal().globalHighScore;
  }

  /** 难度最高分（跨所有槽位，特定难度） */
  getHighScoreByDifficulty(difficulty: Difficulty): number {
    return this.loadGlobal().highScoresByDifficulty[difficulty] ?? 0;
  }

  /** 更新最高分（同时刷新全局/难度/当前槽位三处） */
  updateAllHighScores(difficulty: Difficulty, score: number): boolean {
    const global = this.loadGlobal();
    let updated = false;

    if (score > global.globalHighScore) {
      global.globalHighScore = score;
      updated = true;
    }
    const currentDifficultyHigh = global.highScoresByDifficulty[difficulty] ?? 0;
    if (score > currentDifficultyHigh) {
      global.highScoresByDifficulty[difficulty] = score;
      updated = true;
    }
    if (updated) {
      this.saveGlobal(global);
    }

    // 同步更新自动槽位 meta 的 highScore（按当前游戏所属槽位）
    const autoMeta = this.readMeta(AUTO_SLOT_ID);
    if (autoMeta && !autoMeta.empty && score > autoMeta.highScore) {
      autoMeta.highScore = score;
      localStorage.setItem(slotMetaKey(AUTO_SLOT_ID), JSON.stringify(autoMeta));
    }
    return updated;
  }

  // ============== 教程标记（全局） ==============

  loadTutorialShown(): boolean {
    return !!localStorage.getItem(TUTORIAL_KEY);
  }

  saveTutorialShown(): void {
    localStorage.setItem(TUTORIAL_KEY, '1');
  }

  // ============== 用户设置（全局） ==============

  loadSettings(): UserSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const data = JSON.parse(raw) as Partial<UserSettings>;
      return {
        volume: typeof data.volume === 'number' ? Math.max(0, Math.min(1, data.volume)) : DEFAULT_SETTINGS.volume,
        bgmEnabled: typeof data.bgmEnabled === 'boolean' ? data.bgmEnabled : DEFAULT_SETTINGS.bgmEnabled,
        muted: typeof data.muted === 'boolean' ? data.muted : DEFAULT_SETTINGS.muted,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: UserSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      console.warn('设置保存失败');
    }
  }

  // ============== 内部工具 ==============

  /** 读取槽位 meta（不存在返回 null） */
  private readMeta(slotId: number): SlotMeta | null {
    try {
      const raw = localStorage.getItem(slotMetaKey(slotId));
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<SlotMeta>;
      if (typeof data.slotId !== 'number') return null;
      return {
        slotId: data.slotId,
        kind: data.kind === SlotKind.MANUAL ? SlotKind.MANUAL : SlotKind.AUTO,
        empty: data.empty ?? false,
        difficulty: (data.difficulty as Difficulty) ?? DEFAULT_DIFFICULTY,
        currentLevel: data.currentLevel ?? 1,
        currentMoney: data.currentMoney ?? 0,
        highScore: data.highScore ?? 0,
        createdAt: data.createdAt ?? 0,
        lastPlayedAt: data.lastPlayedAt ?? 0,
      };
    } catch {
      return null;
    }
  }

  /** 读取槽位完整存档（meta + progress） */
  private readSlot(slotId: number): SlotSave | null {
    const meta = this.readMeta(slotId);
    if (!meta || meta.empty) return null;
    try {
      const raw = localStorage.getItem(slotProgressKey(slotId));
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<GameProgress>;
      if (
        typeof data.currentMoney !== 'number' ||
        typeof data.currentLevel !== 'number' ||
        !Array.isArray(data.ownedItems)
      ) {
        return null;
      }
      return {
        meta,
        progress: {
          currentMoney: data.currentMoney,
          currentLevel: data.currentLevel,
          ownedItems: data.ownedItems.filter((s): s is string => typeof s === 'string'),
        },
      };
    } catch {
      return null;
    }
  }

  /** 写入槽位（更新 meta + progress） */
  private writeSlot(
    slotId: number,
    kind: SlotKind,
    progress: GameProgress,
    difficulty: Difficulty,
    highScoreOverride?: number,
  ): void {
    const now = Date.now();
    const existing = this.readMeta(slotId);
    const meta: SlotMeta = {
      slotId,
      kind,
      empty: false,
      difficulty,
      currentLevel: progress.currentLevel,
      currentMoney: progress.currentMoney,
      highScore: highScoreOverride ?? existing?.highScore ?? 0,
      createdAt: existing?.createdAt ?? now,
      lastPlayedAt: now,
    };
    try {
      localStorage.setItem(slotMetaKey(slotId), JSON.stringify(meta));
      localStorage.setItem(slotProgressKey(slotId), JSON.stringify(progress));
    } catch {
      console.warn(`槽位 ${slotId} 保存失败`);
    }
  }

  /** 构造空槽位元数据（用于列表展示，非真实存储） */
  private getOrCreateEmptyMeta(slotId: number, kind: SlotKind): SlotMeta {
    const existing = this.readMeta(slotId);
    if (existing) return existing;
    return {
      slotId,
      kind,
      empty: true,
      difficulty: DEFAULT_DIFFICULTY,
      currentLevel: 0,
      currentMoney: 0,
      highScore: 0,
      createdAt: 0,
      lastPlayedAt: 0,
    };
  }

  /** 加载全局数据 */
  private loadGlobal(): GlobalData {
    try {
      const raw = localStorage.getItem(GLOBAL_KEY);
      if (!raw) return { version: SAVE_VERSION, globalHighScore: 0, highScoresByDifficulty: {} };
      const data = JSON.parse(raw) as Partial<GlobalData>;
      return {
        version: data.version ?? SAVE_VERSION,
        globalHighScore: data.globalHighScore ?? 0,
        highScoresByDifficulty: data.highScoresByDifficulty ?? {},
      };
    } catch {
      return { version: SAVE_VERSION, globalHighScore: 0, highScoresByDifficulty: {} };
    }
  }

  /** 保存全局数据 */
  private saveGlobal(data: GlobalData): void {
    try {
      localStorage.setItem(GLOBAL_KEY, JSON.stringify(data));
    } catch {
      console.warn('全局数据保存失败');
    }
  }

  // ============== 旧存档迁移 ==============

  /**
   * 旧存档迁移到自动槽位：
   * 仅当存在旧 key AND 自动槽位为空时执行（避免覆盖新存档）
   */
  private migrateLegacyIfNeeded(): void {
    const hasAutoSlot = this.readMeta(AUTO_SLOT_ID) !== null;
    if (hasAutoSlot) return;

    const legacyProgressRaw = localStorage.getItem(LEGACY_PROGRESS_KEY);
    const legacySaveRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyProgressRaw && !legacySaveRaw) return;

    // 解析旧进度
    let progress: GameProgress | null = null;
    if (legacyProgressRaw) {
      try {
        const data = JSON.parse(legacyProgressRaw) as Partial<GameProgress>;
        if (
          typeof data.currentMoney === 'number' &&
          typeof data.currentLevel === 'number' &&
          Array.isArray(data.ownedItems)
        ) {
          progress = {
            currentMoney: data.currentMoney,
            currentLevel: data.currentLevel,
            ownedItems: data.ownedItems.filter((s): s is string => typeof s === 'string'),
          };
        }
      } catch {
        // 进度损坏，忽略
      }
    }

    // 解析旧最高分
    let legacyHighScore = 0;
    if (legacySaveRaw) {
      try {
        const data = JSON.parse(legacySaveRaw) as LegacySaveData;
        legacyHighScore = data.highScore ?? 0;
      } catch {
        // 损坏，忽略
      }
    }

    // 仅当有进度时写入自动槽位
    if (progress) {
      this.writeSlot(AUTO_SLOT_ID, SlotKind.AUTO, progress, DEFAULT_DIFFICULTY, legacyHighScore);
    }

    // 旧高分写入全局（按 NORMAL 难度记账）
    if (legacyHighScore > 0) {
      const global = this.loadGlobal();
      if (legacyHighScore > global.globalHighScore) global.globalHighScore = legacyHighScore;
      const normalHigh = global.highScoresByDifficulty[DEFAULT_DIFFICULTY] ?? 0;
      if (legacyHighScore > normalHigh) global.highScoresByDifficulty[DEFAULT_DIFFICULTY] = legacyHighScore;
      this.saveGlobal(global);
    }

    // 清除旧 key
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_PROGRESS_KEY);

    if (progress) {
      console.info('[Storage] 旧存档已迁移到自动槽位');
    }
  }

  // ============== 旧 API 兼容层（@deprecated）==============

  /** @deprecated 改用 getGlobalHighScore() 或 getHighScoreByDifficulty() */
  getHighScore(): number {
    return this.getGlobalHighScore();
  }

  /** @deprecated 改用 updateAllHighScores(difficulty, score) */
  updateHighScore(score: number): boolean {
    return this.updateAllHighScores(DEFAULT_DIFFICULTY, score);
  }

  /** @deprecated 改用 autoSave(progress, difficulty) */
  saveProgress(progress: GameProgress): void {
    this.autoSave(progress, DEFAULT_DIFFICULTY);
  }

  /** @deprecated 改用 loadAutoSlot() */
  loadProgress(): GameProgress | null {
    return this.loadAutoSlot()?.progress ?? null;
  }

  /** @deprecated 改用 resetAutoSlot() */
  clearProgress(): void {
    this.resetAutoSlot();
  }

  /** @deprecated 改用 isSlotOccupied(AUTO_SLOT_ID) */
  hasProgress(): boolean {
    return this.isSlotOccupied(AUTO_SLOT_ID);
  }

  /** @deprecated 旧 API：清除全部存档（含自动槽位 + 全局最高分）；未来 MenuScene 改造后移除 */
  clear(): void {
    this.resetAutoSlot();
    localStorage.removeItem(GLOBAL_KEY);
  }
}
