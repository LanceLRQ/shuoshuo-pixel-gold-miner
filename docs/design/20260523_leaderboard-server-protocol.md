# 排行榜服务端协议设计（v1）

> 范围：客户端 ↔ 服务端的会话与结算上送协议。
> 不含：服务端内部存储与渲染、玩家账号体系（占位待后续设计）。

承接：[20260520_leaderboard-research.md](./20260520_leaderboard-research.md)（本地榜调研） + [20260518_difficulty-system.md](./20260518_difficulty-system.md)（难度参数表） + [20260519_chapter-system.md](./20260519_chapter-system.md)（章节定义） + 本次实施完成的 VictoryScene / VictoryEndScene / 无尽冲榜（commit `ca88f39`）。

---

## Context

本地排行榜（`Storage.commitLeaderboardEntry` + SHA-256 签名 + `validateLeaderboardEntry` 合理性校验）已经在 `commit 20260519_*` 落地，但只在本机 localStorage 里维护，无法跨设备 / 公榜对比。

本次实施完成的 **VictoryScene + 无尽冲榜 + 难度独立结算路径** 已为公榜铺好了客户端基础事件（commit `ca88f39 feat(victory)`）。本文规范 **客户端 ↔ 服务端的会话标识与结算事件上送协议**，使后续接入服务端时改动收敛在一个 SessionService。

**目标：**
1. 上送 3 类结算事件到服务端
2. 仅 **NORMAL / HARD / EXPERT** 三档难度参与公榜，各档独立分榜；NOVICE 与 INFINITE 不参与
3. 服务端通过客户端预生成的 sessionId 识别一次完整游戏会话，**幂等存储**（同一 sessionId 只入一次）
4. 一次 session 严格绑定一个登录用户（playerId）；登录态由外部网站系统提供
5. token 鉴权 + 反 replay（token 由服务端下发，单次有效，HMAC 签名 payload）
6. **上榜门槛**：必须通关第一章（水晶矿坑 L1-L7）才允许入榜，减轻短局刷榜压力

**Non-Goals：**
- 实时榜单订阅（首版只做按需查询 + 提交）
- 玩家账号体系自研（直接复用外部网站登录态）
- 深度反作弊对抗（HMAC 签名 + 合理性校验 + 服务端独立验证为底线）

---

## 一、关键概念

| 术语 | 含义 |
|---|---|
| **Session** | 一次游戏周期：从「开新游戏 / 加载存档」开始 → 直到「结算事件触发」结束。一个 Session 内可以跨多关 / 跨商店 / 进无尽段，但只产出**一个** submit。 |
| **sessionId** | **客户端**预生成的 UUID v4，绑定本次 Session。客户端持久化到 localStorage，离线友好。服务端首次见到时收录；同一 sessionId 重复提交返回 `DUPLICATE_SUBMIT`（**幂等约束**）。 |
| **playerId** | 来自外部网站登录系统（OAuth / Cookie session）。客户端在启动时从宿主页面拉取（详见 §四 4.0）。**一份 sessionId 严格绑定一个 playerId**。 |
| **token** | 服务端下发的鉴权令牌（JWT），与 sessionId 一对一。submit 后服务端将其作废（单次有效）。token 内含 `tokenSigningSecret` 副本，客户端用其对 submit payload 做 HMAC-SHA256 签名。 |
| **结算事件** | 触发 submit 的 3 种场景（见 §三）。 |
| **难度赛道** | **仅 NORMAL / HARD / EXPERT** 三档参与公榜，各档独立分榜。NOVICE 是友好入门档，INFINITE 是娱乐档，**均不上榜**（客户端直接跳过协议）。 |
| **上榜门槛** | `highestLevel >= 8`（即玩家至少通关第一章水晶矿坑 L1-L7）。低于门槛的 submission 服务端返回 `BELOW_THRESHOLD`，客户端可仍在本地榜留存。 |
| **rawMoney** | 客户端结算时的 `Game.currentMoney`（含通关 Bonus 已累加）。 |
| **leaderboardWeight** | 难度权重（src/level/difficulty.ts）。**服务端按难度独立分榜后此字段不参与排名**，但仍随 payload 上送做审计。 |

