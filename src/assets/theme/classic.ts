/**
 * 经典主题 - 黄金矿工原味配色
 * 精灵数据引用 sprites.ts，背景颜色提取自 background.ts
 */

import type { ThemeDefinition } from './types';
import { ALL_SPRITES } from '../sprites';

export const CLASSIC_THEME: ThemeDefinition = {
  id: 'classic',
  name: '经典',
  description: '黄金矿工原味配色',
  sprites: ALL_SPRITES,
  backgroundColors: {
    skyTop: '#87CEEB',
    skyBottom: '#B0E0FF',
    groundColor: '#4CAF50',
    groundDark: '#388E3C',
    groundLight: '#66BB6A',
    dirtLight: '#8B6914',
    dirtMid: '#6B4C12',
    dirtDark: '#4A3508',
    rockColor: '#5D4E37',
    rockDark: '#3E3226',
  },
};
