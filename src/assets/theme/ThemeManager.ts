/**
 * 主题管理器
 * 管理主题注册、切换、精灵缓存和持久化
 */

import type { ThemeDefinition, BackgroundColors } from './types';
import type { SpriteCacheMap } from '../types';
import { createSpriteCacheMap } from '../types';

/** localStorage 存储键 */
const THEME_STORAGE_KEY = 'goldminer_theme';

export class ThemeManager {
  private themes: Map<string, ThemeDefinition> = new Map();
  private currentThemeId: string = 'classic';
  private currentCache: SpriteCacheMap | null = null;

  /** 注册主题 */
  register(theme: ThemeDefinition): void {
    this.themes.set(theme.id, theme);
  }

  /** 切换主题 */
  setTheme(id: string): void {
    if (!this.themes.has(id)) {
      console.warn(`主题 "${id}" 未注册，切换失败`);
      return;
    }
    this.currentThemeId = id;
    this.currentCache = null;
    // 持久化选择
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // localStorage 不可用，忽略
    }
  }

  /** 获取当前主题定义 */
  getTheme(): ThemeDefinition {
    const theme = this.themes.get(this.currentThemeId);
    if (!theme) {
      throw new Error(`当前主题 "${this.currentThemeId}" 未注册`);
    }
    return theme;
  }

  /** 获取当前主题的精灵缓存（懒构建） */
  getSpriteCache(): SpriteCacheMap {
    if (!this.currentCache) {
      this.currentCache = createSpriteCacheMap(this.getTheme().sprites);
    }
    return this.currentCache;
  }

  /** 获取当前主题的背景颜色 */
  getBackgroundColors(): BackgroundColors {
    return this.getTheme().backgroundColors;
  }

  /** 获取所有已注册主题列表 */
  getAvailableThemes(): Array<{ id: string; name: string; description: string }> {
    return Array.from(this.themes.values()).map(({ id, name, description }) => ({
      id,
      name,
      description,
    }));
  }

  /** 获取当前主题 ID */
  getCurrentThemeId(): string {
    return this.currentThemeId;
  }

  /** 从 localStorage 恢复主题选择 */
  restoreTheme(): void {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && this.themes.has(saved)) {
        this.currentThemeId = saved;
        this.currentCache = null;
      }
    } catch {
      // localStorage 不可用，使用默认主题
    }
  }
}
