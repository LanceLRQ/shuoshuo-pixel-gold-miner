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

/** 检测点是否在矩形内 */
export function pointInRect(
  px: number,
  py: number,
  rect: { x: number; y: number; w: number; h: number }
): boolean {
  return px >= rect.x && px <= rect.x + rect.w &&
         py >= rect.y && py <= rect.y + rect.h;
}
