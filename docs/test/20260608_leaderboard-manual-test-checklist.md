# 排行榜系统人工测试清单（M1-M4 联调验收）

> 范围：commit `9c0bb93`(M1) ~ `2a4353f`(M4) — 排行榜服务端接入全链路
> 对应设计文档：[20260605_leaderboard-server-integration.md](../design/20260605_leaderboard-server-integration.md)（§十二 验收清单的可操作化展开）
> 涉及模块：`AuthService` / `LeaderboardClient` / `hmac` / `RankPanel` / `LeaderboardModal` / `Game`(RunTracking) / `ResultScene` / 三结算场景 / `godMode`

---

## 〇、测试前置准备

### 0.1 环境要求（关键）

| 项 | 要求 | 验证方法 |
|---|---|---|
| **同源访问** | 必须经 `https://shuoshuo.sikong.ren/game/gold-miner/` 打开游戏，**不能用 localhost:15715 直连** | 直连时 god 排行榜命令会打印拒绝提示；UI 提交也拿不到主站 Cookie |
| dev 服务器 | `npm run dev`（固定端口 15715，base=`/game/gold-miner/`），本地 nginx 反代到主站子路径 | 浏览器地址栏确认是 `shuoshuo.sikong.ren` 域名 |
| 服务端 gate | 默认 `highestLevel ≥ 8` + `durationSec ≥ 25×sessionLevels`；按需用站长后台「榜单管理」临时清空 gate 灌数据（§9.2） | — |
| 浏览器 DevTools | 全程开 Console + Network 面板观察请求/响应 | — |

### 0.2 测试工具速查

| 工具 | 用途 |
|---|---|
| `god.help()` | 列出全部调试命令 |
| `god.state()` | 看当前 state/level/money/difficulty + **settle payload**（结算口径验收用） |
| `god.lbSubmit(opts?)` | 直接走完 sessions→签名→submissions 提交一条 |
| `god.lbTop(board?, top?)` | 拉榜 console.table 打印 |
| `god.lbLogin()` | 查主站登录态 |
| `god.difficulty('NORMAL')` / `god.level(n)` / `god.money(n)` | 快速构造测试场景 |

### 0.3 localStorage 关键 key（清理/观察用）

```
goldminer_h5_device_id            拉榜设备标识（首次自动生成 UUID）
goldminer_h5_pending_submissions  离线重试队列（M4）
```
> 清空重试队列：DevTools → Application → Local Storage → 删除 `goldminer_h5_pending_submissions`

---

## 一、协议正确性（M1）

### TC-1.1 HMAC 签名双端互验 ⭐核心
- **目的**：确认 canonical 串拼接与服务端完全一致（全协议最大易错点）
- **步骤**：
  1. 同源打开游戏，Console 执行 `god.lbSubmit({ board: 'normal', displayMode: 'anonymous', rawMoney: 12345, highestLevel: 10, endedAtLevel: 10, sessionLevels: 10 })`
  2. Network 面板查看 `POST submissions` 响应
- **预期**：返回 `code: 0`，`data.rank` 有值；**不出现 `5041010`（签名校验失败）**
- **失败排查**：若 5041010 → canonical 键序/数值格式与服务端不一致，检查 `hmac.ts:31` 字节序排序、metrics 是否为最短整数串（`12345` 而非 `12345.0`）

### TC-1.2 canonical 字段集正确性
- **目的**：确认签名只含 `sessionId/event/endedAt` + 客户端原始 metrics，**不含服务端注入的 durationSec**
- **步骤**：Console 执行
  ```js
  // 手动比对：取一组固定值，确认输出符合字典序
  buildCanonical 不直接暴露，可用 god.lbSubmit 后看 Network 请求体的 metrics 与签名是否被服务端接受
  ```
  实操：`god.lbSubmit({ sessionLevels: 5, highestLevel: 9, endedAtLevel: 9, rawMoney: 8000 })` 提交成功即证明字段集对齐