---

## 二、结算事件分类

3 种事件均触发一次 `POST /submit`：

| 事件枚举 | 触发场景 | 客户端触发位置 | 上榜门槛 | 实现状态 |
|---|---|---|---|---|
| `GAME_CLEARED` | L21（TOTAL_LEVELS）通关后玩家点「立即结算 🏆」 | `VictoryScene.handleSettle` → `Game.changeScene(VICTORY_END)` | 必然满足（highestLevel ≥ 21） | ✅ 已就位 |
| `ENDLESS_FAILED` | L22+ 无尽段失败，自动结算 | `ResultScene.handlePrimary` 单按钮 → `Game.changeScene(GAME_OVER)` | 必然满足（highestLevel ≥ 22） | ✅ 已就位 |
| `RUN_ABANDONED` | L1-L21 失败/未通关时玩家主动结束 | `ResultScene.handleSecondary`（"返回菜单"）→ 需改造走 `GAME_OVER` | **`highestLevel >= 8`**（通关 L7 后） | ⚠️ 待实施 |

**为何需要 `RUN_ABANDONED`：** 用户明确要求"未通关也算一次主动结算"。当前 `handleSecondary` 直接 `clearProgress()` + 返回菜单，**不入榜**。落地需改造：让"返回菜单"先走 GAME_OVER → submit → 再清。

**门槛：必须通关第一章（水晶矿坑 L1-L7）才允许入榜。** 即 `highestLevel >= 8`（已经至少推进到 L8 / 进入第二章「蟹潮海湾」入口）。低于门槛的 `RUN_ABANDONED` 服务端**不入榜并返回 `BELOW_THRESHOLD`**，客户端仍可在本地榜留存供个人回顾。这一规则同时减轻服务端被无脑刷低质短局数据的压力。

`GAME_CLEARED` / `ENDLESS_FAILED` 由游戏规则保证 highestLevel ≥ 21，永远过门槛，无需额外判断。

---

## 三、Session 生命周期

```
┌──────────────────────────────────────────────────────────────┐
│ 玩家路径                       客户端动作          服务端动作  │
├──────────────────────────────────────────────────────────────┤
│ 选难度 / 新游戏                 ↓                              │
│ ─或─ 载入存档                   POST /session   ─→ 生成 sid+tk│
│                                 ← 200 {sid,tk,exp}            │
│                                 持久化 sid+tk 到 localStorage │
│                                                                │
│ [游戏过程: L1 .. L21 .. L22+]   不与服务端通信                │
│   关卡通过 / 失败 / 商店 …      仅本地存档                    │
│                                                                │
│ [3 种结算事件之一]              ↓                              │
│                                 POST /submit    ─→ 验证+入榜  │
│                                 ← 200 {rank, ...}             │
│                                 清掉本地 sid+tk               │
│                                                                │
│ [玩家返回主菜单 → 选难度]        进入下一轮 session             │
└──────────────────────────────────────────────────────────────┘
```

**Session 边界**：

| 事件 | 是否开启新 Session |
|---|---|
| `Game.startNewGame(difficulty)` | ✅ 开新 Session |
| `Game.restoreProgress()`（继续上次进度） | ✅ 开新 Session（旧 sid 可能已 submit 或过期，重置） |
| `Game.loadFromManualSlot(id)` | ✅ 开新 Session |
| `Game.retryCurrentLevel()` | ❌ **同一 Session**（重试不算新一轮，但服务端可能想感知，见 §九 D4） |
| `VictoryScene` 选「挑战无尽」进 L22 | ❌ **同一 Session**（L21 通关→L22 是一次连续 run） |
| `ResultScene` 失败 → 重试 | ❌ 同一 Session |
| `ResultScene` 失败 → 返回菜单 | ✅ 触发 `RUN_ABANDONED` 结束当前 Session |

