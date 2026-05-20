#!/usr/bin/env node
/**
 * 难度数值分析：模拟每关每难度的贪心抓取，输出"刚好卡关过"所需抓取数 / 总矿物数。
 *
 * 用法：node scripts/analyze-difficulty.mjs
 *
 * 输出：
 *   1) 当前数值下各档抓取率（按"贪心策略：抓最大的"）
 *   2) 与期望（新手 15% / 一般 33% / 困难 55% / 高手 85%）的对比
 *   3) 推荐新 mineralBudgetRatio
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ==================== 1. 解析现有配置 ====================

const levelsSrc = fs.readFileSync(path.join(ROOT, 'src/level/levels.ts'), 'utf-8');
const difficultySrc = fs.readFileSync(path.join(ROOT, 'src/level/difficulty.ts'), 'utf-8');

// 解析 21 关数据
const LEVELS = [];
const levelRE = /\{\s*level:\s*(\d+),[\s\S]*?targetMoney:\s*(\d+)[\s\S]*?mineralCount:\s*(\d+)[\s\S]*?mineralWeights:\s*\[([\d,\s]+)\]/g;
for (const m of levelsSrc.matchAll(levelRE)) {
  LEVELS.push({
    level: parseInt(m[1]),
    targetMoney: parseInt(m[2]),
    mineralCount: parseInt(m[3]),
    weights: m[4].split(',').map(s => parseInt(s.trim())),
  });
}
console.log(`📊 解析到 ${LEVELS.length} 关`);

// 解析难度配置
const DIFFICULTIES = [];
const diffRE = /\[Difficulty\.(\w+)\]:\s*\{[\s\S]*?valueScale:\s*([\d.]+),[\s\S]*?mineralBudgetRatio:\s*([\d.]+),[\s\S]*?largeWeightScale:\s*([\d.]+),[\s\S]*?mineralBudgetCap:\s*([\d.]+)/g;
for (const m of difficultySrc.matchAll(diffRE)) {
  if (m[1] === 'INFINITE') continue;
  DIFFICULTIES.push({
    id: m[1],
    valueScale: parseFloat(m[2]),
    ratio: parseFloat(m[3]),
    largeWeightScale: parseFloat(m[4]),
    cap: parseFloat(m[5]),
  });
}
console.log(`⚙️  解析到 ${DIFFICULTIES.length} 档难度（不含 INFINITE）`);

// 矿物 base value（与 entity/types.ts 一致）
const MINERAL_VALUES = {
  GOLD_SMALL: 50,
  GOLD_MEDIUM: 250,
  GOLD_LARGE: 500,
  DIAMOND: 600,
  STONE: 15,         // 实际 10-20 随机，取中值
  BOMB: -100,
  MYSTERY_BAG: 125,  // 估算 (50-200 现金 + 道具)
  BONE: 11,
  MOUSE: 20,
  MOLE: 50,
};

// MINERAL_TYPES 顺序（与 weights 数组一一对应）
const TYPE_ORDER = [
  'GOLD_SMALL', 'GOLD_MEDIUM', 'GOLD_LARGE', 'DIAMOND',
  'STONE', 'BOMB', 'MYSTERY_BAG', 'BONE', 'MOUSE', 'MOLE',
];

// 升级链（与 GameScene 一致）
const UPGRADE_CHAIN = ['BONE', 'STONE', 'MOUSE', 'MOLE', 'GOLD_SMALL', 'GOLD_MEDIUM', 'GOLD_LARGE'];

// ==================== 2. 模拟一关：矿物生成 + 预算补足 + 贪心抓取 ====================

function weightedPick(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Mulberry32 — 可复现伪随机 */
function makeRNG(seed) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * 与 GameScene.pickGoldVariant / getCurrentGoldTotal 一致
 * 任何一处改动需同步两侧（mjs 不能 import TS）
 * 注：weightedPick 用 r<0 判断，对应 TS 的 weightedRandom r<=0，浮点边界差异可忽略
 */
function pickGoldVariant(lws, rng) {
  const pLarge = Math.max(0, Math.min(1, lws));
  const pMedium = Math.max(0, Math.min(1, lws * 1.5));
  const pSmall = 1.0;
  const idx = weightedPick([pSmall, pMedium, pLarge], rng);
  return ['GOLD_SMALL', 'GOLD_MEDIUM', 'GOLD_LARGE'][idx];
}

function goldTotal(minerals) {
  return minerals
    .filter(t => t === 'GOLD_SMALL' || t === 'GOLD_MEDIUM' || t === 'GOLD_LARGE')
    .reduce((s, t) => s + MINERAL_VALUES[t], 0);
}