- **预期**：提交成功（服务端用相同字段集验签通过）

### TC-1.3 metrics 必填与范围校验
- **目的**：`sessionLevels` required 生效；越界拒绝
- **步骤**：
  1. `god.lbSubmit({ rawMoney: 99999999 })`（超 9999999 上限）
- **预期**：返回 `5041005`（metric 越界），文案「成绩数值超出范围」

### TC-1.4 重复提交幂等
- **目的**：同 sessionId 二次提交 → `5041003` 按成功处理
- **步骤**：M4 重试队列场景天然覆盖（见 TC-5.1）；或观察回放日志 `pending 补传成功`
- **预期**：`5041003` 不报错，客户端视为成功（rank=0，文案「成绩已记录」）

---

## 二、三事件路径（M2）— 结算 payload 口径

> 验证方法统一：进入对应场景后，**结算场景出现前**用 `god.state()` 看 `settle` 字段，核对 event / metrics。

### TC-2.1 GAME_CLEARED（L21 通关）
- **步骤**：
  1. `god.difficulty('NORMAL')` → `god.level(21)` → 进游戏打通 L21
  2. VictoryScene 点「立即结算」进入 VictoryEndScene
  3. 此时 `god.state()` 看 settle
- **预期**：`settle.event === 'GAME_CLEARED'`，`metrics.highestLevel === 21`，`endedAtLevel === 21`，`boardKey === 'normal'`，面板出现三选一

### TC-2.2 ENDLESS_FAILED（无尽 L22+ 失败）
- **步骤**：
  1. `god.difficulty('NORMAL')` → 通关 L21 → VictoryScene 选「挑战无尽」→ 玩到 L22+ 失败
  2. GameOverScene 出现前 `god.state()`
- **预期**：`settle.event === 'ENDLESS_FAILED'`，`endedAtLevel ≥ 22`

### TC-2.3 RUN_ABANDONED（L8-L21 失败返回菜单）⭐改造点
- **步骤**：
  1. `god.difficulty('NORMAL')` → `god.level(10)` → 进游戏故意失败 → ResultScene
  2. 点「返回菜单」（次按钮）
- **预期**：
  - **不直接回菜单**，而是进入 GameOverScene（`ResultScene.handleSecondary` 已改走 GAME_OVER）
  - `settle.event === 'RUN_ABANDONED'`，`highestLevel === 10`
  - GameOverScene 出现上榜面板，提交成功（10 ≥ 8 过门槛）

### TC-2.4 RUN_ABANDONED 低关卡被门槛拒绝
- **步骤**：`god.difficulty('NORMAL')` → `god.level(5)` → 失败 → 「返回菜单」→ 面板选上榜
- **预期**：返回 `5041006`，面板显示降级文案「通关第一章（L7）后才能登上公榜，成绩已记录在本地」；**本地榜仍有记录**（回主菜单看本地榜）

### TC-2.5 NOVICE / INFINITE 不触发面板 ⭐边界
- **步骤**：
  1. `god.difficulty('NOVICE')` → 任意结算
  2. `god.difficulty('INFINITE')` → 任意结算
- **预期**：
  - **不出现三选一面板**（`getPendingSettlePayload()` 返回 null）
  - Network **无 sessions/submissions 请求**
  - `god.state()` 的 `settle === null`
  - NOVICE 仍进本地榜；INFINITE 本地榜也不进（维持现状）

### TC-2.6 续盘 = 新 Run，sessionLevels 口径 ⭐D8 关键
- **步骤**：
  1. 正常玩到 L15 存档退出 → 重新读档续盘
  2. 续盘后玩 3 关失败 → `god.state()` 看 settle
- **预期**：`sessionLevels` 从读档后**从 0 重新计**（约 3-4，不含读档前的关卡），`tracking.runStartedAt` 是读档时刻
- **意义**：避免「读档 L20 但只玩了几关」被旧时长门槛（按 endedAtLevel 算）误杀

