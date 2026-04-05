/**
 * 经典主题 - 黄金矿工原味配色
 * 精灵数据引用 sprites.ts，矿工精灵放大至 32x32 统一尺寸
 */

import type { ThemeDefinition } from './types';
import { ALL_SPRITES, MINER_IDLE, MINER_PULL, MINER_HAPPY, MINER_SAD } from '../sprites';
import { scalePixelMap } from '../../utils/pixel';

/** 经典矿工精灵放大到 32x32（统一尺寸） */
const SCALED_CLASSIC_SPRITES: Record<string, ReturnType<typeof scalePixelMap>> = {
  MINER_IDLE: scalePixelMap(MINER_IDLE, 2),
  MINER_PULL: scalePixelMap(MINER_PULL, 2),
  MINER_HAPPY: scalePixelMap(MINER_HAPPY, 2),
  MINER_SAD: scalePixelMap(MINER_SAD, 2),
};

export const CLASSIC_THEME: ThemeDefinition = {
  id: 'classic',
  name: '经典',
  description: '黄金矿工原味配色',
  sprites: { ...ALL_SPRITES, ...SCALED_CLASSIC_SPRITES },
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