⚠️ **关键：通关 L21 后选「挑战无尽」不结算**。Session 一直延续到 L22+ 失败时才走 `ENDLESS_FAILED` 结算。这是为了让"通关后冲到 L25" 与"普通通关停在 L21"在榜单上能被区分（前者 event=ENDLESS_FAILED, level=25；后者 event=GAME_CLEARED, level=21）。

⚠️ **NOVICE 与 INFINITE 难度：客户端完全跳过 §四 协议**（不开 session、不 submit）。两档定位：
- NOVICE：友好入门档，金额 ×2.0 + 重量 ×0，分数与中高难度不可比
- INFINITE：道具永久开启的娱乐档，不具竞技性

仅 NORMAL / HARD / EXPERT 走完整协议。客户端在 `Game.startNewGame(difficulty)` 时根据难度判定是否调用 `SessionService.beginSession`。

---

## 四、API 协议

所有 API 走 HTTPS。Base URL 由 Vite env `VITE_LEADERBOARD_API_BASE` 注入。

### 4.0 获取登录态（前置）

游戏页面附属于宿主网站，登录态由宿主提供。客户端启动时通过以下任一渠道获取 playerId：

| 渠道 | 描述 |
|---|---|
| **A. 宿主页面注入**（推荐） | 宿主在嵌入 iframe 时通过 `postMessage` 或 `<meta name="player-id" content="...">` 注入 |
| **B. Cookie + /me 接口** | 客户端调 `GET <host>/api/me`（带 cookie），拿当前登录用户 ID |
| **C. URL 参数**（弱推荐） | `?token=<...>` 透传，仅适合一次性场景 |

未登录态：客户端**仍可游玩**，但 `SessionService.beginSession` 返回 null → 全局禁用上榜（本地榜不受影响）。

> 具体集成方式由宿主网站工程师确定，本协议不限定。

### 4.1 开启会话

```
POST /api/v1/leaderboard/sessions
Content-Type: application/json
Authorization: <由宿主登录态决定，如 Cookie 或 Bearer>
```

**Request body：**

```jsonc
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",  // 客户端预生成的 UUID v4
  "clientVersion": "1.0.0",                              // package.json version
  "difficulty": "NORMAL",                                // 仅允许 NORMAL/HARD/EXPERT
  "startedAt": 1716480000000,                            // 客户端时间戳（毫秒）
  "resumedFromSlot": null                                // null=新游戏；0=自动槽位续盘；1-10=手动槽位续盘
}
```

**Response 200：**

```jsonc
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",   // 服务端回显，确认收录
  "token": "eyJhbGciOi...",                              // JWT (RS256 / ES256)，submit 时用 Bearer 鉴权
  "tokenSigningSecret": "base64-32-bytes",               // HMAC-SHA256 的对称密钥，仅本 session 有效
  "expiresAt": 1716566400000,                            // token 过期时间（毫秒），建议 24h
  "serverTime": 1716480001234                            // 服务端时间，客户端可校准时钟偏差
}
```

⚠️ **`tokenSigningSecret` 的安全约束：** 仅本 session 内使用，submit 后服务端立即作废；客户端不持久化到 localStorage（仅内存保留），刷新页面后从 localStorage 的 sessionId 触发 `POST /sessions/{id}/refresh`（如服务端实现）拿新 secret。简单做法：刷新页面即放弃 session（用户重启即开新 session）。

**Response 4xx：**

| HTTP | error code | 含义 |
|---|---|---|
| 401 | `UNAUTHENTICATED` | 宿主登录态缺失或失效 |
| 409 | `SESSION_ID_TAKEN` | 同一 sessionId 已被其他用户绑定（极端冲突场景，要求客户端重新生成 UUID 重试） |
| 400 | `INVALID_DIFFICULTY` | difficulty 不是 NORMAL/HARD/EXPERT |
| 400 | `CLIENT_VERSION_TOO_OLD` | 服务端要求最低客户端版本 |
| 429 | `RATE_LIMIT` | 同 playerId 限速 |

### 4.2 提交结算

