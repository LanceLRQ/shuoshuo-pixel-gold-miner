/**
 * 像素字体渲染器
 * 使用 Canvas 内置字体渲染文本，模拟像素风格
 */

import type { Renderer } from '../core/Renderer';

/** 像素字体配置 */
const PIXEL_FONT_FAMILY = 'monospace';

/** 字体大小映射 */
const FONT_SIZES = {
  SMALL: 12,
  MEDIUM: 16,
  LARGE: 24,
  TITLE: 32,
} as const;

/**
 * 渲染像素文本
 * @param renderer 渲染器实例
 * @param text 文本内容
 * @param x X 坐标
 * @param y Y 坐标
 * @param color 颜色
 * @param size 字体大小类型
 */
export function drawText(
  renderer: Renderer,
  text: string,
  x: number,
  y: number,
  color: string = '#FFFFFF',
  size: keyof typeof FONT_SIZES = 'MEDIUM'
): void {
  const fontSize = FONT_SIZES[size];
  const ctx = renderer.getContext();

  // 禁用字体平滑，保持像素风格
  ctx.imageSmoothingEnabled = false;
  ctx.font = `bold ${fontSize}px "${PIXEL_FONT_FAMILY}"`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

/**
 * 渲染带阴影的像素文本
 * @param renderer 渲染器实例
 * @param text 文本内容
 * @param x X 坐标
 * @param y Y 坐标
 * @param color 文字颜色
 * @param shadowColor 阴影颜色
 * @param size 字体大小类型
 */
export function drawTextWithShadow(
  renderer: Renderer,
  text: string,
  x: number,
  y: number,
  color: string = '#FFFFFF',
  shadowColor: string = '#000000',
  size: keyof typeof FONT_SIZES = 'MEDIUM'
): void {
  // 先画阴影（偏移 1-2 像素）
  const shadowOffset = size === 'TITLE' ? 2 : 1;
  drawText(renderer, text, x + shadowOffset, y + shadowOffset, shadowColor, size);
  // 再画前景文字
  drawText(renderer, text, x, y, color, size);
}

/**
 * 居中渲染文本
 * @param renderer 渲染器实例
 * @param text 文本内容
 * @param y Y 坐标
 * @param color 颜色
 * @param size 字体大小类型
 */
export function drawTextCentered(
  renderer: Renderer,
  text: string,
  y: number,
  color: string = '#FFFFFF',
  size: keyof typeof FONT_SIZES = 'MEDIUM'
): void {
  const fontSize = FONT_SIZES[size];
  const ctx = renderer.getContext();
  ctx.font = `bold ${fontSize}px "${PIXEL_FONT_FAMILY}"`;
  const metrics = ctx.measureText(text);
  const x = (renderer.width - metrics.width) / 2;
  drawText(renderer, text, x, y, color, size);
}
