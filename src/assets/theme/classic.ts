/**
 * 经典主题 - 黄金矿工原味配色
 * 矿工 5 态 + GOLD_LARGE 使用 HD 原生精灵；其他矿物精灵复用 ALL_SPRITES
 * HD 精灵通过 spriteScaleOverrides 设 scale=1（数据维度 = 显示维度），不影响布局
 */

import type { PixelMap } from '../types';
import type { ThemeDefinition } from './types';
import {
  ALL_SPRITES,
  MINER_IDLE_HD,
  MINER_PULL_HD,
  MINER_HAPPY_HD,
  MINER_SAD_HD,
  MINER_STRAIN_HD,
  GOLD_LARGE_HD,
} from '../sprites';

/** 经典 HD 精灵替换表：name → HD PixelMap */
const HD_CLASSIC_SPRITES: Record<string, PixelMap> = {
  // 矿工 5 态：32×32 + scale=3 = 96×96 显示（同原 16×16 经 scalePixelMap(2) + scale=3）
  MINER_IDLE: MINER_IDLE_HD,
  MINER_PULL: MINER_PULL_HD,
  MINER_HAPPY: MINER_HAPPY_HD,
  MINER_SAD: MINER_SAD_HD,
  MINER_STRAIN: MINER_STRAIN_HD,
  // 大金块：48×48 + scale=1 = 48×48 显示（同原 16×16 + scale=3）
  GOLD_LARGE: GOLD_LARGE_HD,
};

/** HD 精灵 scale 覆盖：48×48 数据用 scale=1 保持显示尺寸；矿工 32×32 用 scale=3 不变 */
const HD_SCALE_OVERRIDES: Record<string, number> = {
  GOLD_LARGE: 1,
};

export const CLASSIC_THEME: ThemeDefinition = {
  id: 'classic',
  name: '经典',
  description: '黄金矿工原味配色',
  sprites: { ...ALL_SPRITES, ...HD_CLASSIC_SPRITES },
  spriteScaleOverrides: HD_SCALE_OVERRIDES,
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
