/**
 * 难度系统
 * 5 档难度（新手/一般/困难/高手/无限火力）的参数配置表
 * 详见 docs/design/difficulty-system.md
 */

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
  /** 矿物总价值相对 target 的最低保障倍率（用于矿物预算驱动生成器） */
  mineralBudgetRatio: number;
  /** 是否开放商店 */
  shopEnabled: boolean;
  /** 道具是否永久不消耗（无限火力娱乐模式） */
  infiniteItems: boolean;
  /** 是否硬核难度：关卡结束清除全部 persistent 道具 + 商店隐藏摇晃饮料 + 摇晃饮料效果强制 return */
  isHardcore: boolean;
  /** UI 主色（卡片差异化展示） */
  color: string;
}

/** 难度配置表 */
export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  [Difficulty.NOVICE]: {
    id: Difficulty.NOVICE,
    name: '新手',
    description: '金额翻倍 + 无重量影响，轻松上手',
    valueScale: 2.0,
    timeScale: 1.0,
    weightFactorScale: 0,
    mineralBudgetRatio: 3.0,
    shopEnabled: true,
    infiniteItems: false,
    isHardcore: false,
    color: '#7CFF7C',
  },
  [Difficulty.NORMAL]: {
    id: Difficulty.NORMAL,
    name: '一般',
    description: '原汁原味经典体验',
    valueScale: 1.0,
    timeScale: 1.0,
    weightFactorScale: 1.0,
    mineralBudgetRatio: 3.0,
    shopEnabled: true,
    infiniteItems: false,
    isHardcore: false,
    color: '#7CC4FF',
  },
  [Difficulty.HARD]: {
    id: Difficulty.HARD,
    name: '困难',
    description: '金额减半 + 重物显著慢，精打细算',
    valueScale: 0.5,
    timeScale: 1.0,
    weightFactorScale: 1.5,
    mineralBudgetRatio: 2.25,
    shopEnabled: true,
    infiniteItems: false,
    isHardcore: true,
    color: '#FFD700',
  },
  [Difficulty.EXPERT]: {
    id: Difficulty.EXPERT,
    name: '高手',
    description: '金额减半 + 时间减半 + 重物极慢',
    valueScale: 0.5,
    timeScale: 0.5,
    weightFactorScale: 2.0,
    mineralBudgetRatio: 1.75,
    shopEnabled: true,
    infiniteItems: false,
    isHardcore: true,
    color: '#FF6464',
  },
  [Difficulty.INFINITE]: {
    id: Difficulty.INFINITE,
    name: '无限火力',
    description: '所有道具永久开启，娱乐模式',
    valueScale: 1.0,
    timeScale: 1.0,
    weightFactorScale: 0,
    mineralBudgetRatio: 3.0,
    shopEnabled: false,
    infiniteItems: true,
    isHardcore: false,
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
