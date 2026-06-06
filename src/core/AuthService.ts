/**
 * 主站登录态服务（排行榜协议前置）
 *
 * 内部应用鉴权口径（服务端 CheckUserLoginStatus）：
 *   优先 Authorization: Bearer <主站JWT>，缺省回退 Cookie shuoshuo-auth-token。
 *   生产 / 本地 nginx 同源部署下 Cookie 自动携带，零配置；
 *   VITE_DEV_AUTH_TOKEN 仅作非同源环境后备（DEV 限定，prod 构建被摇树剔除）。
 *
 * 设计文档：docs/design/20260605_leaderboard-server-integration.md §4.0 / §九
 */

/** 排行榜/登录 API 根路径（生产同源 /api） */
export const API_BASE: string = import.meta.env.VITE_LEADERBOARD_API_BASE ?? '/api';

/** 登录态快照 */
export interface AuthState {
  login: boolean;
  /** 主站账号 ID（未登录为空串） */
  accountId: string;
  /** 主站昵称（未登录为空串；real 模式上榜显名） */
  nickName: string;
}

/** GET /api/login 响应 data 的关键字段（snake_case） */
interface LoginRespData {
  login?: boolean;
  account_id?: number | string;
  account?: { nick_name?: string };
}

const LOGGED_OUT: AuthState = { login: false, accountId: '', nickName: '' };

class AuthServiceImpl {
  private state: AuthState = LOGGED_OUT;

  /** 当前缓存的登录态（启动时 refresh() 一次后有效） */
  get current(): AuthState {
    return this.state;
  }

  /** 拉取并缓存登录态；网络失败按未登录处理（仍可匿名上榜） */
  async refresh(): Promise<AuthState> {
    try {
      const res = await fetch(`${API_BASE}/login`, { headers: this.authHeaders() });
      const body = (await res.json()) as { code?: number; data?: LoginRespData };
      const d = body.data;
      this.state = d?.login
        ? { login: true, accountId: String(d.account_id ?? ''), nickName: d.account?.nick_name ?? '' }
        : LOGGED_OUT;
    } catch {
      this.state = LOGGED_OUT;
    }
    return this.state;
  }

  /** 协议请求公共鉴权头：同源走 Cookie 返回空对象；仅非同源 dev 后备注入 Bearer */
  authHeaders(): Record<string, string> {
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_TOKEN) {
      return { Authorization: `Bearer ${import.meta.env.VITE_DEV_AUTH_TOKEN}` };
    }
    return {};
  }
}

/** 登录态单例 */
export const AuthService = new AuthServiceImpl();
