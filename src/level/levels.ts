/**
 * 关卡数据配置
 * 至少 10 关，难度递增
 */

/** 关卡配置接口 */
export interface LevelConfig {
  /** 关卡编号（1-based） */
  level: number;
  /** 目标金额 */
  targetMoney: number;
  /** 矿物数量 */
  mineralCount: number;
  /** 时间限制（秒） */
  timeLimit: number;
  /** 矿物权重覆盖（可选） */
  mineralWeights?: number[];
}

/** 全部关卡配置 */
export const LEVELS: LevelConfig[] = [
  {
    level: 1,
    targetMoney: 150,
    mineralCount: 10,
    timeLimit: 60,
    // 小金/中金/大金/钻/石/炸/袋/骨/鼠/鼹
    mineralWeights: [28, 10, 8, 2, 22, 4, 6, 8, 6, 6], // 友好：多小金块少炸弹
  },
  {
    level: 2,
    targetMoney: 300,
    mineralCount: 12,
    timeLimit: 60,
    mineralWeights: [26, 10, 8, 3, 22, 5, 7, 7, 6, 6],
  },
  {
    level: 3,
    targetMoney: 450,
    mineralCount: 13,
    timeLimit: 60,
    mineralWeights: [24, 10, 8, 4, 24, 6, 7, 6, 6, 5],
  },
  {
    level: 4,
    targetMoney: 650,
    mineralCount: 14,
    timeLimit: 55,
    mineralWeights: [22, 10, 8, 5, 26, 7, 7, 5, 5, 5],
  },
  {
    level: 5,
    targetMoney: 850,
    mineralCount: 15,
    timeLimit: 55,
    mineralWeights: [20, 10, 8, 5, 28, 8, 7, 5, 5, 4],
  },
  {
    level: 6,
    targetMoney: 1100,
    mineralCount: 16,
    timeLimit: 55,
    mineralWeights: [18, 8, 8, 6, 30, 9, 6, 5, 5, 5], // 增加难度
  },
  {
    level: 7,
    targetMoney: 1350,
    mineralCount: 17,
    timeLimit: 50,
    mineralWeights: [16, 8, 8, 6, 32, 10, 6, 5, 5, 4],
  },
  {
    level: 8,
    targetMoney: 1600,
    mineralCount: 18,
    timeLimit: 50,
    mineralWeights: [14, 8, 8, 7, 32, 11, 6, 5, 5, 4],
  },
  {
    level: 9,
    targetMoney: 1900,
    mineralCount: 19,
    timeLimit: 50,
    mineralWeights: [12, 6, 6, 8, 34, 12, 7, 5, 5, 5], // 更难
  },
  {
    level: 10,
    targetMoney: 2300,
    mineralCount: 20,
    timeLimit: 45,
    mineralWeights: [10, 6, 6, 8, 36, 14, 6, 5, 5, 4], // 最终关
  },
];

/** 获取关卡配置（索引 0-based） */
export function getLevelConfig(level: number): LevelConfig {
  const index = Math.min(level - 1, LEVELS.length - 1);
  return LEVELS[index]!;
}

/** 总关卡数 */
export const TOTAL_LEVELS = LEVELS.length;
