/**
 * 关卡数据配置
 * 21 关分 3 章节（详见 docs/design/20260519_chapter-system.md）
 *  - Ch1 水晶矿坑（L1-L7）：友好引入段
 *  - Ch2 蟹潮海湾（L8-L14）：进入硬核段
 *  - Ch3 猪猪王座（L15-L21）：终极挑战段
 */

/** 章节 ID */
export enum ChapterId {
  /** 水晶矿坑 L1-L7（矿洞地形，棕黄主调） */
  CRYSTAL_MINE = 'CRYSTAL_MINE',
  /** 蟹潮海湾 L8-L14（海洋地形，深蓝磷光） */
  CRAB_BAY = 'CRAB_BAY',
  /** 猪猪王座 L15-L21（粉色宫殿，公主吉祥物） */
  PIGGY_THRONE = 'PIGGY_THRONE',
}

/** 章节元信息（边界 + 显示名 + 过场剧情 + 过场配色） */
export interface ChapterInfo {
  readonly firstLevel: number;
  readonly lastLevel: number;
  readonly displayName: string;
  /** ChapterScene 过场显示的一句剧情 */
  readonly intro: string;
  /** ChapterScene 过场背景色（深色调，氛围底） */
  readonly bgColor: string;
  /** ChapterScene 过场强调色（章名 + 进度条） */
  readonly accentColor: string;
}

/** 章节信息表（颜色与 background.ts 章节色板呼应） */
export const CHAPTER_INFO: Record<ChapterId, ChapterInfo> = {
  [ChapterId.CRYSTAL_MINE]: {
    firstLevel: 1,
    lastLevel: 7,
    displayName: '水晶矿坑',
    intro: '矿工老王听说这里能挖到水晶宝石国的入口……',
    bgColor: '#2A1F14',     // 矿洞棕黑
    accentColor: '#FFD27C', // 暖金黄
  },
  [ChapterId.CRAB_BAY]: {
    firstLevel: 8,
    lastLevel: 14,
    displayName: '蟹潮海湾',
    intro: '传说海湾深处有水晶蟹守卫着前往王城的通道。',
    bgColor: '#0D1F35',     // 海湾深蓝
    accentColor: '#7CD9FF', // 海湾青蓝
  },
  [ChapterId.PIGGY_THRONE]: {
    firstLevel: 15,
    lastLevel: 21,
    displayName: '猪猪王座',
    intro: '粉色宫殿深处，猪猪公主抱着粉宝石打盹。',
    bgColor: '#3A2540',     // 王座紫暗
    accentColor: '#FFB6E5', // 粉色公主
  },
};

/** 章节展示顺序（用于按章节遍历） */
export const CHAPTER_ORDER: readonly ChapterId[] = [
  ChapterId.CRYSTAL_MINE,
  ChapterId.CRAB_BAY,
  ChapterId.PIGGY_THRONE,
];

/** 关卡配置接口 */
export interface LevelConfig {
  /** 关卡编号（1-based） */
  level: number;
  /** 所属章节 */
  chapter: ChapterId;
  /** 目标金额 */
  targetMoney: number;
  /** 矿物数量 */
  mineralCount: number;
  /** 时间限制（秒） */
  timeLimit: number;
  /** 矿物权重覆盖（小金/中金/大金/钻/石/炸/袋/骨/鼠/鼹），不填用默认权重 */
  mineralWeights?: number[];
  /** 是否章节末关：触发章节专属收藏品 +30% 概率倾斜 */
  isChapterFinale?: boolean;
}

/**
 * 全部关卡配置（21 关 3 章节）
 *
 * 数值曲线（NORMAL 难度基准）：
 *  Ch1 L1-L7  : target 150 → 1400, time 60 → 50, 矿数 10 → 17
 *  Ch2 L8-L14 : target 1700 → 4200, time 55 → 45, 矿数 18 → 21
 *  Ch3 L15-L21: target 4800 → 9500, time 50 → 40, 矿数 21 → 24
 *
 * 矿物权重总和恒定为 100，便于按比例直观调参。
 */