function simulateLevel(level, difficulty, seed, useCap = false) {
  const rng = makeRNG(seed);
  const minerals = [];

  // 1) 基础生成（应用 largeWeightScale 降低 GOLD_LARGE/MEDIUM/DIAMOND 权重）
  const adjustedWeights = [...level.weights];
  const lws = difficulty.largeWeightScale ?? 1.0;
  // GOLD_SMALL=0, GOLD_MEDIUM=1, GOLD_LARGE=2, DIAMOND=3
  adjustedWeights[1] = Math.max(1, Math.round(adjustedWeights[1] * lws));
  adjustedWeights[2] = Math.max(0, Math.round(adjustedWeights[2] * lws));
  adjustedWeights[3] = Math.max(0, Math.round(adjustedWeights[3] * lws));
  for (let i = 0; i < level.mineralCount; i++) {
    const idx = weightedPick(adjustedWeights, rng);
    minerals.push(TYPE_ORDER[idx]);
  }

  // 2) 计算金块保底预算
  const earning = level.level === 1
    ? level.targetMoney
    : level.targetMoney - LEVELS[level.level - 2].targetMoney;
  const goldBudget = (earning * difficulty.ratio) / difficulty.valueScale;

  // 3) 金块保底：追加金块直到金块总值 ≥ goldBudget（按 largeWeightScale 加权选品种）
  let goldVal = goldTotal(minerals);
  let append = 0;
  while (goldVal < goldBudget && append < 30) {
    const variant = pickGoldVariant(lws, rng);
    minerals.push(variant);
    goldVal += MINERAL_VALUES[variant];
    append++;
  }

  // 4) 金块过富时降级最大金块（与 GameScene.downgradeGoldToReachCap 一致）
  //    仅在金块品种之间降级（GOLD_LARGE→MEDIUM→SMALL），不破坏金块保底
  if (useCap) {
    const goldCap = goldBudget * (difficulty.cap ?? 1.10);
    const goldChainStart = UPGRADE_CHAIN.indexOf('GOLD_SMALL');
    let downgrades = 0;
    while (goldTotal(minerals) > goldCap && downgrades < 500) {
      // 找到当前价值最高的可降级金块
      let maxVal = -Infinity;
      let maxIdx = -1;
      for (let i = 0; i < minerals.length; i++) {
        const ul = UPGRADE_CHAIN.indexOf(minerals[i]);
        if (ul <= goldChainStart) continue; // 已是 GOLD_SMALL 或非金块
        const v = MINERAL_VALUES[minerals[i]];
        if (v > maxVal) { maxVal = v; maxIdx = i; }
      }
      if (maxIdx < 0) break;
      const oldType = minerals[maxIdx];
      const oldLevel = UPGRADE_CHAIN.indexOf(oldType);
      const newType = UPGRADE_CHAIN[oldLevel - 1];
      minerals[maxIdx] = newType;
      downgrades++;
    }
  }

  // 5) 模拟贪心抓取：从大到小排序，抓到达 earning 停止（去除负价矿物=BOMB）
  const sortedValues = minerals
    .map(t => MINERAL_VALUES[t] * difficulty.valueScale)
    .filter(v => v > 0)
    .sort((a, b) => b - a);
  let acc = 0;
  let picked = 0;
  for (const v of sortedValues) {
    if (acc >= earning) break;
    acc += v;
    picked++;
  }
  // 兜底
  if (acc < earning) {
    return { picked: minerals.length, total: minerals.length, ratio: 1.0, reached: false };
  }
  return {
    picked,
    total: minerals.length,
    ratio: picked / minerals.length,
    reached: true,
  };
}

// ==================== 3. 跑分析（每关每档跑多次取均值） ====================

const SAMPLES = 50;  // 每关每档跑 50 次

const results = {};  // diffId → [{level, avgPickedRatio}, ...]
for (const diff of DIFFICULTIES) {
  results[diff.id] = [];
  for (const level of LEVELS) {
    let totalRatio = 0;
    let totalPicked = 0;
    let totalMinerals = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const r = simulateLevel(level, diff, level.level * 1000 + s);
      totalRatio += r.ratio;
      totalPicked += r.picked;
      totalMinerals += r.total;
    }
    results[diff.id].push({
      level: level.level,
      avgPickRatio: totalRatio / SAMPLES,
      avgPicked: totalPicked / SAMPLES,
      avgTotal: totalMinerals / SAMPLES,
    });
  }
}

// ==================== 4. 输出表格 ====================

const EXPECTED = { NOVICE: 0.15, NORMAL: 0.33, HARD: 0.55, EXPERT: 0.85 };