```
POST /api/v1/leaderboard/submissions
Content-Type: application/json
Authorization: Bearer <token>
```

**Request body：**

```jsonc
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "event": "GAME_CLEARED",             // GAME_CLEARED | ENDLESS_FAILED | RUN_ABANDONED
  "endedAt": 1716482800000,
  "difficulty": "NORMAL",              // 必须与 session 一致，否则拒绝
  "rawMoney": 24500,                   // 结算时的累计金额（含通关 Bonus）
  "highestLevel": 22,                  // 达到的最高关卡（>= 8 否则 BELOW_THRESHOLD）
  "endedAtLevel": 22,                  // 结算事件触发时所在关卡
  "clientStats": {                     // 可选审计字段
    "totalLevelsPlayed": 22,
    "retries": 1,
    "itemsPurchased": ["DYNAMITE", "EXTRA_TIME"]
  },
  "clientSig": "9f8b7e6c..."           // HMAC-SHA256(tokenSigningSecret, canonicalPayload)
}
```

**`clientSig` 生成（客户端）：**

```ts
// canonicalPayload 是按字段名升序拼接的字符串，确保前后端口径一致：
const canonical = [
  `difficulty=${difficulty}`,
  `endedAt=${endedAt}`,
  `endedAtLevel=${endedAtLevel}`,
  `event=${event}`,
  `highestLevel=${highestLevel}`,
  `rawMoney=${rawMoney}`,
  `sessionId=${sessionId}`,
].join('&');
const clientSig = hmacSha256Hex(tokenSigningSecret, canonical);
```

服务端用同一 secret 重算 HMAC 验签。**对称 HMAC 由服务端控制 secret 生命周期**（一次性、随 token 作废），客户端拿不到长期密钥 → 无法在 token 失效后伪造任意提交。

**Response 200：**

```jsonc
{
  "accepted": true,
  "submissionId": "...",
  "rank": {
    "difficulty": "NORMAL",
    "position": 7,                     // 当前难度榜中的名次
    "totalEntries": 1024
  },
  "personalBest": true                 // 是否刷新了该玩家此难度的最高分
}
```

**Response 4xx：**

| HTTP | rejectedReason | 含义 |
|---|---|---|
| 401 | `INVALID_TOKEN` | Bearer token 过期 / 错误 |
| 409 | `DUPLICATE_SUBMIT` | 同 sessionId 已提交过（幂等约束） |
| 422 | `INVALID_SIG` | HMAC 验签失败 |
| 422 | `DIFFICULTY_MISMATCH` | submit.difficulty 与 session.difficulty 不一致 |
| 422 | `SCORE_OUT_OF_RANGE` | rawMoney 超出 `getMaxPlausibleScore` 上限 |
| 422 | `BELOW_THRESHOLD` | `highestLevel < 8`，未通关第一章 |
| 422 | `SESSION_EXPIRED` | token 超时 |

### 4.3 拉榜单

```
GET /api/v1/leaderboard?difficulty=NOVICE&event=any&top=50&aroundPlayer=<playerId>
```

**Query 参数：**

| 参数 | 取值 | 说明 |
|---|---|---|
| `difficulty` | `NOVICE` / `NORMAL` / `HARD` / `EXPERT` | 必填，一个难度一个榜 |
| `event` | `any` / `GAME_CLEARED` / `ENDLESS_FAILED` / `RUN_ABANDONED` | 可选过滤；`any` = 全部事件混合 |
| `top` | 1-100，默认 50 | 取前 N 名 |
| `aroundPlayer` | playerId | 可选，额外返回该玩家附近 ±5 名（无则忽略） |

**Response 200：**

```jsonc
{
  "difficulty": "NOVICE",
  "event": "any",
  "updatedAt": 1716483600000,
  "entries": [
    {
      "rank": 1,
      "playerId": "anon-...",
      "displayName": "矿洞老王",
      "rawMoney": 99999,
      "highestLevel": 28,
      "event": "ENDLESS_FAILED",
      "submittedAt": 1716480001234
    }
    // ...
  ],
  "playerNearby": [ /* aroundPlayer 时填充 */ ]
}
```

