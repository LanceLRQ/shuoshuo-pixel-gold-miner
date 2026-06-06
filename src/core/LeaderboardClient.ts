/**
 * 排行榜协议层（对接 shuoshuo-crystal 开放平台「游戏运行时」）
 *
 * 上送流程（懒开会话）：settle() = POST sessions → HMAC 签名 → POST submissions。
 * 协议双命名注意：HTTP 请求体为 snake_case，HMAC canonical 串键名为 camelCase（见 utils/hmac.ts）。
 *
 * 设计文档：docs/design/20260605_leaderboard-server-integration.md §三/§四/§五/§六
 */

import { Difficulty } from '../level/difficulty';
import { buildCanonical, hmacSha256Hex } from '../utils/hmac';
import { API_BASE, AuthService } from './AuthService';

/** 开放平台应用标识（路由参数，非密钥） */
export const LEADERBOARD_CLIENT_ID = 'shuoshuo-pixel-gold-miner';

/** 难度 → 榜单映射；无映射 = 不上榜（NOVICE / INFINITE 仅本地榜） */
export const BOARD_KEY_BY_DIFFICULTY: Partial<Record<Difficulty, string>> = {
  [Difficulty.NORMAL]: 'normal',
  [Difficulty.HARD]: 'hard',
  [Difficulty.EXPERT]: 'expert',
};

// ==================== 类型 ====================

/** 结算事件（决策 D9） */
export type SettleEvent = 'GAME_CLEARED' | 'ENDLESS_FAILED' | 'RUN_ABANDONED';

/** 上榜显名模式：real 须登录；anonymous 由服务端从 IP 派生「XX蟹」显名 */
export type DisplayMode = 'real' | 'anonymous';

/** 一次 Run 的追踪数据（Game 持有，纯内存；重置/计数于 M2 实装） */
export interface RunTracking {
  /** Run 开始时 crypto.randomUUID() 预生成 */
  sessionId: string;
  /** 开新局/读档时刻（epoch 毫秒） */
  runStartedAt: number;
  /** 本次会话实际游玩局数（含重试），供服务端时长门槛 */
  sessionLevels: number;
  /** retryCurrentLevel 计数（仅审计） */
  retries: number;
}

/** 数值成绩（全 int，键名与榜单声明一致） */
export interface SettleMetrics {
  rawMoney: number;
  highestLevel: number;
  endedAtLevel: number;
  sessionLevels: number;
}

/** 审计字段（不参与排名/签名/展示） */
export interface SettleExtra {
  retries: number;
  itemsPurchased: string[];
  clientVersion: string;
}

/** 结算 payload（changeScene 收口处构造，传给结算场景 / god.lbSubmit） */
export interface SettlePayload {
  event: SettleEvent;
  boardKey: string;
  tracking: RunTracking;
  metrics: SettleMetrics;
  extra: SettleExtra;
}

/** settle 失败归因（驱动 RankPanel 文案分支） */
export type SettleFailReason = 'below_threshold' | 'need_login' | 'offline' | 'rejected';

export type SettleResult =
  /** rank=0 表示名次未知（5041003 幂等场景按成功处理） */
  | { ok: true; rank: number; personalBest: boolean; displayName: string }
  | { ok: false; code: number; reason: SettleFailReason; message: string };

/** 榜单条目（camelCase 化） */
export interface BoardEntry {
  rank: number;
  displayName: string;
  metrics: Record<string, number>;
  event: string;
  /** ⚠️ epoch 秒（协议中其余时间戳均为毫秒） */
  submittedAt: number;
  anonymous: boolean;
}

export interface BoardData {
  list: BoardEntry[];
  /** 登录态请求自动附带的「我的附近 ±5 名」，未登录为空 */
  around: BoardEntry[];
}

// ==================== 服务端错误码（§五） ====================

export const LB_ERR = {
  BOARD_NOT_FOUND: 5041001,
  SESSION_TAKEN: 5041002,
  ALREADY_SUBMITTED: 5041003,
  SESSION_INVALID: 5041004,
  METRIC_OUT_OF_RANGE: 5041005,
  BELOW_THRESHOLD: 5041006,
  TIME_RANGE_INVALID: 5041007,
  SUBMIT_RATE_LIMITED: 5041008,
  BAD_SIGNATURE: 5041010,
  NEED_LOGIN: 5041011,
  ANONYMOUS_DISABLED: 5041012,
  DISPLAY_MODE_MISMATCH: 5041014,
  ENDED_AT_AHEAD: 5041015,
  BOARD_RATE_LIMITED: 5041016,
  BAD_DISPLAY_NAME: 5041017,
} as const;

