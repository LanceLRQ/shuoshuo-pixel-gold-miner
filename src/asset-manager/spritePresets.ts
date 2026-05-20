/**
 * sprite 系统预设显示尺寸 — 单一来源真相
 *
 * 用途：
 * 1. pixel-converter embed 模式：作为比例约束 + 显示尺寸默认值，防止美术误产出
 *    "无法在游戏内正常工作"的 sprite（如 GIF 转出来直接 96×64，碰撞圆 16 半径抓不到）
 * 2. ThemeStore.loadCustom lazy 迁移：老自定义主题缺 displayWidth/Height 时兜底
 * 3. PixelEditorDialog onApply 兜底：apply 前补字段
 *
 * 数据来源（与 src/entity/types.ts MineralConfig × 3 / MINER 96×96 / HOOK 30×36 对齐）
 */

export interface SpriteDisplayPreset {
  displayWidth: number;
  displayHeight: number;
}

export const SPRITE_DEFAULT_DISPLAY: Record<string, SpriteDisplayPreset> = {
  // 矿物（来自 MineralConfig.width/height × 3）
  GOLD_SMALL:         { displayWidth: 24, displayHeight: 24 },
  GOLD_MEDIUM:        { displayWidth: 36, displayHeight: 36 },
  GOLD_LARGE:         { displayWidth: 48, displayHeight: 48 },
  DIAMOND_SPRITE:     { displayWidth: 24, displayHeight: 24 },
  STONE_SMALL_SPRITE: { displayWidth: 24, displayHeight: 24 },
  STONE_SPRITE:       { displayWidth: 36, displayHeight: 36 },
  STONE_LARGE_SPRITE: { displayWidth: 48, displayHeight: 48 },
  BOMB_SPRITE:        { displayWidth: 24, displayHeight: 24 },
  MYSTERY_BAG:        { displayWidth: 24, displayHeight: 24 },
  WOODEN_BOX_SPRITE:  { displayWidth: 24, displayHeight: 24 },
  BONE_SPRITE:        { displayWidth: 36, displayHeight: 18 },
  MOUSE_SPRITE:       { displayWidth: 36, displayHeight: 24 },
  MOLE_SPRITE:        { displayWidth: 36, displayHeight: 30 },
  CRYSTAL_ORE_SPRITE: { displayWidth: 24, displayHeight: 24 },
  CRAB_SHELL_SPRITE:  { displayWidth: 30, displayHeight: 30 },
  PIGGY_GEM_SPRITE:   { displayWidth: 36, displayHeight: 36 },
  // 钩爪、HUD、矿工（独立硬编码）
  HOOK_SPRITE:        { displayWidth: 30, displayHeight: 36 },
  COIN_ICON:          { displayWidth: 24, displayHeight: 24 },
  MINER_IDLE:         { displayWidth: 96, displayHeight: 96 },
  MINER_PULL:         { displayWidth: 96, displayHeight: 96 },
  MINER_HAPPY:        { displayWidth: 96, displayHeight: 96 },
  MINER_SAD:          { displayWidth: 96, displayHeight: 96 },
  MINER_STRAIN:       { displayWidth: 96, displayHeight: 96 },
};

/**
 * 给 sprite 补齐缺失的 displayWidth/Height（不覆盖已有值）。
 * sprite 名不在预设表中时原样返回。
 */
export function applyDisplayPreset<T extends { displayWidth?: number; displayHeight?: number }>(
  spriteName: string,
  sprite: T
): T {
  if (sprite.displayWidth !== undefined && sprite.displayHeight !== undefined) return sprite;
  const preset = SPRITE_DEFAULT_DISPLAY[spriteName];
  if (!preset) return sprite;
  return {
    ...sprite,
    displayWidth: sprite.displayWidth ?? preset.displayWidth,
    displayHeight: sprite.displayHeight ?? preset.displayHeight,
  };
}
