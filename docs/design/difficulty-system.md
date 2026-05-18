# 难度系统规划文档

> 黄金矿工 H5 新增 5 档难度系统，覆盖从小白到硬核玩家的体验梯度，并新增一个娱乐"无限火力"模式。

---

## 一、目标 & 设计原则

1. **5 档难度**：覆盖小白入门到硬核挑战 + 1 个娱乐模式
2. **同一关卡数据复用**：不为每个难度复制一份关卡表，通过乘数派生
3. **保证可通关性**：每关矿物总价值必须 ≥ 通关目标 × 安全倍率（防止抽到全石头无法过关）
4. **存档隔离**：不同难度的进度/最高分独立保存

---

## 二、难度梯队定义

| 难度 ID | 中文名 | 金额× | 时间× | 重量× | 商店 | 道具机制 | 矿物保障 |
|---------|-------|------|------|------|------|---------|---------|
| `NOVICE` | 新手 | ×2.0 | ×1.0 | **×0**（无重量影响） | ✓ | 持久跨关 + 消耗品当关 | 300% target |
| `NORMAL` | 一般（基准） | ×1.0 | ×1.0 | ×1.0 | ✓ | 持久跨关 + 消耗品当关 | 300% target |
| `HARD` | 困难 | ×0.5 | ×1.0 | ×1.5（重物显著慢） | ✓ | 全部当关消耗 | 225% target |
| `EXPERT` | 高手 | ×0.5 | ×0.5 | ×2.0（重物极慢） | ✓ | 全部当关消耗 | 175% target |
| `INFINITE` | 无限火力 | ×1.0 | ×1.0 | **×0**（娱乐模式） | ✗ | 所有道具永久开启 | 300% target |

### 2.1 参数说明

- **矿物金额乘数（valueScale）**：抓到矿物时显示和入账的金额按此倍率缩放
- **时间倍率（timeScale）**：每关 `levelConfig.timeLimit` 乘以此值（高手模式时间砍半）
- **商店开关（shopEnabled）**：无限火力跳过商店场景，直接进下一关
- **道具机制（infiniteItems）**：无限火力下所有 ItemType buff 永久生效（含 DYNAMITE 抓不完）
- **矿物总价值保障（mineralBudgetRatio）**：生成的所有矿物**实际金额**总和 ≥ target × 该比例

### 2.2 难度体验示意

**新手**：什么都好抓，金额翻倍，目标轻松达到
**一般**：原汁原味经典体验
**困难**：金额砍半，需要精打细算每一次抓取，纯硬核体验（无辅助）
**高手**：金额砍半 + 时间砍半，节奏极快，决策窗口短（无辅助）
**无限火力**：娱乐模式，所有 buff 道具永久挂着，纯爽感

### 2.3 难度门控功能（设计哲学：辅助 vs 硬核）

> **新手 + 一般 = 辅助派**（允许各种"作弊式"辅助）
> **困难 + 高手 = 硬核派**（拒绝所有辅助，纯靠操作）

| 功能 | 新手 | 一般 | 困难 | 高手 | 无限火力 |
|------|------|------|------|------|---------|
| **#7 摇晃饮料**（钩爪伸出中 ←/→ 微调角度） | ✓ | ✓ | ✗（商店隐藏） | ✗（商店隐藏） | ✓ |
| **#8 持久道具跨关**（buff 类道具跨关保留） | ✓ | ✓ | ✗（强制当关失效） | ✗（强制当关失效） | N/A |
| 商店开放 | ✓ | ✓ | ✓ | ✓ | ✗ |
| 道具消耗 | 持久型不消耗 | 持久型不消耗 | 全部消耗 | 全部消耗 | 全部不消耗 |

**实施门控点**：
- `ShopScene` 渲染前过滤：困难/高手隐藏 `SHAKE_DRINK` 道具卡片
- `Hook.tryAdjustAngle()`：困难/高手强制 return（即使道具误生效也不响应）
- `Game.clearLevelBuffs()`：根据难度选择"清理全部 buff"或"仅清理消耗品"