console.log('\n========== 当前数值各档抓取率（贪心抓最大的） ==========\n');
console.log('关卡 | NOVICE         | NORMAL         | HARD           | EXPERT');
console.log('-----|----------------|----------------|----------------|----------------');
for (let i = 0; i < LEVELS.length; i++) {
  const row = [`L${(i + 1).toString().padStart(2)}`];
  for (const diff of DIFFICULTIES) {
    const r = results[diff.id][i];
    const pct = (r.avgPickRatio * 100).toFixed(0).padStart(3);
    const cnt = `${r.avgPicked.toFixed(1)}/${r.avgTotal.toFixed(0)}`.padStart(9);
    row.push(`${pct}% (${cnt})`);
  }
  console.log(row.join(' | '));
}

// 难度均值
console.log('\n========== 各档平均抓取率 vs 期望 ==========\n');
console.log('难度    | 当前ratio | 平均抓取率 | 期望抓取率 | 偏差');
console.log('--------|-----------|------------|------------|--------');
for (const diff of DIFFICULTIES) {
  const arr = results[diff.id];
  const avg = arr.reduce((s, r) => s + r.avgPickRatio, 0) / arr.length;
  const expected = EXPECTED[diff.id];
  const delta = ((avg - expected) * 100).toFixed(0);
  const sign = delta >= 0 ? '+' : '';
  console.log(
    `${diff.id.padEnd(7)} | ${diff.ratio.toFixed(2).padStart(9)} | ${(avg * 100).toFixed(0).padStart(8)}%  | ${(expected * 100).toFixed(0).padStart(8)}%  | ${sign}${delta}%`
  );
}

// ==================== 5. 根本问题诊断 ====================

console.log('\n========== 诊断：场上矿物总价值 vs target ==========\n');
console.log('关卡 | earning | NOVICE场总值×倍数 | NORMAL | HARD  | EXPERT');
console.log('-----|---------|------------------|--------|-------|-------');
for (let i = 0; i < LEVELS.length; i++) {
  const level = LEVELS[i];
  const earning = i === 0 ? level.targetMoney : level.targetMoney - LEVELS[i - 1].targetMoney;
  const row = [`L${(i + 1).toString().padStart(2)}`, `${earning.toString().padStart(7)}`];
  for (const diff of DIFFICULTIES) {
    // 模拟一次取场上总价值
    const rng = makeRNG(level.level * 1000);
    const minerals = [];
    for (let j = 0; j < level.mineralCount; j++) {
      const idx = weightedPick(level.weights, rng);
      minerals.push(TYPE_ORDER[idx]);
    }
    const targetBudget = (earning * diff.ratio) / diff.valueScale;
    let total = minerals.reduce((s, t) => s + MINERAL_VALUES[t], 0);
    // 升级
    let attempts = 0;
    while (total < targetBudget && attempts < 100) {
      let minL = UPGRADE_CHAIN.length, minI = -1;
      for (let k = 0; k < minerals.length; k++) {
        const ul = UPGRADE_CHAIN.indexOf(minerals[k]);
        if (ul >= 0 && ul < minL) { minL = ul; minI = k; }
      }
      if (minI < 0 || minL >= UPGRADE_CHAIN.length - 1) break;
      const oldT = minerals[minI];
      const newT = UPGRADE_CHAIN[minL + 1];
      minerals[minI] = newT;
      total += MINERAL_VALUES[newT] - MINERAL_VALUES[oldT];
      attempts++;
    }
    // 玩家可获得金额（仅正价矿物 × valueScale）
    const playerMax = minerals.reduce((s, t) => s + Math.max(0, MINERAL_VALUES[t]) * diff.valueScale, 0);
    const multiplier = playerMax / earning;
    row.push(`${multiplier.toFixed(1)}x`.padStart(6));
  }
  console.log(row.join(' | '));
}

console.log('\n💡 关键洞察：场上总值 / target 比例就是"理论最低抓取率倒数"');
console.log('   场上 10x target → 抓 1/10 = 10% 价值就过');
console.log('   场上 1.2x target → 必须抓 83% 价值');
console.log('   现状所有档场上都 5-30x target → 玩家只需抓 1-2 个最大的件');

console.log('\n========== 真正可控的难度参数 ==========\n');
console.log('要让"数量抓取率"接近期望，需双管齐下：');
console.log('  1. valueScale 降到 ~0.3（玩家收益减少，必须多抓）');
console.log('  2. mineralBudgetRatio 降到 ~1.0（场上总值 ≈ target，几乎全抓）');
console.log('  3. 大件矿物权重降低（少 GOLD_LARGE，多 GOLD_SMALL/STONE）');

