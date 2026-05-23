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
    /** 5 档难度的显示名 + 描述（src/level/difficulty.ts 引用） */
    list: {
      novice:   { name: '新手',     description: '金币丰厚，大件充裕，轻松上手' },
      normal:   { name: '一般',     description: '经典体验，娱乐休闲，' },
      hard:     { name: '困难',     description: '大件稀少，重物拖手，需要谋略' },
      expert:   { name: '高手',     description: '金币稀缺，分秒必争，举步维艰' },
      infinite: { name: '无限火力', description: '道具任你挥霍，纯粹的娱乐场' },
    },
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
      fineAdjust: '钩爪伸出中 ←/→ 或 A/D 微调',
      bomb: 'F / ↑ / W 键 - 引爆 TNT（需购买炸药）',
      pause: 'ESC / 右上角按钮 - 暂停',
      goal: '抓取矿物达到目标金额即可过关',
      clickToStart: '点击任意位置开始',
    },
    saveToast: '✓ 已保存到槽位',
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
    /** HUD 难度标签（GameScene 拼接难度名后显示） */
    hud: {
      difficultyPrefix: '难度: ',
      infiniteEmoji: '🔥 ',
      endlessLabel: '⚡ 无尽 L',
    },
  },

  // ====================================================================
  // 矿物 (Mineral / 神秘袋 / 木箱抽奖飘字)
  // ====================================================================
  mineral: {
    /** 神秘袋开出后飘字显示用 label */
    mystery: {
      cashSmall: '少量现金',
      cashLarge: '大量现金',
      strengthPotion: '大力药剂',
      dynamite: '炸药',
    },
    /** 木箱抽奖结果飘字 label */
    box: {
      prizeDiamond: '钻石大奖！',
      prizeGold: '金币 +500',
      prizeCoin: '金币 +200',
      empty: '空盒……',
      skullLarge: '骷髅 -300',
      skullSmall: '小骷髅 -100',
    },
  },

  // ====================================================================
  // 图鉴弹窗 (CodexModal)
  // ====================================================================
  codex: {
    dialogLabel: '游戏帮助',
    tabControls: '操作说明',
    tabCodex: '矿物图鉴',
    closeAria: '关闭',
    footer: '按 ESC 关闭 · 点击遮罩关闭 · 上方切换 Tab',
    /** 操作说明列表 */
    controls: [
      { key: '空格 / 点击画面', desc: '发射钩爪' },
      { key: 'F / ↑ / W 键',     desc: '引爆 TNT（需购买炸药）' },
      { key: 'ESC / 右上角按钮', desc: '暂停游戏' },
    ],
    /** 矿物名 + 备注（按图鉴顺序） */
    minerals: {
      bone:        { name: '骨头',     note: '低价值垫场' },
      stoneSmall:  { name: '小石头' },
      stoneMedium: { name: '中石头',   note: '石头书 ×3' },
      stoneLarge:  { name: '大石头',   note: '石头书 ×3' },
      mouse:       { name: '老鼠',     note: '会移动 · 老鼠药 ×5' },
      mole:        { name: '鼹鼠',     note: '会移动 · 30% 携带钻石' },
      goldSmall:   { name: '小金块' },
      goldMedium:  { name: '中金块' },
      crystalOre:  { name: '水晶矿石', note: 'Ch1 章节专属' },
      goldLarge:   { name: '大金块' },
      diamond:     { name: '钻石',     note: '钻石变色油 ×2' },
      crabShell:   { name: '水晶蟹甲', note: 'Ch2 章节专属' },
      piggyGem:    { name: '猪猪宝石', note: 'Ch3 章节专属' },
      mysteryBag:  { name: '神秘袋',   note: '现金 / 大力药剂 / 炸药' },
      woodenBox:   { name: '木箱',     note: '抽奖：钻石 / 金币 / 骷髅扣分' },
      bomb:        { name: '炸药桶',   note: '⚠ 碰到爆炸，避开' },
    },
  },

  // ====================================================================
  // 商店 (ShopScene)
  // ====================================================================
  shop: {
    title: '道具商店',
    nextLevel: '下一关',
    moneyLabel: '持有金额: $',
    items: {
      dynamite: { name: '炸药', desc: '按 F 键引爆收回物' },
      extraTime: { name: '额外时间', desc: '本关开局 +10 秒（一次性）' },
      strengthPotion: { name: '力量药水', desc: '收回速度 +50%' },
      diamondGloss: { name: '钻石变色油', desc: '钻石价值 x2' },
      stoneBook: { name: '石头书', desc: '石头价值 x3' },
      ratPoison: { name: '老鼠药', desc: '老鼠价值 x5' },
      lucky: { name: '幸运草', desc: '神秘袋最低 200$' },
      shakySoda: { name: '摇晃饮料', desc: '钩爪伸出中 ←/→ 或 A/D 微调' },
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
    earnedPrefix: '本关入账: +$',
    cumulativeTargetPrefix: '累计目标: $',
    cumulativeAchievedPrefix: '累计达成: $',
    cumulativeFailPrefix: '累计: $',
    gapPrefix: '还差 $',
  },

  // ====================================================================
  // 游戏失败 (GameOverScene)
  // ====================================================================
  gameOver: {
    title: '游戏结束',
    titleEndless: '无尽挑战结束',
    restart: '重新开始',
    /** 关卡显示模板：endlessLevelPrefix + 关数 + endlessLevelSuffix */
    endlessLevelPrefix: '坚持到无尽第 ',
    endlessLevelSuffix: ' 关',
    /** 普通模式到达关卡：normalLevelPrefix + 关数 + endlessLevelSuffix */
    normalLevelPrefix: '到达关卡: 第 ',
    finalScore: '最终得分: $',
    highScore: '最高分: $',
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
    manualSlotsDivider: '— 手动槽位（暂停菜单"另存为"写入） —',
    autoSlotLabel: '⚡ 自动存档',
    autoSlotEmpty: '（暂无进度）',
    manualSlotEmpty: '[空槽位]',
    /** 槽位卡片字段前缀 */
    fieldDifficulty: '难度: ',
    fieldLevelPrefix: '第 ',
    fieldLevelSuffix: ' 关',
    fieldLastPlayed: '最后游玩: ',
    fieldHighScore: '最高分: $',
    /** GameScene 暂停界面"另存为"槽位卡片 */
    saveAsEmpty: '[空]',
    saveAsOverwriteWarn: '⚠ 覆盖',
  },

  // ====================================================================
  // 章节过场 (ChapterScene)
  // ====================================================================
  chapter: {
    label1: '第 一 章',
    label2: '第 二 章',
    label3: '第 三 章',
    skipHint: '按任意键跳过 · 1s 后自动进入',
    /** 3 章节的标题 + 过场剧情（src/level/levels.ts 引用） */
    list: {
      crystalMine: {
        displayName: '水晶矿坑',
        intro: '听说这里能挖到水晶宝石国的宝藏...',
      },
      crabBay: {
        displayName: '蟹潮海湾',
        intro: '海湾深处有水晶蟹守卫着前往王城的通道...',
      },
      piggyThrone: {
        displayName: '猪猪王座',
        intro: '粉色宫殿深处，猪猪公主抱着粉宝石打盹...',
      },
    },
  },
} as const;
