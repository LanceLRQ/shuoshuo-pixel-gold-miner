/**
 * UI 文案资源（集中管理，方便统一修改）
 *
 * 使用方式：
 *   import { STRINGS } from '../ui/strings';
 *   drawText(renderer, STRINGS.menu.newGame, ...);
 *
 * 命名规范：按场景/模块分组，扁平化避免过深嵌套。
 * 修改原则：保持 key 名稳定（修改文案不需要改 key 名），方便未来 i18n 扩展。
 */

export const STRINGS = {
  // ====================================================================
  // 通用（多场景复用）
  // ====================================================================
  common: {
    cancel: '取消',
    confirm: '确认',
    close: '关闭',
    backToMenu: '返回主菜单',
    backToMenuShort: '返回菜单',
    continueGame: '继续游戏',
    purchased: '已购买',
    undoWarning: '此操作不可撤销',
  },

  // ====================================================================
  // 主菜单 (MenuScene)
  // ====================================================================
  menu: {
    titleLine1: '水晶宝石国',
    titleLine2: '猪猪传说',
    highScoreLabel: '最高分',
    pressSpaceContinue: '按空格继续上次进度',
    pressSpaceNewGame: '按空格直接进入难度选择',
    newGame: '新游戏',
    loadSave: '读取存档',
    settings: '设置',
    clearProgress: '清除进度',
    confirmClearTitle: '清除进度？',
    settingsTitle: '设置',
    musicLabel: '音乐',
    volumeLabel: '音量',
    mutedLabel: '静音',
    bgmLabel: 'BGM',
    on: '开',
    off: '关',
    muted: '已静音',
    normal: '正常',
    themeLabel: '主题',
    escCloseSettings: 'ESC 关闭设置',
  },

  // ====================================================================
  // 难度选择 (DifficultyScene)
  // ====================================================================
  difficulty: {
    title: '选择难度',
    moneyLabel: '金币',
    timeLabel: '时间',
    money: {
      rich: '丰厚',
      normal: '标准',
      poor: '微薄',
      scarce: '稀缺',
    },
    time: {
      plenty: '充裕',
      normal: '标准',
      tight: '紧迫',
    },
    infiniteItemsBadge: '∞ 无限道具',
  },

  // ====================================================================
  // 游戏内 (GameScene)
  // ====================================================================
  game: {
    paused: '游戏暂停',
    pauseHint: '点击按钮或按 ESC 继续',
    finishEarly: '提前结算 ▶',
    saveAs: '另存为...',
    saveAsTitle: '选择手动槽位保存',
    saveAsClickPrompt: '点击保存',
    overwriteTitle: '覆盖槽位？',
    overwriteWarning: '非空槽位将覆盖（需二次确认）',
    overwrite: '覆盖',
    tutorial: {
      title: '操作说明',
      shoot: '空格 / 点击画面 - 发射钩爪',
      fineAdjust: '钩爪伸出中←/→微调',
      bomb: '按 F 键引爆收回物',
      goal: '抓取矿物达到目标金额即可过关',
      clickToStart: '点击任意位置开始',
    },
    /** HUD 显示用道具简写（短名，2 字内） */
    itemNamesShort: {
      dynamite: '炸药',
      strength: '力量',
      lucky: '幸运',
      stoneBook: '石书',
      ratPoison: '鼠药',
      diamondGloss: '钻油',
    },
    notifications: {
      bombDestroy: '炸药: 摧毁了一个矿物!',
      bombEmpty: '炸药: 场上没有可炸的...',
      strengthPotionMsg: '大力药剂: 收回加速!',
    },
    floatingText: {
      bombBoom: '炸药! BOOM',
      bombDestroyed: '炸毁!',
      bombMissed: '空炸药',
      strengthPotion: '大力药剂!',
    },
  },

  // ====================================================================
  // 商店 (ShopScene)
  // ====================================================================
  shop: {
    title: '道具商店',
    nextLevel: '下一关',
    items: {
      dynamite: { name: '炸药', desc: '按 F 键引爆收回物' },
      extraTime: { name: '额外时间', desc: '本关开局 +10 秒（一次性）' },
      strengthPotion: { name: '力量药水', desc: '收回速度 +50%' },
      diamondGloss: { name: '钻石变色油', desc: '钻石价值 x2' },
      stoneBook: { name: '石头书', desc: '石头价值 x3' },
      ratPoison: { name: '老鼠药', desc: '老鼠价值 x5' },
      lucky: { name: '幸运草', desc: '神秘袋最低 200$' },
      shakySoda: { name: '摇晃饮料', desc: '钩爪伸出中←/→微调' },
    },
  },

  // ====================================================================
  // 关卡结算 (ResultScene)
  // ====================================================================
  result: {
    title: '关卡结算',
    success: '恭喜达标！',
    failure: '未达标...',
    skipAnimation: '点击跳过动画 ▶',
    enterShop: '进入商店',
    retry: '重试本关',
  },

  // ====================================================================
  // 游戏失败 (GameOverScene)
  // ====================================================================
  gameOver: {
    title: '游戏结束',
    titleEndless: '无尽挑战结束',
    restart: '重新开始',
  },

  // ====================================================================
  // 存档管理 (SlotSelectScene)
  // ====================================================================
  slotSelect: {
    title: '存档管理',
    confirmDeleteTitle: '确定删除',
    delete: '删除',
    load: '载入',
    neverPlayed: '从未游玩',
    justNow: '刚刚',
    emptyHint: '在主菜单点"新游戏"开始',
  },

  // ====================================================================
  // 章节过场 (ChapterScene)
  // ====================================================================
  chapter: {
    label1: '第 一 章',
    label2: '第 二 章',
    label3: '第 三 章',
    skipHint: '按任意键跳过 · 2.5s 后自动进入',
  },
} as const;