### 2.4 重量机制（钩爪收回速度差异）

> **设计目的**：还原经典版"抓到石头拉得慢、抓到钻石拉得快"的体感差异。

**公式（修复 Bug 后）**：
```ts
const factor = GAME_CONFIG.WEIGHT_FACTOR * difficulty.weightFactorScale;
let reelSpeed = HOOK_BASE_REEL_SPEED * hook.reelSpeedMultiplier;
if (grabbedMineral) {
  // ⚠️ 关键修复：抓到矿物时也乘 multiplier，让力量药水生效
  reelSpeed = reelSpeed / (1 + grabbedMineral.weight * factor);
}
```

**修复的两个问题**：

1. **力量药水 Bug**：原代码 `if (grabbedMineral) { reelSpeed = BASE_SPEED / (1 + weight × factor); }` 没乘 `reelSpeedMultiplier`，导致花 200$ 买的"收回速度 +50%"对抓到矿物完全无效。
2. **重量差距不明显**：`WEIGHT_FACTOR=0.5` 偏小，最重和最轻只差 1.6 倍。建议调整：
   - `WEIGHT_FACTOR` 全局基础值改为 `1.0`
   - 各难度通过 `weightFactorScale` 微调

**各难度下"钻石(0.2) vs 石头(1.5)"实际速度**：

| 难度 | 钻石速度 | 石头速度 | 倍数差 | 体感 |
|------|---------|---------|--------|------|
| 新手 | 250 px/s | 250 px/s | 1.0x | 无差异（轻松） |
| 一般 | 208 | 100 | **2.1x** | 明显（经典体验） |
| 困难 | 192 | 71 | **2.7x** | 重物显著慢 |
| 高手 | 178 | 56 | **3.2x** | 重物极慢，节奏紧张 |
| 无限火力 | 250 | 250 | 1.0x | 娱乐模式 |

**力量药水（200$）实际效果**：

| 难度 | 不吃药石头速度 | 吃药石头速度 | 提升 |
|------|--------------|-------------|------|
| 一般 | 100 | **150** | +50% |
| 困难 | 71 | **107** | +50% |
| 高手 | 56 | **84** | +50% |

修复后 200$ 买的药水**对抓重物显著加速**，让购买决策有意义。

**实施改动**：
- `entity/types.ts`: `GAME_CONFIG.WEIGHT_FACTOR: 0.5 → 1.0`
- `entity/Hook.ts:152-157`: 修复公式（抓矿物时也乘 multiplier，引入难度 factor）
- `entity/Hook.ts`: 增加 `weightFactor` 字段（由 GameScene 注入难度配置）

---

## 三、矿物生成预算系统

### 3.1 当前实现问题

当前 `GameScene.generateMinerals()` 纯基于 `mineralCount` 和 `mineralWeights` 加权随机生成，**没有总价值兜底**。极端情况（连续抽到石头）可能导致总价值不足 target，玩家即使完美操作也无法过关。

### 3.2 新预算驱动算法

```
预算计算：
  targetBudget = level.target × difficulty.mineralBudgetRatio / difficulty.valueScale
  （表示"原始价值预算"，因为最终展示时还会乘 valueScale）

生成流程：
  1. 按 mineralWeights 加权选 mineralCount 个矿物（保持当前关卡感）
  2. 计算当前矿物总价值 currentTotal
  3. 若 currentTotal < targetBudget：
     - 反复选择最低价值矿物替换为更高价值矿物
     - 优先替换石头/骨头为小金/中金/大金
     - 直至 currentTotal ≥ targetBudget 或无法继续替换
  4. 若仍不足 targetBudget：
     - 追加生成"补足金块"（自动加大金块直到达标）
     - 上限保护：追加数量不超过 mineralCount × 0.3
  5. 返回矿物列表
```

### 3.3 各难度下的实际矿物总价值（关卡 1 示例）

