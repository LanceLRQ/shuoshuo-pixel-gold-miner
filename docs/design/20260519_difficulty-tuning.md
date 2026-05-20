# 难度数值分析报告

> 创建：2026-05-19
> 工具：`scripts/analyze-difficulty.mjs`（每次跑一次即可重新评估）

## 一、问题

用户反馈"每个关卡的数值上还是简单了一些"。期望以**贪心抓取率**为基准重新设计：

| 难度 | 期望"刚好卡关过"抓取率 |
|------|------------------------|
| 新手 | 10-20%（10 个抓 1-2 个）|
| 一般 | 30-40%（抓 3-4 个）|
| 困难 | 50-60%（抓 5-6 个）|
| 高手 | 80-90%（抓 8-9 个）|

## 二、诊断（当前数值）

模拟 21 关 × 4 难度 × 50 次贪心抓取，结果：

| 难度 | 当前 ratio | 当前 valueScale | 实测平均抓取率 | 期望 | 偏差 |
|------|-----------|----------------|---------------|------|------|
| NOVICE | 3.0 | 2.0 | **7%** | 15% | -8% |
| NORMAL | 3.0 | 1.0 | **10%** | 33% | -23% |
| HARD | 2.25 | 0.5 | **19%** | 55% | -36% |
| EXPERT | 1.75 | 0.5 | **20%** | 85% | -65% |

**结论**：所有档都比期望简单，**高手档与新手档几乎无区别**（数量抓取率都在 7-20% 区间）。

## 三、根本原因（反直觉）

```
场上矿物总价值 = max(原始权重生成总值, target × mineralBudgetRatio / valueScale)
玩家可获得 = 场上正价矿物总值 × valueScale
抓取率（数量）取决于：场上大件矿物（GOLD_LARGE 500、GOLD_MEDIUM 250）数量
```

**核心矛盾**：
- 当前 `mineralBudgetRatio` 是**下限保障**，不是上限
- 原始 weights 已经生成出 target 的 5-30 倍价值（场上很富）
- 贪心策略只需抓 1-2 个 GOLD_LARGE（500 价值）即可达 target=200-1000
- 提高 ratio 只会**让场上更富**，反而**降低**数量抓取率

实测各关场上总值倍数（与 target 之比）：

```
NOVICE: 3.3-21.7x   NORMAL: 3.2-10.9x   HARD: 2.3-5.4x   EXPERT: 1.8-5.4x
```

即使最难的 EXPERT，场上仍有 1.8-5.4 倍 target 的矿物可用，**1-2 个金块就过关**。

## 四、解决方案

需双管齐下：

### 方案 A — 引入 cap 降级（代码改动）

在 `GameScene.generateMinerals` 增加降级阶段：
```typescript
// 4.5) 矿物总价值超过 budget × 1.10 时，强制降级最高价矿物
const budgetCap = targetBudget * 1.10;
while (getCurrentMineralTotal() > budgetCap) {
  // 找最高价矿物，沿升级链降一级（GOLD_LARGE → GOLD_MEDIUM → ... → BONE）
  downgradeMostValuable();
}
```

### 方案 B — 调整难度参数（数值改动）

| 难度 | 旧 valueScale | 新 valueScale | 旧 ratio | 新 ratio |
|------|--------------|---------------|----------|----------|
| NOVICE | 2.0 | **2.0**（保留）| 3.0 | **1.0** |
| NORMAL | 1.0 | **1.0**（保留）| 3.0 | **1.0** |
| HARD | 0.5 | **0.6** | 2.25 | **1.0** |
| EXPERT | 0.5 | **0.4** | 1.75 | **1.0** |

所有档 ratio 统一改为 1.0（场上总值 ≈ target），实际"卡过线"水平由 cap 控制。

### 应用方案 A+B 后的实测抓取率

| 难度 | 期望 | 实测 | 状态 |
|------|------|------|------|
| NOVICE | 15% | **14%** | ✅ 完美 |
| NORMAL | 33% | **22%** | ⚠️ 偏简单 |
| HARD | 55% | **33%** | ⚠️ 偏简单 |
| EXPERT | 85% | **45%** | ⚠️ 距期望远 |

> EXPERT 难以达到 85%，因为贪心总能找到几个高价金块。
> **45% 已比当前 20% 提升 2.25 倍**，是实际可达成的"很难"水平。

## 五、终极方案（如需达到 80%+）

需要进一步：
- **降低 GOLD_LARGE/MEDIUM 的权重**（每关 weights 调整）
- 或**禁用升级链最顶端**（生成器不允许产出 GOLD_LARGE 在某些档）
- 工作量：每关 weights 都要调整，21 关 × 4 难度

## 六、推荐落地

按"提升体感难度"目标（不强求精确达期望）：

```diff
- valueScale: 2.0,  mineralBudgetRatio: 3.0   // NOVICE
+ valueScale: 2.0,  mineralBudgetRatio: 1.0

- valueScale: 1.0,  mineralBudgetRatio: 3.0   // NORMAL
+ valueScale: 1.0,  mineralBudgetRatio: 1.0

- valueScale: 0.5,  mineralBudgetRatio: 2.25  // HARD
+ valueScale: 0.6,  mineralBudgetRatio: 1.0

- valueScale: 0.5,  mineralBudgetRatio: 1.75  // EXPERT
+ valueScale: 0.4,  mineralBudgetRatio: 1.0
```

+ 在 `GameScene.generateMinerals` 增加 cap 降级阶段。

预期效果：
- NOVICE 抓取率提升轻微（7% → 14%）
- NORMAL/HARD/EXPERT 抓取率翻倍（10/19/20% → 22/33/45%）
- EXPERT 距期望 85% 仍有 40% 缺口，但已是当前的 2.25 倍

如需进一步逼近 80%+，需重新设计 21 关的 mineralWeights（降 GOLD_LARGE 比例）。

## 七、复跑分析

```bash
node scripts/analyze-difficulty.mjs
```

输出：每关每难度抓取率表格 + 各档平均 vs 期望 + 自动二分搜索最优 ratio。
