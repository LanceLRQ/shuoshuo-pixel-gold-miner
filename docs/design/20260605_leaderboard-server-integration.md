# 排行榜服务端接入开发文档（v2 · 对接实装服务端）

> 状态：**正式开发文档**（可直接据此实施）
> 取代：[20260523_leaderboard-server-protocol.md](./20260523_leaderboard-server-protocol.md)（v1 协议设想稿，服务端实装后协议已变化）
> 承接：[20260520_leaderboard-research.md](./20260520_leaderboard-research.md)（本地榜调研，本地榜机制不变）
> 服务端：shuoshuo-crystal 开放平台「游戏运行时」模块（已上线），开发者文档见
> `https://shuoshuo.sikong.ren/open_platform/docs`（源码 `shuoshuo-crystal/web/src/app/open_platform/docs`）

---

## 〇、一页速览

| 项 | 结论 |
|---|---|
| 应用身份 | 服务端 seed 已预置 **内部应用** `client_id = shuoshuo-pixel-gold-miner`（无需 OAuth、无需 client_secret） |
| 鉴权 | 主站登录态：同域 Cookie `shuoshuo-auth-token`（或 `Authorization: Bearer <主站JWT>`）；**未登录也可匿名上榜** |
| 榜单 | 3 个独立榜：`normal` / `hard` / `expert`（NOVICE / INFINITE 不上榜，保持本地榜） |
| 排名 | 服务端按 `rawMoney` 单键降序；客户端不再做难度折算 |
| 上送流程 | **结算时懒开会话**：`POST sessions`（回填 started_at）→ HMAC 签名 → `POST submissions` |
| 签名 | `require_sign=true`：HMAC-SHA256(signing_secret, canonical)，canonical 键名 camelCase 字典序 |
| 门槛（服务端 gates） | `highestLevel ≥ 8` + `durationSec ≥ 25 × sessionLevels`（✅ 服务端配置已落地，见 §八） |
| 结算交互 | 三选一弹窗：**登录上榜 / 匿名上榜 / 不上榜**（匿名显名由服务端从 IP 派生「XX蟹」） |
| 本地榜 | 不下线，双写 + 离线降级（机制不变） |

---

## 一、背景与重评估结论

v1 协议设计（20260523）是在服务端未实现时的设想稿。服务端现已实装为**通用游戏排行榜平台**
（声明式 `ranked` 计分引擎 + 会话/提交/拉榜三段式 API），并在 seed 中预置了本游戏的应用与榜单。
客户端接入协议需按服务端实际实现重写。

### 1.1 服务端已就位的事实（源码核对）

| 项目 | 实际实现 | 源码位置（shuoshuo-crystal） |
|---|---|---|
| 应用注册 | `client_id=shuoshuo-pixel-gold-miner`，app_type=internal，`require_sign=true`、`allow_anonymous=true`、`session_ttl=86400`、`rate_limit_submit=5` | `backend/internal/app/seed/open_apps.json` |
| 榜单 ×3 | `normal` / `hard` / `expert`，`rank_by=ranked`，`rawMoney` 降序单键 | 同上 |
| 指标声明 | `rawMoney`[0, 9999999] / `highestLevel`[0,999] / `endedAtLevel`[0,999]，全部 required | 同上 |
| 门槛 | `min: highestLevel ≥ 8`；`minRatio: durationSec ≥ 25 × endedAtLevel` | 同上（本次将调整，见 §八） |
| 鉴权分流 | internal 走 `CheckUserLoginStatus`（Cookie/Bearer，未登录不报错走匿名）；third_party 才需要 OAuth | `handler/open_platform/game/auth.go` |
| 开会话 | SETNX 幂等；startedAt ∈ [now−TTL, now+5s]；返回 session_token + signing_secret + display_name | `service/open_platform/game/session_service.go` |
| 提交 | 会话校验 → 限速（5/分/member）→ used 幂等锁 → endedAt 校验 → HMAC 验签 → 注入 durationSec → 指标校验/门槛 → Lua 原子 ZADD+HSET（仅新分 ≥ 旧分才更新） | `service/open_platform/game/submission_service.go` |
| 拉榜 | TopN（默认 50 / 上限 200）+ 登录用户 around ±5；限速 60/分/设备 + 300/分/IP | `handler/open_platform/game/leaderboard.go` |
| 撤回 | 登录用户可 DELETE 自己条目；未登录匿名条目需站长后台处理 | 同上 |
| 登录态查询 | `GET /api/login` 返回 `login` / `account_id` / `account` | `handler/account/login.go` CheckLoginView |

### 1.2 与 v1 设计的差异对照（为什么要重写）

