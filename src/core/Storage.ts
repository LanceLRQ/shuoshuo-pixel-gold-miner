/**
 * 存档系统
 * 使用 localStorage 持久化游戏进度
 */

/** 存档数据接口 */
interface SaveData {
  /** 最高分 */
  highScore: number;
  /** 最后到达的关卡 */
  lastLevel: number;
  /** 累计金额 */
  totalMoney: number;
}

const STORAGE_KEY = 'goldminer_h5_save';
const TUTORIAL_KEY = 'goldminer_tutorial_shown';

export class Storage {
  /** 保存游戏数据 */
  save(data: SaveData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      console.warn('存档保存失败');
    }
  }

  /** 加载游戏数据 */
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as SaveData;
      }
    } catch {
      console.warn('存档加载失败');
    }
    return null;
  }

  /** 获取最高分 */
  getHighScore(): number {
    const data = this.load();
    return data?.highScore ?? 0;
  }

  /** 更新最高分 */
  updateHighScore(score: number): boolean {
    const current = this.getHighScore();
    if (score > current) {
      const data = this.load() ?? { highScore: 0, lastLevel: 1, totalMoney: 0 };
      data.highScore = score;
      this.save(data);
      return true;
    }
    return false;
  }

  /** 清除存档 */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** 是否已显示过教程 */
  loadTutorialShown(): boolean {
    return !!localStorage.getItem(TUTORIAL_KEY);
  }

  /** 标记教程已显示 */
  saveTutorialShown(): void {
    localStorage.setItem(TUTORIAL_KEY, '1');
  }
}
