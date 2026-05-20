# 排行榜功能调研报告（纯前端视角）

> 调研范围：基于当前 localStorage 存档体系，不引入后端服务。

---

## 一、现有可度量数据

| 数据项 | 来源 | 说明 |
|--------|------|------|
| 累计金额 `currentMoney` | `Storage.SlotMeta` | Game Over 时的最终金额，**已有全局/分难度最高分记录** |
| 到达关卡 `currentLevel` | `Storage.SlotMeta` | 1-21 正常关卡 + 22+ 无尽模式 |
| 难度 `difficulty` | `Storage.SlotMeta` | 5 档：新手/一般/困难/高手/无限火力 |
| 已购道具 `ownedItems` | `GameProgress` | 可间接反映策略偏好 |
| 游戏时间 `lastPlayedAt` | `Storage.SlotMeta` | 时间戳，可用于排序/展示日期 |
| 章节进度 | 可由 `currentLevel` 派生 | L1-7 水晶矿坑 / L8-14 蟹潮海湾 / L15-21 猪猪王座 |

**关键发现**：`Storage` 已实现 `updateAllHighScores()` 和 `getHighScoreByDifficulty()`，说明高分记录基础设施已经存在。

---

## 二、排行榜维度设计

### 2.1 核心排名基准：累计金额

**理由**：
- 累计金额是贯穿整个游戏的核心目标（每关 HUD 显示 "累计 / 累计目标"）
- Game Over 时 `updateAllHighScores()` 已按此值记录
- 无尽模式（L22+）下金额持续增长，天然适合排名

**不推荐作为主排名基准的候选**：

| 候选基准 | 排除原因 |
|---------|---------|
| 到达关卡数 | 新手难度 ×2.0 金额乘数，到同一关卡金额差异巨大，不具备可比性 |
| 单关收入 | 受矿物随机权重和道具组合影响大，波动性高，不够稳定 |
| 通关速度 | 当前无全局计时器，需要新增数据采集，且"速度"不是本游戏的核心体验 |

### 2.2 排行榜分类

纯前端场景下，排行榜分类的核心目的是**提供公平的比较基准**。不同难度的金额乘数差异极大（新手 ×2.0 vs 高手 ×0.5），混在一起排名没有意义。

| 榜单 | 数据范围 | 说明 |
|------|---------|------|
| **总榜** | 跨难度，取每个难度最高分 × 难度权重系数后排名 | 折算后的统一分数，高手难度拿高分更难，系数应更高 |
| **分难度榜** × 5 | 单难度内所有记录 | 每个难度独立排名，最直观 |
| **无尽榜** | 仅 L22+ 的无尽模式记录 | 单独赛道，衡量"能走多远" |

### 2.3 难度权重系数建议（总榜折算用）

| 难度 | 金额乘数 | 建议权重系数 | 理由 |
|------|---------|-------------|------|
| 新手 NOVICE | ×2.0 | ×0.4 | 金额翻倍但重量 ×0，实际最简单 |
| 一般 NORMAL | ×1.0 | ×1.0 | 基准难度，系数 1.0 |
| 困难 HARD | ×0.5 | ×2.5 | 金额减半 + 重量 ×1.5，难度陡增 |
| 高手 EXPERT | ×0.5 | ×3.5 | 金额减半 + 时间减半 + 重量 ×2.0，极限挑战 |
| 无限火力 INFINITE | ×1.0 | ×0.3 | 娱乐模式，道具全开，不具备竞技性 |

> 折算公式：`排行榜分数 = 原始累计金额 × 难度权重系数`
> 例：高手难度累计 5000 → 排行榜分 = 5000 × 3.5 = 17500

---

## 三、每条记录展示内容

```
┌──────────────────────────────────────┐
│  #1   🏆                            │
│  ★★★★ 17,500 分                     │
│  高手难度 · 到达 第 18 关 · 猪猪王座  │
│  2026-05-20                          │
└──────────────────────────────────────┘
```

| 展示项 | 数据来源 | 说明 |
|--------|---------|------|
| 排名 # | 计算得出 | 按排行榜分数降序 |
| 分数 | `currentMoney × 难度系数` | 核心数据，大字号突出 |
| 难度标签 | `difficulty` 枚举值 | 像素风彩色标签 |
| 到达关卡 | `currentLevel` | 含章节名（由关卡号派生） |
| 日期 | `lastPlayedAt` | 格式化显示 |

---

## 四、数据存储方案

### 方案：localStorage 历史记录表

当前 `Storage` 只保留**最高分**，没有历史记录。排行榜需要多条记录。

**建议扩展 `GlobalData` 结构**：

```typescript
interface LeaderboardEntry {
  score: number;          // 折算后的排行榜分数
  rawMoney: number;       // 原始累计金额
  difficulty: Difficulty;
  level: number;          // 到达关卡
  date: number;           // 时间戳
}

interface GlobalData {
  // ... 现有字段
  leaderboard: LeaderboardEntry[];  // 最多保留 50 条
}
```