| 维度 | v1 设想（20260523） | 服务端实际 | 客户端影响 |
|---|---|---|---|
| 玩家身份 | 宿主注入 playerId，未登录禁榜 | 内部应用读主站 Cookie；**支持匿名上榜**（IP 派生「XX蟹」，ipHash 去重） | 新增三选一结算弹窗；AuthService 改为查 `GET /api/login` |
| 凭证 | JWT(RS256) + token 内嵌 secret | 不透明 `session_token`(64hex) + 独立下发 `signing_secret`(64hex) | 协议层重写 |
| 端点 | `/api/v1/leaderboard/*` | `/api/game/:clientId/{sessions,submissions,leaderboard}` | 重写 |
| 请求体 | camelCase | **snake_case**（签名 canonical 仍是 camelCase，两套并存） | 易错点，见 §四 4.3 |
| 难度区分 | submit 带 difficulty 字段 | **难度 = 不同 board_key**（normal/hard/expert 三个榜） | 难度→榜单映射 |
| 成绩字段 | 顶层 rawMoney / highestLevel / … | 装进 `metrics{}` 字典（数值型）；审计数据装 `extra{}` | payload 重排 |
| 门槛校验 | 客户端不判，服务端 BELOW_THRESHOLD | 服务端声明式 gates（同语义），错误码 `5041006` | 错误处理重写 |
| 错误模型 | 字符串 rejectedReason | 数字错误码 `5041xxx` + HTTP 状态 | 错误处理重写 |
| 反速通 | `endedAt−startedAt ≥ 25s × endedAtLevel`（服务端硬编码设想） | gate `minRatio durationSec/endedAtLevel ≥ 25`（可配置） | 本次改为 per=sessionLevels（§八） |
| 提交响应 | rank.position / totalEntries / personalBest | `{rank, personal_best}`（无 totalEntries） | UI 文案调整 |
| 会话时机 | 开局即开 | started_at 允许在 24h TTL 窗口内回填 → **结算时懒开**成为更优解 | 时序重排（§三） |

### 1.3 本次落定的决策（2026-06-05 评审）

> 以下决策与 v1 的 D1-D5 同级，后续变更须升版本。

| # | 决策 | 结论 |
|---|---|---|
| **D6 · 匿名上榜** | 客户端支持匿名 | ✅ 结算时三选一弹窗（登录上榜 / 匿名上榜 / 不上榜）；匿名入口标注「同一网络仅保留一人最高成绩」 |
| **D7 · 会话时机** | 懒开 | ✅ 开局只生成 sessionId + 记录 runStartedAt；结算弹窗选定身份后才 `sessions → submissions` 连发。理由：一次网络往返、displayMode 可结算时再选、不浪费会话、规避 24h 过期 |
| **D8 · 续盘门槛** | 服务端改 gate | ✅ 榜单 config 新增声明指标 `sessionLevels`（本次会话实际游玩关卡局数，含重试），gate 改为 `durationSec ≥ 25 × sessionLevels`，消除读档续盘被时长门槛误杀的问题（§八） |
| **D9 · 事件命名** | 沿用 v1 | ✅ `GAME_CLEARED` / `ENDLESS_FAILED` / `RUN_ABANDONED`（服务端 event 为自由字符串 ≤64） |
| 沿用 v1 | D2 sessionId 客户端 `crypto.randomUUID()`、D3 仅 NORMAL/HARD/EXPERT 上榜、D1 第一章门槛 `highestLevel ≥ 8`（现由服务端 gate 承担） | 不变 |

---

## 二、关键概念（实装版）

| 术语 | 含义 |
|---|---|
| **clientId** | 固定 `shuoshuo-pixel-gold-miner`，路由参数，不是密钥 |
| **boardKey** | 榜单标识。难度映射：NORMAL→`normal`、HARD→`hard`、EXPERT→`expert`；NOVICE / INFINITE 无榜，跳过协议 |
| **Run** | 一次游戏周期：开新局 / 读档 → 结算事件触发。客户端内存态追踪（刷新页面即放弃，本地榜不受影响） |
| **sessionId** | Run 开始时 `crypto.randomUUID()` 生成；服务端 SETNX 幂等（重复开会话 `5041002`，重复提交 `5041003`） |
| **displayMode** | `real`（实名，须登录）/ `anonymous`（匿名，显名由服务端从 IP 派生「XX蟹」）。开会话时锁定，提交时必须一致 |
| **session_token** | 开会话返回的不透明凭证（64 hex），提交时随 body 上送 |
| **signing_secret** | `require_sign=true` 时开会话返回（64 hex），用于对提交 payload 做 HMAC-SHA256；单会话有效 |
| **metrics** | 数值成绩字典：`rawMoney` / `highestLevel` / `endedAtLevel` / `sessionLevels`（全 int） |
| **durationSec** | 服务端按 `ended_at − started_at` 注入的内置指标（秒），仅供 gate 引用，客户端不上送、不参与签名 |
| **extra** | 任意 JSON 审计字段（不参与排名/签名/展示），放 retries、itemsPurchased 等 |

---

## 三、Run 生命周期与时序（懒开模式）