以关卡 1（target=150）为例：

| 难度 | mineralBudgetRatio | 原始预算 | ×valueScale 后实际玩家看到 |
|------|-------------------|---------|---------------------------|
| 新手 | 300% / 2.0 = 150% | 225$ | 450$（300% target，富余） |
| 一般 | 300% | 450$ | 450$（300% target） |
| 困难 | 225% / 0.5 = 450% | 675$ | 337.5$（225% target） |
| 高手 | 175% / 0.5 = 350% | 525$ | 262.5$（175% target） |
| 无限火力 | 300% | 450$ | 450$（300% target） |

> ⚠️ **关键算法点**：`原始预算 = (target × budgetRatio) / valueScale`，确保实际生成的金额满足"playerVisibleTotal ≥ target × budgetRatio"

---

## 四、关卡目标金额（保持不变）

**结论**：关卡 target 不随难度调整，**复用当前 10 关数据**。

```
关卡 1-10 target: 150 / 300 / 450 / 650 / 850 / 1100 / 1350 / 1600 / 1900 / 2300
关卡 1-10 timeLimit: 60 / 60 / 60 / 55 / 55 / 55 / 50 / 50 / 50 / 45
```

不同难度下玩家体感差异：

| 关卡 | 一般 实际 target | 高手 实际可获 | 高手 实际时间 |
|------|----------------|-------------|--------------|
| 1 | 150$ | 262$（×0.5 后） | 30s |
| 5 | 850$ | 1488$ | 27.5s |
| 10 | 2300$ | 4025$ | 22.5s |

> 高手模式下玩家可获总额 ≈ 175% target，扣除浪费时间和错抓后基本卡线过关 —— 设计意图

---

## 五、数据模型变更

### 5.1 新增 Difficulty 模块

```ts
// src/level/difficulty.ts（新建）

export enum Difficulty {
  NOVICE = 'NOVICE',
  NORMAL = 'NORMAL',
  HARD = 'HARD',
  EXPERT = 'EXPERT',
  INFINITE = 'INFINITE',
}

export interface DifficultyConfig {
  id: Difficulty;
  name: string;            // 显示名
  description: string;     // 选择界面副标题
  valueScale: number;      // 矿物金额乘数
  timeScale: number;       // 时间乘数
  shopEnabled: boolean;
  infiniteItems: boolean;
  mineralBudgetRatio: number; // 矿物总价值 / target 的最低保障倍率
  color: string;           // UI 主色（差异化展示）
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  NOVICE:   { ..., valueScale: 2.0, timeScale: 1.0, mineralBudgetRatio: 3.0, shopEnabled: true,  infiniteItems: false },
  NORMAL:   { ..., valueScale: 1.0, timeScale: 1.0, mineralBudgetRatio: 3.0, shopEnabled: true,  infiniteItems: false },
  HARD:     { ..., valueScale: 0.5, timeScale: 1.0, mineralBudgetRatio: 2.25, shopEnabled: true,  infiniteItems: false },
  EXPERT:   { ..., valueScale: 0.5, timeScale: 0.5, mineralBudgetRatio: 1.75, shopEnabled: true,  infiniteItems: false },
  INFINITE: { ..., valueScale: 1.0, timeScale: 1.0, mineralBudgetRatio: 3.0, shopEnabled: false, infiniteItems: true  },
};
```

### 5.2 Game.ts 增加 currentDifficulty

```ts
private currentDifficulty: Difficulty = Difficulty.NORMAL;

getDifficulty(): Difficulty
setDifficulty(d: Difficulty): void
getDifficultyConfig(): DifficultyConfig
```

### 5.3 Storage.ts 存档结构调整

> ⚠️ 存档结构涉及"10 个槽位"重构，详见 [`save-slot-system.md`](./save-slot-system.md)。两套系统强关联，建议**打包一起实施**。

简化设计：
- 每个槽位绑定一个难度（创建时确定，不可修改）
- 难度最高分跨所有槽位统计