### TC-2.7 重试不重置 Run，retries/sessionLevels 累加
- **步骤**：某关失败 → ResultScene 点「重试」→ 重玩同关
- **预期**：同一 Run（sessionId 不变），`retries++`，`sessionLevels` 照常 ++（重试也算一局）

---

## 三、身份三态（M3 RankPanel）

### TC-3.1 已登录 — 实名上榜
- **前置**：先在主站登录，`god.lbLogin()` 确认 `已登录：<昵称>`
- **步骤**：N/H/E 难度结算 → 面板第一项显示「以「{昵称}」上榜」→ 点击
- **预期**：提交成功，success 态显示「以『{昵称}』上榜，当前第 N 名」；榜单页该条 **无匿名标签**

### TC-3.2 已登录 — 仍选匿名上榜
- **步骤**：已登录状态 → 面板点「匿名上榜」
- **预期**：成功，显名为服务端 IP 派生「XX蟹」；member 仍按账号去重（同账号实名+匿名只留最高分）

### TC-3.3 未登录 — 匿名上榜
- **前置**：未登录（无痕窗口或登出），`god.lbLogin()` 确认「未登录」
- **步骤**：结算 → 面板第一项显示「登录后上榜」，点「匿名上榜」
- **预期**：成功，显名「XX蟹」，带匿名标签

### TC-3.4 未登录 — 登录后上榜流程 ⭐多步
- **步骤**：
  1. 未登录结算 → 点「登录后上榜」
  2. **新窗口打开** `/login`（同源主站登录页）
  3. 在新窗口完成登录 → 回游戏面板（已转「已完成登录？」态）
  4. 点「刷新登录态并上榜」
- **预期**：
  - 刷新后 `AuthService.refresh()` 成功 → 自动以实名提交
  - 若仍未登录 → 显示提示「尚未检测到登录」，可重试或改选匿名
  - 面板有「返回」可退回三选一

### TC-3.5 匿名去重（同网络）
- **步骤**：同一网络两个浏览器/无痕窗口分别匿名提交不同分数到同一榜
- **预期**：榜单只保留**最高分**那一条（按 ipHash 去重，匿名最多占一行）

---

## 四、在线榜 UI（M3 LeaderboardModal）

### TC-4.1 主菜单入口
- **步骤**：主菜单点「排行榜」按钮
- **预期**：DOM overlay 弹窗打开，覆盖 canvas；游戏暂停（`setPausedByExternal`，防空格误触）

### TC-4.2 三难度榜 Tab 切换
- **步骤**：在弹窗内切 普通/困难/专家 三个 Tab
- **预期**：
  - 每个 Tab 拉对应榜（normal/hard/expert）
  - 快速连续切换不出现「过期响应覆盖当前 Tab」（loadSeq 防护）
  - 加载中显示 loading 文案，空榜显示空态文案

### TC-4.3 榜单列与排名样式
- **预期**：表头 名次/玩家/金币/最高关；前 3 名金色高亮；匿名条目带「匿名」标签

### TC-4.4 around ±5 高亮（登录态）
- **前置**：已登录且自己在榜上
- **步骤**：打开对应难度榜
- **预期**：底部独立「我的附近」区块，高亮显示自己 ±5 名

### TC-4.5 XSS 转义 ⭐安全
- **目的**：display_name 来自服务端用户输入，必须转义
- **步骤**：（需站长配合）造一条含 `<script>` 或 `<b>` 的昵称条目，或代码审查 `escapeHtml` 覆盖 `& < > " '`
- **预期**：特殊字符以文本形式显示，**不执行/不破坏 DOM**

### TC-4.6 关闭方式
- **步骤**：分别测 ✕ 按钮 / 点遮罩 / 按 Esc
- **预期**：三种方式均能关闭，关闭后游戏恢复（取消暂停）

### TC-4.7 拉榜 30s 缓存
- **步骤**：打开榜 → 关闭 → 30s 内再打开同榜
- **预期**：30s 内不重发请求（Network 无新请求，命中内存缓存）；超 30s 后重新拉取

