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

/** 基于权重随机选择一个索引（接受 readonly 数组/元组，函数内只读不写） */
export function weightedRandom(weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** 按 weight 字段从配置数组中随机选一项（神秘袋/木箱等配置抽样通用模式） */
export function pickWeightedContent<T extends { weight: number }>(items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  const idx = weightedRandom(items.map(i => i.weight));
  return items[idx];
}
