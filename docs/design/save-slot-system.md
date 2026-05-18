# 多存档槽位系统规划文档

> 黄金矿工 H5 引入 **1 个自动槽位 + 10 个手动槽位**（共 11 个），玩家可在不同难度/不同进度间自由切换。
> 关联文档：[`difficulty-system.md`](./difficulty-system.md)

---

## 一、目标 & 需求

1. **11 个槽位**：
   - **1 个自动槽位（AUTO，编号 0）**：游戏自动写入最新进度
   - **10 个手动槽位（编号 1-10）**：玩家显式"保存到 N"才写入
2. **每个槽位包含**：难度、当前关卡进度、累计金额、已购道具、历史最高分、元信息
3. **支持的操作**：新建 / 继续 / 加载 / 另存为 / 删除手动槽位
4. **向后兼容**：旧单存档无损迁移到自动槽位
5. **全局数据保留**：设置（音量/BGM）、教程已显示标记 跨槽位共享

### 1.1 自动 vs 手动 设计哲学

| 槽位类型 | 写入时机 | 用途 |
|---------|---------|------|
| **自动槽位（0）** | 所有关键事件自动写入（结算/商店/进新关） | 防丢失，关浏览器也能继续 |
| **手动槽位（1-10）** | 玩家显式"保存"才写入 | check point，可回档到任意"已存"点 |

**经典使用场景**：
- 玩家通关 5 关后觉得"这个进度不错"，按 ESC → 暂停菜单 → "保存到槽位 3"
- 继续玩到关卡 7 失败 → 自动槽位记录的是关卡 7 失败状态
- 玩家想回到关卡 5 那个稳定点 → 主菜单 → 加载槽位 3 → 自动槽位被覆盖为槽位 3 的快照 → 从关卡 5 重新出发

---

## 二、设计原则

| 原则 | 说明 |
|------|------|
| 自动槽位是"当前游戏状态" | 一份特殊存档，所有正在游玩的进度都写到这里，不需玩家手动操作 |
| 手动槽位是"快照" | 玩家显式"保存到槽位 N"才写入，作为可回档的 check point |
| 加载手动槽位会覆盖自动槽位 | 加载后自动槽位 = 该手动槽位快照，让游戏从该状态继续 |
| 槽位独立 | 每个槽位绑定一个难度，创建后不可修改难度（要换难度 = 开新游戏） |
| 显式选择 | 启动时必须先选槽位才能进游戏，没有"自动选最后一个"等隐式行为 |
| 元数据丰富 | 每槽位记录最后游玩时间、关卡进度、累计金币，便于槽位列表识别 |
| 全局数据隔离 | 音量/BGM/教程标记**不属于槽位**，跨槽位共享 |
| 防误删 | 删除手动槽位时必须二次确认，**自动槽位不可删除**（仅可被新游戏重置） |

---

## 三、数据结构

### 3.1 槽位类型枚举

```ts
/** 自动槽位编号常量 */
export const AUTO_SLOT_ID = 0;

/** 手动槽位编号范围 1-10 */
export const MANUAL_SLOT_RANGE = { min: 1, max: 10 } as const;

/** 槽位类型 */
export enum SlotKind {
  AUTO = 'AUTO',     // 自动槽位（0）
  MANUAL = 'MANUAL', // 手动槽位（1-10）
}
```

### 3.2 槽位元数据（轻量，仅用于槽位列表展示）

```ts
interface SlotMeta {
  /** 槽位编号：0=自动槽位，1-10=手动槽位 */
  slotId: number;
  /** 槽位类型 */
  kind: SlotKind;
  /** 槽位是否为空（未创建） */
  empty: boolean;
  /** 槽位绑定的难度 */
  difficulty: Difficulty;
  /** 当前关卡（用于显示"第 N 关"） */
  currentLevel: number;
  /** 累计金额 */
  currentMoney: number;
  /** 历史最高分（本槽位） */
  highScore: number;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 最后游玩时间戳（毫秒） */
  lastPlayedAt: number;
}
```

### 3.2 槽位完整存档（玩游戏时加载）

```ts
interface SlotSave {
  meta: SlotMeta;
  progress: GameProgress;  // 复用现有 GameProgress
}

// GameProgress 已有结构（无变更）
interface GameProgress {
  currentMoney: number;
  currentLevel: number;
  ownedItems: string[];
}
```