---

## 五、离线降级与重试队列（M4）⭐核心

### TC-5.1 断网入队 → 恢复补传
- **步骤**：
  1. DevTools Network → 勾选 **Offline**
  2. N/H/E 难度结算 → 面板选「匿名上榜」
  3. 观察：提交失败，面板显示降级文案「网络异常，成绩已记录在本地，恢复后自动补传」
  4. 检查 localStorage `goldminer_h5_pending_submissions` **已入队 1 条**
  5. 取消 Offline → **刷新页面**（触发启动 `replayPending`）
  6. 看 Console 日志
- **预期**：
  - Console 输出 `[Leaderboard] 回放 pending 队列：1 条` → `pending 补传成功`
  - 队列被清空（key 移除）
  - 榜单出现该成绩

### TC-5.2 开会话成功但提交失败 → 凭证持久化
- **步骤**：sessions 成功后立即断网（较难手动构造，可代码审查 `settle` catch 分支 `LeaderboardClient.ts:461`）
- **预期**：入队条目含 `sessionToken`/`signingSecret`；下次回放**跳过重开会话直接提交**（不会吃 5041002 误丢弃）

### TC-5.3 重试上限放弃
- **步骤**：持续断网，多次刷新触发回放（每次 attempts++）
- **预期**：`attempts` 达 5 次后 Console 输出 `pending 重试超限放弃`，出队（本地榜兜底）

### TC-5.4 4xx 被拒丢弃出队
- **步骤**：构造一条会被 4xx 拒的 pending（如超 24h TTL 的 startedAt），刷新回放
- **预期**：Console `pending 提交被拒 code=xxxx，丢弃`，出队不重试

### TC-5.5 限速 429 退避重试
- **步骤**：短时间密集提交（>5 次/分）触发 `5041008`
- **预期**：客户端读 `Retry-After` 退避后自动重试一次；回放场景中 429 留队下次再试（不算确定性拒绝）

### TC-5.6 时钟偏差校正
- **步骤**：（可选）系统时钟调快 10s 后提交
- **预期**：首次可能 `5041015`（ended_at 超前），客户端用 skew 校正后重试一次成功

---

## 六、回归测试（不能被破坏）

### TC-6.1 本地榜不受影响 ⭐
- **步骤**：
  1. NOVICE 难度通关 → 看本地榜有记录
  2. N/H/E 难度结算选「暂不上榜」→ 本地榜仍有记录（双写已在 changeScene 完成）
  3. 断网结算 → 本地榜仍写入
- **预期**：本地榜写入/展示/签名校验全部正常，与上榜选择解耦

### TC-6.2 失败「返回菜单」清档职责
- **步骤**：TC-2.3 流程走完，从 GameOverScene 点「返回菜单」
- **预期**：自动存档槽被清（`resetAutoSlot`），回主菜单无「继续游戏」残留

### TC-6.3 「暂不上榜」尊重选择
- **步骤**：结算面板点「暂不上榜」
- **预期**：面板关闭，**不入 pending 队列**，无网络请求，本地榜有记录

### TC-6.4 面板交互独占
- **步骤**：上榜面板出现时，点击面板外区域 / 按空格
- **预期**：输入被面板独占（场景 handleInput 判 `isActive()` 全权交给面板），不误触场景按钮

### TC-6.5 主站详情页榜单一致
- **步骤**：对比游戏内榜单与主站游戏详情页 `/games/shuoshuo-pixel-gold-miner` 榜单
- **预期**：数据一致（同一服务端榜单）

### TC-6.6 god 命令同源守卫
- **步骤**：localhost:15715 直连执行 `god.lbSubmit()`
- **预期**：打印拒绝提示，不发请求（`assertLbOrigin` 守卫）

---

## 七、错误码覆盖速查表