```ts
// 槽位元数据（含难度字段）
interface SlotMeta {
  slotId: number;
  difficulty: Difficulty;   // 槽位绑定的难度
  currentLevel: number;
  currentMoney: number;
  highScore: number;         // 本槽位历史最高
  // ...
}

// 全局：按难度的跨槽位最高分
interface GlobalData {
  highScoresByDifficulty: Record<Difficulty, number>;
}
```

---

## 六、涉及代码改动

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/level/difficulty.ts` | 新建 | Difficulty 枚举 + 配置表 |
| `src/level/LevelManager.ts` | 改 | 接受难度配置，时间/价值按比例应用 |
| `src/core/Game.ts` | 改 | currentDifficulty 状态 + getter/setter，进入 SHOP 时按 shopEnabled 决定 |
| `src/core/Storage.ts` | 改 | 存档结构兼容 difficulty 字段，highScore 按难度分 |
| `src/entity/Mineral.ts` | 改 | value getter 按 valueScale 缩放（或在 onHookComplete 处统一缩放） |
| `src/scene/MenuScene.ts` | 改 | 主菜单加"难度选择"入口，或在开始游戏时弹难度选择 |
| **新建** `src/scene/DifficultyScene.ts` | 新建 | 5 档难度选择界面（卡片式） |
| `src/scene/GameScene.ts` | 改 | enter() 应用 timeScale；onHookComplete 应用 valueScale；INFINITE 模式开局自动加全 buff |
| `src/scene/ShopScene.ts` | 改 | INFINITE 模式跳过（Game 直接 changeScene PLAYING） |
| `src/scene/GameOverScene.ts` | 改 | 显示当前难度 + 最高分对比 |
| `src/scene/ResultScene.ts` | 改 | Bonus 计算时考虑 valueScale（确保 Bonus 也按难度缩放，可选） |

---

## 七、矿物预算生成器（核心算法详细）

### 7.1 接口

```ts
// 新增到 GameScene.ts 或抽出到 utils
function generateMineralsWithBudget(
  config: LevelConfig,
  difficulty: DifficultyConfig,
  spriteCache: SpriteCacheMap,
  areaConfig: { left, right, top, bottom }
): Mineral[]
```

### 7.2 算法步骤

```
Step 1: 按权重生成基础矿物数组
  for i in 0..mineralCount:
    minerals.push(weightedRandom(mineralWeights))

Step 2: 计算原始总价值 currentTotal
  currentTotal = sum(m.value for m in minerals)

Step 3: 计算目标预算
  targetBudget = (level.target × difficulty.mineralBudgetRatio) / difficulty.valueScale

Step 4: 不足则升级
  while currentTotal < targetBudget AND 有可升级矿物:
    找到 minerals 中价值最低的矿物 lowMin
    将其替换为权重表中价值更高一档的矿物
    例：BONE(5$) → STONE(15$) → GOLD_SMALL(50$) → GOLD_MEDIUM(250$) → GOLD_LARGE(500$)
    更新 currentTotal

Step 5: 仍不足则追加
  while currentTotal < targetBudget AND minerals.length < mineralCount × 1.3:
    追加一个 GOLD_LARGE（500$）

Step 6: 按物理位置摆放（不重叠）

