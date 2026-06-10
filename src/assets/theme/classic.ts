/**
 * 经典主题 - 从 themes/classic.json 加载（懒加载入口）
 *
 * 经典主题非默认主题，精灵 JSON 体积较大（~0.69MB）。为避免拖累首屏 chunk，
 * 此处仅导出元信息常量 + 异步加载器：JSON 通过动态 import() 触发 Vite 代码分割，
 * 玩家在主题列表中选中经典主题时才按需拉取（见 ThemeManager.registerLazy / setThemeAsync）。
 *
 * 美术编辑直接改 JSON 即可，无需碰 TS 代码。
 */

import { loadTheme } from '../themeLoader';
import type { ThemeDefinition } from './types';

/** 经典主题元信息（与 classic.json 的 id/name/description 保持一致，供选择列表展示） */
export const CLASSIC_THEME_META = {
  id: 'classic',
  name: '经典',
  description: '黄金矿工原味配色（矿工 5 态 + 大金块 HD）',
} as const;

/** 异步加载经典主题完整数据（动态 import → 独立 chunk，不进首屏） */
export async function loadClassicTheme(): Promise<ThemeDefinition> {
  const { default: classicJson } = await import('../themes/classic.json');
  return loadTheme(classicJson);
}