```
┌────────────────────────────────────────────────────────────────────┐
│ 玩家路径                  客户端动作                    服务端动作   │
├────────────────────────────────────────────────────────────────────┤
│ 启动游戏                  AuthService.refresh()                     │
│                           GET /api/login（缓存登录态）  ← login 状态 │
│                                                                     │
│ 开新局/读档(N/H/E)        生成 sessionId (UUID v4)                  │
│                           runStartedAt = Date.now()                 │
│                           sessionLevels = 0, retries = 0            │
│                           （纯内存，不联网）                         │
│                                                                     │
│ [游戏过程 L1..L21..L22+]  每开一关 sessionLevels++                  │
│   关卡/商店/重试/无尽      仅本地存档，不与服务端通信                │
│                                                                     │
│ [结算事件 ×3]             结算场景内弹「三选一」面板                 │
│   玩家选 实名/匿名   ────→ POST /sessions                            │
│                           {session_id, board_key, display_mode,     │
│                            started_at=runStartedAt, ...}            │
│                           ← {session_token, signing_secret,         │
│                              display_name, server_time}             │
│                           计算 clientSig (HMAC)                     │
│                      ────→ POST /submissions                         │
│                           ← {rank, personal_best}                   │
│                           面板显示「第 N 名 · 以 XX蟹 上榜」         │
│   玩家选 不上榜           跳过协议（本地榜照常）                     │
└────────────────────────────────────────────────────────────────────┘
```

### 3.1 Run 边界（与 v1 一致，重申）

| 事件 | 新 Run？ | 备注 |
|---|---|---|
| `Game.startNewGame(difficulty)` | ✅ | 重置 run 追踪数据 |
| `Game.restoreProgress()` / `loadFromManualSlot(id)` | ✅ | **续盘 = 新 Run**：runStartedAt = 读档时刻，sessionLevels 从 0 计 |
| `Game.retryCurrentLevel()` | ❌ | 同一 Run；retries++，sessionLevels 照常 ++（重试也是一局） |
| VictoryScene 选「挑战无尽」 | ❌ | Run 延续至 L22+ 失败结算 |
| ResultScene 失败 → 返回菜单 | ✅ 触发 `RUN_ABANDONED` 结束 Run | 需改造 handleSecondary（§六） |
| 刷新/关闭页面 | Run 丢弃 | 内存态；本地榜不受影响。pending 队列仅存「已尝试提交但失败」的结算（§七） |

### 3.2 结算事件 → 触发位置映射

| 事件 | 触发场景 | 客户端代码位置（现状） | 上送条件 |
|---|---|---|---|
| `GAME_CLEARED` | L21 通关，玩家在 VictoryScene 点「立即结算」 | `Game.changeScene(VICTORY_END)`（src/core/Game.ts:264） | 难度 ∈ {N,H,E} |
| `ENDLESS_FAILED` | L22+ 无尽段失败自动结算 | `Game.changeScene(GAME_OVER)` 且 `currentLevel > TOTAL_LEVELS`（src/core/Game.ts:273） | 难度 ∈ {N,H,E} |
| `RUN_ABANDONED` | L1-L21 失败后玩家点「返回菜单」 | `ResultScene.handleSecondary`（src/scene/ResultScene.ts:240）**改造**：改走 GAME_OVER | 难度 ∈ {N,H,E}；`highestLevel < 8` 时服务端 gate 拒绝（客户端照常上送，吃 `5041006` 后提示） |

> INFINITE 通关直跳 GAME_OVER（ResultScene.handlePrimary 的 INFINITE 分支）与 NOVICE 的一切结算：
> **跳过服务端协议**，本地榜照旧（NOVICE 进本地榜；INFINITE 本地榜也不进，维持现状 src/core/Game.ts:279-282）。

### 3.3 事件判定逻辑（结算入口统一收口）

```ts
/** 在 changeScene(VICTORY_END / GAME_OVER) 处构造结算上下文 */
function resolveSettleEvent(game: Game): SettleEvent | null {
  if (game.currentDifficulty === Difficulty.NOVICE
   || game.currentDifficulty === Difficulty.INFINITE) return null; // 不上榜
  if (game.state === GameState.VICTORY_END) return 'GAME_CLEARED';
  // GAME_OVER：
  return game.levelManager.currentLevel > TOTAL_LEVELS
    ? 'ENDLESS_FAILED'
    : 'RUN_ABANDONED';
}
```

---

## 四、API 协议（实装版）

- Base URL：`VITE_LEADERBOARD_API_BASE`，**生产默认 `/api`（同源）**；fetch 用同源默认凭证（Cookie 自动携带）。
- 响应统一包裹：`{ "code": 0, "data": {...} }`；错误 `{ "code": 5041xxx, "message": "...", "module": "..." }`。
- 时间戳：请求/响应中 `started_at` / `ended_at` / `expires_at` / `server_time` 为 **epoch 毫秒**；
  拉榜条目的 `submitted_at` 为 **epoch 秒**（服务端存 Unix()，注意单位差异）。

### 4.0 登录态查询（前置，启动时调用一次并缓存）

```
GET /api/login
```

响应 `data` 关键字段：`login`(bool)、`account_id`、`account`（含 `nick_name` 等公开字段）。
未登录 `login=false` —— 仍可游玩 + 匿名上榜。

> 内部应用鉴权口径（服务端 `CheckUserLoginStatus`）：优先 `Authorization: Bearer <主站JWT>`，
> 缺省回退 Cookie `shuoshuo-auth-token`。生产同源部署 Cookie 自动生效；
> 本地开发可用 `VITE_DEV_AUTH_TOKEN` 注入 Bearer 头模拟登录（§九）。