Step 7: 返回 minerals
```

### 7.3 价值升级链定义

```ts
const VALUE_UPGRADE_CHAIN: MineralType[] = [
  MineralType.BONE,        // 5$
  MineralType.STONE,       // 15$
  MineralType.MOUSE,       // 20$
  MineralType.MOLE,        // 50$
  MineralType.GOLD_SMALL,  // 50$
  MineralType.GOLD_MEDIUM, // 250$
  MineralType.GOLD_LARGE,  // 500$
];
```

> 升级时跳过 BOMB / MYSTERY_BAG / DIAMOND，避免破坏随机感

---

## 八、UI/UX 设计

### 8.1 难度选择场景（DifficultyScene）

布局（横屏 800×540）：
```
┌─────────────────────────────────────┐
│       选择难度                       │
├─────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│ │ 新手  │ │ 一般  │ │ 困难  │ │ 高手  │ │ 无限  │ │
│ │  💚   │ │  💙   │ │  💛   │ │  ❤️   │ │  💜   │ │
│ │ 金额  │ │ 经典  │ │ 金额  │ │ 金额  │ │ 道具  │ │
│ │ ×2   │ │ 体验  │ │ ÷2   │ │ ÷2   │ │ 无限  │ │
│ │      │ │      │ │      │ │ 时间÷2│ │      │ │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │
├─────────────────────────────────────┤
│         [开始游戏]   [返回]          │
└─────────────────────────────────────┘
```

### 8.2 HUD 显示

游戏内 HUD 增加难度标签（右下角小字）：
```
难度: 高手 ×0.5 ⏰×0.5
```

### 8.3 主菜单流程

```
主菜单 → "新游戏"按钮 → DifficultyScene → PLAYING
       ↓
       "继续游戏"按钮（从存档读取难度） → PLAYING
