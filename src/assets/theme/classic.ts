/**
 * 经典主题 - 黄金矿工原味配色
 * 矿工 5 态使用 32×32 HD 原生精灵，其他矿物精灵复用 ALL_SPRITES
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
} from '../sprites';

/** 经典矿工精灵：5 态全部用 32×32 HD 真高密度版本 */
const HD_CLASSIC_MINER_SPRITES: Record<string, PixelMap> = {
  MINER_IDLE: MINER_IDLE_HD,
  MINER_PULL: MINER_PULL_HD,
  MINER_HAPPY: MINER_HAPPY_HD,
  MINER_SAD: MINER_SAD_HD,
  MINER_STRAIN: MINER_STRAIN_HD,
};

export const CLASSIC_THEME: ThemeDefinition = {
  id: 'classic',
  name: '经典',
  description: '黄金矿工原味配色',
  sprites: { ...ALL_SPRITES, ...HD_CLASSIC_MINER_SPRITES },
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
