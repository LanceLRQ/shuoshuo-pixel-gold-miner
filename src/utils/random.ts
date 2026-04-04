/**
 * 随机数工具
 * 提供带种子的随机数和概率分布函数
 */

/** 返回 [min, max) 范围内的随机整数 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

/** 返回 [min, max) 范围内的随机浮点数 */
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** 基于权重随机选择一个索引 */
export function weightedRandom(weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