```

---

## 九、道具分类（与 #7#8 联动）

### 9.1 持久道具（新手/一般跨关保留，困难/高手强制当关失效）

| 道具 | 价格 | 效果 | 持久性 |
|------|------|------|--------|
| 力量药水 | 200$ | 收回速度 +50% | ✅ 持久 |
| 幸运草 | 100$ | 神秘袋最低 200$ | ✅ 持久 |
| 石头书 | 80$ | 石头价值 ×3 | ✅ 持久 |
| 老鼠药 | 120$ | 老鼠价值 ×5 | ✅ 持久 |
| 钻石变色油 | 250$ | 钻石价值 ×2 | ✅ 持久 |
| **摇晃饮料（#7 新增）** | 180$ | 钩爪伸出中 ←/→ 微调角度 | ✅ 持久 |

### 9.2 消耗道具（任何难度下都是用完即弃）

| 道具 | 价格 | 效果 | 持久性 |
|------|------|------|--------|
| 炸药 | 150$ | 按 F 键引爆当前矿物 | ❌ 消耗品 |
| 额外时间 | 80$ | 开局 +10 秒 | ❌ 消耗品 |

### 9.3 难度模式下的道具行为矩阵

| 道具类型 | 新手/一般 | 困难/高手 | 无限火力 |
|---------|----------|----------|---------|
| 持久型 buff | 跨关保留直到玩家主动放弃 | 每关结束清除（强制当关消耗） | 永久开启 |
| 消耗品（炸药/+时间） | 用完即弃 | 用完即弃 | 用不完 |
| 摇晃饮料（#7）特殊 | 商店可购买 + 跨关 | **商店隐藏 + 不可购买** | 默认开启 |

### 9.4 实施：Game.clearLevelBuffs() 重构

```ts
// src/core/Game.ts
private clearLevelBuffs(): void {
  const cfg = this.getDifficultyConfig();

  if (cfg.id === Difficulty.INFINITE) return; // 无限模式不清

  if (cfg.id === Difficulty.HARD || cfg.id === Difficulty.EXPERT) {
    // 硬核模式：清除全部 buff 道具（仅保留消耗品状态，但消耗品本身已在使用时减少）
    for (const itemType of Object.values(ItemType)) {
      const item = SHOP_ITEMS.find(i => i.type === itemType);
      if (item?.persistent) {
        this.ownedItems.delete(itemType);
      }
    }
  } else {
    // 新手/一般：仅清除"消耗品已用尽"的（实际上消耗品在用时已 delete，此处无操作）
    // 持久道具保留到下一关
  }

  // 所有难度：消耗品（用完即弃型 LEVEL_BUFF_ITEMS）必须清除
  // 但当前实现中 DYNAMITE/EXTRA_TIME 在使用时已 delete，此处可省略
}
```

---

## 十、INFINITE 模式特殊处理

无限火力作为娱乐模式：

1. **跳过商店**：`Game.changeScene(SHOP)` 时若难度为 INFINITE 则改为 `PLAYING`
2. **开局自动加全 buff**：`GameScene.enter()` 中若难度为 INFINITE：
   ```ts
   for (const item of Object.values(ItemType)) {
     this.game.addOwnedItem(item);
   }
   ```
3. **道具不消耗**：在 `tryDetonate()` 中检测 INFINITE 时跳过 `items.delete(DYNAMITE)`
4. **HUD 提示**：HUD 显示 "🔥 无限火力" 标签

---

## 十一、存档兼容性

### 10.1 旧存档迁移

旧 `GameProgress` 缺少 `difficulty` 字段，加载时默认填 `NORMAL`：
```ts
function migrateProgress(raw: any): GameProgress {
  return {
    difficulty: raw.difficulty ?? Difficulty.NORMAL,
    currentMoney: raw.currentMoney ?? 0,
    currentLevel: raw.currentLevel ?? 1,
    ownedItems: raw.ownedItems ?? [],
  };
}
```

### 10.2 最高分独立存储

```ts
// localStorage key: goldminer_highscore_<difficulty>
storage.getHighScore(difficulty: Difficulty): number
storage.updateHighScore(difficulty: Difficulty, score: number): void
```

旧的全局 `highScore` 字段迁移为 `highscore_NORMAL`。

---

## 十二、实施 Sprint 拆分

| Sprint | 内容 | 工作量 |
|--------|------|--------|
| **S1：核心难度系统** | difficulty.ts 模块 + Game/Storage 改造 + GameScene 应用乘数 | 中 |
| **S2：矿物预算生成器** | 替换 generateMinerals 为预算驱动，加 VALUE_UPGRADE_CHAIN | 中 |
| **S3：UI 层** | DifficultyScene + MenuScene 流转 + HUD 难度标签 | 中 |
| **S4：INFINITE 模式** | 跳商店逻辑 + 道具不消耗 + 全 buff 自动启用 | 小 |
| **S5：存档兼容 + 难度独立高分** | Storage 迁移 + GameOver/Result 展示 | 小 |

**总预计**：8-10 个文件，~400-500 行改动

---

## 十三、风险 & 边界

1. **风险**：旧存档玩家加载后默认 NORMAL，可能与他原始难度不符
   - **缓解**：迁移版本号机制，老存档默认 NORMAL 并 toast 提示
2. **风险**：高手模式时间太短，结合矿物总价值 175%，可能仍有玩家完不成
   - **缓解**：放出后看数据，调整 mineralBudgetRatio 到 200%
3. **风险**：INFINITE 模式过于娱乐化可能破坏成就感
   - **缓解**：INFINITE 模式最高分不参与 NORMAL/HARD/EXPERT 排行
4. **边界**：神秘袋的随机值是否受 valueScale 影响？
   - **决策**：是，统一在 `onHookComplete` 入口处缩放
5. **边界**：Bonus 时间奖励是否受 valueScale 影响？
   - **决策**：**不缩放**（时间奖励是 5$/s 的固定折算，独立于矿物经济）

---

## 十四、ROI 评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 玩家受众扩展 | ⭐⭐⭐⭐⭐ | 覆盖小白到硬核 + 娱乐玩家 |
| 重玩价值 | ⭐⭐⭐⭐⭐ | 5 个独立排行榜，硬核玩家追求高难度通关 |
| 实施成本 | ⭐⭐⭐ | 中等复杂度，~10 文件改动 |
| 兼容风险 | ⭐⭐ | 存档迁移可控 |

**老王推荐**：S1+S2+S3 一次完成（核心可玩），S4+S5 后续 PR。

---

> 文档创建日期：2026-05-18
> 关联文档：[`classic-feature-gaps.md`](./classic-feature-gaps.md)
> 维护：实施过程中根据实际调整数值表 §二、§七