console.log('\n========== 推荐新数值（按期望抓取率反推） ==========\n');
console.log('难度    | 当前 ratio×scale | 推荐 ratio×scale | 期望数量抓取率');
console.log('--------|------------------|------------------|--------------');
// 终极方案：极致调参达到期望抓取率
const RECOMMENDATIONS = {
  // NOVICE: 大件多 + 高收益（玩家抓 1-2 个就过，约 15%）
  NOVICE: { ratio: 2.5, valueScale: 1.5, largeWeightScale: 1.0 },
  // NORMAL: 中等大件 + 标准收益（抓 3-4 个，约 33%）✅ 命中
  NORMAL: { ratio: 1.1, valueScale: 0.85, largeWeightScale: 0.35 },
  // HARD: 大件几乎绝迹 + 收益减半（抓 5-6 个，约 55%）
  HARD: { ratio: 1.0, valueScale: 0.45, largeWeightScale: 0.10 },
  // EXPERT: 完全无大件 + 极低收益 + cap 控场上贴近 target（抓 8-9 个，约 80%）
  EXPERT: { ratio: 1.0, valueScale: 0.15, largeWeightScale: 0.0 },
};

for (const diff of DIFFICULTIES) {
  const newCfg = RECOMMENDATIONS[diff.id];
  const oldStr = `${diff.ratio.toFixed(1)}/${diff.valueScale.toFixed(1)}`;
  const newStr = `${newCfg.ratio.toFixed(1)}/${newCfg.valueScale.toFixed(1)}`;
  const expected = EXPECTED[diff.id];
  console.log(`${diff.id.padEnd(7)} | ${oldStr.padStart(16)} | ${newStr.padStart(16)} | ${(expected * 100).toFixed(0)}%`);
}

// 用新数值跑分析验证（含 cap 降级 + largeWeightScale）
console.log('\n========== 应用 终极方案（cap + largeWeightScale + ratio + valueScale） ==========\n');
console.log('难度    | 期望抓取率 | 实测抓取率 | 偏差');
console.log('--------|------------|------------|--------');
for (const diff of DIFFICULTIES) {
  const newCfg = RECOMMENDATIONS[diff.id];
  const newDiff = { id: diff.id, ratio: newCfg.ratio, valueScale: newCfg.valueScale, largeWeightScale: newCfg.largeWeightScale };
  let sum = 0, count = 0;
  for (const level of LEVELS) {
    for (let s = 0; s < SAMPLES; s++) {
      const r = simulateLevel(level, newDiff, level.level * 1000 + s, /*useCap=*/ true);
      sum += r.ratio;
      count++;
    }
  }
  const avg = sum / count;
  const expected = EXPECTED[diff.id];
  const delta = ((avg - expected) * 100).toFixed(0);
  const sign = delta >= 0 ? '+' : '';
  console.log(`${diff.id.padEnd(7)} | ${(expected * 100).toFixed(0).padStart(8)}%  | ${(avg * 100).toFixed(0).padStart(8)}%  | ${sign}${delta}%`);
}

// ==================== 6. 二分搜索（带 cap）找最优 ratio ====================

function avgPickRatioWithCap(diffId, valueScale, ratio) {
  const diff = { id: diffId, ratio, valueScale };
  let sum = 0, count = 0;
  for (const level of LEVELS) {
    for (let s = 0; s < SAMPLES; s++) {
      const r = simulateLevel(level, diff, level.level * 1000 + s, true);
      sum += r.ratio;
      count++;
    }
  }
  return sum / count;
}

console.log('\n========== 二分搜索最优 ratio（valueScale 固定，含 cap） ==========\n');
console.log('难度    | valueScale | 最优ratio | 实测抓取率 | 期望抓取率');
console.log('--------|------------|-----------|------------|----------');
const FINAL_TUNING = {};
for (const diff of DIFFICULTIES) {
  const newCfg = RECOMMENDATIONS[diff.id];
  const expected = EXPECTED[diff.id];
  let lo = 1.0, hi = 8.0;
  for (let iter = 0; iter < 14; iter++) {
    const mid = (lo + hi) / 2;
    const actual = avgPickRatioWithCap(diff.id, newCfg.valueScale, mid);
    if (actual > expected) lo = mid;
    else hi = mid;
  }
  const best = (lo + hi) / 2;
  const actual = avgPickRatioWithCap(diff.id, newCfg.valueScale, best);
  FINAL_TUNING[diff.id] = { ratio: best, valueScale: newCfg.valueScale };
  console.log(`${diff.id.padEnd(7)} | ${newCfg.valueScale.toFixed(1).padStart(8)}   | ${best.toFixed(2).padStart(8)}  | ${(actual * 100).toFixed(0).padStart(8)}%   | ${(expected * 100).toFixed(0)}%`);
}

console.log('\n========== 最终建议（请采用） ==========\n');
for (const [id, cfg] of Object.entries(FINAL_TUNING)) {
  console.log(`  [Difficulty.${id}]:`);
  console.log(`    valueScale: ${cfg.valueScale.toFixed(1)},`);
  console.log(`    mineralBudgetRatio: ${cfg.ratio.toFixed(2)},`);
}
console.log('\n⚠️  注意：需同时给 generateMinerals 加 cap 降级逻辑（让场上总值 ≤ budget × 1.15）');
