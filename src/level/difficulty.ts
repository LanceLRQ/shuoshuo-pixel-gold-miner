/**
 * 难度系统
 * 5 档难度（新手/一般/困难/高手/无限火力）的参数配置表
 * 详见 docs/design/20260518_difficulty-system.md
 *
 * 注：难度显示名/描述统一从 src/ui/strings.ts 引用，方便集中维护。
 */

import { STRINGS } from '../ui/strings';

/** 难度等级 */
export enum Difficulty {
  NOVICE = 'NOVICE',
  NORMAL = 'NORMAL',
  HARD = 'HARD',
  EXPERT = 'EXPERT',
  INFINITE = 'INFINITE',
}

/** 难度配置接口 */
export interface DifficultyConfig {
  /** 难度 ID */
  id: Difficulty;
  /** 显示名（中文） */
  name: string;
  /** 副标题/描述 */
  description: string;
  /** 矿物金额乘数（玩家最终看到的金额按此缩放） */
  valueScale: number;
  /** 时间乘数（关卡 timeLimit 按此缩放） */
  timeScale: number;
  /** 重量影响系数倍率（与 GAME_CONFIG.WEIGHT_FACTOR 相乘，控制重物收回慢的程度） */
  weightFactorScale: number;
  /**
   * 运动速度倍率：同时驱动钩爪甩动速度（Hook.swingSpeedScale）和移动型矿物（猪子/水晶蟹）的水平速度。
   * HARD=1.0 为基准；NORMAL/NOVICE/INFINITE=0.65（更慢更宽松）；EXPERT=1.3（节奏更紧）。
   */
  motionSpeedScale: number;
  /** 金块（GOLD_SMALL/MEDIUM/LARGE，不含钻石）总金额相对 target 的最低保障倍率 */
  mineralBudgetRatio: number;
  /** 大件矿物权重倍率（GOLD_MEDIUM/LARGE/DIAMOND），值越小高难度越多小件 */
  largeWeightScale: number;
  /**
   * 金块保底阶段品种权重 [SMALL, MEDIUM, LARGE]，与 largeWeightScale 解耦。
   * 解决 2026-05-24 前的零碎化问题：原保底逻辑复用 lws，HARD/EXPERT 几乎只灌 SMALL；
   * 现按难度独立指定，保证场上有稳定大件诱惑，玩家不再面对"小金海"。
   */
  goldRefillWeights: readonly [number, number, number];
  /** 矿物总价值上限倍率（相对 budget），超过时强制降级最高价矿物。1.10 = 上限 110% budget */
  mineralBudgetCap: number;
  /** 是否开放商店 */
  shopEnabled: boolean;
  /** 道具是否永久不消耗（无限火力娱乐模式） */
  infiniteItems: boolean;
  /** 是否硬核难度：关卡结束清除全部 persistent 道具 + 商店隐藏摇晃饮料 + 摇晃饮料效果强制 return */
  isHardcore: boolean;
  /** 排行榜折算权重（总榜用，高手难度拿高分更难 → 系数更高） */
  leaderboardWeight: number;
  /** UI 主色（卡片差异化展示） */
  color: string;
}