**写入时机**：Game Over 时（`GameState.GAME_OVER`），已有 `updateAllHighScores` 调用点，在此处追加写入排行榜记录。

**容量限制**：
- 最多保留 50 条记录（约 5KB JSON）
- 同一难度只保留 Top 10
- 每条记录去重（同难度 + 同关卡 + ±5% 分数范围内视为重复，只保留最高分）

---

## 五、排行榜展示场景

| 场景 | 入口 | 说明 |
|------|------|------|
| 主菜单 | "排行榜" 按钮 | 主入口，默认显示总榜 |
| 游戏结束 | GameOverScene 底部 | "查看排行榜" 链接 |
| 关卡结算 | ResultScene 达标时 | 提示"当前排名 #N"（激励感） |

**交互设计**：
- 左右切换榜单（总榜 / 新手 / 一般 / 困难 / 高手 / 无尽）
- 自己的最高记录高亮显示（金色边框）
- 像素风 UI，与现有 HUD 风格统一

---

## 六、纯前端的局限性与应对

| 局限 | 影响 | 应对策略 |
|------|------|---------|
| **无跨设备同步** | 换设备/清缓存记录丢失 | 排行榜定位为"个人成就回顾"而非竞技排名 |
| **数据可篡改** | localStorage 可手动修改 | 签名校验 + 合理性校验（见第八章防作弊设计） |
| **无实时竞争** | 看不到别人的成绩 | 用"历史最佳"和"里程碑"替代多人排名（见下方） |

### 里程碑系统（弥补无多人竞争）

排行榜可增加"里程碑"维度，给玩家持续追求目标：

| 里程碑 | 条件 | 称号 |
|--------|------|------|
| 入门矿工 | 总榜 ≥ 5,000 | 🪏 |
| 黄金猎人 | 总榜 ≥ 15,000 | 🪏🪏 |
| 矿洞之王 | 总榜 ≥ 30,000 | 🪏🪏🪏 |
| 通关勇士 | 任意难度到达 L21 | 🏅 |
| 无尽探索者 | 到达 L25+ | 💎 |
| 硬核大师 | 高手难度到达 L15+ | 👑 |

---

## 七、实施建议

### 优先级评估

| 项目 | 工作量 | 收益 | 优先级 |
|------|-------|------|-------|
| 分难度最高分展示 | 小（数据已有，纯 UI） | 高 | P0 |
| 历史记录存储 + 排行榜页面 | 中 | 高 | P1 |
| 难度折算总榜 | 小 | 中 | P1 |
| 里程碑系统 | 中 | 中 | P2 |
| ResultScene 实时排名提示 | 小 | 中 | P2 |

### 最小可行方案（P0）

仅利用现有的 `getGlobalHighScore()` 和 `getHighScoreByDifficulty()` API，在主菜单增加一个简单的"最高分"展示面板，无需新增存储结构。这是零成本起步点。

---

## 八、防作弊设计

> 纯前端无法完全阻止作弊，目标是**提高作弊门槛**，让直接改 localStorage 的普通玩家无法轻易伪造记录。

### 8.1 第一层：数据签名校验

**原理**：每次写入排行榜数据时附加 HMAC 签名，读回时验签。签名不匹配则丢弃该记录。

```typescript
import { createHash } from './utils/hash';

/** 签名盐值（混淆拆分存储，增加逆向成本） */
const _S = [0x47, 0x6f, 0x6c, 0x64, 0x4d, 0x69, 0x6e, 0x65, 0x72];
const SALT = String.fromCharCode(..._S);

/** 为排行榜记录生成签名 */
function signEntry(entry: LeaderboardEntry): string {
  const payload = `${entry.rawMoney}:${entry.difficulty}:${entry.level}:${entry.date}:${SALT}`;
  return createHash(payload);
}

/** 签名的排行榜记录 */
interface SignedLeaderboardEntry extends LeaderboardEntry {
  /** HMAC 签名（写入时生成，读取时校验） */
  _sig: string;
}
```

**写入流程**（Game Over 时）：

```typescript
function addLeaderboardEntry(entry: LeaderboardEntry): void {
  const signed: SignedLeaderboardEntry = { ...entry, _sig: signEntry(entry) };
  leaderboard.push(signed);
  persistLeaderboard();
}
```

**读取流程**：

```typescript
function loadLeaderboard(): LeaderboardEntry[] {
  const raw = localStorage.getItem(LEADERBOARD_KEY);
  if (!raw) return [];
  try {
    const entries: SignedLeaderboardEntry[] = JSON.parse(raw);
    return entries.filter(e => {
      if (e._sig !== signEntry(e)) {
        console.warn('[排行榜] 检测到篡改记录，已丢弃', e);
        return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}
```

**SHA-256 实现选择**：
- 推荐用 Web Crypto API（`crypto.subtle.digest('SHA-256', ...)`），浏览器原生支持，无额外依赖
- 不推荐手写哈希算法，容易出错且有性能问题

