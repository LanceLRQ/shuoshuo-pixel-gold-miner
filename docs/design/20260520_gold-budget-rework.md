# 矿物保底机制改造：从「全矿物总值」到「金块保底」

> 创建：2026-05-20
> 上一版数值方案：`20260519_difficulty-tuning.md`

## 一、改造动因

旧机制下 HARD/EXPERT 关频繁出现"道具不够"——玩家抓满 5-6 件仍达不到 target。

根因：旧 `mineralBudgetRatio` 是**全矿物总价值**保底，里面混了 BONE/STONE/MOUSE 等低价垃圾。配合 `largeWeightScale=0.10/0.0`（高难度大金块几乎不生成），场上确实有"足够总值"但**金块比例极低**，玩家看到的多是石头老鼠，真正能"刷钱"的金块总额低于 target，导致抓不完也不达标。

## 二、新机制

### 保底语义重定义

| 旧 | 新 |
|----|----|
| 全矿物总价值 ≥ target × ratio | **金块**（GOLD_SMALL/MEDIUM/LARGE）总金额 ≥ target × ratio |
| 通过"升级低价矿物→追加 GOLD_LARGE"达成预算 | 直接追加金块（按 largeWeightScale 加权选品种） |
| 不含钻石 | 钻石仍不算金块（视为彩蛋）|

### 数值表

| 难度 | 旧 ratio | **新 ratio** | 直观含义 |
|------|---------|-------------|----------|
| NOVICE | 2.5 | **2.0** | 金块总额 = target 200% |
| NORMAL | 1.1 | **1.5** | 150%（提升） |
| HARD | 1.0 | **1.25** | 125%（提升，修主诉求） |
| EXPERT | 1.0 | **1.25** | 125%（提升） |
| INFINITE | 3.0 | 3.0 | 不变 |

其他参数（`valueScale` / `largeWeightScale` / `mineralBudgetCap`）保持原样。

### 生成流程（5 步）

```
1) 基础加权生成 count 个矿物（按 weights × largeWeightScale 抑制大件）
2) goldBudget = levelEarning × mineralBudgetRatio / valueScale
3) 金块保底：循环追加金块（pickGoldVariant 加权随机）直到 goldTotal ≥ goldBudget
4) cap 降级：场上总值溢出 goldBudget × mineralBudgetCap 时反向降级最高价矿物
5) 章节末关收藏品 + 木箱 + 幸运草 buff（与旧版一致）
```

### 金块品种选择

```
pLarge  = clamp(largeWeightScale, 0, 1)
pMedium = clamp(largeWeightScale × 1.5, 0, 1)
pSmall  = 1.0
```

| 难度 | lws | 加权 [S, M, L] | 主力金块 |
|------|------|---------------|----------|
| NOVICE | 1.0 | [1.0, 1.0, 1.0] | 三档均衡，常见 GOLD_LARGE |
| NORMAL | 0.35 | [1.0, 0.53, 0.35] | GOLD_SMALL 主导 |
| HARD | 0.10 | [1.0, 0.15, 0.10] | 几乎全 GOLD_SMALL |
| EXPERT | 0 | [1.0, 0, 0] | 全 GOLD_SMALL |

## 三、模拟结果（`scripts/analyze-difficulty.mjs`）

| 难度 | 期望抓取率 | 实测抓取率（含 cap） | 状态 |
|------|-----------|---------------------|------|
| NOVICE | 15% | 9% | 偏低（新手"少抓即过"目标可接受） |
| NORMAL | 33% | 29% | ✓ 接近 |
| HARD | 55% | 56% | ✓✓ 达成 |
| EXPERT | 85% | 98% | 偏高（cap 1.05 极紧导致全抓） |

主诉求"困难关道具不够"已解决：**HARD 从抓 19% 提到 56%，玩家有明确的达标路径**。

## 四、关键代码

- `src/level/difficulty.ts:49-122` — 难度配置
- `src/scene/GameScene.ts` — `generateMinerals` + `ensureGoldBudget` / `pickGoldVariant` / `getCurrentGoldTotal`
- `scripts/analyze-difficulty.mjs` — 模拟器同步金块保底逻辑

## 五、复跑分析

```bash
node scripts/analyze-difficulty.mjs
```
