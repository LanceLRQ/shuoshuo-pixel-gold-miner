/**
 * 自定义主题持久化（localStorage）
 *
 * 系统主题（classic / shuoshuo_crystal）只读，由编译期 JSON 静态导入；
 * 自定义主题保存到 localStorage 的 `goldminer_custom_themes` 键下。
 */

import type { ThemeJson } from '../assets/themeLoader';
import type { BackgroundColors } from '../assets/theme/types';

const CUSTOM_THEMES_KEY = 'goldminer_custom_themes';

/** 系统主题 ID（只读、不可删/改） */
export const SYSTEM_THEME_IDS: readonly string[] = ['classic', 'shuoshuo_crystal'];

/** BackgroundColors 字段清单（与 src/assets/theme/types.ts 保持同步） */
export const BACKGROUND_COLOR_KEYS: ReadonlyArray<keyof BackgroundColors> = [
  'skyTop',
  'skyBottom',
  'groundColor',
  'groundDark',
  'groundLight',
  'dirtLight',
  'dirtMid',
  'dirtDark',
  'rockColor',
  'rockDark',
];

export class ThemeStore {
  /** 加载用户在素材管理页创建的所有自定义主题 */
  loadCustom(): ThemeJson[] {
    try {
      const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((t): t is ThemeJson => {
        try {
          this.validateThemeJson(t);
          return true;
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  /** 全量保存自定义主题列表 */
  saveCustom(themes: ThemeJson[]): void {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  }

  isSystemTheme(id: string): boolean {
    return SYSTEM_THEME_IDS.includes(id);
  }

  /** 单条更新（按 id 匹配），若不存在则追加 */
  addOrUpdate(theme: ThemeJson): void {
    if (this.isSystemTheme(theme.id)) {
      throw new Error(`不能修改系统主题 "${theme.id}"`);
    }
    const list = this.loadCustom();
    const idx = list.findIndex((t) => t.id === theme.id);
    if (idx >= 0) {
      list[idx] = theme;
    } else {
      list.push(theme);
    }
    this.saveCustom(list);
  }

  remove(id: string): void {
    if (this.isSystemTheme(id)) {
      throw new Error(`不能删除系统主题 "${id}"`);
    }
    const list = this.loadCustom().filter((t) => t.id !== id);
    this.saveCustom(list);
  }

  exportThemeJson(theme: ThemeJson): string {
    return JSON.stringify(theme, null, 2);
  }

  /**
   * 从字符串解析并校验导入的 ThemeJson
   * @throws 解析失败或结构非法
   */
  importThemeJson(raw: string): ThemeJson {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
    return this.validateThemeJson(parsed);
  }

  /**
   * 结构校验。检查所有必需字段都在且类型正确；
   * 抛出的错误信息精确定位字段，用于在 UI 上向用户提示。
   */
  validateThemeJson(obj: unknown): ThemeJson {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error('根节点不是对象');
    }
    const o = obj as Record<string, unknown>;
    const requireString = (key: string): string => {
      const v = o[key];
      if (typeof v !== 'string' || v.length === 0) {
        throw new Error(`字段 "${key}" 必须为非空字符串`);
      }
      return v;
    };
    const id = requireString('id');
    const name = requireString('name');
    requireString('description');

    if (typeof o.sprites !== 'object' || o.sprites === null || Array.isArray(o.sprites)) {
      throw new Error('字段 "sprites" 必须为对象');
    }
    const sprites = o.sprites as Record<string, unknown>;
    if (Object.keys(sprites).length === 0) {
      throw new Error('字段 "sprites" 至少需要一个 sprite');
    }
    for (const [spriteName, sprite] of Object.entries(sprites)) {
      if (typeof sprite !== 'object' || sprite === null) {
        throw new Error(`sprite "${spriteName}" 必须为对象`);
      }
      const s = sprite as Record<string, unknown>;
      if (typeof s.scale !== 'number') {
        throw new Error(`sprite "${spriteName}".scale 必须为数字`);
      }
      if (typeof s.palette !== 'object' || s.palette === null) {
        throw new Error(`sprite "${spriteName}".palette 必须为对象`);
      }
      if (!Array.isArray(s.pixels) || s.pixels.length === 0) {
        throw new Error(`sprite "${spriteName}".pixels 必须为非空字符串数组`);
      }
      for (let i = 0; i < s.pixels.length; i++) {
        if (typeof s.pixels[i] !== 'string') {
          throw new Error(`sprite "${spriteName}".pixels[${i}] 必须为字符串`);
        }
      }
    }

    if (typeof o.background !== 'object' || o.background === null) {
      throw new Error('字段 "background" 必须为对象');
    }
    const bg = o.background as Record<string, unknown>;
    for (const key of BACKGROUND_COLOR_KEYS) {
      if (typeof bg[key] !== 'string') {
        throw new Error(`background.${key} 必须为字符串（hex 颜色）`);
      }
    }

    // 校验通过：用 id 作为返回值类型 ThemeJson；TypeScript 在此层之外信任结构
    void id;
    void name;
    return obj as ThemeJson;
  }
}
