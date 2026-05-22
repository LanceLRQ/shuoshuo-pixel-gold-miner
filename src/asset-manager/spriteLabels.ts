/**
 * Sprite 中文备注名（用于素材管理页 UI 展示）
 * 不在游戏运行时使用，仅辅助美术/玩家辨认
 */

export const SPRITE_LABELS: Record<string, string> = {
  // 矿工（5 态）
  MINER_IDLE: '矿工·待机',
  MINER_PULL: '矿工·拉钩',
  MINER_STRAIN: '矿工·吃力',
  MINER_HAPPY: '矿工·开心',
  MINER_SAD: '矿工·失败',

  // 钩爪 & UI
  HOOK_SPRITE: '钩爪',
  COIN_ICON: '金币图标',

  // 金块（3 级）
  GOLD_SMALL: '小金块',
  GOLD_MEDIUM: '中金块',
  GOLD_LARGE: '大金块',

  // 高价矿物
  DIAMOND_SPRITE: '钻石',

  // 章节矿物
  CRYSTAL_ORE_SPRITE: '水晶矿石（章节 1）',
  CRAB_SHELL_SPRITE: '螃蟹壳（章节 2）',
  PIGGY_GEM_SPRITE: '猪猪宝石（章节 3）',

  // 障碍 / 低价
  STONE_SPRITE: '石头（重物）',
  BONE_SPRITE: '骨头（低价）',

  // 移动小动物
  MOUSE_SPRITE: '老鼠（移动）',
  MOLE_SPRITE: '鼹鼠（移动）',

  // 道具 / 容器
  BOMB_SPRITE: '炸弹道具',
  MYSTERY_BAG: '神秘袋（随机奖励）',
  WOODEN_BOX_SPRITE: '木箱（容器）',

  // 主菜单装饰（仅 MenuScene 使用，可由各主题独立替换）
  MENU_BUTTON_BG: '通用按钮底图（青蓝色，3-slice 横向拉伸，全场景共用）',
  MENU_SETTINGS_BG: '主菜单·设置按钮底图（黄色，3-slice 横向拉伸）',
  MENU_TITLE_BG: '主菜单·标题底图（5 方块 + 水晶装饰）',
  MENU_MASCOT_CAT: '主菜单·水晶猫吉祥物',
  MENU_DPAD_DECOR: '主菜单·D-Pad 装饰',
  MENU_BUTTON_B: '主菜单·B 键金币装饰',
  MENU_BUTTON_R: '主菜单·R 键金币装饰',
  MENU_BULLSEYE_ICON: '主菜单·靶心音乐图标',
  MENU_HEARTS_DECOR: '主菜单·3 心飘装饰',
};

/** 取 sprite 中文名，未配置时回退空字符串（UI 自动隐藏副标题） */
export function getSpriteLabel(name: string): string {
  return SPRITE_LABELS[name] ?? '';
}
