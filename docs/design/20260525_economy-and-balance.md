# 数值平衡与经济系统速查（v3 当前真值）

> **创建：** 2026-05-25
> **当前生效版本** ✅ 与 `src/level/difficulty.ts` / `src/scene/GameScene.ts` / `src/entity/types.ts` 实时对齐
> **历史快照（参考用）：**
>   - `20260518_difficulty-system.md` — 难度系统总览（参数已迭代）
>   - `20260519_difficulty-tuning.md` — v1 调优报告（已废弃）
>   - `20260520_gold-budget-rework.md` — 金块保底改造报告（部分概念仍适用）

---

## 一、5 档难度完整配置表

> 源：`src/level/difficulty.ts:64-163`

| 字段 | NOVICE | NORMAL | HARD | EXPERT | INFINITE |
|------|--------|--------|------|--------|----------|
| `valueScale`（入账倍率） | **×1.5** | **×0.75** | **×0.50** | **×0.40** | ×1.0 |
| `timeScale` | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| `weightFactorScale`（重物拖拽系数） | **0**（无重量） | 1.0 | 1.5 | 1.5 | 0 |
| `motionSpeedScale`（钩爪+动物速度） | 0.85 | 0.85 | **1.0** | **1.3** | 0.85 |
| `mineralBudgetRatio`（金块保底倍率） | 1.7 | 1.0 | 1.25 | 1.25 | 3.0 |
| `largeWeightScale`（基础生成大件压制） | 1.0 | 0.35 | 0.25 | 0.05 | 1.0 |
| `goldRefillWeights`（保底追加 [S/M/L]） | [.20,.35,.45] | [.40,.40,.20] | [.55,.35,.10] | [.55,.35,.10] | [.20,.35,.45] |
| `mineralBudgetCap`（金块上限倍率） | **2.5** | **1.6** | 1.20 | 1.30 | 2.0 |
| `shopEnabled` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `infiniteItems` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `isHardcore` | ✗ | ✗ | ✓ | ✓ | ✗ |
| `leaderboardWeight` | 0.4 | 1.0 | 2.5 | 3.5 | 0.3 |

### 1.1 字段语义

- **`valueScale`**：玩家抓矿物最终入账金额的倍率。HUD/排行榜看到的就是乘后值。
- **`timeScale`**：关卡 `timeLimit` 缩放系数（当前 5 档全 = 1.0，仅作为未来调优开关保留）。
- **`weightFactorScale`**：与全局 `WEIGHT_FACTOR=1.0` 相乘控制重物收回慢的程度。
  `reelSpeed = baseSpeed / (1 + weight × WEIGHT_FACTOR × weightFactorScale)`
  NOVICE/INFINITE = 0 表示重物拖拽完全消失（手感最爽）。
- **`motionSpeedScale`**：同时驱动钩爪甩动速度（`Hook.swingSpeedScale`）与移动型矿物（猪子/水晶蟹）水平速度。HARD=1.0 为基准。
- **`mineralBudgetRatio`**：金块（GOLD_SMALL/MEDIUM/LARGE，**不含钻石**）总金额相对于本关增量的最低保障倍率。
- **`largeWeightScale`**：基础生成阶段对 GOLD_MEDIUM/LARGE/DIAMOND 权重的同比例打折。
- **`goldRefillWeights`**：金块保底追加阶段（场上金块不够 budget 时）的品种权重。**与 `largeWeightScale` 解耦**，2026-05-23 重构后单独配置，避免高难度只灌 SMALL 形成"小金海"。
- **`mineralBudgetCap`**：场上金块总值上限倍率。超过 `budget × cap` 触发降级（LRG→MED→SMALL）。
- **`isHardcore`**：硬核标记。关卡结束清除全部 persistent 道具 + 商店隐藏摇晃饮料 + 摇晃饮料效果强制 return。**目前还驱动 2026-05-25 新增的"前 3 关 ratio 收紧"逻辑。**

---

## 二、矿物原值表（固定 vs 随机）

> 源：`src/entity/types.ts:48-189` + `src/entity/Mineral.ts:100-143`

### 2.1 价格**固定**（直接读 `MINERAL_CONFIGS`）