**安全说明**：
- 盐值硬编码在 JS 中，理论上可被逆向，但足以防止 99% 直接改 localStorage 的行为
- 构建时通过 Vite 插件对盐值字符串做一次混淆（如 base64 编码 + 反转 + 拆分拼接），提升静态分析难度

### 8.2 第二层：合理性校验

**原理**：每个难度 + 关卡组合存在数学上的分数上限。超过上限的记录直接拒绝写入。

```typescript
import { getLevelConfig, TOTAL_LEVELS } from '../level/levels';
import { getDifficultyConfig, Difficulty } from '../level/difficulty';

/**
 * 计算指定难度 + 关卡的累计金额理论最大值
 *
 * 逻辑：假设每关都抓到最高价值矿物（钻石 $600），填满全部时间
 * 实际上限远低于此，但作为硬性边界足够安全
 *
 * 公式：
 *   - 每关矿物数由 getLevelConfig(level).mineralCount 决定
 *   - 单矿最大价值 = 钻石原价 600 × 难度金额乘数
 *   - 累计上限 = sum(每关矿物数 × 单矿最大价) × 1.5（容差系数）
 */
function getMaxPlausibleScore(difficulty: Difficulty, level: number): number {
  const diffConfig = getDifficultyConfig(difficulty);
  const DIAMOND_BASE_VALUE = 600;
  const maxMineralValue = DIAMOND_BASE_VALUE * diffConfig.valueScale;

  let maxTotal = 0;
  for (let i = 1; i <= level; i++) {
    const cfg = getLevelConfig(i);
    maxTotal += cfg.mineralCount * maxMineralValue;
  }
  // 1.5 倍容差：防止商店 Bonus 等边缘情况误杀合法记录
  return Math.floor(maxTotal * 1.5);
}

/** 校验排行榜记录是否合理 */
function isEntryPlausible(entry: LeaderboardEntry): boolean {
  const maxScore = getMaxPlausibleScore(entry.difficulty, entry.level);

  if (entry.rawMoney > maxScore) {
    console.warn(`[排行榜] 分数超出合理范围: ${entry.rawMoney} > ${maxScore}`, entry);
    return false;
  }

  // 关卡边界检查
  if (entry.level < 1) {
    console.warn('[排行榜] 关卡编号无效', entry);
    return false;
  }

  // 分数非负检查
  if (entry.rawMoney < 0) {
    console.warn('[排行榜] 分数为负', entry);
    return false;
  }

  return true;
}
```

**完整写入流程**（结合两层防护）：

```typescript
function commitLeaderboardEntry(
  rawMoney: number,
  difficulty: Difficulty,
  level: number,
): boolean {
  const entry: LeaderboardEntry = {
    score: Math.floor(rawMoney * getDifficultyConfig(difficulty).leaderboardWeight),
    rawMoney,
    difficulty,
    level,
    date: Date.now(),
  };

  // 第二层：合理性校验
  if (!isEntryPlausible(entry)) return false;

  // 第一层：签名后写入
  addLeaderboardEntry(entry);
  return true;
}
```

### 8.3 需要扩展的数据结构

难度配置 `DifficultyConfig` 需新增排行榜权重字段：

```typescript
// difficulty.ts 中的 DifficultyConfig 新增：
interface DifficultyConfig {
  // ... 现有字段
  /** 排行榜折算权重（总榜用） */
  leaderboardWeight: number;
}

// 难度表新增 leaderboardWeight 列：
// NOVICE   → 0.4
// NORMAL   → 1.0
// HARD     → 2.5
// EXPERT   → 3.5
// INFINITE → 0.3
```

排行榜存储结构更新为签名版本：

```typescript
/** 持久化的排行榜（每条记录带签名） */
interface LeaderboardStorage {
  version: number;
  entries: SignedLeaderboardEntry[];
}
```

### 8.4 安全策略总结

| 防护层 | 防护对象 | 实现成本 | 覆盖率 |
|--------|---------|---------|-------|
| 签名校验 | 直接改 localStorage | 低（~50 行） | 99% 普通用户 |
| 合理性校验 | 注入不可能的高分 | 低（~40 行） | 100%（数学硬上限） |
| 构建时盐值混淆 | DevTools 静态分析 | 低（Vite 插件 ~20 行） | 90% 初级逆向 |

> **不做的事**：不防动态调试（断点改内存）、不防 JS 逆向重写。这是单机游戏，这两项的防护成本远超收益。

---

## 九、总结

1. **排名基准**：累计金额（Game Over 时的 `currentMoney`），折算难度系数后跨难度可比
2. **核心榜单**：总榜（折算）+ 5 个分难度榜 + 1 个无尽榜
3. **展示信息**：排名、分数、难度、到达关卡/章节、日期
4. **存储方案**：扩展现有 `GlobalData`，最多 50 条记录，写入时机为 Game Over
5. **定位**：个人成就回顾 + 里程碑追逐，不依赖后端、不清耗网络请求