### 4.1 开会话

```
POST /api/game/shuoshuo-pixel-gold-miner/sessions
Content-Type: application/json
```

```jsonc
// Request（snake_case）
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",  // Run 开始时预生成的 UUID v4
  "board_key": "normal",                                  // normal | hard | expert
  "display_mode": "anonymous",                            // real | anonymous（real 需登录态）
  "client_version": "1.0.0",                              // package.json version
  "started_at": 1749100000000                             // runStartedAt（毫秒，须落在 [now-86400s, now+5s]）
}
```

```jsonc
// Response data
{
  "session_id": "550e8400-...",
  "session_token": "64位hex",
  "signing_secret": "64位hex",          // 本应用 require_sign=true，必返回
  "expires_at": 1749186400000,
  "server_time": 1749100001234,          // 用于校准时钟偏差（§4.4）
  "member": "10086",                     // 或 "anon:<ipHash>"，仅信息性
  "display_name": "深圳蟹"               // 本局上榜显名（real=昵称；anonymous=IP 派生）
}
```

主要错误：`5041002` session_id 已占用（重开会话场景，见 §七重试队列）、`5041011` real 模式未登录、
`5041012` 匿名被禁、`5041007` started_at 不在合理区间、`5041017` 昵称含非法字符（real 模式）。

### 4.2 提交成绩

```
POST /api/game/shuoshuo-pixel-gold-miner/submissions
Content-Type: application/json
```

```jsonc
// Request（snake_case）
{
  "session_id": "550e8400-...",
  "session_token": "<开会话返回>",
  "board_key": "normal",
  "display_mode": "anonymous",           // 必须与开会话一致，否则 5041014
  "event": "GAME_CLEARED",               // GAME_CLEARED | ENDLESS_FAILED | RUN_ABANDONED
  "ended_at": 1749102800000,             // 毫秒；须 ∈ [started_at, serverNow+5s]
  "metrics": {                            // 数值成绩（全 int，键名与榜单声明一致）
    "rawMoney": 24500,
    "highestLevel": 22,
    "endedAtLevel": 22,
    "sessionLevels": 24                   // 本次会话实际游玩局数（含重试），供时长门槛
  },
  "extra": {                              // 审计字段（不参与排名/签名/展示）
    "retries": 2,
    "itemsPurchased": ["DYNAMITE", "EXTRA_TIME"],
    "clientVersion": "1.0.0"
  },
  "client_sig": "9f8b7e6c..."            // HMAC-SHA256，见 §4.3
}
```

```jsonc
// Response data
{
  "rank": 7,              // 当前榜内名次（1-based）
  "personal_best": true   // 是否刷新（或首次创建）该 member 在本榜的最佳
}
```

> 服务端写入语义：同 member 仅当**新排序分 ≥ 旧分**时才更新 ZSET 与展示数据（Lua 原子），
> 低分提交不会覆盖历史最佳 —— 客户端无需自行判断「是否值得上送」。

### 4.3 client_sig 签名（⚠️ 全协议最大易错点）

`client_sig = HEX( HMAC-SHA256( signing_secret, canonical ) )`

- HTTP 请求体字段是 **snake_case**，但 **canonical 串键名是 camelCase** —— 服务端固定约定，两套并存。
- canonical 字段集：固定三项 `sessionId` / `event` / `endedAt` + **全部 metrics 键**（客户端原始 metrics；
  服务端注入的 `durationSec` 不参与）。
- 数值用最短十进制定点表示（整数不带小数点）—— 本游戏 metrics 全 int，无浮点歧义。
- 所有键**字典序升序**，拼 `key=value` 用 `&` 连接。

