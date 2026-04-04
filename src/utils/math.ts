/**
 * 数学工具函数
 * 向量、角度、插值等计算
 */

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 限制值在范围内 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 计算两点间距离 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 角度转弧度 */
export function degToRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

/** 弧度转角度 */
export function radToDeg(radians: number): number {
  return radians * 180 / Math.PI;
}