/** 错误码 → 玩家可读文案 */
const LB_ERR_TEXT: Record<number, string> = {
  [LB_ERR.BOARD_NOT_FOUND]: '榜单不存在（客户端配置错误）',
  [LB_ERR.SESSION_TAKEN]: '会话标识已被占用',
  [LB_ERR.ALREADY_SUBMITTED]: '成绩已记录（重复提交）',
  [LB_ERR.SESSION_INVALID]: '会话已过期，成绩仅记录在本地',
  [LB_ERR.METRIC_OUT_OF_RANGE]: '成绩数值超出范围',
  [LB_ERR.BELOW_THRESHOLD]: '通关第一章（L7）后才能登上公榜，成绩已记录在本地',
  [LB_ERR.TIME_RANGE_INVALID]: '游戏时长校验未通过',
  [LB_ERR.SUBMIT_RATE_LIMITED]: '提交太频繁，请稍后再试',
  [LB_ERR.BAD_SIGNATURE]: '签名校验失败（客户端 bug）',
  [LB_ERR.NEED_LOGIN]: '实名上榜需要先登录',
  [LB_ERR.ANONYMOUS_DISABLED]: '匿名上榜暂不可用',
  [LB_ERR.DISPLAY_MODE_MISMATCH]: '上榜身份与会话不一致（客户端 bug）',
  [LB_ERR.ENDED_AT_AHEAD]: '本机时钟超前，校正后仍失败',
  [LB_ERR.BOARD_RATE_LIMITED]: '查询太频繁，请稍后再试',
  [LB_ERR.BAD_DISPLAY_NAME]: '昵称含非法字符，请改昵称或改选匿名',
};

/** 错误码翻译（god 命令 / UI 共用） */
export function describeLbError(code: number, fallback = ''): string {
  return LB_ERR_TEXT[code] ?? (fallback || `提交被拒绝（code=${code}）`);
}

// ==================== 协议常量 ====================

/** 网络/5xx 指数退避间隔（§五：1s/2s/4s 共 3 次重试） */
const BACKOFF_DELAYS_MS = [1000, 2000, 4000] as const;
/** 榜单内存缓存时长（配合拉榜限速 60 次/分/设备） */
const BOARD_CACHE_TTL_MS = 30_000;
/** 拉榜默认条数（与服务端默认一致） */
const BOARD_DEFAULT_TOP = 50;
/** 设备标识持久化 key（拉榜限速按设备计，避免共享出口 IP 误伤） */
const DEVICE_ID_KEY = 'goldminer_h5_device_id';

// ==================== 服务端原始响应（snake_case） ====================

interface RawSessionData {
  session_token?: string;
  signing_secret?: string;
  server_time?: number;
  display_name?: string;
}

interface RawSubmitData {
  rank?: number;
  personal_best?: boolean;
}

interface RawBoardEntry {
  rank?: number;
  display_name?: string;
  metrics?: Record<string, number>;
  event?: string;
  submitted_at?: number;
  anonymous?: boolean;
}

interface RawBoardData {
  list?: RawBoardEntry[];
  around?: RawBoardEntry[];
}

/** 开会话成功返回（camelCase 化，仅协议层内部使用） */
interface SessionData {
  sessionToken: string;
  signingSecret: string;
  serverTime: number;
  displayName: string;
}

// ==================== HTTP 基础设施 ====================