```ts
// src/utils/hmac.ts —— 与服务端 buildCanonical / CanonicalPayload 完全对齐
export function buildCanonical(p: {
  sessionId: string; event: string; endedAt: number;
  metrics: Record<string, number>;
}): string {
  const fields: Record<string, string> = {
    sessionId: p.sessionId,
    event: p.event,
    endedAt: String(p.endedAt),
  };
  for (const [k, v] of Object.entries(p.metrics)) fields[k] = String(v); // int → 无歧义
  return Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('&');
}

export async function hmacSha256Hex(secretHex: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secretHex),          // secret 按 ASCII 串处理（与服务端 []byte(secret) 一致）
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

```text
canonical 示例（注意 endedAtLevel < event < highestLevel … 按字典序）：
endedAt=1749102800000&endedAtLevel=22&event=GAME_CLEARED&highestLevel=22&rawMoney=24500&sessionId=550e8400-...&sessionLevels=24
```

### 4.4 时钟偏差处理

服务端校验 `ended_at ≤ serverNow + 5s`（超则 `5041015`）。客户端本地时钟可能快于服务端：

```
开会话后：skew = server_time − Date.now()
提交时：  ended_at = clamp(Date.now() + skew, started_at, ∞)
```

懒开模式下 sessions 与 submissions 间隔仅毫秒级，skew 校正足够。

### 4.5 拉榜

```
GET /api/game/shuoshuo-pixel-gold-miner/leaderboard?board=normal&top=50
X-Device-Id: <持久化的设备UUID，可选>
```

- `top` 默认 50、上限 200。限速 60 次/分（按 `X-Device-Id`，无则按 IP）+ IP 300 次/分兜底。
  建议客户端生成持久化 deviceId（localStorage UUID）随头上送，避免共享出口 IP 误伤。
- 登录态请求自动附带 `around`（自己附近 ±5 名）。

```jsonc
// Response data
{
  "list": [
    {
      "rank": 1,
      "display_name": "深圳蟹",
      "metrics": { "rawMoney": 99999, "highestLevel": 28, "endedAtLevel": 28, "sessionLevels": 30, "durationSec": 5400 },
      "event": "ENDLESS_FAILED",
      "submitted_at": 1749100123,     // ⚠️ 秒
      "source": "new",
      "anonymous": true
    }
  ],
  "around": []                          // 登录时填充，条目结构同上
}
```

> 展示哪些列由榜单 display 配置决定（`rawMoney` 主列 + `highestLevel`）；
> 如需动态表头元数据可调 `GET /api/game/apps/shuoshuo-pixel-gold-miner`（返回 boards[].display.columns）。
> 游戏内像素 UI 可直接硬编码两列，与服务端配置保持一致即可。

### 4.6 撤回我的成绩（P2 可选）

```
DELETE /api/game/shuoshuo-pixel-gold-miner/leaderboard/me?board=normal
```

仅登录用户（实名或登录态匿名条目，accountId 命名空间）；未登录匿名条目（`anon:` 前缀）需联系站长后台移除。

---

## 五、错误码处理表（客户端行为）

| code | HTTP | 含义 | 客户端行为 |
|---|---|---|---|
| `5041001` | 404 | board_key 不存在 | 配置错误，禁用上榜入口 + console.error |
| `5041002` | 409 | session_id 已占用 | 重试队列场景：会话已开过 → 用持久化的 session_token 直接提交（§七）；其他场景：换新 UUID 重开 |
| `5041003` | 409 | 该 session 已提交过（幂等） | **视为成功**：出队，提示「成绩已记录」 |
| `5041004` | 401 | 会话凭证无效/过期 | 丢弃该结算（>24h），降级本地榜提示 |
| `5041005` | 422 | metric 越界 | 不重试；理论上仅 rawMoney>9,999,999 触发，本地榜兜底 |
| `5041006` | 422 | 未达门槛（highestLevel<8 或时长不足） | 不重试；提示「通关第一章后才能上公榜，本地已记录」 |
| `5041007` | 422 | 时长不合理（started_at/ended_at 区间错） | 不重试；检查时间戳逻辑 |
| `5041008` | 429 | 提交限速（5 次/分/member） | 读 `Retry-After` 头退避后重试 |
| `5041010` | 401 | 签名校验失败 | 不重试；canonical 实现 bug，console.error 上报 |
| `5041011` | 401 | real 模式需要登录 | 弹窗引导登录或改选匿名 |
| `5041012` | 403 | 匿名被禁（站长关闭 allow_anonymous） | 隐藏匿名按钮（开会话阶段即返回） |
| `5041014` | 409 | display_mode 与开会话不一致 | 不重试；客户端 bug |
| `5041015` | 422 | ended_at 超前服务端时间 | 用 skew 校正后重试一次（§4.4） |
| `5041016` | 429 | 拉榜限速 | 退避；榜单 UI 做 30s 内存缓存 |
| `5041017` | 422 | 显示名非法字符（real 模式昵称） | 提示改昵称或改选匿名 |
| 网络错误 / 5xx | — | 服务端故障 | 指数退避（1s/2s/4s，3 次）；仍失败 → 入 pending 队列（§七），降级本地榜提示 |

> 通用原则（服务端文档同款）：**4xx 是调用方的错不要无脑重试**（仅 429/5041015 例外）；5xx 才指数退避。

---

## 六、客户端架构设计

### 6.1 新增模块

```
src/core/AuthService.ts        登录态：GET /api/login 一次性拉取 + 缓存；login / nickName / accountId
src/core/LeaderboardClient.ts  协议层单例：openSession / submit / fetchBoard / withdraw / replayPending
src/utils/hmac.ts              buildCanonical + hmacSha256Hex（Web Crypto，§4.3）
src/ui/RankPanel.ts            结算三选一面板（GameOverScene / VictoryEndScene 复用的像素 UI 组件）
src/scene/LeaderboardScene.ts  在线榜查看场景（主菜单入口，三榜切换 + around 高亮）
```

#### LeaderboardClient 接口草案

```ts
/** 难度 → 榜单映射；无映射 = 不上榜 */
const BOARD_KEY_BY_DIFFICULTY: Partial<Record<Difficulty, string>> = {
  [Difficulty.NORMAL]: 'normal',
  [Difficulty.HARD]: 'hard',
  [Difficulty.EXPERT]: 'expert',
};

/** 一次 Run 的追踪数据（Game 持有，纯内存） */
interface RunTracking {
  sessionId: string;       // crypto.randomUUID()，开新局/读档时生成
  runStartedAt: number;    // 开新局/读档时刻（ms）
  sessionLevels: number;   // 本次会话游玩局数（GameScene 实例化即 +1，含重试）
  retries: number;         // retryCurrentLevel 计数（仅审计）
}