### 3.3 全局数据（跨槽位共享）

```ts
interface GlobalData {
  /** 全局最高分（跨所有槽位 + 难度，用于成就感展示） */
  globalHighScore: number;
  /** 按难度独立的最高分（跨所有槽位） */
  highScoresByDifficulty: Record<Difficulty, number>;
}

// 仍然属于全局的（不变）：
// - UserSettings: 音量 / BGM / 静音
// - TUTORIAL_KEY: 教程已显示
```

---

## 四、localStorage Key 结构

```
全局共享：
  goldminer_h5_settings         (UserSettings)
  goldminer_tutorial_shown      ('1' or null)
  goldminer_h5_global           (GlobalData，含全局/难度最高分)

自动槽位（编号 0，固定 key）：
  goldminer_h5_slot_0_meta      (SlotMeta JSON，kind=AUTO)
  goldminer_h5_slot_0_progress  (GameProgress JSON)

手动槽位（编号 1-10）：
  goldminer_h5_slot_1_meta      (SlotMeta JSON，kind=MANUAL)
  goldminer_h5_slot_1_progress
  goldminer_h5_slot_2_meta
  goldminer_h5_slot_2_progress
  ...
  goldminer_h5_slot_10_meta
  goldminer_h5_slot_10_progress
```

> 注：旧的 `goldminer_h5_save` / `goldminer_h5_progress` 在迁移完成后删除（迁移到自动槽位 0）。

---

## 五、Storage 模块 API 变更

### 5.1 新增槽位 API

```ts
class Storage {
  // —— 槽位列表 ——
  /** 获取全部 11 个槽位的元数据（含自动槽位 0 + 手动槽位 1-10） */
  listAllSlots(): SlotMeta[];
  
  /** 仅获取手动槽位列表（用于"另存为"选择界面） */
  listManualSlots(): SlotMeta[];
  
  /** 获取自动槽位的元数据（始终存在，可能为空） */
  getAutoSlot(): SlotMeta;
  
  /** 获取指定槽位的元数据 */
  getSlotMeta(slotId: number): SlotMeta | null;
  
  /** 判断槽位是否非空 */
  isSlotOccupied(slotId: number): boolean;

  // —— 自动槽位 API（核心） ——
  /** 自动保存进度到 AUTO 槽位（关键事件触发，详见 §9.3） */
  autoSave(progress: GameProgress, difficulty: Difficulty): void;
  
  /** 从自动槽位加载（"继续上次"按钮使用） */
  loadAutoSlot(): SlotSave | null;
  
  /** 重置自动槽位（新游戏开始时清空） */
  resetAutoSlot(): void;

  // —— 手动槽位 API ——
  /**
   * "另存为"：将当前游戏状态（即自动槽位的内容）保存到指定手动槽位
   * 不影响自动槽位
   */
  saveToManualSlot(slotId: number): SlotMeta;
  
  /**
   * 加载手动槽位：把该手动槽位的快照复制到自动槽位
   * 加载后游戏从该状态继续，所有自动存档继续覆盖自动槽位
   */
  loadManualSlot(slotId: number): SlotSave | null;
  
  /** 删除手动槽位（自动槽位不可删） */
  deleteManualSlot(slotId: number): void;

  // —— 活跃槽位（仅用于 UI 高亮，存档逻辑不依赖此） ——
  /** 标记当前游戏来源于哪个槽位（自动 0 或手动 1-10） */
  setActiveSlot(slotId: number): void;
  getActiveSlot(): number | null;
  clearActiveSlot(): void;

  // —— 全局数据 ——
  /** 全局最高分（跨所有槽位+难度） */
  getGlobalHighScore(): number;
  
  /** 难度最高分（跨所有槽位，特定难度） */
  getHighScoreByDifficulty(difficulty: Difficulty): number;
  
  /** 更新最高分（自动 + 难度 + 全局三处统一刷新） */
  updateAllHighScores(difficulty: Difficulty, score: number): void;
}
```

### 5.2 关键 API 行为说明

**`autoSave()` 调用流程**：
```
关卡通过 → ResultScene.enter()
  → game.commitLevelResult()
  → storage.autoSave(progress, difficulty)
  → 写入 slot_0_meta + slot_0_progress
  → meta.lastPlayedAt = Date.now()
```

