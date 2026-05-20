/**
 * 说说Crystal 主题 - 从 themes/shuoshuo-crystal.json 加载
 *
 * 矿工 5 态使用 32×32 高密度精灵；其他矿物精灵与 classic 同源。
 * 美术编辑直接改 JSON 即可，无需碰 TS 代码。
 */

import crystalJson from '../themes/shuoshuo-crystal.json';
import { loadTheme } from '../themeLoader';

export const SHUOSHUO_CRYSTAL_THEME = loadTheme(crystalJson);
