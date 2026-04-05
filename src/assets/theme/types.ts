/**
 * 主题系统类型定义
 * 主题 = 精灵数据集 + 背景颜色配置
 */

import type { PixelMap } from '../types';

/** 背景颜色配置 */
export interface BackgroundColors {
  skyTop: string;
  skyBottom: string;
  groundColor: string;
  groundDark: string;
  groundLight: string;
  dirtLight: string;
  dirtMid: string;
  dirtDark: string;
  rockColor: string;
  rockDark: string;
}

/** 主题定义 */
export interface ThemeDefinition {
  /** 主题唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 主题描述 */
  description: string;
  /** 精灵数据集（名称 → PixelMap） */
  sprites: Record<string, PixelMap>;
  /** 背景颜色配置 */
  backgroundColors: BackgroundColors;
}
