/**
 * 碰撞检测工具
 * 点与圆形碰撞判定
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
  const distSq = dx * dx + dy * dy;
  const radiusSq = radius * radius;
  return distSq < radiusSq;
}
