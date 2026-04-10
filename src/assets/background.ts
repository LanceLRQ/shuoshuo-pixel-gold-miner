/**
 * 背景渲染器（带离屏 Canvas 缓存）
 * 天空 / 地表 / 地下三层背景（横屏 800x540 布局）
 * 颜色由主题系统提供，布局参数固定
 * 首次渲染绘制到离屏 Canvas 缓存，后续帧直接 drawImage
 */

import type { Renderer } from '../core/Renderer';
import type { BackgroundColors } from './theme/types';

/** 地表 Y 坐标（下移给天空更大空间） */
export const GROUND_Y = 140;

/** 地下浅层结束位置 */
const DIRT_DEEP_Y = 300;

/** 背景离屏缓存 */
let bgCache: HTMLCanvasElement | null = null;
/** 缓存键（尺寸+主题颜色组合） */
let bgCacheKey = '';

/**
 * 渲染三层背景（带缓存）
 * @param colors 背景颜色配置，由主题系统提供
 */
export function renderBackground(renderer: Renderer, width: number, height: number, colors: BackgroundColors): void {
  // 用尺寸和关键颜色生成缓存键
  const key = `${width}x${height}_${colors.skyTop}_${colors.dirtDark}`;

  // 缓存有效则直接绘制
  if (bgCache && bgCacheKey === key) {
    renderer.getContext().drawImage(bgCache, 0, 0);
    return;
  }

  // 创建离屏 Canvas 缓存
  bgCache = document.createElement('canvas');
  bgCache.width = width;
  bgCache.height = height;
  const ctx = bgCache.getContext('2d')!;

  // 绘制到离屏 Canvas
  drawSkyGradient(ctx, width, GROUND_Y, colors);
  drawGround(ctx, width, colors);
  drawDirtShallow(ctx, width, DIRT_DEEP_Y, colors);
  drawDirtDeep(ctx, width, height, DIRT_DEEP_Y, colors);

  bgCacheKey = key;
  renderer.getContext().drawImage(bgCache, 0, 0);
}

/** 清除背景缓存（主题切换时调用） */
export function clearBackgroundCache(): void {
  bgCache = null;
  bgCacheKey = '';
}

/** 渲染天空渐变 */
function drawSkyGradient(ctx: CanvasRenderingContext2D, width: number, height: number, colors: BackgroundColors): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.skyTop);
  gradient.addColorStop(1, colors.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** 渲染地表草地 */
function drawGround(ctx: CanvasRenderingContext2D, width: number, colors: BackgroundColors): void {
  ctx.fillStyle = colors.groundColor;
  ctx.fillRect(0, GROUND_Y, width, 8);
  ctx.fillStyle = colors.groundDark;
  ctx.fillRect(0, GROUND_Y + 8, width, 8);

  ctx.fillStyle = colors.groundLight;
  for (let x = 0; x < width; x += 12) {
    ctx.fillRect(x, GROUND_Y - 2, 2, 2);
    ctx.fillRect(x + 4, GROUND_Y - 4, 2, 4);
    ctx.fillRect(x + 8, GROUND_Y - 2, 2, 2);
  }
}

/** 渲染地下浅层（浅棕色土壤） */
function drawDirtShallow(ctx: CanvasRenderingContext2D, width: number, endY: number, colors: BackgroundColors): void {
  const startY = GROUND_Y + 16;
  ctx.fillStyle = colors.dirtLight;
  ctx.fillRect(0, startY, width, endY - startY);

  ctx.fillStyle = colors.dirtMid;
  for (let i = 0; i < 40; i++) {
    const x = ((i * 73 + 17) * 31) % width;
    const y = startY + ((i * 47 + 23) * 13) % (endY - startY - 4);
    ctx.fillRect(x, y, 4, 4);
  }
}

/** 渲染地下深层（深棕色岩石） */
function drawDirtDeep(ctx: CanvasRenderingContext2D, width: number, totalHeight: number, startY: number, colors: BackgroundColors): void {
  ctx.fillStyle = colors.dirtDark;
  ctx.fillRect(0, startY, width, totalHeight - startY);

  ctx.fillStyle = colors.rockColor;
  for (let i = 0; i < 50; i++) {
    const x = ((i * 59 + 31) * 23) % width;
    const y = startY + ((i * 41 + 13) * 19) % (totalHeight - startY - 4);
    const size = (i % 3 === 0) ? 6 : 4;
    ctx.fillRect(x, y, size, size);
  }

  ctx.fillStyle = colors.rockDark;
  for (let i = 0; i < 25; i++) {
    const x = ((i * 67 + 43) * 17) % width;
    const y = startY + ((i * 53 + 29) * 11) % (totalHeight - startY - 4);
    ctx.fillRect(x, y, 4, 4);
  }
}