/** 统一响应解析结果（{ code, data } 包裹 + HTTP 元信息） */
interface ApiResp<T> {
  http: number;
  code: number;
  message: string;
  data: T | null;
  /** 429 响应的 Retry-After（秒，无则 0） */
  retryAfterSec: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 单次请求：解析统一包裹；网络异常向上抛（由 withBackoff 捕获） */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResp<T>> {
  const headers: Record<string, string> = {
    ...AuthService.authHeaders(),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  let body: { code?: number; message?: string; data?: T } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // 网关错误页等非 JSON 响应：保留 HTTP 状态按 5xx/4xx 处理
  }
  return {
    http: res.status,
    code: body.code ?? (res.ok ? 0 : -1),
    message: body.message ?? '',
    data: body.data ?? null,
    retryAfterSec: Number(res.headers.get('Retry-After') ?? 0) || 0,
  };
}

/** 网络错误 / 5xx 按 1s/2s/4s 退避重试；4xx 原样返回不重试（§五通用原则） */
async function withBackoff<T>(fn: () => Promise<ApiResp<T>>): Promise<ApiResp<T>> {
  let lastErr: unknown;
  for (let i = 0; i <= BACKOFF_DELAYS_MS.length; i++) {
    try {
      const resp = await fn();
      if (resp.http < 500) return resp;
      lastErr = new Error(`HTTP ${resp.http}`);
    } catch (e) {
      lastErr = e;
    }
    const delay = BACKOFF_DELAYS_MS[i];
    if (delay !== undefined) await sleep(delay);
  }
  throw lastErr;
}

/** 持久化设备标识（首次生成 UUID 存 localStorage） */
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** 错误响应 → SettleResult 失败分支（错误码归因 §五） */
function failResult(resp: ApiResp<unknown>): SettleResult {
  const message = describeLbError(resp.code, resp.message);
  if (resp.code === LB_ERR.BELOW_THRESHOLD) {
    return { ok: false, code: resp.code, reason: 'below_threshold', message };
  }
  if (resp.code === LB_ERR.NEED_LOGIN) {
    return { ok: false, code: resp.code, reason: 'need_login', message };
  }
  return { ok: false, code: resp.code, reason: 'rejected', message };
}

function toSessionData(raw: RawSessionData): SessionData {
  return {
    sessionToken: raw.session_token ?? '',
    signingSecret: raw.signing_secret ?? '',
    serverTime: raw.server_time ?? 0,
    displayName: raw.display_name ?? '',
  };
}

function toBoardEntry(raw: RawBoardEntry): BoardEntry {
  return {
    rank: raw.rank ?? 0,
    displayName: raw.display_name ?? '',
    metrics: raw.metrics ?? {},
    event: raw.event ?? '',
    submittedAt: raw.submitted_at ?? 0,
    anonymous: raw.anonymous ?? false,
  };
}

// ==================== 协议层 ====================

class LeaderboardClientImpl {
  /** 拉榜内存缓存：`${boardKey}:${top}` → 数据快照 */
  private boardCache = new Map<string, { at: number; data: BoardData }>();

  // -------- 低层 API --------

