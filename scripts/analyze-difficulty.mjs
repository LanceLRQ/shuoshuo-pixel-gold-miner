#!/usr/bin/env node
/**
 * 难度数值分析（v3：完美 + 失误玩家双模型 + 期望通关率达标判定）
 *
 * 用法：node scripts/analyze-difficulty.mjs
 *
 * 三层模拟（每层都跑 SAMPLES 次取均值）：
 *   1) 贪心理论上限（按价值排序抓最大的，忽略时间/角度/遮挡） — 数值天花板
 *   2) 完美玩家（时间 + 角度 + 重量 + 遮挡，但不失误）         — 操作上限
 *   3) 失误玩家（在 ROI Top-K 中随机抽，会被遮挡踩雷）         — 普通玩家估计
 *
 * 期望基准（用户设定）：
 *   通关率：NOVICE 95% / NORMAL 80% / HARD 60% / EXPERT 45%
 *   失误容忍：NOVICE 9 次 / NORMAL 6 次 / HARD 4 次 / EXPERT 2 次
 *
 * 输出：每关、每档对比，标注哪些关 / 哪些档"偏离期望"。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ==================== 0. 期望基准（按用户设定） ====================

const EXPECTED_WIN_RATE = {
  NOVICE: 0.95,
  NORMAL: 0.80,
  HARD:   0.60,
  EXPERT: 0.45,
};
const ERROR_TOLERANCE = {  // 每关允许的失误数（抓到 STONE/BOMB/低价物 计为失误）
  NOVICE: 9,
  NORMAL: 6,
  HARD:   4,
  EXPERT: 2,
};
// 失误玩家的"眼力"参数：从 ROI Top-K 中按权重随机抽
const ERROR_TOPK = {  // 越小越接近完美玩家
  NOVICE: 4,
  NORMAL: 3,
  HARD:   3,
  EXPERT: 2,
};

// ==================== 1. 解析配置 ====================

const levelsSrc = fs.readFileSync(path.join(ROOT, 'src/level/levels.ts'), 'utf-8');
const difficultySrc = fs.readFileSync(path.join(ROOT, 'src/level/difficulty.ts'), 'utf-8');
const typesSrc = fs.readFileSync(path.join(ROOT, 'src/entity/types.ts'), 'utf-8');

/**
 * 解析 types.ts 中的数值常量
 * 安全策略：仅接受纯数字（parseFloat），含表达式的字段（如 HOOK_MAX_ANGLE = Math.PI * 4 / 9）
 * 必须显式传 fallback 兜底；不再使用 new Function() 求值，避免源文件内容当代码执行
 */
function readConst(name, fallback) {
  const m = typesSrc.match(new RegExp(`${name}:\\s*([^,\\n]+)`));
  if (!m) return fallback;
  const val = parseFloat(m[1].trim());
  return Number.isFinite(val) ? val : fallback;
}
const CFG = {
  HOOK_SWING_SPEED:   readConst('HOOK_SWING_SPEED', 1.5),
  // HOOK_MAX_ANGLE 在 types.ts 是 `Math.PI * 4 / 9` 表达式，parseFloat 解析不出，固定取计算后的值
  HOOK_MAX_ANGLE:     Math.PI * 4 / 9,
  HOOK_EXTEND_SPEED:  readConst('HOOK_EXTEND_SPEED', 400),
  HOOK_BASE_REEL_SPEED: readConst('HOOK_BASE_REEL_SPEED', 250),
  HOOK_MAX_LENGTH:    readConst('HOOK_MAX_LENGTH', 550),
  WEIGHT_FACTOR:      readConst('WEIGHT_FACTOR', 1.0),
  MINER_X:            readConst('MINER_X', 400),
  MINER_Y:            readConst('MINER_Y', 92),
  MA_TOP:    readConst('MINERAL_AREA_TOP', 225),
  MA_BOTTOM: readConst('MINERAL_AREA_BOTTOM', 500),
  MA_LEFT:   readConst('MINERAL_AREA_LEFT', 60),
  MA_RIGHT:  readConst('MINERAL_AREA_RIGHT', 740),
};