---

## 五、Payload 字段定义详表

| 字段路径 | 类型 | 必填 | 取值约束 | 说明 |
|---|---|---|---|---|
| `sessionId` | UUID v4 | ✅ | `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | 客户端 `crypto.randomUUID()` 生成；服务端首见时收录，重复时拒绝（幂等） |
| `clientVersion` | string | ✅ | 语义化版本 `x.y.z` | 取自 `package.json` |
| `difficulty` | enum | ✅ | `NORMAL` / `HARD` / `EXPERT` | NOVICE / INFINITE 客户端不走此协议 |
| `startedAt` / `endedAt` | number | ✅ | 毫秒时间戳 | 客户端时间，服务端用来限速 + 反速通 |
| `resumedFromSlot` | number \| null | ✅ | `null` / `0` / `1`-`10` | null=新游戏；0=自动槽位续盘；1-10=手动槽位续盘 |
| `event` | enum | ✅ | `GAME_CLEARED` / `ENDLESS_FAILED` / `RUN_ABANDONED` | §二 |
| `rawMoney` | number | ✅ | `[0, getMaxPlausibleScore(difficulty, highestLevel)]`（参考 utils/validation.ts） | 累计金额 |
| `highestLevel` | number | ✅ | `>= 8`（门槛） | 本 session 中达到过的最高关卡；< 8 服务端返回 `BELOW_THRESHOLD` |
| `endedAtLevel` | number | ✅ | `>= 1` | 结算时所在关卡。`GAME_CLEARED` 时 = 21；`ENDLESS_FAILED` 时 ≥ 22；`RUN_ABANDONED` 时 1-21 |
| `clientSig` | string | ✅ | hex(64) | `HMAC-SHA256(tokenSigningSecret, canonicalPayload)`，见 §4.2 |
| `clientStats.totalLevelsPlayed` | number | ⭕️ | `>= 1` | 含失败重试的总关卡次数（>= endedAtLevel） |
| `clientStats.retries` | number | ⭕️ | `>= 0` | 本 session 失败重试次数 |
| `clientStats.itemsPurchased` | string[] | ⭕️ | ItemType 枚举值数组 | 购买记录（去重） |

> **playerId 与 displayName 不在 submit body 中**：playerId 通过 Bearer token 在服务端解出（token 内绑定）；displayName 由宿主网站用户信息派生，不由游戏侧上送。这保证客户端无法伪造他人身份。

---

## 六、与本地排行榜的关系

本地榜（`Storage.commitLeaderboardEntry`）**不下线**，作为：

1. **离线降级**：网络不可达或服务端 5xx 时，submit 失败但本地榜仍记录
2. **回看历史**：玩家无网情况下也能看自己的过往战绩
3. **审计源**：客户端可比对"本地榜 vs 服务端榜"找篡改痕迹

**双写策略：**

```
结算事件触发
    ↓
本地: Storage.commitLeaderboardEntry(rawMoney, difficulty, level)   // 立刻写
    ↓
网络: SessionService.submit({event, payload})
    ├─ 成功: 本地 entry 加 `submittedAt: <serverTime>` 字段
    └─ 失败: 加 pendingSubmit 标记，下次启动时重试