/** 结算 payload（changeScene 收口处构造，传给结算场景） */
interface SettlePayload {
  event: 'GAME_CLEARED' | 'ENDLESS_FAILED' | 'RUN_ABANDONED';
  boardKey: string;
  tracking: RunTracking;
  metrics: { rawMoney: number; highestLevel: number; endedAtLevel: number; sessionLevels: number };
  extra: { retries: number; itemsPurchased: string[]; clientVersion: string };
}

class LeaderboardClient {
  /** 三选一面板点击后调用：开会话 + 签名 + 提交，一气呵成 */
  async settle(payload: SettlePayload, displayMode: 'real' | 'anonymous'): Promise<SettleResult>;
  /** 拉榜（30s 内存缓存 + X-Device-Id） */
  async fetchBoard(boardKey: string, top?: number): Promise<BoardData>;
  /** 启动时回放 pending 队列（§七） */
  async replayPending(): Promise<void>;
}

type SettleResult =
  | { ok: true; rank: number; personalBest: boolean; displayName: string }
  | { ok: false; code: number; reason: 'below_threshold' | 'need_login' | 'offline' | 'rejected' };
```

> 注：`highestLevel === endedAtLevel` 恒成立（本游戏关卡单调推进，重试不回退），两值同源上送，
> 字段分立是为兼容服务端通用榜单声明。

### 6.2 改动点清单（现有文件）

| 文件 | 改动 |
|---|---|
| `src/core/Game.ts` | ① `startNewGame` / `restoreProgress` / `loadFromManualSlot` 重置 `RunTracking`；② `changeScene` PLAYING 分支 `new GameScene(...)` 处 `sessionLevels++`；③ `retryCurrentLevel` 处 `retries++`；④ `VICTORY_END` / `GAME_OVER` case 在现有 `commitLeaderboardEntry`（本地榜）旁构造 `SettlePayload` 传给结算场景（**不在此处发网络**，交互在场景内） |
| `src/scene/ResultScene.ts` | `handleSecondary`（:240）改造：`clearProgress()+MENU` → 走 `changeScene(GAME_OVER)`（事件自动判定为 RUN_ABANDONED）。GAME_OVER 场景的「返回菜单」继续承担清进度职责 |
| `src/scene/GameOverScene.ts` | 嵌入 `RankPanel`：有 SettlePayload 时展示三选一 → 提交 → 结果（名次/降级提示） |
| `src/scene/VictoryEndScene.ts` | 同上（GAME_CLEARED 路径） |
| `src/scene/MenuScene.ts` | 新增「排行榜」按钮 → `LeaderboardScene` |
| `src/level/difficulty.ts` | `DifficultyConfig` 增加 `boardKey?: string`（或独立映射表）；`leaderboardWeight` 保留（本地总榜折算仍用） |
| `vite.config.ts` / `.env` | `VITE_LEADERBOARD_API_BASE`（默认 `/api`）；dev proxy；`__APP_VERSION__` define 注入 package.json version |
| `src/main.ts` | 启动时 `AuthService.refresh()` + `LeaderboardClient.replayPending()`（异步、不阻塞首屏） |

### 6.3 三选一面板交互（RankPanel）

```
┌─ 上传成绩到公榜? ────────────────────────────┐
│  [ 以「{nickName}」上榜 ]   ← 已登录时显示    │
│  [ 登录后上榜 ]             ← 未登录时显示    │
│  [ 匿名上榜 ]                                │
│    └ 小字：同一网络仅保留一人最高成绩          │
│  [ 暂不上榜 ]                                │
└──────────────────────────────────────────────┘
```

- **已登录**：第一项直接 `settle(payload, 'real')`。
- **未登录点「登录后上榜」**：新窗口打开 `https://shuoshuo.sikong.ren/login`，面板变为
  「已完成登录？[刷新登录态并上榜]」→ 点击后 `AuthService.refresh()` 成功则 settle('real')。
- **匿名上榜**：直接 `settle(payload, 'anonymous')`，成功文案带服务端返回的 display_name：
  「以『广东蟹』之名上榜，当前第 N 名」。
- **暂不上榜**：关闭面板。成绩仍在本地榜（双写已在 changeScene 完成）。
- 提交中显示 loading；失败按 §五 错误表给出文案；`below_threshold` 文案：
  「通关第一章（L7）后才能登上公榜，成绩已记录在本地」。
- 面板仅在 `SettlePayload != null`（即 N/H/E 难度结算）时出现；NOVICE / INFINITE 不渲染。

### 6.4 本地榜关系（不变 + 衔接）

- 双写顺序：`changeScene` 内先 `Storage.commitLeaderboardEntry`（本地，立即），玩家在面板选择后才走网络。
- 本地榜继续承担：离线降级、NOVICE 难度记录、历史回看、「总榜折算」怀旧视图（`leaderboardWeight` 仅本地用）。
- 服务端提交成功后可在本地对应 entry 补 `submittedAt` 标记（P2，可选）。

---

## 七、离线降级与重试队列