export const LEVELS: LevelConfig[] = [
  // ============== Ch1 水晶矿坑（L1-L7）友好引入 ==============
  {
    level: 1,
    chapter: ChapterId.CRYSTAL_MINE,
    targetMoney: 150,
    mineralCount: 10,
    timeLimit: 60,
    mineralWeights: [28, 10, 8, 2, 22, 4, 6, 8, 6, 6],
  },
  {
    level: 2,
    chapter: ChapterId.CRYSTAL_MINE,
    targetMoney: 300,
    mineralCount: 12,
    timeLimit: 60,
    mineralWeights: [26, 10, 8, 3, 22, 5, 7, 7, 6, 6],
  },
  {
    level: 3,
    chapter: ChapterId.CRYSTAL_MINE,
    targetMoney: 450,
    mineralCount: 13,
    timeLimit: 60,
    mineralWeights: [24, 10, 8, 4, 24, 6, 7, 6, 6, 5],
  },
  {
    level: 4,
    chapter: ChapterId.CRYSTAL_MINE,
    targetMoney: 650,
    mineralCount: 14,
    timeLimit: 55,
    mineralWeights: [22, 10, 8, 5, 26, 7, 7, 5, 5, 5],
  },
  {
    level: 5,
    chapter: ChapterId.CRYSTAL_MINE,
    targetMoney: 850,
    mineralCount: 15,
    timeLimit: 55,
    mineralWeights: [20, 10, 8, 5, 28, 8, 7, 5, 5, 4],
  },
  {
    level: 6,
    chapter: ChapterId.CRYSTAL_MINE,
    targetMoney: 1100,
    mineralCount: 16,
    timeLimit: 55,
    mineralWeights: [18, 8, 8, 6, 30, 9, 6, 5, 5, 5],
  },
  {
    level: 7,
    chapter: ChapterId.CRYSTAL_MINE,
    targetMoney: 1400,
    mineralCount: 17,
    timeLimit: 50,
    mineralWeights: [16, 8, 8, 6, 32, 10, 6, 5, 5, 4],
    isChapterFinale: true, // 水晶矿石 +30% 倾斜
  },

  // ============== Ch2 蟹潮海湾（L8-L14）进入硬核 ==============
  {
    level: 8,
    chapter: ChapterId.CRAB_BAY,
    targetMoney: 1700,
    mineralCount: 18,
    timeLimit: 55,
    mineralWeights: [14, 8, 8, 7, 32, 11, 6, 5, 5, 4],
  },
  {
    level: 9,
    chapter: ChapterId.CRAB_BAY,
    targetMoney: 2000,
    mineralCount: 18,
    timeLimit: 55,
    mineralWeights: [13, 7, 7, 8, 33, 12, 6, 5, 5, 4],
  },
  {
    level: 10,
    chapter: ChapterId.CRAB_BAY,
    targetMoney: 2400,
    mineralCount: 19,
    timeLimit: 55,
    mineralWeights: [12, 7, 7, 8, 34, 12, 7, 5, 4, 4],
  },
  {
    level: 11,
    chapter: ChapterId.CRAB_BAY,
    targetMoney: 2800,
    mineralCount: 19,
    timeLimit: 50,
    mineralWeights: [11, 7, 7, 9, 34, 13, 7, 5, 4, 3],
  },
  {
    level: 12,
    chapter: ChapterId.CRAB_BAY,
    targetMoney: 3200,
    mineralCount: 20,
    timeLimit: 50,
    mineralWeights: [10, 6, 6, 9, 35, 14, 7, 5, 4, 4],
  },
  {
    level: 13,
    chapter: ChapterId.CRAB_BAY,
    targetMoney: 3600,
    mineralCount: 20,
    timeLimit: 50,
    mineralWeights: [9, 6, 6, 10, 35, 14, 7, 5, 4, 4],
  },
  {
    level: 14,
    chapter: ChapterId.CRAB_BAY,
    targetMoney: 4200,
    mineralCount: 21,
    timeLimit: 45,
    mineralWeights: [8, 5, 5, 11, 36, 15, 7, 5, 4, 4],
    isChapterFinale: true, // 水晶蟹甲 +30% 倾斜
  },

  // ============== Ch3 猪猪王座（L15-L21）终极挑战 ==============
  {
    level: 15,
    chapter: ChapterId.PIGGY_THRONE,
    targetMoney: 4800,
    mineralCount: 21,
    timeLimit: 50,
    mineralWeights: [8, 6, 7, 12, 35, 14, 8, 4, 3, 3],
  },
  {
    level: 16,
    chapter: ChapterId.PIGGY_THRONE,
    targetMoney: 5500,
    mineralCount: 22,
    timeLimit: 50,
    mineralWeights: [7, 6, 7, 13, 35, 15, 8, 4, 3, 2],
  },
  {
    level: 17,
    chapter: ChapterId.PIGGY_THRONE,
    targetMoney: 6200,
    mineralCount: 22,
    timeLimit: 45,
    mineralWeights: [6, 5, 8, 14, 35, 15, 8, 4, 3, 2],
  },
  {
    level: 18,
    chapter: ChapterId.PIGGY_THRONE,
    targetMoney: 7000,
    mineralCount: 22,
    timeLimit: 45,
    mineralWeights: [6, 5, 8, 15, 35, 16, 7, 4, 2, 2],
  },
  {
    level: 19,
    chapter: ChapterId.PIGGY_THRONE,
    targetMoney: 7800,
    mineralCount: 23,
    timeLimit: 45,
    mineralWeights: [5, 5, 9, 15, 36, 16, 7, 3, 2, 2],
  },
  {
    level: 20,
    chapter: ChapterId.PIGGY_THRONE,
    targetMoney: 8500,
    mineralCount: 23,
    timeLimit: 40,
    mineralWeights: [4, 4, 9, 16, 37, 17, 7, 3, 2, 1],
  },
  {
    level: 21,
    chapter: ChapterId.PIGGY_THRONE,
    targetMoney: 9500,
    mineralCount: 24,
    timeLimit: 40,
    mineralWeights: [3, 4, 10, 17, 37, 18, 7, 2, 1, 1],
    isChapterFinale: true, // 猪猪粉宝石 +30% 倾斜（终极关）
  },
];

/** 获取关卡配置（索引 0-based，越界时返回最后一关） */
export function getLevelConfig(level: number): LevelConfig {
  const index = Math.min(level - 1, LEVELS.length - 1);
  return LEVELS[index]!;
}

/** 通过关卡号反查所属章节 */
export function getChapterByLevel(level: number): ChapterId {
  return getLevelConfig(level).chapter;
}

/** 是否章节首关（用于触发 ChapterScene 过场） */
export function isChapterFirstLevel(level: number): boolean {
  return CHAPTER_ORDER.some(id => CHAPTER_INFO[id].firstLevel === level);
}

/** 总关卡数 */
export const TOTAL_LEVELS = LEVELS.length;