/** 难度配置表 */
export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  // 新数值经过 analyze-difficulty.mjs 模拟验证（贪心抓取率达 NOVICE 10% / NORMAL 33% / HARD 60% / EXPERT 75%）
  [Difficulty.NOVICE]: {
    id: Difficulty.NOVICE,
    name: STRINGS.difficulty.list.novice.name,
    description: STRINGS.difficulty.list.novice.description,
    valueScale: 1.5,
    timeScale: 1.0,
    weightFactorScale: 0,
    motionSpeedScale: 0.65,
    // 2026-05-24 二次调优：原 ratio 2.0 让 NOVICE 用时仅 18%，资源过剩；降至 1.7 让玩家更主动找大件
    mineralBudgetRatio: 1.7,
    largeWeightScale: 1.0,
    goldRefillWeights: [0.20, 0.35, 0.45],  // 大件为主，玩家上手轻松
    mineralBudgetCap: 1.40,  // 上限较宽（允许场上富裕）
    shopEnabled: true,
    infiniteItems: false,
    isHardcore: false,
    leaderboardWeight: 0.4,
    color: '#7CFF7C',
  },
  [Difficulty.NORMAL]: {
    id: Difficulty.NORMAL,
    name: STRINGS.difficulty.list.normal.name,
    description: STRINGS.difficulty.list.normal.description,
    // 2026-05-24 调优：原 ratio 1.5/scale 0.85 让 NORMAL 通关 94%（期望 80%）
    // 三轮迭代后定为 ratio 1.0 / valueScale 0.75，让玩家必须抓 ~30% 矿物
    valueScale: 0.75,
    timeScale: 1.0,
    weightFactorScale: 1.0,
    motionSpeedScale: 0.65,
    mineralBudgetRatio: 1.0,
    largeWeightScale: 0.35,
    goldRefillWeights: [0.40, 0.40, 0.20],  // 均衡梯度
    mineralBudgetCap: 1.20,
    shopEnabled: true,
    infiniteItems: false,
    isHardcore: false,
    leaderboardWeight: 1.0,
    color: '#7CC4FF',
  },
  [Difficulty.HARD]: {
    id: Difficulty.HARD,
    name: STRINGS.difficulty.list.hard.name,
    description: STRINGS.difficulty.list.hard.description,
    // 2026-05-24 二次调优：一轮 valueScale 0.55 仍偏易 +11%，二轮收到 0.50
    valueScale: 0.50,
    timeScale: 1.0,
    weightFactorScale: 1.5,
    motionSpeedScale: 1.0,
    mineralBudgetRatio: 1.25,
    largeWeightScale: 0.25,
    goldRefillWeights: [0.55, 0.35, 0.10],  // 仍偏 SMALL，但留出 MEDIUM 通道，避免"小金海"
    mineralBudgetCap: 1.20,
    shopEnabled: true,
    infiniteItems: false,
    isHardcore: true,
    leaderboardWeight: 2.5,
    color: '#FFD700',
  },
  [Difficulty.EXPERT]: {
    id: Difficulty.EXPERT,
    name: STRINGS.difficulty.list.expert.name,
    description: STRINGS.difficulty.list.expert.description,
    // 2026-05-24 重做：原 valueScale 0.15 让场上堆 39-54 个矿物物理不可通关（0%）
    // 三轮迭代后定为 valueScale 0.40 / cap 1.30，达到 45% 期望通关率
    valueScale: 0.40,
    timeScale: 1.0,
    weightFactorScale: 1.5,
    motionSpeedScale: 1.3,
    mineralBudgetRatio: 1.25,
    largeWeightScale: 0.05,
    goldRefillWeights: [0.55, 0.35, 0.10],  // 与 HARD 同梯度，避免高难度退化为"小金海"
    mineralBudgetCap: 1.30,
    shopEnabled: true,
    infiniteItems: false,
    isHardcore: true,
    leaderboardWeight: 3.5,
    color: '#FF6464',
  },
  [Difficulty.INFINITE]: {
    id: Difficulty.INFINITE,
    name: STRINGS.difficulty.list.infinite.name,
    description: STRINGS.difficulty.list.infinite.description,
    valueScale: 1.0,
    timeScale: 1.0,
    weightFactorScale: 0,
    motionSpeedScale: 0.65,
    mineralBudgetRatio: 3.0,
    goldRefillWeights: [0.20, 0.35, 0.45],  // 同 NOVICE 大件为主，娱乐模式
    largeWeightScale: 1.0,
    mineralBudgetCap: 2.0,  // 几乎无限制
    shopEnabled: false,
    infiniteItems: true,
    isHardcore: false,
    leaderboardWeight: 0.3,
    color: '#C77CFF',
  },
};

/** 默认难度（旧存档迁移时使用） */
export const DEFAULT_DIFFICULTY = Difficulty.NORMAL;

/** 难度展示顺序（用于难度选择界面卡片排列） */
export const DIFFICULTY_DISPLAY_ORDER: Difficulty[] = [
  Difficulty.NOVICE,
  Difficulty.NORMAL,
  Difficulty.HARD,
  Difficulty.EXPERT,
  Difficulty.INFINITE,
];

/** 按 ID 获取配置（带默认 fallback） */
export function getDifficultyConfig(id: Difficulty): DifficultyConfig {
  return DIFFICULTY_CONFIGS[id] ?? DIFFICULTY_CONFIGS[DEFAULT_DIFFICULTY];
}