> 逐个错误码确认客户端行为正确（参照 `LeaderboardClient.ts` LB_ERR_TEXT）。

| code | 触发方式 | 预期客户端行为 |
|---|---|---|
| `5041002` | session_id 占用 | 换新 UUID 重开一次（settle）/ 回放场景丢弃 |
| `5041003` | 重复提交 | 视为成功，文案「成绩已记录」 |
| `5041005` | rawMoney > 9999999 | 不重试，「成绩数值超出范围」 |
| `5041006` | highestLevel < 8 | 不重试，降级文案，本地榜兜底 |
| `5041008` | 提交 >5次/分 | 读 Retry-After 退避重试 |
| `5041010` | 签名错误 | 不重试，console.error（**正常不应出现**） |
| `5041011` | real 未登录 | error 态保留「匿名上榜」兜底按钮 |
| `5041015` | ended_at 超前 | skew 校正后重试一次 |
| `5041016` | 拉榜限速 | 退避，UI 30s 缓存 |
| 网络/5xx | 断网/服务故障 | 指数退避 1s/2s/4s → 入 pending 队列 |

---

## 八、测试执行记录表

| 用例 | 结果 | 备注 |
|---|---|---|
| TC-1.1 HMAC 互验 | ☐ Pass ☐ Fail | |
| TC-1.3 metrics 校验 | ☐ Pass ☐ Fail | |
| TC-1.4 幂等 | ☐ Pass ☐ Fail | |
| TC-2.1 GAME_CLEARED | ☐ Pass ☐ Fail | |
| TC-2.2 ENDLESS_FAILED | ☐ Pass ☐ Fail | |
| TC-2.3 RUN_ABANDONED | ☐ Pass ☐ Fail | |
| TC-2.4 门槛拒绝 | ☐ Pass ☐ Fail | |
| TC-2.5 NOVICE/INFINITE 跳过 | ☐ Pass ☐ Fail | |
| TC-2.6 续盘 sessionLevels | ☐ Pass ☐ Fail | |
| TC-2.7 重试累加 | ☐ Pass ☐ Fail | |
| TC-3.1 实名上榜 | ☐ Pass ☐ Fail | |
| TC-3.3 匿名上榜 | ☐ Pass ☐ Fail | |
| TC-3.4 登录后上榜 | ☐ Pass ☐ Fail | |
| TC-3.5 匿名去重 | ☐ Pass ☐ Fail | |
| TC-4.1 菜单入口 | ☐ Pass ☐ Fail | |
| TC-4.2 Tab 切换 | ☐ Pass ☐ Fail | |
| TC-4.4 around 高亮 | ☐ Pass ☐ Fail | |
| TC-4.5 XSS 转义 | ☐ Pass ☐ Fail | |
| TC-4.6 关闭方式 | ☐ Pass ☐ Fail | |
| TC-4.7 30s 缓存 | ☐ Pass ☐ Fail | |
| TC-5.1 断网补传 | ☐ Pass ☐ Fail | |
| TC-5.3 重试上限 | ☐ Pass ☐ Fail | |
| TC-6.1 本地榜回归 | ☐ Pass ☐ Fail | |
| TC-6.2 清档职责 | ☐ Pass ☐ Fail | |
| TC-6.3 暂不上榜 | ☐ Pass ☐ Fail | |

---

## 九、冒烟测试最小集（时间紧时优先跑）

5 分钟快速验证核心链路是否通：

1. **TC-1.1** — `god.lbSubmit()` 提交成功（协议层通）
2. **TC-2.3** — L10 失败返回菜单 → RUN_ABANDONED 上送（结算改造通）
3. **TC-2.5** — NOVICE 结算无面板无请求（边界正确）
4. **TC-3.3** — 未登录匿名上榜成功（UI 通）
5. **TC-4.1 + TC-4.2** — 菜单打开在线榜 + 切 Tab（榜单 UI 通）
6. **TC-5.1** — 断网入队 → 恢复补传（降级通）

全过 → 主链路健康。
