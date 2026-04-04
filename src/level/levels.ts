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
    mineralWeights: [35, 15, 3, 25, 5, 7, 10], // 友好：多小金块少炸弹
  },
  {
    level: 2,
    targetMoney: 250,
    mineralCount: 12,
    timeLimit: 60,
    mineralWeights: [30, 15, 4, 25, 6, 10, 10],
  },
  {
    level: 3,
    targetMoney: 400,
    mineralCount: 13,
    timeLimit: 60,
    mineralWeights: [28, 14, 5, 25, 8, 10, 10],
  },
  {
    level: 4,
    targetMoney: 550,
    mineralCount: 14,
    timeLimit: 55,
  },
  {
    level: 5,
    targetMoney: 700,
    mineralCount: 15,
    timeLimit: 55,
  },
  {
    level: 6,
    targetMoney: 900,
    mineralCount: 16,
    timeLimit: 55,
    mineralWeights: [25, 12, 6, 25, 10, 12, 10], // 增加难度
  },
  {
    level: 7,
    targetMoney: 1100,
    mineralCount: 17,
    timeLimit: 50,
  },
  {
    level: 8,
    targetMoney: 1350,
    mineralCount: 18,
    timeLimit: 50,
  },
  {
    level: 9,
    targetMoney: 1600,
    mineralCount: 19,
    timeLimit: 50,
    mineralWeights: [22, 10, 7, 28, 12, 11, 10], // 更难
  },
  {
    level: 10,
    targetMoney: 2000,
    mineralCount: 20,
    timeLimit: 45,
    mineralWeights: [20, 10, 8, 30, 12, 10, 10], // 最终关
  },
];

/** 获取关卡配置（索引 0-based） */
export function getLevelConfig(level: number): LevelConfig {
  const index = Math.min(level - 1, LEVELS.length - 1);
  return LEVELS[index]!;
}

/** 总关卡数 */
export const TOTAL_LEVELS = LEVELS.length;