**`saveToManualSlot(N)` 调用流程**：
```
玩家按 ESC → 暂停菜单 → "另存为槽位 N"
  → 读取自动槽位当前状态
  → 复制到 slot_N_meta + slot_N_progress
  → 自动槽位不变
```

**`loadManualSlot(N)` 调用流程**：
```
主菜单 → 槽位选择 → 点击手动槽位 N
  → 读取 slot_N（快照）
  → 复制到自动槽位（覆盖）
  → 设 activeSlot=0（标识当前是自动槽位在写）
  → 进入 PLAYING
  → 之后所有 autoSave 仍写自动槽位（手动槽位 N 保持快照不变）
```

### 5.2 废弃 API（迁移完成后移除）

```ts
// 标记 @deprecated，先保留以兼容：
- getHighScore()       → 改用 getGlobalHighScore() 或 getHighScoreByDifficulty()
- updateHighScore()    → 改用 updateAllHighScores()
- saveProgress()       → 改用 saveSlotProgress(activeSlot, ...)
- loadProgress()       → 改用 loadSlot(activeSlot).progress
- hasProgress()        → 改用 isSlotOccupied(activeSlot)
- clearProgress()      → 改用 deleteSlot(activeSlot)
```

---

## 六、UI/UX 设计

### 6.1 主菜单流程调整

```
启动 → 主菜单
  ├─ [继续游戏]    → 加载自动槽位 → PLAYING（自动槽位为空则禁用）
  ├─ [新游戏]      → DifficultyScene → 重置自动槽位 → PLAYING
  ├─ [读取存档]    → SlotSelectScene（11 槽位列表）
  └─ [设置]        → SettingsScene
```

### 6.2 存档槽位选择场景（SlotSelectScene）

布局：**第一行单独放自动槽位（强调），下面 2 行 × 5 列放手动槽位 1-10**

```
┌────────────────────────────────────────────────────────────────┐
│                    存档管理（共 11 个槽位）                      │
├────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐    │
│ │ ⚡ 自动存档        难度: 一般  第 5 关  $1240            │    │
│ │  最后游玩: 刚刚                          [继续] [覆盖]   │    │
│ └────────────────────────────────────────────────────────┘    │
├────────────────────────────────────────────────────────────────┤
│   手动槽位（玩家显式保存的 check point）                          │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │
│ │ #1   │ │ #2   │ │ #3   │ │ #4   │ │ #5   │                 │
│ │ 一般  │ │ 高手  │ │ [空] │ │ 困难  │ │ [空] │                 │
│ │ 第3关 │ │ 第6关 │ │      │ │ 第8关 │ │      │                 │
│ │ $450 │ │ $1200 │ │      │ │ $1830 │ │      │                 │
│ │ 昨天  │ │ 3天前 │ │      │ │ 一周前 │ │      │                 │
│ │[载入] │ │[载入] │ │      │ │[载入] │ │      │                 │
│ │[删除] │ │[删除] │ │      │ │[删除] │ │      │                 │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                 │
│ │ #6   │ │ #7   │ │ #8   │ │ #9   │ │ #10  │                 │
│ │ ...                                                          │
│ └──────┘                                                       │
├────────────────────────────────────────────────────────────────┤
│                     [返回主菜单]                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.3 自动槽位卡片行为

| 自动槽位状态 | 显示 | 可点击按钮 |
|------------|------|----------|
| 空（首次启动 / 未开始游戏） | "⚡ 自动存档（暂无）" | （无按钮） |
| 进行中 | 难度 + 关卡 + 金额 + 最后游玩时间 | [继续]：直接进游戏<br>[覆盖]：警告"将丢失当前进度"二次确认后开新游戏 |
| 已通关 | "已通关 ✓" + 总金额 + 难度 | [新游戏]：重置自动槽位重玩 |

> ⚠️ **自动槽位不可删除**，但可被"新游戏"重置

### 6.4 手动槽位卡片行为

| 手动槽位状态 | 显示 | 可点击按钮 |
|------------|------|----------|
| 空 | "[空槽位]" | （仅在游戏中通过"另存为"才能写入） |
| 已用 | 难度 + 关卡 + 金额 + 保存时间 | [载入]：复制到自动槽位 → 进游戏<br>[删除]：二次确认后清空 |
| 已通关 | "已通关 ✓" + 难度 + 最终金额 | [载入]<br>[删除] |

### 6.5 游戏内"另存为"入口

游戏中按 **ESC** → 暂停菜单增加新选项：

```
┌────────────────────────────────┐
│         游戏暂停                │
├────────────────────────────────┤
│   [继续游戏]                    │
│   [💾 另存为...]                │  ← 新增
│   [返回主菜单]                  │
└────────────────────────────────┘