| 类型 | 内部原值 | 内部重量 | 半径 | 说明 |
|------|---------|---------|------|------|
| `GOLD_SMALL` | **50** | 0.3 | 20 | 小金块 |
| `GOLD_MEDIUM` | **250** | 1.2 | 30 | 中金块 |
| `GOLD_LARGE` | **500** | 2.5 | 42 | 大金块（最沉，约 8s 收回） |
| `DIAMOND` | **600** | 0.2 | 18 | 钻石（不算金块） |
| `BOMB` | **-100** | 0.2 | 18 | 炸弹（负值扣分） |
| `BONE` | **11** | 1.2 | 24 | 骨头 |
| `MOUSE` | **20** | 0.3 | 16 | 猪子（移动） |
| `MOLE` | **50** | 0.5 | 20 | 水晶蟹（移动，30% 概率额外 +600 内部值） |
| `CRYSTAL_ORE` | **400** | 0.4 | 22 | Ch1 章末专属收藏品 |
| `CRAB_SHELL` | **800** | 0.5 | 26 | Ch2 章末专属收藏品 |
| `PIGGY_GEM` | **1500** | 0.3 | 28 | Ch3 终极收藏品 |

### 2.2 价格**随机**（Mineral 构造时随机）

| 类型 | 随机方式 | 取值范围 |
|------|---------|---------|
| `STONE` | 抽小/中/大三档（权重 0.5/0.3/0.2），档内随机 | 小 5-10 / 中 10-20 / 大 25-45 |
| `MYSTERY_BAG` | 抽 `MYSTERY_CONTENTS` 内容 → 现金类再区间随机 | 小钱包 50-200 / 大钱包 400-800 / 道具类 0 |
| `WOODEN_BOX` | 抽 `BOX_CONTENTS`（钻 800/金 500/铜 200/空 0/骷髅 -100~-300） | 见 `Mineral.ts:47-55` |

> 💡 **关键设计**：金块（你最常调参的核心矿物）一律固定值，没有运行时随机。差异化全部走 `valueScale` 一个旋钮，调参点单一。

---

## 三、入账结算公式

> 源：`src/scene/GameScene.ts:991-1017`（普通矿物） + `:1064-1066`（神秘袋） + `:1124-1126`（木箱）

```ts
// 入账金额 = round(矿物原值 × 道具加成 × valueScale)
hud.money += Math.round(value × difficulty.valueScale);
```

### 3.1 道具加成清单（顺序：先道具后难度）

| 道具 | 影响矿物 | 加成 |
|------|---------|------|
| `STONE_BOOK`（爱心抱枕） | STONE | ×3 |
| `MOUSE_POISON`（猪猪魔法） | MOUSE | ×5 |
| `DIAMOND_OIL`（绮彩变色油） | DIAMOND | ×2 |
| `LUCKY_CLOVER`（幸运草） | MYSTERY_BAG | 现金内容下限提升到 200 |

水晶蟹带绮彩（30% 概率，构造时确定）：抓取时 `value += 600`（内部值）。

### 3.2 各档难度典型矿物入账对照

| 矿物 | NOVICE ×1.5 | NORMAL ×0.75 | HARD ×0.50 | EXPERT ×0.40 |
|------|-------------|--------------|------------|--------------|
| GOLD_SMALL (50) | $75 | $38 | $25 | $20 |
| GOLD_MEDIUM (250) | $375 | $188 | $125 | $100 |
| GOLD_LARGE (500) | **$750** | **$375** | **$250** | **$200** |
| DIAMOND (600) | $900 | $450 | $300 | $240 |
| PIGGY_GEM (1500) | $2250 | $1125 | $750 | $600 |
| 大石头 (45) + 爱心抱枕 ×3 | $202 | $101 | $67 | $54 |

### 3.3 HUD.money 与 levelEarning 的关系

```
HUD.money       = 玩家累计入账（已乘 valueScale），从 levelStartMoney 起步
levelStartMoney = 进入本关时玩家已累计的金额
targetMoney     = 截止本关结束玩家应累计达到的金额（来自 levels.ts，HUD 视角）
levelEarning    = targetMoney - 上关 targetMoney（本关增量，HUD 视角）
```

**所有 HUD 显示值都是玩家视角（已乘 valueScale）。** 调参时 `target` / `earning` / `ratio` 这几个语义参数都按"玩家应看到几倍"理解，不用心算 valueScale。

---

## 四、金块保底策略

> 源：`src/scene/GameScene.ts:1160-1230` （`generateMinerals` / `ensureGoldBudget` / `downgradeGoldToReachCap`）

### 4.1 完整生成流水线

```
1) 基础加权生成（mineralCount 个）
   - 按 mineralWeights 抽 type
   - GOLD_MEDIUM/LARGE/DIAMOND 权重经 largeWeightScale 打折

2) 金块保底（场上金块原值 < goldBudget 时循环追加）
   - 追加品种按 goldRefillWeights 加权
   - 上限 30 次（GOLD_BUDGET_MAX_APPEND）

3) cap 降级（场上金块原值 > goldBudget × cap 时降级）
   - 找当前最大金块（LRG → MED → SMALL）逐次降一级
   - 直到落到 cap 以下

4) 章节末关 30% 概率追加章节收藏品
5) L5+ 关卡保证 1 个木箱
6) 幸运草 buff：神秘袋现金最低 200
```