```

⚠️ 注意：本地榜按 `rawMoney × leaderboardWeight` 做总榜折算；服务端**按难度独立分榜**后此折算不再参与服务端排名。本地榜的「总榜」视图作为客户端独有的怀旧 + 离线视图存在。

---

## 七、客户端代码改动概览（铺路）

| 改动点 | 文件 | 描述 |
|---|---|---|
| 新增 `SessionService` | `src/core/SessionService.ts`（新） | 单例。封装：beginSession / submit / pending replay / 持久化 sessionId + token / 内存保留 tokenSigningSecret |
| 新增 `AuthService` | `src/core/AuthService.ts`（新） | 从宿主登录态读 playerId（§4.0 A/B/C 任一渠道），未登录返 null |
| 新增 `crypto/hmac.ts` | `src/utils/hmac.ts`（新） | `HMAC-SHA256(secret, message)` 工具（Web Crypto API），用于 `clientSig` |
| 启动 Session | `Game.startNewGame` / `Game.restoreProgress` / `Game.loadFromManualSlot` | 进 PLAYING 前判 `difficulty ∈ {NORMAL, HARD, EXPERT}` 且 AuthService 有 playerId，才调 `SessionService.beginSession`；NOVICE / INFINITE / 未登录直接跳过 |
| 提交结算 (GAME_CLEARED) | `Game.changeScene(VICTORY_END)` 内 | 现有 `commitLeaderboardEntry` 后并行调 `SessionService.submit('GAME_CLEARED', ...)` |
| 提交结算 (ENDLESS_FAILED) | `Game.changeScene(GAME_OVER)` 内（且 `currentLevel > TOTAL_LEVELS`） | 同上 |
| 提交结算 (RUN_ABANDONED) | `ResultScene.handleSecondary` 改造 | 改走 `Game.abandonRun()`（新方法）→ `changeScene(GAME_OVER)` 并打 event=RUN_ABANDONED；客户端不再前置判断阈值，让服务端打 BELOW_THRESHOLD |
| Env 注入 | `.env` + `vite.config.ts` | `VITE_LEADERBOARD_API_BASE` |
| 重试队列 | `SessionService` 启动时 | scan `localStorage['goldminer_h5_pending_submissions']`，逐条 replay |

---

## 八、安全考虑

### 8.1 签名机制选型：HMAC-SHA256 over short-lived secret

**为什么不是非对称公私钥（RSA / ECDSA）签名 payload？** 私钥若放客户端 = 公开盐值升级版，逆向出来作弊门槛没变。要真正用私钥签名，私钥必须留在服务端 → 但服务端无法替客户端签提交。**所以"客户端用私钥签 payload"这条路在 web 单机游戏里走不通**。

**业界通行做法（按强度递增）：**

| 方案 | 描述 | 适用场景 |
|---|---|---|
| **固定盐 + SHA-256** | 盐值硬编码在客户端 | 单机本地校验（防小白改 localStorage）。**就是本项目当前本地榜的方案。** |
| **HMAC + 服务端 issue 一次性 secret** | 每个 session token 内含 secret，client 用 secret 算 HMAC，submit 后 secret 作废 | **Web 游戏排行榜主流方案 ✅ 本协议选此** |
| **JWT (RS256) bearer + HMAC payload** | token 用服务端私钥签（RS256），payload 用 HMAC | 高安全场景，本协议在 token 完整性上已采用 RS256（§4.1 `token`） |
| **服务端复盘事件流** | 客户端上送整局每关 earnedMoney / 抓矿时序，服务端用确定性 RNG 重放 | 反作弊深度方案，留作后续扩展 |

> 用户提到"公私钥校验"对应的是 **JWT 验签**（服务端用私钥签 token、客户端只读 token claim），与 **HMAC 给 payload 签名**互补，不是替代关系。本协议两层都用：
> - **token 完整性**：服务端 issuer 用 RS256/ES256（非对称）签 JWT；客户端不验，由服务端在 submit 时验
> - **payload 真实性**：客户端用 token 内的一次性 secret 做 HMAC-SHA256（对称）

### 8.2 客户端侧（基线已就位 + 本协议新增）

| 措施 | 来源 |
|---|---|
| ✅ `utils/hash.signEntry` SHA-256 + 盐 | 本地榜复用，不变 |
| ✅ `utils/validation` 合理性校验（数学硬上限） | 本地榜复用，不变 |
| 🆕 `clientSig = HMAC-SHA256(tokenSigningSecret, canonicalPayload)` | 本协议新增，仅服务端协议使用 |
| 🆕 `crypto.randomUUID()` 生成 sessionId | 本协议新增 |

### 8.3 服务端侧（必须独立校验，不信任客户端）

| 校验项 | 实现 |
|---|---|
| **登录态** | Bearer token 解出 playerId，会话表的 playerId 必须等于该值 |
| **sessionId 幂等** | 同一 sessionId 在 sessions 表唯一索引，重复 INSERT 返回 `DUPLICATE_SUBMIT` |
| **sessionId ↔ playerId 严绑** | sessions 表外键，一份 sessionId 永远只关联 1 个 playerId |
| **HMAC 验签** | 服务端用 sessions 表里存的 `tokenSigningSecret` 重算 HMAC 比对 |
| **rawMoney 上限** | 服务端独立移植 `validateLeaderboardEntry` 公式（src/utils/validation.ts） |
| **难度白名单** | 仅 NORMAL / HARD / EXPERT 入榜 |
| **门槛校验** | `highestLevel >= 8` 才入榜，否则 `BELOW_THRESHOLD` |
| **时长合理性** | `endedAt - startedAt` ≥ `25s × endedAtLevel`（HARD/EXPERT 最短关时长），且 ≤ 24h |
| **token 单次使用** | submit 成功后 token + tokenSigningSecret 立即作废，重复 submit 返回 `DUPLICATE_SUBMIT` |
| **difficulty 一致** | session 表里的 difficulty 必须等于 submit body 中的 difficulty |
| **限速** | 同 playerId 每分钟 ≤ 5 次 submit；同 IP 每分钟 ≤ 20 次 |

### 8.4 不防的事

- 不防动态调试改内存（成本远高于收益，单机游戏）
- 不防 JS 逆向 + 完整模拟客户端流程（如有人有时间这么干，再升级 §8.1 表中的"事件流复盘"方案）
- 客户端时钟偏差不强校验（用 §4.1 `serverTime` 客户端可自纠正显示）

---

## 九、决策记录（v1 已落定）

> 所有 D1-D5 已在 2026-05-23 设计评审中落定。如需变更须升 v2。

**D1 · `RUN_ABANDONED` 上榜规则 ✅ 已决**

> **结论：阈值上榜 — `highestLevel >= 8`（通关第一章「水晶矿坑」L1-L7 后才能入榜）**
>
> - 客户端：低于阈值的 `RUN_ABANDONED` **仍调 submit**（让服务端打 BELOW_THRESHOLD 拒绝信号）；本地榜不受影响
> - 服务端：`highestLevel < 8` 返回 `BELOW_THRESHOLD`（4xx）
> - 收益：减轻服务端被无脑短局刷库压力；同时给玩家"打完一章再上榜"的目标感
> - `GAME_CLEARED` / `ENDLESS_FAILED` 因游戏规则保证 highestLevel ≥ 21，永远过门槛

**D2 · sessionId 谁生成 ✅ 已决**

> **结论：客户端用 `crypto.randomUUID()` 预生成 + 服务端幂等收录**
>
> - 客户端：游戏启动时生成 UUID v4，写 localStorage `goldminer_h5_session_id`
> - 服务端：sessions 表 sessionId 加唯一索引；同 ID 重复 INSERT 返回 `DUPLICATE_SUBMIT`
> - 一份 sessionId 严绑一个 playerId（外键），杜绝多账号共用 session 串数据

**D3 · 哪些难度参与协议 ✅ 已决**

> **结论：仅 NORMAL / HARD / EXPERT 三档；NOVICE 与 INFINITE 客户端直接跳过 §四 流程**
>
> - NOVICE 是友好入门档（金额 ×2.0、重量 ×0），分数与中高难度不可比
> - INFINITE 是娱乐档（道具永久开启），不具竞技性
> - 客户端在 `Game.startNewGame(difficulty)` 时根据 difficulty ∈ {NORMAL, HARD, EXPERT} 决定是否调 `SessionService.beginSession`

**D4 · 心跳 vs 签名 ✅ 已决**

> **结论：不做心跳；用 HMAC-SHA256 + 一次性服务端下发 secret 给 submit payload 签名**
>
> 详见 §8.1。简要：
> - 取消"上报心跳" — 把 retry 等运行时数据压到 submit 的 `clientStats.retries` 里
> - 签名机制：服务端 issue session 时返回 `tokenSigningSecret`，客户端用其对 canonical payload 做 HMAC，服务端用同一 secret 验签
> - **不用客户端非对称私钥签 payload**：私钥放客户端等于公开
> - **服务端 token 完整性已用 JWT (RS256 / ES256)** — 与 HMAC payload 签名互补
> - 远期升级路径：服务端复盘事件流（客户端上送每关时序，服务端确定性 RNG 重放校验）

**D5 · 玩家身份 ✅ 已决**

> **结论：依赖宿主网站的登录态，playerId 不由游戏侧管理**
>
> - 宿主网站已实现登录功能，排行榜功能由宿主提供
> - 客户端通过 §4.0 的 A/B/C 任一渠道拿 playerId
> - 未登录态：仍可游玩，但 `SessionService.beginSession` 返回 null，全局禁用上榜（本地榜不受影响）
> - playerId / displayName 不上送 submit body — 服务端从 Bearer token 解出，杜绝伪造

---

## 十、实施顺序建议（落地路线）

> 此节非强制契约，只是建议的开发节奏。

```
Phase 1 — 客户端铺路（不依赖服务端）
  ├─ M1.1 新增 SessionService 框架（仅本地状态：playerId + sessionId）
  ├─ M1.2 Game.startNewGame 等接入 beginSession（仅本地写入，不调网络）
  ├─ M1.3 改造 ResultScene.handleSecondary → 走 GAME_OVER + RUN_ABANDONED（基于决策 D1）
  └─ M1.4 在 commitLeaderboardEntry 旁边并行调 SessionService.submit（仅本地暂存）