点击"另存为..." → 弹出手动槽位选择对话框：
┌────────────────────────────────┐
│   选择槽位保存                  │
├────────────────────────────────┤
│  [#1 一般·第3关·$450]    ⚠️ 覆盖 │
│  [#2 高手·第6关·$1200]   ⚠️ 覆盖 │
│  [#3 空槽位]                    │
│  ...                            │
│  [#10 空槽位]                   │
│                  [取消]          │
└────────────────────────────────┘
```

非空槽位"另存为"时，二次确认"将覆盖已有快照"。

### 6.6 游戏内 HUD 标识

HUD 右下角小字：
```
难度: 高手 · 自动存档
```

或加载手动槽位 N 后（提示玩家"该自动槽位的快照源自手动槽位 N"）：
```
难度: 高手 · 自动存档（来自槽位 3）
```

---

## 七、与难度系统的关系

### 7.1 槽位 = 难度绑定

- 槽位创建时确定难度，**之后不可修改**
- 想换难度的玩家：到 SlotSelectScene 删除旧槽位 + 新建槽位 OR 选另一个空槽位
- 这种设计避免"中途切难度刷高分"的滥用

### 7.2 最高分三层结构

| 层级 | 范围 | 用途 |
|------|------|------|
| **槽位最高分** | 单槽位内 | 显示在槽位卡片上 |
| **难度最高分** | 跨所有槽位 + 单一难度 | GameOver 时展示"打破了一般难度最高分！" |
| **全局最高分** | 跨所有槽位 + 所有难度 | 主菜单顶部炫耀展示 |

---

## 八、迁移策略

### 8.1 旧存档迁移

```
启动时 Storage 初始化：
  1. 检测是否存在旧 key (goldminer_h5_progress / goldminer_h5_save)
  2. 若存在 AND 自动槽位为空（所有手动槽位也为空更好）：
     a. 把旧进度迁移到【自动槽位】（kind=AUTO, slotId=0）：
        - difficulty = Difficulty.NORMAL（旧版默认）
        - progress 复制自旧 PROGRESS_KEY
        - highScore 复制自旧 STORAGE_KEY.highScore（同时写入全局难度高分表）
     b. 删除旧 key
     c. console.info('旧存档已迁移到自动槽位')
  3. 若新槽位已有数据：不动旧 key，但也不重复迁移
```

> 选择迁移到自动槽位（而非手动 1）的原因：自动槽位代表"当前游戏状态"，旧存档玩家继续游戏的体感最自然。

### 8.2 SAVE_VERSION 升级

```ts
const SAVE_VERSION = 3;  // v2 → v3 引入槽位
```

槽位元数据本身带 version 字段（未来再升级时按版本号迁移）。

---

## 九、Game.ts 状态机调整

### 9.1 新增 GameState

```ts
export enum GameState {
  MENU,
  SLOT_SELECT,       // 新增：槽位选择
  DIFFICULTY_SELECT, // 新增：难度选择（仅新建槽位时）
  READY,
  PLAYING,
  REELING,
  RESULT,
  SHOP,
  GAME_OVER,
}
```

### 9.2 Game 持有 activeSlot 状态

```ts
class Game {
  private activeSlot: number | null = null;
  
  loadSlotAndStart(slotId: number): void;
  createSlotAndStart(slotId: number, difficulty: Difficulty): void;
  exitToMenu(): void;  // 清除 activeSlot，返回主菜单
}
```

### 9.3 自动存档触发点（写入自动槽位）

> ⚠️ **核心原则**：**所有自动写入只动自动槽位（0）**，手动槽位 1-10 仅由玩家在"另存为"时显式触发。
> 改进点：当前实现是"结算 → 商店过渡瞬间"才存档，新方案改为 **ResultScene.enter() 计算完 Bonus 立即存档**，确保"看到结算页 = 进度固化"。

#### 自动槽位触发点矩阵

| 时机 | 操作 | 写入自动槽位 | 优先级 |
|------|------|------------|--------|
| **关卡通过 → ResultScene.enter()** | totalMoney = earned + bonus 后立即 autoSave | ✅ **核心点** | 高 |
| 商店购买道具 | autoSave（更新 ownedItems） | ✅ | 高 |
| 商店 → 下一关 PLAYING | autoSave + meta.currentLevel++ | ✅ | 高 |
| 通关全部关卡 → GameOverScene | autoSave（标记"已通关"）+ updateAllHighScores | ✅ | 高 |
| 关卡失败（金额不足） | meta.lastPlayedAt 更新，progress 不变（让玩家重试） | ⚠️ 仅元数据 | 中 |
| 浏览器关闭 / visibilitychange | beforeunload 监听，紧急 autoSave | ✅ 防丢失保险 | 低 |

#### 手动槽位触发点矩阵

| 时机 | 操作 | 写入手动槽位 | 触发方式 |
|------|------|------------|---------|
| 暂停菜单点击 "另存为槽位 N" | 复制自动槽位 → 手动槽位 N | ✅ | 玩家显式 |
| SlotSelectScene "覆盖" 按钮（手动槽位卡片） | 复制自动槽位 → 手动槽位 N | ✅ | 玩家显式 |
| 删除手动槽位 N | 清除 slot_N_meta + slot_N_progress | ❌（实际是清空） | 玩家显式 |

#### 存档点设计原则

1. **"结算页面 = 上锁"**：玩家看到 Bonus 数字时，自动槽位必须已固化
2. **失败不存进度**：让玩家放心重试，不被"上次失败的状态"绑架
3. **手动槽位是快照**：写入后不再被自动覆盖，只能由玩家主动"覆盖保存"或删除
4. **自动槽位永远代表当前游戏**：加载手动槽位时也是"复制到自动槽位"再继续

#### Game.ts 实施代码草案

```ts
// 关键变更：ResultScene 通过时主动通知 Game 自动存档
class ResultScene {
  enter(): void {
    // ... 动画初始化 ...
    if (this.isPassed) {
      // 立即结算到累计金额并写入自动槽位
      this.game.commitLevelResult(this.earnedMoney + this.bonusMoney);
    }
  }
}

class Game {
  /** 关卡通过即时存档到自动槽位（确保 Bonus 不丢失） */
  commitLevelResult(totalEarned: number): void {
    this.currentMoney += totalEarned;
    this.storage.autoSave(this.buildProgress(), this.currentDifficulty);
    this.storage.updateAllHighScores(this.currentDifficulty, this.currentMoney);
  }

  /** 玩家点击"另存为槽位 N"（暂停菜单调用） */
  saveAsManualSlot(slotId: number): void {
    this.storage.saveToManualSlot(slotId);
    // 提示 toast: "已保存到槽位 N"
  }

  /** 玩家在 SlotSelectScene 加载手动槽位 N */
  loadFromManualSlot(slotId: number): void {
    const save = this.storage.loadManualSlot(slotId);
    if (!save) return;
    // loadManualSlot 内部已复制到自动槽位，此处恢复内存状态
    this.currentMoney = save.progress.currentMoney;
    this.levelManager.setLevel(save.progress.currentLevel);
    this.currentDifficulty = save.meta.difficulty;
    // 恢复道具
    this.ownedItems.clear();
    for (const itemStr of save.progress.ownedItems) {
      this.ownedItems.add(itemStr as ItemType);
    }
    this.changeScene(GameState.PLAYING);
  }
}
```

---

## 十、涉及代码改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/core/Storage.ts` | 大改 | 重构为 11 槽位结构（1 自动 + 10 手动），保留旧 API 兼容期 |
| `src/core/Game.ts` | 改 | activeSlot 状态 + autoSave/saveAsManualSlot/loadFromManualSlot |
| `src/scene/MenuScene.ts` | 改 | 主菜单按钮调整：[继续游戏]/[新游戏]/[读取存档] |
| **新建** `src/scene/SlotSelectScene.ts` | 新建 | 11 槽位列表（自动 1 + 手动 10） + 载入/覆盖/删除 |
| **新建** `src/scene/DifficultyScene.ts` | 新建 | 难度选择（仅在"新游戏"时显示，与难度系统协同） |
| **新建** `src/scene/SaveAsDialog.ts` | 新建 | 暂停菜单"另存为"弹窗，10 个手动槽位选择 |
| `src/scene/GameScene.ts` | 改 | 暂停菜单加"另存为..."按钮 |
| `src/scene/GameOverScene.ts` | 改 | 展示难度最高分 + 全局最高分 |
| `src/scene/ResultScene.ts` | 改 | 通过时显示槽位 + 难度信息 |
| `src/ui/HUD.ts` | 改 | 右下角加槽位/难度标识 |

---

## 十一、实施 Sprint 拆分

| Sprint | 内容 | 工作量 |
|--------|------|--------|
| **S1：Storage 11 槽位重构** | autoSave/loadAutoSlot + saveToManualSlot/loadManualSlot + 旧数据迁移 | 中 |
| **S2：SlotSelectScene** | 11 卡片 UI（自动 1 + 手动 10）+ 载入/覆盖/删除 + 二次确认 | 中 |
| **S3：暂停"另存为"机制** | GameScene 暂停菜单加按钮 + SaveAsDialog 弹窗 | 小 |
| **S4：Game 状态机改造** | activeSlot + autoSave 触发点统一接入 + MenuScene 入口调整 | 中 |
| **S5：HUD/Result/GameOver** | 显示槽位+难度信息 + 最高分三层展示 + ResultScene.enter() 即时存档 | 小 |
| **S6：与难度系统联调** | DifficultyScene + 槽位创建/加载与难度衔接 | 小 |

> **总预计**：6-7 个文件改动 + 3 个新建，~700-800 行

---

## 十二、推荐实施顺序（与难度系统协同）

由于槽位系统与难度系统强关联（槽位 = 难度绑定），老王建议**两套系统一起实施**：

```
阶段 1（核心数据层）：
  - difficulty.ts 模块定义
  - Storage 槽位重构（含难度字段）
  - Game.activeSlot + Game.currentDifficulty

阶段 2（UI 层）：
  - SlotSelectScene
  - DifficultyScene
  - MenuScene 流转

阶段 3（应用层）：
  - GameScene 应用难度乘数
  - 矿物预算生成器（与难度联动）
  - HUD/Result/GameOver 信息展示

阶段 4（兼容性）：
  - 旧存档迁移
  - INFINITE 模式特殊处理
  - 道具持久化机制（#7#8 联动）
```

---

## 十三、边界 & 风险

| 编号 | 风险 | 缓解 |
|------|------|------|
| R1 | 旧版本玩家进度被覆盖 | 迁移仅在所有新槽位为空时执行，否则保留 |
| R2 | 10 个槽位 × 道具/进度数据可能膨胀 localStorage | 单槽位 ~1KB，10 槽位 + 全局 ~12KB，远低于 5MB 限制 |
| R3 | 玩家误删槽位 | 二次确认 + 7 天回收站（可选高阶功能，本期跳过） |
| R4 | 槽位列表展示性能 | 10 个 SlotMeta 是 O(10) 读取，可接受 |
| R5 | 难度切换被绕过（玩家手改 localStorage） | 不防小人，设计假设玩家诚实 |

---

## 十四、ROI 评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 玩家体验 | ⭐⭐⭐⭐⭐ | 多人共用设备 / 同玩家多难度并行的核心需求 |
| 与难度系统协同 | ⭐⭐⭐⭐⭐ | 槽位 = 难度容器，天然契合 |
| 实施成本 | ⭐⭐⭐ | 中等复杂度，需新建 2 个场景 + 重构 Storage |
| 兼容风险 | ⭐⭐ | 迁移策略明确，可控 |

**老王推荐**：**与难度系统打包一起实施**，避免后续返工 Storage 结构。

---

> 文档创建日期：2026-05-18
> 关联文档：[`difficulty-system.md`](./difficulty-system.md) / [`classic-feature-gaps.md`](./classic-feature-gaps.md)
> 维护：实施过程中根据 UI 设计实际调整 §6 卡片布局参数