### 4.2 核心公式（保底视角等价性）

```ts
// goldBudget 用「内部原值」计算（不是入账值），但语义等价于「玩家视角」
const effectiveRatio = isHardcore && level ≤ 3 ? 1.0 : difficulty.mineralBudgetRatio;
const goldBudget = (levelEarning × effectiveRatio) / valueScale;
const goldCap   = goldBudget × mineralBudgetCap;
```

| 视角 | 等式 |
|------|------|
| 内部视角 | `goldBudget(内部) = levelEarning × ratio / valueScale` |
| 玩家视角 | `goldBudget × valueScale = levelEarning × ratio` |

→ **`ratio` 的语义 = "场上金块全部抓到后玩家看到的金额 / levelEarning"**

### 4.3 各档 L4 保底实算（举例）

| 项目 | NOVICE | NORMAL | HARD | EXPERT |
|------|--------|--------|------|--------|
| `levelEarning`（L4 HUD 增量） | $350 | $350 | $350 | $350 |
| `effectiveRatio`（L4 不在前 3 关） | 1.7 | 1.0 | 1.25 | 1.25 |
| `valueScale` | 1.5 | 0.75 | 0.50 | 0.40 |
| **`goldBudget`（内部值）** | 397 | 467 | 875 | 1094 |
| **`goldCap` = budget × cap（内部值）** | 992 | 747 | 1050 | 1422 |
| 玩家视角等价 = budget × scale | $595 | $350 | $438 | $438 |
| 富裕度 = 等价值 / earning | **1.70×** | **1.00×** | **1.25×** | **1.25×** |

---

## 五、关卡 target 曲线（21 关 + 无尽）

> 源：`src/level/levels.ts:103-280` + `getEndlessLevelConfig:295`

### 5.1 全 21 关 + 无尽前 3 关

| 章节 | 关卡 | 累计 target | 增量 | 时间 | 矿物数 | 备注 |
|------|------|------------|------|------|--------|------|
| **Ch1** | L1 | $200 | $200 | 60s | 10 | 起步 |
| | L2 | $450 | $250 | 60s | 12 | |
| | L3 | $750 | $300 | 60s | 13 | |
| | L4 | $1100 | $350 | 55s | 14 | |
| | L5 | $1500 | $400 | 55s | 15 | 木箱启用 |
| | L6 | $1950 | $450 | 55s | 16 | |
| | L7 | $2450 | $500 | 50s | 17 | 章末（水晶矿石 +30%） |
| **Ch2** | L8 | $3050 | $600 | 55s | 18 | 跨章跳档 |
| | L9 | $3700 | $650 | 55s | 18 | |
| | L10 | $4400 | $700 | 55s | 19 | |
| | L11 | $5150 | $750 | 50s | 19 | |
| | L12 | $5950 | $800 | 50s | 20 | |
| | L13 | $6800 | $850 | 50s | 20 | |
| | L14 | $7750 | $950 | 45s | 21 | 章末（蟹甲 +30%） |
| **Ch3** | L15 | $8750 | $1000 | 50s | 21 | |
| | L16 | $9850 | $1100 | 50s | 22 | |
| | L17 | $11050 | $1200 | 45s | 22 | |
| | L18 | $12350 | $1300 | 45s | 22 | |
| | L19 | $13750 | $1400 | 45s | 23 | |
| | L20 | $15250 | $1500 | 40s | 23 | |
| | L21 | $17000 | **$1750** | 40s | 24 | 终关（猪猪粉宝石 +30%） |
| **无尽** | L22 | $19000 | $2000 | 40s | 25 | offset=1 |
| | L23 | $21250 | $2250 | 39s | 26 | +250 |
| | L24 | $23750 | $2500 | 38s | 27 | +250 |

### 5.2 无尽模式公式（L22+）

```
累计 target = lastTarget + 2000×offset + 125×(offset-1)×offset
mineralCount = min(30, lastCount + offset)
timeLimit = max(25, lastTime - offset + 1)
```

其中 `offset = level - 21`，`lastTarget = 17000`，`lastCount = 24`，`lastTime = 40`。

### 5.3 各档"实际原值压力"对比（以 L21 为例）