const LEVELS = [];
const levelRE = /\{\s*level:\s*(\d+),[\s\S]*?targetMoney:\s*(\d+)[\s\S]*?mineralCount:\s*(\d+)[\s\S]*?timeLimit:\s*(\d+)[\s\S]*?mineralWeights:\s*\[([\d,\s]+)\]/g;
for (const m of levelsSrc.matchAll(levelRE)) {
  LEVELS.push({
    level: parseInt(m[1]),
    targetMoney: parseInt(m[2]),
    mineralCount: parseInt(m[3]),
    timeLimit: parseInt(m[4]),
    weights: m[5].split(',').map(s => parseInt(s.trim())),
  });
}

const DIFFICULTIES = [];
// 容忍配置项之间夹注释行：用 [\s\S]*? 跳过任意中间内容
const diffRE = /\[Difficulty\.(\w+)\]:\s*\{[\s\S]*?valueScale:\s*([\d.]+)[\s\S]*?timeScale:\s*([\d.]+)[\s\S]*?weightFactorScale:\s*([\d.]+)[\s\S]*?motionSpeedScale:\s*([\d.]+)[\s\S]*?mineralBudgetRatio:\s*([\d.]+)[\s\S]*?largeWeightScale:\s*([\d.]+)[\s\S]*?goldRefillWeights:\s*\[([\d.,\s]+)\][\s\S]*?mineralBudgetCap:\s*([\d.]+)/g;
for (const m of difficultySrc.matchAll(diffRE)) {
  if (m[1] === 'INFINITE') continue;
  DIFFICULTIES.push({
    id: m[1],
    valueScale: parseFloat(m[2]),
    timeScale: parseFloat(m[3]),
    weightFactorScale: parseFloat(m[4]),
    motionSpeedScale: parseFloat(m[5]),
    ratio: parseFloat(m[6]),
    largeWeightScale: parseFloat(m[7]),
    goldRefillWeights: m[8].split(',').map(s => parseFloat(s.trim())),
    cap: parseFloat(m[9]),
  });
}
console.log(`📊 解析到 ${LEVELS.length} 关 / ${DIFFICULTIES.length} 档难度`);
console.log(`⚙️  GAME_CONFIG: swing=${CFG.HOOK_SWING_SPEED}, maxAngle=${(CFG.HOOK_MAX_ANGLE * 180 / Math.PI).toFixed(0)}°, reel=${CFG.HOOK_BASE_REEL_SPEED}, weight=${CFG.WEIGHT_FACTOR}\n`);

// 防御：新增难度若未在 ERROR_TOPK / ERROR_TOLERANCE / EXPECTED_WIN_RATE 注册，会导致仿真用 fallback 值
for (const diff of DIFFICULTIES) {
  if (ERROR_TOPK[diff.id] === undefined) console.warn(`⚠️ 难度 ${diff.id} 未注册 ERROR_TOPK，将使用 fallback=3`);
  if (ERROR_TOLERANCE[diff.id] === undefined) console.warn(`⚠️ 难度 ${diff.id} 未注册 ERROR_TOLERANCE`);
  if (EXPECTED_WIN_RATE[diff.id] === undefined) console.warn(`⚠️ 难度 ${diff.id} 未注册 EXPECTED_WIN_RATE`);
}

// ==================== 2. 矿物属性 ====================

const MINERAL_DATA = {
  GOLD_SMALL:  { value: 50,   weight: 0.3, radius: 20, isMistake: false },
  GOLD_MEDIUM: { value: 250,  weight: 1.2, radius: 30, isMistake: false },
  GOLD_LARGE:  { value: 500,  weight: 2.5, radius: 42, isMistake: false },
  DIAMOND:     { value: 600,  weight: 0.2, radius: 18, isMistake: false },
  STONE:       { value: 15,   weight: 1.5, radius: 28, isMistake: true },  // 玩家踩雷
  BOMB:        { value: -100, weight: 0.2, radius: 18, isMistake: true },
  MYSTERY_BAG: { value: 125,  weight: 0.2, radius: 18, isMistake: false },
  BONE:        { value: 11,   weight: 1.2, radius: 24, isMistake: true },
  MOUSE:       { value: 20,   weight: 0.3, radius: 16, isMistake: false },
  MOLE:        { value: 50,   weight: 0.5, radius: 20, isMistake: false },
};
const TYPE_ORDER = ['GOLD_SMALL', 'GOLD_MEDIUM', 'GOLD_LARGE', 'DIAMOND', 'STONE', 'BOMB', 'MYSTERY_BAG', 'BONE', 'MOUSE', 'MOLE'];
const UPGRADE_CHAIN = ['BONE', 'STONE', 'MOUSE', 'MOLE', 'GOLD_SMALL', 'GOLD_MEDIUM', 'GOLD_LARGE'];

// ==================== 3. 工具 ====================

function makeRNG(seed) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function weightedPick(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}
/** 按难度独立配置的金块保底权重选品种（与运行时 GameScene.pickGoldVariant 一致） */
function pickGoldVariant(refillWeights, rng) {
  return ['GOLD_SMALL', 'GOLD_MEDIUM', 'GOLD_LARGE'][weightedPick(refillWeights, rng)];
}

// ==================== 4. 矿物生成（带坐标） ====================

function generateMinerals(level, diff, seed) {
  const rng = makeRNG(seed);
  const minerals = [];
  function isOverlap(x, y, r) {
    for (const m of minerals) {
      const dx = x - m.x, dy = y - m.y;
      if (Math.sqrt(dx * dx + dy * dy) < (r + m.r) * 0.85) return true;
    }
    return false;
  }
  function place(type) {
    const data = MINERAL_DATA[type];
    if (!data) return false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = CFG.MA_LEFT + rng() * (CFG.MA_RIGHT - CFG.MA_LEFT);
      const y = CFG.MA_TOP + rng() * (CFG.MA_BOTTOM - CFG.MA_TOP);
      if (!isOverlap(x, y, data.radius)) {
        minerals.push({ type, x, y, value: data.value, weight: data.weight, r: data.radius, isMistake: data.isMistake });
        return true;
      }
    }
    return false;
  }
  // 1) 基础生成（应用 largeWeightScale）
  const lws = diff.largeWeightScale;
  const adjustedWeights = [...level.weights];
  adjustedWeights[1] = Math.max(1, Math.round(adjustedWeights[1] * lws));
  adjustedWeights[2] = Math.max(0, Math.round(adjustedWeights[2] * lws));
  adjustedWeights[3] = Math.max(0, Math.round(adjustedWeights[3] * lws));
  for (let i = 0; i < level.mineralCount; i++) place(TYPE_ORDER[weightedPick(adjustedWeights, rng)]);

  // 2) 金块保底
  const earning = level.level === 1 ? level.targetMoney : level.targetMoney - LEVELS[level.level - 2].targetMoney;
  const goldBudget = (earning * diff.ratio) / diff.valueScale;
  const goldTotal = () => minerals.filter(m => ['GOLD_SMALL', 'GOLD_MEDIUM', 'GOLD_LARGE'].includes(m.type)).reduce((s, m) => s + m.value, 0);
  let append = 0;
  while (goldTotal() < goldBudget && append < 30) { if (!place(pickGoldVariant(diff.goldRefillWeights, rng))) break; append++; }

  // 3) cap 降级
  const goldCap = goldBudget * diff.cap;
  let downgrades = 0;
  while (goldTotal() > goldCap && downgrades < 500) {
    let maxVal = -Infinity, maxIdx = -1;
    for (let i = 0; i < minerals.length; i++) {
      const ul = UPGRADE_CHAIN.indexOf(minerals[i].type);
      if (ul <= UPGRADE_CHAIN.indexOf('GOLD_SMALL')) continue;
      if (minerals[i].value > maxVal) { maxVal = minerals[i].value; maxIdx = i; }
    }
    if (maxIdx < 0) break;
    const oldType = minerals[maxIdx].type;
    const newType = UPGRADE_CHAIN[UPGRADE_CHAIN.indexOf(oldType) - 1];
    const data = MINERAL_DATA[newType];
    minerals[maxIdx] = { ...minerals[maxIdx], type: newType, value: data.value, weight: data.weight, r: data.radius, isMistake: data.isMistake };
    downgrades++;
  }
  return { minerals, earning };
}

// ==================== 5. 抓取时间估算 + 遮挡 ====================

function estimateGrab(m, diff) {
  const dx = m.x - CFG.MINER_X, dy = m.y - CFG.MINER_Y;
  const angle = Math.atan2(dx, dy);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const omega = CFG.HOOK_SWING_SPEED * diff.motionSpeedScale;
  const wait = Math.PI / (2 * omega);  // 平均等待半周期
  const extend = dist / CFG.HOOK_EXTEND_SPEED;
  const reelSpeed = CFG.HOOK_BASE_REEL_SPEED / (1 + m.weight * CFG.WEIGHT_FACTOR * diff.weightFactorScale);
  const reel = dist / reelSpeed;
  return { angle, dist, total: wait + extend + reel };
}

/** 射线遮挡：钩爪沿 angle 方向射出，返回最先碰到的可抓矿物 */
function rayHit(angle, minerals) {
  if (Math.abs(angle) > CFG.HOOK_MAX_ANGLE * 0.95) return null;
  let best = null, bestProj = Infinity;
  const cs = Math.cos(angle), sn = Math.sin(angle);
  for (const m of minerals) {
    if (m._taken) continue;
    const dx = m.x - CFG.MINER_X, dy = m.y - CFG.MINER_Y;
    const proj = dx * sn + dy * cs;
    if (proj <= 0) continue;
    const perp = Math.abs(dx * cs - dy * sn);
    if (perp > m.r) continue;
    if (proj < bestProj) { bestProj = proj; best = m; }
  }
  return best;
}

// ==================== 6. 三层模型 ====================

/** 贪心理论上限：按价值排序，忽略时间/角度 */
function simulateGreedy(level, diff, seed) {
  const { minerals, earning } = generateMinerals(level, diff, seed);
  const values = minerals.map(m => m.value * diff.valueScale).filter(v => v > 0).sort((a, b) => b - a);
  let acc = 0, picked = 0;
  for (const v of values) { if (acc >= earning) break; acc += v; picked++; }
  return { won: acc >= earning, gained: acc, picked, total: minerals.length };
}

/** 完美玩家：时间 + 角度 + 重量 + 遮挡约束，但选择永远最优 */
function simulatePerfect(level, diff, seed) {
  const { minerals, earning } = generateMinerals(level, diff, seed);
  const timeLimit = level.timeLimit * diff.timeScale;
  let timeLeft = timeLimit, gained = 0, picked = 0, mistakes = 0;
  while (timeLeft > 0 && gained < earning) {
    // 评分 = 净价值 / 时间，且只看正价 / 非石头
    let bestRoi = -Infinity, bestTarget = null, bestT = null;
    for (const m of minerals) {
      if (m._taken) continue;
      const t = estimateGrab(m, diff);
      if (t.total > timeLeft || Math.abs(t.angle) > CFG.HOOK_MAX_ANGLE * 0.95) continue;
      const v = m.value * diff.valueScale;
      if (v <= 0) continue;
      // 完美玩家也避开 STONE（除非真没东西可抓）
      const adj = m.type === 'STONE' ? v * 0.1 : (m.type === 'BONE' ? v * 0.3 : v);
      const roi = adj / t.total;
      if (roi > bestRoi) { bestRoi = roi; bestTarget = m; bestT = t; }
    }
    if (!bestTarget) break;
    // 射线检查是否被遮挡
    const hit = rayHit(bestT.angle, minerals);
    const grabbed = (hit && hit !== bestTarget) ? hit : bestTarget;
    const gT = (grabbed === bestTarget) ? bestT : estimateGrab(grabbed, diff);
    timeLeft -= gT.total;
    grabbed._taken = true;
    picked++;
    gained += grabbed.value * diff.valueScale;
    if (grabbed.isMistake) mistakes++;
  }
  return { won: gained >= earning, gained, earning, picked, mistakes, timeUsed: timeLimit - timeLeft, timeLimit };
}

/** 失误玩家：从 ROI Top-K 中按权重随机抽（眼力有限），且可能瞄歪 */
function simulateImperfect(level, diff, seed) {
  const { minerals, earning } = generateMinerals(level, diff, seed);
  const timeLimit = level.timeLimit * diff.timeScale;
  const topK = ERROR_TOPK[diff.id] ?? 3;
  const rng = makeRNG(seed + 7777);
  let timeLeft = timeLimit, gained = 0, picked = 0, mistakes = 0;
  while (timeLeft > 0 && gained < earning) {
    // 收集所有可瞄准矿物（含 STONE，因为玩家可能瞄歪/被迫接受）
    const candidates = [];
    for (const m of minerals) {
      if (m._taken) continue;
      const t = estimateGrab(m, diff);
      if (t.total > timeLeft || Math.abs(t.angle) > CFG.HOOK_MAX_ANGLE * 0.95) continue;
      const v = m.value * diff.valueScale;
      // 玩家心理评估：STONE/BONE 减权但不为零（可能被迫抓），BOMB 强烈避开
      let adj;
      if (m.type === 'BOMB') adj = -1000;
      else if (m.type === 'STONE') adj = v * 0.1;
      else if (m.type === 'BONE') adj = v * 0.3;
      else adj = Math.max(v, 0);
      candidates.push({ m, t, roi: adj / t.total });
    }
    if (candidates.length === 0) break;
    candidates.sort((a, b) => b.roi - a.roi);
    // 从 Top-K 中按 ROI 权重抽（眼力差越选越靠下）
    const pool = candidates.slice(0, Math.min(topK, candidates.length));
    const weights = pool.map((c, i) => 1 / (i + 1));  // 1, 1/2, 1/3, ...
    const choice = pool[weightedPick(weights, rng)];
    // 模拟"瞄准角度有 ±5° 抖动"
    const aimError = (rng() - 0.5) * (Math.PI / 18); // ±5°（PI/18 = 10°，(rng()-0.5) 范围 [-0.5, 0.5)）
    const aim = choice.t.angle + aimError;
    const hit = rayHit(aim, minerals);
    const grabbed = hit || choice.m;
    const gT = (grabbed === choice.m) ? choice.t : estimateGrab(grabbed, diff);
    timeLeft -= gT.total;
    grabbed._taken = true;
    picked++;
    gained += grabbed.value * diff.valueScale;
    if (grabbed.isMistake) mistakes++;
  }
  return { won: gained >= earning, gained, earning, picked, mistakes, timeUsed: timeLimit - timeLeft, timeLimit };
}

// ==================== 7. 跑分析 ====================

const SAMPLES = 100;
const results = {};
for (const diff of DIFFICULTIES) {
  results[diff.id] = { greedy: [], perfect: [], imperfect: [] };
  for (const level of LEVELS) {
    const acc = { greedy: { win: 0 }, perfect: { win: 0, time: 0, mist: 0, cmpl: 0 }, imperfect: { win: 0, time: 0, mist: 0, cmpl: 0, mistOk: 0 } };
    for (let s = 0; s < SAMPLES; s++) {
      const seed = level.level * 1000 + s;
      const g = simulateGreedy(level, diff, seed);
      const p = simulatePerfect(level, diff, seed);
      const i = simulateImperfect(level, diff, seed);
      if (g.won) acc.greedy.win++;
      if (p.won) acc.perfect.win++;
      acc.perfect.time += p.timeUsed; acc.perfect.mist += p.mistakes; acc.perfect.cmpl += p.gained / p.earning;
      if (i.won) acc.imperfect.win++;
      acc.imperfect.time += i.timeUsed; acc.imperfect.mist += i.mistakes; acc.imperfect.cmpl += i.gained / i.earning;
      // 失误容忍内的通关：通关 + 失误 ≤ 容忍
      if (i.won && i.mistakes <= ERROR_TOLERANCE[diff.id]) acc.imperfect.mistOk++;
    }
    results[diff.id].greedy.push({ level: level.level, winRate: acc.greedy.win / SAMPLES });
    results[diff.id].perfect.push({ level: level.level, winRate: acc.perfect.win / SAMPLES, avgMist: acc.perfect.mist / SAMPLES, avgCmpl: acc.perfect.cmpl / SAMPLES, avgTime: acc.perfect.time / SAMPLES, timeLimit: level.timeLimit * diff.timeScale });
    results[diff.id].imperfect.push({ level: level.level, winRate: acc.imperfect.win / SAMPLES, avgMist: acc.imperfect.mist / SAMPLES, avgCmpl: acc.imperfect.cmpl / SAMPLES, avgTime: acc.imperfect.time / SAMPLES, mistOkRate: acc.imperfect.mistOk / SAMPLES, timeLimit: level.timeLimit * diff.timeScale });
  }
}

// ==================== 8. 输出 ====================

console.log('========== 一、贪心理论通关率（数值天花板，操作完美无限制） ==========\n');
console.log('关卡 | NOVICE | NORMAL | HARD   | EXPERT');
console.log('-----|--------|--------|--------|-------');
for (const level of LEVELS) {
  const row = [`L${level.level.toString().padStart(2)}`];
  for (const diff of DIFFICULTIES) {
    const r = results[diff.id].greedy[level.level - 1];
    row.push(`${(r.winRate * 100).toFixed(0).padStart(4)}%`);
  }
  console.log(row.join(' | '));
}

console.log('\n========== 二、完美玩家通关率（含时间/角度/重量/遮挡） ==========\n');
console.log('关卡 | NOVICE         | NORMAL         | HARD           | EXPERT');
console.log('-----|----------------|----------------|----------------|---------------');
for (const level of LEVELS) {
  const row = [`L${level.level.toString().padStart(2)}`];
  for (const diff of DIFFICULTIES) {
    const r = results[diff.id].perfect[level.level - 1];
    const wr = (r.winRate * 100).toFixed(0).padStart(3);
    const tm = r.avgTime.toFixed(0).padStart(2);
    const lm = r.timeLimit.toFixed(0);
    row.push(`${wr}% (${tm}/${lm}s)   `);
  }
  console.log(row.join(' | '));
}

console.log('\n========== 三、失误玩家通关率（Top-K 抽取 + 瞄准抖动） ==========\n');
console.log('关卡 | NOVICE 通关%(失误) | NORMAL              | HARD                | EXPERT');
console.log('-----|-------------------|---------------------|---------------------|--------------------');
for (const level of LEVELS) {
  const row = [`L${level.level.toString().padStart(2)}`];
  for (const diff of DIFFICULTIES) {
    const r = results[diff.id].imperfect[level.level - 1];
    const wr = (r.winRate * 100).toFixed(0).padStart(3);
    const mst = r.avgMist.toFixed(1).padStart(4);
    row.push(`${wr}% (失误${mst}/${ERROR_TOLERANCE[diff.id]})  `);
  }
  console.log(row.join(' | '));
}

// ==================== 9. 难度汇总 + 期望对比 ====================

console.log('\n========== 四、各档难度汇总 vs 期望基准 ==========\n');
console.log('难度    | 期望通关 | 贪心 | 完美玩家 | 失误玩家 | 失误容忍通关 | 平均失误/容忍 | 用时%   | 评估');
console.log('--------|---------|------|---------|---------|------------|--------------|---------|------');
for (const diff of DIFFICULTIES) {
  const id = diff.id;
  const arr = results[id];
  const greedy   = arr.greedy.reduce((s, r) => s + r.winRate, 0) / arr.greedy.length;
  const perfect  = arr.perfect.reduce((s, r) => s + r.winRate, 0) / arr.perfect.length;
  const imperf   = arr.imperfect.reduce((s, r) => s + r.winRate, 0) / arr.imperfect.length;
  const mistOk   = arr.imperfect.reduce((s, r) => s + r.mistOkRate, 0) / arr.imperfect.length;
  const avgMist  = arr.imperfect.reduce((s, r) => s + r.avgMist, 0) / arr.imperfect.length;
  const avgTimeR = arr.imperfect.reduce((s, r) => s + r.avgTime / r.timeLimit, 0) / arr.imperfect.length;
  const expected = EXPECTED_WIN_RATE[id];
  const tol = ERROR_TOLERANCE[id];
  const delta = mistOk - expected;
  let verdict;
  if (Math.abs(delta) <= 0.05) verdict = '✅ 达标';
  else if (delta > 0)          verdict = `⬆️ 偏易 (+${(delta * 100).toFixed(0)}%)`;
  else                         verdict = `⬇️ 偏难 (${(delta * 100).toFixed(0)}%)`;
  console.log(
    `${id.padEnd(7)} | ${(expected * 100).toFixed(0).padStart(6)}%  | ${(greedy * 100).toFixed(0).padStart(3)}% | ${(perfect * 100).toFixed(0).padStart(6)}%  | ${(imperf * 100).toFixed(0).padStart(6)}%  | ${(mistOk * 100).toFixed(0).padStart(10)}%  | ${avgMist.toFixed(1).padStart(7)}/${tol.toString().padEnd(3)}  | ${(avgTimeR * 100).toFixed(0).padStart(5)}%  | ${verdict}`
  );
}

// ==================== 10. 危险关卡 TopN ====================

console.log('\n========== 五、危险关卡（失误容忍通关率 < 期望 - 15%） ==========\n');
for (const diff of DIFFICULTIES) {
  const expected = EXPECTED_WIN_RATE[diff.id];
  const threshold = Math.max(0, expected - 0.15);
  const danger = results[diff.id].imperfect
    .filter(r => r.mistOkRate < threshold)
    .sort((a, b) => a.mistOkRate - b.mistOkRate);
  if (danger.length === 0) { console.log(`${diff.id.padEnd(7)}：✅ 全部关卡通关率达标`); continue; }
  console.log(`${diff.id.padEnd(7)}（期望≥${(expected * 100).toFixed(0)}%，警戒线<${(threshold * 100).toFixed(0)}%）：${danger.length} 关需关注`);
  for (const r of danger.slice(0, 6)) {
    const earn = LEVELS[r.level - 1].targetMoney - (r.level > 1 ? LEVELS[r.level - 2].targetMoney : 0);
    console.log(`   L${r.level.toString().padStart(2)} 通关 ${(r.mistOkRate * 100).toFixed(0)}% / 完成度 ${(r.avgCmpl * 100).toFixed(0)}% / 失误 ${r.avgMist.toFixed(1)} (earning=$${earn})`);
  }
}

// ==================== 11. HARD 零碎化诊断 ====================

console.log('\n========== 六、HARD 零碎化诊断（场上 GOLD_SMALL 占比） ==========\n');
console.log('关卡 | HARD 场上总数 | GOLD_SMALL% | 大件(MED+LRG+DIA)%');
console.log('-----|---------------|-------------|---------------------');
const hardDiff = DIFFICULTIES.find(d => d.id === 'HARD');
if (!hardDiff) {
  console.warn('⚠️ 找不到 HARD 难度配置，跳过零碎化诊断');
} else {
  for (const level of LEVELS) {
    let total = 0, sm = 0, lg = 0;
    for (let s = 0; s < 30; s++) {
      const { minerals } = generateMinerals(level, hardDiff, level.level * 1000 + s);
      total += minerals.length;
      for (const m of minerals) {
        if (m.type === 'GOLD_SMALL') sm++;
        if (['GOLD_MEDIUM', 'GOLD_LARGE', 'DIAMOND'].includes(m.type)) lg++;
      }
    }
    console.log(`L${level.level.toString().padStart(2)} | ${(total / 30).toFixed(0).padStart(10)}    | ${((sm / total) * 100).toFixed(0).padStart(8)}%   | ${((lg / total) * 100).toFixed(0).padStart(17)}%`);
  }
}

console.log('\n💡 解读：');
console.log('  - 贪心通关率 = 数值天花板，<100% 表示场上总值不够 target，必崩。');
console.log('  - 完美玩家 = 操作天花板，<100% 表示时间/角度物理不够。');
console.log('  - 失误玩家 = 真实评估；失误容忍通关 = 在合理失误数内通关的概率。');
console.log('  - "✅ 达标"= 失误容忍通关率落在期望 ±5% 内；偏易需提难，偏难需放松。');
