/**
 * 背景渲染器
 * 天空 / 地表 / 地下三层背景（横屏 800x480 布局）
 * 颜色由主题系统提供，布局参数固定
 */

import type { Renderer } from '../core/Renderer';
import type { BackgroundColors } from './theme/types';

/** 地表 Y 坐标 */
export const GROUND_Y = 80;

/** 地下浅层结束位置 */
const DIRT_DEEP_Y = 260;

/**
 * 渲染三层背景
 * @param colors 背景颜色配置，由主题系统提供
 */
export function renderBackground(renderer: Renderer, width: number, height: number, colors: BackgroundColors): void {
  // 1. 天空渐变
  renderSkyGradient(renderer, width, GROUND_Y, colors);

  // 2. 地表草地
  renderGround(renderer, width, colors);

  // 3. 地下浅层
  renderDirtShallow(renderer, width, DIRT_DEEP_Y, colors);

  // 4. 地下深层
  renderDirtDeep(renderer, width, height, DIRT_DEEP_Y, colors);
}

/** 渲染天空渐变 */
function renderSkyGradient(renderer: Renderer, width: number, height: number, colors: BackgroundColors): void {
  const ctx = renderer.getContext();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.skyTop);
  gradient.addColorStop(1, colors.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** 渲染地表草地 */
function renderGround(renderer: Renderer, width: number, colors: BackgroundColors): void {
  // 草地主体
  renderer.fillRect(0, GROUND_Y, width, 8, colors.groundColor);
  renderer.fillRect(0, GROUND_Y + 8, width, 8, colors.groundDark);

  // 草丛装饰
  const ctx = renderer.getContext();
  ctx.fillStyle = colors.groundLight;
  for (let x = 0; x < width; x += 12) {
    ctx.fillRect(x, GROUND_Y - 2, 2, 2);
    ctx.fillRect(x + 4, GROUND_Y - 4, 2, 4);
    ctx.fillRect(x + 8, GROUND_Y - 2, 2, 2);
  }
}

/** 渲染地下浅层（浅棕色土壤） */
function renderDirtShallow(renderer: Renderer, width: number, endY: number, colors: BackgroundColors): void {
  const startY = GROUND_Y + 16;
  renderer.fillRect(0, startY, width, endY - startY, colors.dirtLight);

  // 土壤纹理点缀
  const ctx = renderer.getContext();
  ctx.fillStyle = colors.dirtMid;
  for (let i = 0; i < 40; i++) {
    const x = ((i * 73 + 17) * 31) % width;
    const y = startY + ((i * 47 + 23) * 13) % (endY - startY - 4);
    ctx.fillRect(x, y, 4, 4);
  }
}

/** 渲染地下深层（深棕色岩石） */
function renderDirtDeep(renderer: Renderer, width: number, totalHeight: number, startY: number, colors: BackgroundColors): void {
  renderer.fillRect(0, startY, width, totalHeight - startY, colors.dirtDark);

  // 岩石纹理
  const ctx = renderer.getContext();
  ctx.fillStyle = colors.rockColor;
  for (let i = 0; i < 50; i++) {
    const x = ((i * 59 + 31) * 23) % width;
    const y = startY + ((i * 41 + 13) * 19) % (totalHeight - startY - 4);
    const size = (i % 3 === 0) ? 6 : 4;
    ctx.fillRect(x, y, size, size);
  }

  // 深层岩石装饰
  ctx.fillStyle = colors.rockDark;
  for (let i = 0; i < 25; i++) {
    const x = ((i * 67 + 43) * 17) % width;
    const y = startY + ((i * 53 + 29) * 11) % (totalHeight - startY - 4);
    ctx.fillRect(x, y, 4, 4);
  }
}
