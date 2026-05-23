/**
 * 矿物类型枚举和配置数据
 */

/** 矿物类型 */
export enum MineralType {
  GOLD_SMALL = 'GOLD_SMALL',
  GOLD_MEDIUM = 'GOLD_MEDIUM',
  GOLD_LARGE = 'GOLD_LARGE',
  DIAMOND = 'DIAMOND',
  STONE = 'STONE',
  BOMB = 'BOMB',
  MYSTERY_BAG = 'MYSTERY_BAG',
  BONE = 'BONE',
  MOUSE = 'MOUSE',
  MOLE = 'MOLE',
  // 章节专属收藏品（仅末关倾斜插入，不进随机权重池）
  CRYSTAL_ORE = 'CRYSTAL_ORE',   // Ch1 水晶矿石
  CRAB_SHELL = 'CRAB_SHELL',     // Ch2 水晶蟹甲
  PIGGY_GEM = 'PIGGY_GEM',       // Ch3 猪猪粉宝石
  // 木箱抽奖箱（L5+ 关卡每关追加 1 个，内容构造时随机）
  WOODEN_BOX = 'WOODEN_BOX',
}

/** 矿物配置接口 */
export interface MineralConfig {
  type: MineralType;
  value: number;
  weight: number;
  /** 圆形碰撞半径（向后兼容，所有矿物必填） */
  radius: number;
  /**
   * 椭圆碰撞水平半径（可选）。
   * 设置后碰撞从圆形升级为椭圆，水平/垂直独立。
   * 用于横向 sprite（如猪子、水晶蟹），让水平 hitbox 与 sprite 视觉宽对齐。
   */
  radiusX?: number;
  /** 椭圆碰撞垂直半径（可选，与 radiusX 配对使用） */
  radiusY?: number;
  spriteName: string;
  width: number;
  height: number;
  /** 是否根据 vx 方向水平翻转精灵（移动小动物专用，默认 false） */
  flipOnDirection?: boolean;
}

/** 矿物配置表（碰撞半径已放大，更容易抓取） */
export const MINERAL_CONFIGS: Record<MineralType, MineralConfig> = {
  [MineralType.GOLD_SMALL]: {
    type: MineralType.GOLD_SMALL,
    value: 50,
    weight: 0.3,
    radius: 20,
    spriteName: 'GOLD_SMALL',
    width: 8,
    height: 8,
  },
  [MineralType.GOLD_MEDIUM]: {
    type: MineralType.GOLD_MEDIUM,
    value: 250,
    // 中金块比小金块明显沉一些（拉满更慢），玩家瞄准前需思考成本
    weight: 1.2,
    radius: 30,
    spriteName: 'GOLD_MEDIUM',
    width: 12,
    height: 12,
  },
  [MineralType.GOLD_LARGE]: {
    type: MineralType.GOLD_LARGE,
    value: 500,
    // 大金疙瘩超沉 — 远超大石头(1.5)，拖一颗要 ~8s 占关卡 13%，需精准决策
    weight: 2.5,
    radius: 42,
    spriteName: 'GOLD_LARGE',
    width: 16,
    height: 16,
  },
  [MineralType.DIAMOND]: {
    type: MineralType.DIAMOND,
    value: 600,
    weight: 0.2,
    radius: 18,
    spriteName: 'DIAMOND_SPRITE',
    width: 8,
    height: 8,
  },
  [MineralType.STONE]: {
    type: MineralType.STONE,
    value: 10,
    weight: 1.5,
    radius: 28,
    spriteName: 'STONE_SPRITE',
    width: 12,
    height: 12,
  },
  [MineralType.BOMB]: {
    type: MineralType.BOMB,
    value: -100,
    weight: 0.2,
    radius: 18,
    spriteName: 'BOMB_SPRITE',
    width: 8,
    height: 8,
  },
  [MineralType.MYSTERY_BAG]: {
    type: MineralType.MYSTERY_BAG,
    value: 0, // 随机，在生成时确定
    weight: 0.2,
    radius: 18,
    spriteName: 'MYSTERY_BAG',
    width: 8,
    height: 8,
  },
  [MineralType.BONE]: {
    type: MineralType.BONE,
    value: 11,
    weight: 1.2,
    radius: 24,
    spriteName: 'BONE_SPRITE',
    width: 12,
    height: 6,
  },
  [MineralType.MOUSE]: {
    type: MineralType.MOUSE,
    value: 20,
    weight: 0.3,
    radius: 16,
    // 猪子 sprite 36×24（横向），用椭圆让水平 hitbox 略超 sprite 宽便于抓头/尾
    radiusX: 22,
    radiusY: 14,
    spriteName: 'MOUSE_SPRITE',
    width: 12,
    height: 8,
    flipOnDirection: true,
  },
  [MineralType.MOLE]: {
    type: MineralType.MOLE,
    value: 50,
    weight: 0.5,
    radius: 20,
    // 水晶蟹 sprite 36×30（横向但较高），椭圆水平略宽
    radiusX: 22,
    radiusY: 17,
    spriteName: 'MOLE_SPRITE',
    width: 12,
    height: 10,
    flipOnDirection: true,
  },
  // ========== 章节专属收藏品 ==========
  [MineralType.CRYSTAL_ORE]: {
    type: MineralType.CRYSTAL_ORE,
    value: 400,
    weight: 0.4,
    radius: 22,
    spriteName: 'CRYSTAL_ORE_SPRITE',
    width: 8,
    height: 8,
  },
  [MineralType.CRAB_SHELL]: {
    type: MineralType.CRAB_SHELL,
    value: 800,
    weight: 0.5,
    radius: 26,
    spriteName: 'CRAB_SHELL_SPRITE',
    width: 10,
    height: 10,
  },
  [MineralType.PIGGY_GEM]: {
    type: MineralType.PIGGY_GEM,
    value: 1500,
    weight: 0.3,
    radius: 28,
    spriteName: 'PIGGY_GEM_SPRITE',
    width: 12,
    height: 12,
  },
  // ========== 木箱抽奖箱 ==========
  // 注意：石头 STONE 在运行时按 STONE_VARIANTS 权重抽小/中/大档（见下方），
  // 关卡数据无需新增 type，21 关 mineralWeights 数组结构不变。
  [MineralType.WOODEN_BOX]: {
    type: MineralType.WOODEN_BOX,
    value: 0, // 真实价值由 Mineral 构造时按 BoxContent 随机
    weight: 0.5,
    radius: 22,
    spriteName: 'WOODEN_BOX_SPRITE',
    width: 8,
    height: 8,
  },
};

