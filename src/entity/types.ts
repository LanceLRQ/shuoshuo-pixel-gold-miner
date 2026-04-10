/**
 * 矿物类型枚举和配置数据
 */

/** 矿物类型 */
export enum MineralType {
  GOLD_SMALL = 'GOLD_SMALL',
  GOLD_LARGE = 'GOLD_LARGE',
  DIAMOND = 'DIAMOND',
  STONE = 'STONE',
  BOMB = 'BOMB',
  MYSTERY_BAG = 'MYSTERY_BAG',
  BONE = 'BONE',
}

/** 矿物配置接口 */
export interface MineralConfig {
  type: MineralType;
  value: number;
  weight: number;
  radius: number;
  spriteName: string;
  width: number;
  height: number;
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
  [MineralType.GOLD_LARGE]: {
    type: MineralType.GOLD_LARGE,
    value: 200,
    weight: 0.8,
    radius: 32,
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
    value: 5,
    weight: 0.1,
    radius: 24,
    spriteName: 'BONE_SPRITE',
    width: 12,
    height: 6,
  },
};

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
  WEIGHT_FACTOR: 0.5,
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