  /** 开会话（POST sessions）；网络/5xx 已含退避 */
  async openSession(req: {
    sessionId: string;
    boardKey: string;
    displayMode: DisplayMode;
    startedAt: number;
    clientVersion: string;
  }): Promise<ApiResp<RawSessionData>> {
    return withBackoff(() =>
      apiFetch<RawSessionData>(`/game/${LEADERBOARD_CLIENT_ID}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          session_id: req.sessionId,
          board_key: req.boardKey,
          display_mode: req.displayMode,
          client_version: req.clientVersion,
          started_at: req.startedAt,
        }),
      }),
    );
  }

  /** 提交成绩（POST submissions）：内部完成 canonical 拼接 + HMAC 签名 */
  async submit(req: {
    sessionId: string;
    sessionToken: string;
    signingSecret: string;
    boardKey: string;
    displayMode: DisplayMode;
    event: SettleEvent;
    endedAt: number;
    metrics: SettleMetrics;
    extra: SettleExtra;
  }): Promise<ApiResp<RawSubmitData>> {
    const canonical = buildCanonical({
      sessionId: req.sessionId,
      event: req.event,
      endedAt: req.endedAt,
      metrics: { ...req.metrics },
    });
    const clientSig = await hmacSha256Hex(req.signingSecret, canonical);
    return withBackoff(() =>
      apiFetch<RawSubmitData>(`/game/${LEADERBOARD_CLIENT_ID}/submissions`, {
        method: 'POST',
        body: JSON.stringify({
          session_id: req.sessionId,
          session_token: req.sessionToken,
          board_key: req.boardKey,
          display_mode: req.displayMode,
          event: req.event,
          ended_at: req.endedAt,
          metrics: req.metrics,
          extra: req.extra,
          client_sig: clientSig,
        }),
      }),
    );
  }

  // -------- 组合流程 --------

  /**
   * 三选一面板点击后调用：开会话 → 签名 → 提交，一气呵成。
   * 错误码消化为 SettleResult（§五）；网络/5xx 退避后仍失败返回 offline。
   * TODO(M4)：offline 场景入 pending 队列（goldminer_h5_pending_submissions）+ 启动回放
   */
  async settle(payload: SettlePayload, displayMode: DisplayMode): Promise<SettleResult> {
    try {
      // 1) 开会话；5041002（session_id 已占用）换新 UUID 重开一次
      let sessionId = payload.tracking.sessionId;
      const open = (sid: string) =>
        this.openSession({
          sessionId: sid,
          boardKey: payload.boardKey,
          displayMode,
          startedAt: payload.tracking.runStartedAt,
          clientVersion: payload.extra.clientVersion,
        });
      let opened = await open(sessionId);
      if (opened.code === LB_ERR.SESSION_TAKEN) {
        sessionId = crypto.randomUUID();
        console.warn(`[Leaderboard] session_id 冲突，换新 UUID 重开：${sessionId}`);
        opened = await open(sessionId);
      }
      if (opened.code !== 0 || !opened.data) return failResult(opened);
      const session = toSessionData(opened.data);

      // 2) 时钟偏差校正（§4.4）：ended_at 不得超前服务端时间
      const skewMs = session.serverTime > 0 ? session.serverTime - Date.now() : 0;
      const endedAtNow = () => Math.max(payload.tracking.runStartedAt, Date.now() + skewMs);

      // 3) 提交（签名在 submit 内随 endedAt 重算）
      const doSubmit = () =>
        this.submit({
          sessionId,
          sessionToken: session.sessionToken,
          signingSecret: session.signingSecret,
          boardKey: payload.boardKey,
          displayMode,
          event: payload.event,
          endedAt: endedAtNow(),
          metrics: payload.metrics,
          extra: payload.extra,
        });
      let resp = await doSubmit();
      // 5041015：用 skew 重新取样校正后重试一次
      if (resp.code === LB_ERR.ENDED_AT_AHEAD) {
        resp = await doSubmit();
      }
      // 5041008：按 Retry-After 退避后重试一次
      if (resp.code === LB_ERR.SUBMIT_RATE_LIMITED && resp.retryAfterSec > 0) {
        await sleep(resp.retryAfterSec * 1000);
        resp = await doSubmit();
      }

      if (resp.code === 0 && resp.data) {
        return {
          ok: true,
          rank: resp.data.rank ?? 0,
          personalBest: resp.data.personal_best ?? false,
          displayName: session.displayName,
        };
      }
      // 幂等：同会话已提交过 → 视为成功（名次未知，rank=0）
      if (resp.code === LB_ERR.ALREADY_SUBMITTED) {
        return { ok: true, rank: 0, personalBest: false, displayName: session.displayName };
      }
      return failResult(resp);
    } catch (e) {
      console.warn('[Leaderboard] settle 网络失败（pending 队列于 M4 实装）', e);
      return { ok: false, code: -1, reason: 'offline', message: '网络异常，成绩已记录在本地' };
    }
  }

  /** 拉榜（30s 内存缓存 + X-Device-Id）；失败抛 Error（含 5041016 限速文案） */
  async fetchBoard(boardKey: string, top: number = BOARD_DEFAULT_TOP): Promise<BoardData> {
    const cacheKey = `${boardKey}:${top}`;
    const hit = this.boardCache.get(cacheKey);
    if (hit && Date.now() - hit.at < BOARD_CACHE_TTL_MS) return hit.data;

    const resp = await withBackoff(() =>
      apiFetch<RawBoardData>(
        `/game/${LEADERBOARD_CLIENT_ID}/leaderboard?board=${encodeURIComponent(boardKey)}&top=${top}`,
        { headers: { 'X-Device-Id': getDeviceId() } },
      ),
    );
    if (resp.code !== 0 || !resp.data) {
      throw new Error(describeLbError(resp.code, resp.message || '拉榜失败'));
    }
    const data: BoardData = {
      list: (resp.data.list ?? []).map(toBoardEntry),
      around: (resp.data.around ?? []).map(toBoardEntry),
    };
    this.boardCache.set(cacheKey, { at: Date.now(), data });
    return data;
  }
}

/** 协议层单例 */
export const LeaderboardClient = new LeaderboardClientImpl();
