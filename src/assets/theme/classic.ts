/**
 * 经典主题 - 从 themes/classic.json 加载
 *
 * 所有精灵数据、调色板、背景色已迁移到 JSON（详见 src/assets/themes/README.md）。
 * 美术编辑直接改 JSON 即可，无需碰 TS 代码。
 */

import classicJson from '../themes/classic.json';
import { loadTheme } from '../themeLoader';

export const CLASSIC_THEME = loadTheme(classicJson);