Phase 2 — 服务端 MVP
  ├─ M2.1 实现 §4.1 / §4.2 / §4.3 三个端点
  ├─ M2.2 玩家匿名表 + Session 表 + Submission 表
  └─ M2.3 §八 安全校验全部上线

Phase 3 — 联调
  ├─ M3.1 Vite env 注入 API base，SessionService 启用网络层
  ├─ M3.2 重试队列上线
  └─ M3.3 主菜单"排行榜"按钮 → 拉 §4.3 渲染

Phase 4 — 上线后
  ├─ 客户端：账号体系（如需要）
  └─ 服务端：反作弊深度策略（rate limit、relay attack 检测、回放校验）
```

---

## 附录：与已有代码的契合点

| 文件 | 函数 | 复用方式 |
|---|---|---|
| `src/utils/hash.ts` | `signEntry` | clientSig 字段直接复用 |
| `src/utils/validation.ts` | `getMaxPlausibleScore` / `validateLeaderboardEntry` | 服务端独立移植同一公式 |
| `src/core/Storage.ts` | `commitLeaderboardEntry` / `loadLeaderboard` | 本地榜继续维护，作为离线降级 |
| `src/level/difficulty.ts` | `leaderboardWeight` | submit 时上送但**服务端按难度独立分榜**，权重不再参与服务端排名 |
| `src/scene/VictoryScene.ts` | `handleSettle` | 触发 GAME_CLEARED |
| `src/scene/ResultScene.ts` | `handlePrimary`（无尽段单按钮分支） | 触发 ENDLESS_FAILED |
| `src/scene/ResultScene.ts` | `handleSecondary` | **改造点**：触发 RUN_ABANDONED（取代当前 clearProgress + MENU） |
| `src/core/Game.ts` | `changeScene(VICTORY_END/GAME_OVER)` | 调 SessionService.submit |
| `src/core/Game.ts` | `startNewGame` / `restoreProgress` / `loadFromManualSlot` | 调 SessionService.beginSession |

---

**变更历史：**

- 2026-05-23 v1 初稿（LanceLRQ）
- 2026-05-23 v1.1 决策落定：D1=阈值 L7 / D2=客户端 UUID + 服务端幂等 / D3=仅 NORMAL/HARD/EXPERT / D4=HMAC over 一次性 secret + JWT 完整性 / D5=外部登录系统 playerId