| 难度 | HUD 增量 | 实际需要的内部原值 | 等效"几个 GOLD_LARGE($500)" |
|------|---------|------------------|---------------------------|
| NOVICE (×1.5) | $1750 | $1167 | ≈ 2.3 个 |
| NORMAL (×0.75) | $1750 | $2333 | ≈ 4.7 个 |
| HARD (×0.50) | $1750 | **$3500** | **≈ 7 个** |
| EXPERT (×0.40) | $1750 | $4375 | ≈ 8.75 个 |
| INFINITE (×1.0) | $1750 | $1750 | ≈ 3.5 个 |

---

## 六、2026-05-25 规则增强（最近一轮）

### 6.1 高难度前 3 关 ratio 收紧

> 源：`src/scene/GameScene.ts:172-175` + `:1184-1190`

```ts
const EARLY_HARDCORE_RATIO_OVERRIDE = 1.0;
const EARLY_HARDCORE_LEVEL_THRESHOLD = 3;
```

**触发条件**：`difficulty.isHardcore && level ≤ 3` → 强制覆盖 `mineralBudgetRatio = 1.0`
**影响范围**：仅 HARD/EXPERT 的 L1-L3
**设计动因**：避免 HARD/EXPERT 起步关因预算富裕（默认 1.25）"傻瓜过"，让高手玩家从 L1 就要主动抓 ~80% 矿物。
**实测效果**：HARD L1 通关率 100% → 95%，平均失误数 0.5 → 1.0。

### 6.2 大件矿物下层偏置

> 源：`src/scene/GameScene.ts:181-191` + `:1300-1314`

```ts
const LARGE_MINERAL_TYPES = [GOLD_LARGE, DIAMOND, MYSTERY_BAG];
const LARGE_MINERAL_Y_MIN_FACTOR = 0.4;  // 大件 y 起点 = MA_TOP + 0.4 × 矿区高度
```

**效果**：大件被限制在矿区下 60% 区域（y ≥ 335，矿区 225-500），避免钩爪一甩就秒抓。
**调优历史**：0.5（下 50%）让 EXPERT 通关率掉到 -8%（瞄准窗口过窄），放宽到 0.4 后 HARD 抬难效果保留，EXPERT 仅 -7%。

### 6.3 NOVICE/NORMAL cap 放宽

> 源：`src/level/difficulty.ts:80` + `:101`

| 难度 | 旧 cap | 新 cap |
|------|--------|--------|
| NOVICE | 1.40 | **2.5** |
| NORMAL | 1.20 | **1.6** |

**问题**：旧 cap 让自然生成的大件被 `downgradeGoldToReachCap` 循环砍光，NOVICE L1 大件占比仅 2%（基本看不到）。
**效果**：NOVICE L1 大件占比 2% → 12%（6× 提升）；NORMAL 79% 通关率 → 82%（更贴期望 80%）。
**HARD/EXPERT 不受影响**：它们的 `lws` 已抑制基础生成，cap 触发频率低。

---

## 七、v3 仿真验证（当前 4 档通关率）

> 工具：`scripts/analyze-difficulty.mjs` — 三层模拟（贪心 / 完美玩家 / 失误玩家）

### 7.1 期望基准

| 难度 | 期望通关率 | 失误容忍 | ROI Top-K（眼力差） |
|------|----------|---------|-------------------|
| NOVICE | 95% | 9 次/关 | 4 |
| NORMAL | 80% | 6 次/关 | 3 |
| HARD | 60% | 4 次/关 | 3 |
| EXPERT | 45% | 2 次/关 | 2 |

### 7.2 当前实测（2026-05-25 跑分）

| 难度 | 期望 | 实测失误容忍通关率 | 平均失误 | 用时% | 评估 |
|------|------|------------------|---------|------|------|
| NOVICE | 95% | **100%** | 0.9/9 | 21% | ✅ 达标 |
| NORMAL | 80% | **82%** | 1.9/6 | 59% | ✅ 达标 |
| HARD | 60% | **59%** | 2.1/4 | 74% | ✅ 达标 |
| EXPERT | 45% | **38%** | 2.3/2 | 81% | ⬇️ 偏难 -7%（超 ±5%） |

### 7.3 已知问题

- **EXPERT 偏难 -7%**：超出 ±5% 容忍区。本质是 `motionSpeedScale=1.3 + valueScale=0.40 + lws=0.05` 三重压制叠加，对 L1-L3 ratio 收紧 + 大件下层偏置敏感。
- **末关难度悬崖**：
  - NORMAL L19-L21（56%/54%/8%）
  - HARD L14, L17-L21（6 关警戒）
  - EXPERT L16-L21（最后 5 关 0%）

---

## 八、调参快速参考

