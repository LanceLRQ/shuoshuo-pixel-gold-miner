/**
 * 存档系统
 * 使用 localStorage 持久化游戏进度
 * 数据结构带版本号，便于后续升级时做兼容
 */

/** 当前存档版本号（数据结构变更时递增） */
const SAVE_VERSION = 2;

/** 主存档数据结构（持久化最高分等元数据） */
interface SaveData {
  version: number;
  highScore: number;
}

/** 游戏进度数据（每次进入商店/下一关时写入，关卡失败/通关全部时清除） */
export interface GameProgress {
  /** 累计金额 */
  currentMoney: number;
  /** 当前关卡（1-based） */
  currentLevel: number;
  /** 已购买的道具 type 字符串数组 */
  ownedItems: string[];
}

const STORAGE_KEY = 'goldminer_h5_save';
const PROGRESS_KEY = 'goldminer_h5_progress';
const TUTORIAL_KEY = 'goldminer_tutorial_shown';
const SETTINGS_KEY = 'goldminer_h5_settings';

/** 用户设置（音量、BGM 开关等） */
export interface UserSettings {
  /** 主音量 0-1 */
  volume: number;
  /** BGM 是否启用 */
  bgmEnabled: boolean;
  /** 静音 */
  muted: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  volume: 0.5,
  bgmEnabled: true,
  muted: false,
};

export class Storage {
  /** 保存主存档（含版本号） */
  save(data: Omit<SaveData, 'version'>): void {
    try {
      const payload: SaveData = { ...data, version: SAVE_VERSION };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      console.warn('存档保存失败');
    }
  }

  /** 加载主存档，旧版本自动迁移或丢弃 */
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<SaveData>;
      // 旧版本兼容：缺 version 视为 v1，提取 highScore 字段重建
      if (typeof data.version !== 'number') {
        return { version: SAVE_VERSION, highScore: data.highScore ?? 0 };
      }
      if (data.version > SAVE_VERSION) {
        console.warn('存档版本过高，已忽略');
        return null;
      }
      return { version: data.version, highScore: data.highScore ?? 0 };
    } catch {
      console.warn('存档加载失败');
      return null;
    }
  }

  /** 获取最高分 */
  getHighScore(): number {
    return this.load()?.highScore ?? 0;
  }

  /** 更新最高分（仅当新分数更高时） */
  updateHighScore(score: number): boolean {
    const current = this.getHighScore();
    if (score > current) {
      this.save({ highScore: score });
      return true;
    }
    return false;
  }

  /** 清除主存档 */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** 保存游戏进度（玩家可从此处继续） */
  saveProgress(progress: GameProgress): void {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      console.warn('进度保存失败');
    }
  }

  /** 加载游戏进度（无则返回 null） */
  loadProgress(): GameProgress | null {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as Partial<GameProgress>;
      // 字段完整性校验
      if (
        typeof data.currentMoney !== 'number' ||
        typeof data.currentLevel !== 'number' ||
        !Array.isArray(data.ownedItems)
      ) {
        return null;
      }
      return {
        currentMoney: data.currentMoney,
        currentLevel: data.currentLevel,
        ownedItems: data.ownedItems.filter((s): s is string => typeof s === 'string'),
      };
    } catch {
      console.warn('进度加载失败');
      return null;
    }
  }

  /** 清除游戏进度（关卡失败或通关后调用） */
  clearProgress(): void {
    localStorage.removeItem(PROGRESS_KEY);
  }

  /** 是否存在可继续的进度 */
  hasProgress(): boolean {
    return localStorage.getItem(PROGRESS_KEY) !== null;
  }

  /** 是否已显示过教程 */
  loadTutorialShown(): boolean {
    return !!localStorage.getItem(TUTORIAL_KEY);
  }

  /** 标记教程已显示 */
  saveTutorialShown(): void {
    localStorage.setItem(TUTORIAL_KEY, '1');
  }

  /** 加载用户设置 */
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

  /** 保存用户设置 */
  saveSettings(settings: UserSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      console.warn('设置保存失败');
    }
  }
}