/**
 * 石头档位变体 — STONE 在 Mineral 构造时按 weight 随机抽一档，
 * 实例的 spriteName / value / radius 由抽中的档位覆盖。
 *
 * 对齐经典版黄金矿工的"大中小石头"视觉层次（小石头多/价值低，大石头少/价值高）。
 */
export interface StoneVariant {
  spriteName: string;
  /** [min, max] 价值随机区间（含两端） */
  valueRange: [number, number];
  /** 碰撞半径（圆形） */
  radius: number;
  /** 抽取权重 */
  weight: number;
}

export const STONE_VARIANTS: readonly StoneVariant[] = [
  { spriteName: 'STONE_SMALL_SPRITE', valueRange: [5, 10],  radius: 20, weight: 0.5 },
  { spriteName: 'STONE_SPRITE',       valueRange: [10, 20], radius: 30, weight: 0.3 },
  { spriteName: 'STONE_LARGE_SPRITE', valueRange: [25, 45], radius: 42, weight: 0.2 },
];

/** 游戏数值配置常量（横屏 800x540 布局） */
export const GAME_CONFIG = {
  // 画布逻辑尺寸
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 540,

  // 钩爪参数
  HOOK_SWING_SPEED: 2,
  HOOK_MAX_ANGLE: Math.PI * 4 / 9,
  HOOK_EXTEND_SPEED: 400,
  HOOK_BASE_REEL_SPEED: 250,
  HOOK_MAX_LENGTH: 550,
  // 重量影响系数基准值（最终 factor = WEIGHT_FACTOR × difficulty.weightFactorScale）
  // 0.5 偏弱（最重最轻只差 1.6x），上调为 1.0 让重物拖拽感更明显
  WEIGHT_FACTOR: 1.0,
  HOOK_ROPE_WIDTH: 2,

  // 关卡
  LEVEL_TIME_LIMIT: 60,

  // 矿工（顶部居中，32x32 精灵底部对齐草地）
  MINER_X: 400,
  MINER_Y: 92,

  // 矿物生成区域（横屏，地下大面积区域）
  MINERAL_AREA_TOP: 225,
  MINERAL_AREA_BOTTOM: 500,
  MINERAL_AREA_LEFT: 60,
  MINERAL_AREA_RIGHT: 740,
} as const;
