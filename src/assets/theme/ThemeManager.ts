/**
 * 主题管理器
 * 管理主题注册、切换、精灵缓存和持久化
 */

import type { ThemeDefinition, BackgroundColors } from './types';
import type { SpriteCacheMap } from '../types';
import { createSpriteCacheMap } from '../types';
import type { SpriteAnimationMeta } from '../animation';

/** localStorage 存储键 */
const THEME_STORAGE_KEY = 'goldminer_theme';

/** 懒主题登记项：仅含选择列表所需元信息 + 异步加载器（数据按需拉取，不进首屏） */
interface LazyThemeEntry {
  id: string;
  name: string;
  description: string;
  loader: () => Promise<ThemeDefinition>;
}

export class ThemeManager {
  private themes: Map<string, ThemeDefinition> = new Map();
  /** 懒主题登记表：id → 元信息 + 加载器（首次切换时 await loader 并 register） */
  private lazyThemes: Map<string, LazyThemeEntry> = new Map();
  /** 默认主题：说说Crystal（HD 矿物 + 替换矿工形象） */
  private currentThemeId: string = 'shuoshuo_crystal';
  private currentCache: SpriteCacheMap | null = null;

  /** 注册主题 */
  register(theme: ThemeDefinition): void {
    this.themes.set(theme.id, theme);
  }

  /**
   * 登记懒主题：只记录元信息和加载器，不拉取精灵数据（避免大体积 JSON 进首屏 chunk）。
   * 主题出现在 getAvailableThemes() 列表中，玩家首次切换时由 setThemeAsync 触发实际加载。
   */
  registerLazy(entry: LazyThemeEntry): void {
    if (this.themes.has(entry.id)) return; // 已实际注册则无需懒登记
    this.lazyThemes.set(entry.id, entry);
  }

  /** 切换主题（仅限已注册主题；懒主题请用 setThemeAsync） */
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

  /**
   * 异步切换主题：目标为未加载的懒主题时，先 await 加载并注册再切换；
   * 已注册主题等价于同步 setTheme。返回是否切换成功。
   */
  async setThemeAsync(id: string): Promise<boolean> {
    if (!this.themes.has(id)) {
      const ok = await this.ensureLoaded(id);
      if (!ok) {
        console.warn(`主题 "${id}" 未注册且无法懒加载，切换失败`);
        return false;
      }
    }
    this.setTheme(id);
    return true;
  }

  /** 确保懒主题已加载并注册；已注册或加载成功返回 true，无此主题或加载失败返回 false */
  private async ensureLoaded(id: string): Promise<boolean> {
    if (this.themes.has(id)) return true;
    const entry = this.lazyThemes.get(id);
    if (!entry) return false;
    try {
      this.register(await entry.loader());
      return true;
    } catch (e) {
      console.error(`懒主题 "${id}" 加载失败`, e);
      return false;
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
      const theme = this.getTheme();
      this.currentCache = createSpriteCacheMap(
        theme.sprites,
        3,
        theme.spriteScaleOverrides
      );
    }
    return this.currentCache;
  }

  /** 获取当前主题的背景颜色 */
  getBackgroundColors(): BackgroundColors {
    return this.getTheme().backgroundColors;
  }

  /** 获取 sprite 动画元数据。静态 sprite 返回 undefined */
  getSpriteMeta(name: string): SpriteAnimationMeta | undefined {
    return this.getTheme().spriteAnimations?.[name];
  }

  /** 获取所有可选主题列表（已注册 + 懒登记；懒主题不重复计入） */
  getAvailableThemes(): Array<{ id: string; name: string; description: string }> {
    const list = Array.from(this.themes.values()).map(({ id, name, description }) => ({
      id,
      name,
      description,
    }));
    for (const entry of this.lazyThemes.values()) {
      if (!this.themes.has(entry.id)) {
        list.push({ id: entry.id, name: entry.name, description: entry.description });
      }
    }
    return list;
  }

  /** 获取当前主题 ID */
  getCurrentThemeId(): string {
    return this.currentThemeId;
  }

  /**
   * 从 localStorage 恢复主题选择（异步：保存的若是未加载的懒主题，先加载再恢复）。
   * 加载失败或无此主题则保持当前默认主题。
   */
  async restoreTheme(): Promise<void> {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return; // localStorage 不可用，使用默认主题
    }
    if (!saved) return;
    if (!this.themes.has(saved)) {
      const ok = await this.ensureLoaded(saved);
      if (!ok) return; // 懒加载失败或无此主题：保持默认
    }
    this.currentThemeId = saved;
    this.currentCache = null;
  }
}