```
localStorage key: goldminer_h5_pending_submissions
条目: {
  sessionId, boardKey, displayMode, startedAt, endedAt, event,
  metrics, extra,
  sessionToken?,     // 开会话成功但提交失败时持久化
  signingSecret?,    // 同上（单会话有效，泄露仅能伪造该次提交，风险可接受）
  attempts: number,
}
```

- **入队时机**：玩家已在面板做出上榜选择，但 sessions 或 submissions 因网络/5xx 最终失败。
  （玩家选「暂不上榜」不入队 —— 尊重选择。）
- **回放时机**：下次启动 `replayPending()`，逐条：
  1. 无 sessionToken → 重新 `POST /sessions`（started_at 用原值；若已超 24h TTL 窗口被 `5041007` 拒 → 丢弃出队，本地榜兜底）；
     遇 `5041002`（会话已存在但本地丢了 token）→ 无法恢复，丢弃出队。
  2. 有 sessionToken → 直接 `POST /submissions`；`5041003` 视为成功出队。
  3. 其余 4xx → 丢弃出队（记录 console.warn）；5xx/网络 → attempts++（≥5 次放弃），留队。
- 回放静默执行，不打断玩家；成功时可在主菜单 toast「上次成绩已补传（第 N 名）」（P2 可选）。

---

## 八、服务端配置变更（✅ 已于 2026-06-05 落地）

> 决策 D8：续盘局 `durationSec`（会话时长）只覆盖读档后的游玩时间，按 `endedAtLevel` 算门槛会误杀。
> 改为按「本次会话实际游玩局数 `sessionLevels`」计算，语义为**平均每局 ≥ 25 秒**，对新局/续盘一视同仁。

三个榜（normal / hard / expert）的 config 统一为（已核对 seed `open_apps.json` 三榜逐项一致）：

```jsonc
{
  "version": 1,
  "metrics": [
    { "key": "rawMoney",      "label": "金币",     "type": "int", "min": 0, "max": 9999999, "required": true },
    { "key": "highestLevel",  "label": "最高关卡", "type": "int", "min": 0, "max": 999,     "required": true },
    { "key": "endedAtLevel",  "label": "结束关卡", "type": "int", "min": 0, "max": 999,     "required": true },
    { "key": "sessionLevels", "label": "会话局数", "type": "int", "min": 1, "max": 999,     "required": true }   // 🆕
  ],
  "rank": [
    { "metric": "rawMoney", "order": "desc" }
  ],
  "gates": [
    { "type": "min",      "metric": "highestLevel", "value": 8 },
    { "type": "minRatio", "metric": "durationSec", "per": "sessionLevels", "value": 25 }    // 🆕 per 由 endedAtLevel 改 sessionLevels
  ],
  "display": { "columns": ["rawMoney", "highestLevel"], "primary": "rawMoney" }
}
```

**落地记录（2026-06-05 站长已完成）：**

1. ✅ `shuoshuo-crystal/backend/internal/app/seed/open_apps.json` 中 goldminer 三个 board 的 config 已同步
   （`sessionLevels` 指标 + `minRatio per=sessionLevels` gate，`open_apps.json:76/100/124` 与 `:83/107/131`）。
2. ✅ 运行库榜单配置已生效（seed 对已存在 board 不自动覆盖——`seed_service.go` ensureBoards 已存在即跳过，
   需经后台「榜单管理 → 恢复默认配置」刷新，该步骤站长已处理）。

> 备注：`sessionLevels` 不参与 rank，无位预算影响；声明 `required:true` 后不带该指标的提交会被拒，
> 客户端实装时 metrics 必须携带 `sessionLevels`（游戏公榜尚未开放，无存量兼容压力）。
> 排名键仅 `rawMoney`[0,9999999] ≈ 24 bits ≤ 52，预算不变。

---

## 九、开发环境与部署

| 项 | 方案 |
|---|---|
| 生产部署 | 构建产物部署到主站 `https://shuoshuo.sikong.ren/game/gold-miner/`（seed entry_url 已指向此处）；同源 → Cookie/API 零配置 |
| `VITE_LEADERBOARD_API_BASE` | 生产 `/api`；不配置时代码默认 `/api` |
| 本地 dev | `vite.config.ts` 增加 proxy：`'/api' → 'https://shuoshuo.sikong.ren'`（或本地 crystal 后端 `http://localhost:<port>`），`changeOrigin: true` |
| dev 登录态 | Cookie 跨域不可用；用 `VITE_DEV_AUTH_TOKEN`（主站 JWT）让 LeaderboardClient/AuthService 在 dev 模式附加 `Authorization: Bearer` 头（服务端 internal 鉴权优先读该头）。仅 dev 生效，禁止打进生产构建 |
| client_version | vite `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` |
| 设备标识 | `localStorage goldminer_h5_device_id`（UUID，首次生成），拉榜时附 `X-Device-Id` |

---

## 十、安全模型小结（实装版）

