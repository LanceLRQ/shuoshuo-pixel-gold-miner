/**
 * 背景渲染器
 * 天空 / 地表 / 地下三层背景（横屏 800x480 布局）
 */

import type { Renderer } from '../core/Renderer';

// 背景颜色常量
const SKY_TOP = '#87CEEB';
const SKY_BOTTOM = '#B0E0FF';
const GROUND_COLOR = '#4CAF50';
const GROUND_DARK = '#388E3C';
const GROUND_LIGHT = '#66BB6A';
const DIRT_LIGHT = '#8B6914';
const DIRT_MID = '#6B4C12';
const DIRT_DARK = '#4A3508';
const ROCK_COLOR = '#5D4E37';
const ROCK_DARK = '#3E3226';

/** 地表 Y 坐标 */
export const GROUND_Y = 80;

/** 地下浅层结束位置 */
const DIRT_DEEP_Y = 260;

/**
 * 渲染三层背景
 */
export function renderBackground(renderer: Renderer, width: number, height: number): void {
  // 1. 天空渐变
  renderSkyGradient(renderer, width, GROUND_Y);

  // 2. 地表草地
  renderGround(renderer, width);

  // 3. 地下浅层
  renderDirtShallow(renderer, width, DIRT_DEEP_Y);

  // 4. 地下深层
  renderDirtDeep(renderer, width, height, DIRT_DEEP_Y);
}

/** 渲染天空渐变 */
function renderSkyGradient(renderer: Renderer, width: number, height: number): void {
  const ctx = renderer.getContext();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** 渲染地表草地 */
function renderGround(renderer: Renderer, width: number): void {
  // 草地主体
  renderer.fillRect(0, GROUND_Y, width, 8, GROUND_COLOR);
  renderer.fillRect(0, GROUND_Y + 8, width, 8, GROUND_DARK);

  // 草丛装饰
  const ctx = renderer.getContext();
  ctx.fillStyle = GROUND_LIGHT;
  for (let x = 0; x < width; x += 12) {
    ctx.fillRect(x, GROUND_Y - 2, 2, 2);
    ctx.fillRect(x + 4, GROUND_Y - 4, 2, 4);
    ctx.fillRect(x + 8, GROUND_Y - 2, 2, 2);
  }
}

/** 渲染地下浅层（浅棕色土壤） */
function renderDirtShallow(renderer: Renderer, width: number, endY: number): void {
  const startY = GROUND_Y + 16;
  renderer.fillRect(0, startY, width, endY - startY, DIRT_LIGHT);

  // 土壤纹理点缀
  const ctx = renderer.getContext();
  ctx.fillStyle = DIRT_MID;
  for (let i = 0; i < 40; i++) {
    const x = ((i * 73 + 17) * 31) % width;
    const y = startY + ((i * 47 + 23) * 13) % (endY - startY - 4);
    ctx.fillRect(x, y, 4, 4);
  }
}

/** 渲染地下深层（深棕色岩石） */
function renderDirtDeep(renderer: Renderer, width: number, totalHeight: number, startY: number): void {
  renderer.fillRect(0, startY, width, totalHeight - startY, DIRT_DARK);

  // 岩石纹理
  const ctx = renderer.getContext();
  ctx.fillStyle = ROCK_COLOR;
  for (let i = 0; i < 50; i++) {
    const x = ((i * 59 + 31) * 23) % width;
    const y = startY + ((i * 41 + 13) * 19) % (totalHeight - startY - 4);
    const size = (i % 3 === 0) ? 6 : 4;
    ctx.fillRect(x, y, size, size);
  }

  // 深层岩石装饰
  ctx.fillStyle = ROCK_DARK;
  for (let i = 0; i < 25; i++) {
    const x = ((i * 67 + 43) * 17) % width;
    const y = startY + ((i * 53 + 29) * 11) % (totalHeight - startY - 4);
    ctx.fillRect(x, y, 4, 4);
  }
}
