/**
 * 碰撞检测工具
 * 点与圆形/矩形碰撞判定
 */

/** 检测点是否在圆内 */
export function pointInCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * 检测点是否在椭圆内：(dx/rx)² + (dy/ry)² < 1
 *
 * 用于水平移动的小动物（MOUSE / MOLE）—— 横向 sprite 用圆形碰撞要么过严
 * （直径 < sprite 宽，抓头/尾不到），要么过松（直径 > sprite 高，正上方
 * 老远也触发）。椭圆 radiusX/radiusY 分离让水平/垂直独立调整。
 */
export function pointInEllipse(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number
): boolean {
  const dx = (px - cx) / radiusX;
  const dy = (py - cy) / radiusY;
  return dx * dx + dy * dy < 1;
}

/** 检测点是否在矩形内 */
export function pointInRect(
  px: number,
  py: number,
  rect: { x: number; y: number; w: number; h: number }
): boolean {
  return px >= rect.x && px <= rect.x + rect.w &&
         py >= rect.y && py <= rect.y + rect.h;
}