| 层 | 机制 | 归属 |
|---|---|---|
| 身份 | 内部应用 + 主站登录态（Cookie/Bearer）；匿名按 ipHash 去重 + IP 派生显名 | 服务端 |
| 凭证 | session_token 不透明随机串；signing_secret 单会话、随会话 TTL 过期 | 服务端下发 |
| Payload 完整性 | HMAC-SHA256(signing_secret, canonical)，恒定时比较 | 双端 |
| 幂等 | sessionId SETNX（开会话）+ used 锁（提交），重复提交 `5041003` | 服务端 |
| 反速通/合理性 | started_at 区间校验 + ended_at 上界 + durationSec 注入 + gates（门槛/时长比） + metrics min/max | 服务端 |
| 限速 | 提交 5/分/member；拉榜 60/分/设备 + 300/分/IP | 服务端 |
| 本地榜防篡改 | SHA-256 签名 + `validateLeaderboardEntry` 数学上限（不变，见 20260520 §八） | 客户端 |
| 不防的事 | 动态调试改内存、完整逆向重放协议（单机游戏，成本>收益；终极手段是服务端事件流复盘，远期） | — |

> v1 中的客户端预判门槛、难度白名单判断等逻辑**不再前置拦截**（NOVICE/INFINITE 跳过除外）——
> 统一交给服务端 gates/校验，客户端只做错误码消化与降级提示，避免双端规则漂移。

---

## 十一、实施里程碑

```
M0 — 服务端配置（前置，站长操作）✅ 已完成（2026-06-05）
  └─ 三榜 config 更新 sessionLevels + gate（§八），seed JSON 同步 + 后台恢复默认配置

M1 — 协议层（不动游戏逻辑，可独立联调）
  ├─ src/utils/hmac.ts（buildCanonical + hmacSha256Hex）＋ 单元自测（与服务端互验一组向量）
  ├─ src/core/AuthService.ts（GET /api/login + 缓存 + dev Bearer 注入）
  ├─ src/core/LeaderboardClient.ts（openSession/submit/fetchBoard + 错误码映射 + 退避）
  └─ vite env / proxy / __APP_VERSION__

M2 — Run 追踪与结算改造
  ├─ Game.ts：RunTracking 重置/计数/SettlePayload 构造
  ├─ ResultScene.handleSecondary → GAME_OVER（RUN_ABANDONED 路径）
  └─ 验证：三事件的 payload 数值正确（含续盘 sessionLevels 口径）

M3 — UI
  ├─ RankPanel 三选一面板（GameOverScene / VictoryEndScene 嵌入）
  ├─ LeaderboardScene 在线榜（三榜切换 + around 高亮 + 30s 缓存）
  └─ MenuScene 入口按钮

M4 — 离线降级 + 验收
  ├─ pending 队列 + replayPending
  └─ §十二 验收清单全量过一遍
```

## 十二、测试与验收清单

**协议正确性**
- [ ] canonical 串与服务端互验：同一组 {sessionId, event, endedAt, metrics} 双端 HMAC 一致
- [ ] metrics 键名/取值与榜单声明一致（int、范围内）；缺 `sessionLevels` 时服务端拒绝（required 生效）
- [ ] 重复提交同 sessionId → `5041003`，客户端按成功处理

**三事件路径**
- [ ] L21 通关 → VictoryScene「立即结算」→ GAME_CLEARED 上送，highestLevel=21
- [ ] 无尽 L22+ 失败 → ENDLESS_FAILED，endedAtLevel ≥ 22
- [ ] L10 失败「返回菜单」→ RUN_ABANDONED 上送成功（highestLevel=10 ≥ 8）
- [ ] L5 失败「返回菜单」→ RUN_ABANDONED 被 `5041006` 拒 → 降级文案正确，本地榜有记录
- [ ] NOVICE / INFINITE 结算 → 不出现三选一面板，无网络请求

**身份三态**
- [ ] 已登录实名：显名=昵称，around 在榜单页正确高亮
- [ ] 已登录匿名：显名=XX蟹，member 仍按账号去重
- [ ] 未登录匿名：同一网络两浏览器只留最高分；「登录后上榜」流程（新窗口登录 → 刷新登录态 → 提交）跑通

**续盘与时长门槛（D8 验证）**
- [ ] 读档 L20 速败（<25s×endedAtLevel 旧口径会被拒的场景）→ 新 gate 下提交成功
- [ ] 新开局速通脚本模拟（durationSec < 25×sessionLevels）→ `5041006` 拒绝

**降级与重试**
- [ ] 断网结算 → 入 pending 队列 → 恢复网络重启 → 补传成功（`5041003` 场景也验证）
- [ ] 限速 429 → 按 Retry-After 退避重试成功
- [ ] ended_at 时钟快 10s → skew 校正后提交成功

**回归**
- [ ] 本地榜（含 NOVICE）写入/展示/签名校验不受影响
- [ ] 主站游戏详情页（/games/shuoshuo-pixel-gold-miner）榜单与游戏内榜单数据一致

---

**变更历史：**

- 2026-06-05 v2 初稿（LanceLRQ）：按服务端实装重写协议；落定 D6 匿名三选一 / D7 懒开会话 / D8 sessionLevels 门槛 / D9 事件命名沿用
- 2026-06-05 v2.1：§八 服务端配置变更核实并标记已落地（seed 三榜逐项核对一致 + 运行库已刷新），M0 里程碑完成