| 你想达到的效果 | 调哪个参数 | 文件:行号 |
|---------------|-----------|----------|
| 整体提高某难度难度 | 降 `valueScale` | `difficulty.ts:67+` |
| 让大件更少出现（场上零碎化） | 降 `largeWeightScale` | `difficulty.ts:67+` |
| 大件多但 cap 把它砍了 | 提高 `mineralBudgetCap` | `difficulty.ts:67+` |
| 场上金块总值不够 | 提高 `mineralBudgetRatio` | `difficulty.ts:67+` |
| 让保底追加偏向大件（解决"小金海"） | 调 `goldRefillWeights` 偏右 | `difficulty.ts:67+` |
| 钩爪甩得太快/太慢 | 调 `motionSpeedScale` | `difficulty.ts:67+` |
| 重物拖拽感不够 | 提高 `weightFactorScale` | `difficulty.ts:67+` |
| 高难度起步关太松 | 调 `EARLY_HARDCORE_LEVEL_THRESHOLD` / `_RATIO_OVERRIDE` | `GameScene.ts:173-174` |
| 大件被秒抓 | 提高 `LARGE_MINERAL_Y_MIN_FACTOR` | `GameScene.ts:191` |
| 某关 target 不合理 | 改 `LEVELS[i].targetMoney` | `levels.ts:103+` |

---

## 九、代码定位索引（速查）

### 9.1 配置入口

| 概念 | 位置 |
|------|------|
| 难度配置表 | `src/level/difficulty.ts:64-163` |
| 关卡配置表（21 关） | `src/level/levels.ts:103-280` |
| 矿物原值配置 | `src/entity/types.ts:48-189` |
| 全局游戏常量（钩爪/矿区） | `src/entity/types.ts:213+` `GAME_CONFIG` |

### 9.2 核心逻辑

| 概念 | 位置 |
|------|------|
| 矿物生成主流程 | `src/scene/GameScene.ts:1160` `generateMinerals` |
| 金块保底追加 | `src/scene/GameScene.ts:1254` `ensureGoldBudget` |
| cap 降级 | `src/scene/GameScene.ts:1268` `downgradeGoldToReachCap` |
| 大件下层偏置 | `src/scene/GameScene.ts:1300` `tryPlaceMineral` |
| 保底品种选择 | `src/scene/GameScene.ts:1248` `pickGoldVariant` |
| 矿物抓取入账 | `src/scene/GameScene.ts:991-1017` `onHookComplete` 普通矿物分支 |
| 神秘袋入账 | `src/scene/GameScene.ts:1064-1066` |
| 木箱入账 | `src/scene/GameScene.ts:1124-1126` |
| 矿物 value 随机化 | `src/entity/Mineral.ts:100-143` 构造函数 |

### 9.3 验证脚本

| 工具 | 用法 |
|------|------|
| 难度数值分析 | `node scripts/analyze-difficulty.mjs` |
| 输出项 | 贪心通关率 / 完美玩家 / 失误玩家 / 失误容忍通关 / HARD 零碎化诊断 |

---

## 十、变更历史

| 日期 | 变更 | 文件 |
|------|------|------|
| 2026-05-18 | 5 档难度系统设计 | `20260518_difficulty-system.md` |
| 2026-05-19 | v1 难度调优（已废弃） | `20260519_difficulty-tuning.md` |
| 2026-05-20 | 金块保底机制改造（全矿物 → 仅金块） | `20260520_gold-budget-rework.md` |
| 2026-05-23 | 解耦 `goldRefillWeights` + 4 档达标期望通关率 | commit `1190c54` |
| 2026-05-24 | code-review 反馈修复 | commits `c3b963b` / `3659300` |
| 2026-05-25 | 高难度前 3 关 ratio 收紧 + 大件下层偏置 + NOVICE/NORMAL cap 放宽 | commits `7f72c12` / `443fb7a` |
| 2026-05-25 | 钩爪甩速：NOVICE/NORMAL/INFINITE `motionSpeedScale` 0.65 → 0.85（体感更顺手） | — |

---

## 附：术语速查

- **levelEarning** = 本关增量（targetMoney 差额，玩家视角）
- **goldBudget** = 场上金块原值最低保障（内部值）
- **goldCap** = 场上金块原值上限（内部值，= budget × cap）
- **lws** = `largeWeightScale` 简称（基础生成阶段大件压制系数）
- **mws** = `motionSpeedScale` 简称
- **效率窗口** = 玩家完美操作下，单关通关所需时间占比（用时%）
- **失误容忍通关率** = 在 `ERROR_TOLERANCE` 失误次数以内通关的概率
