/// <reference types="vite/client" />

/** 构建时注入的 package.json version（vite.config.ts define），用于排行榜协议 client_version 上报 */
declare const __APP_VERSION__: string;

/** 自定义环境变量（docs/design/20260605_leaderboard-server-integration.md §九） */
interface ImportMetaEnv {
  /** 排行榜/登录 API 根路径，缺省 '/api'（生产与本地 nginx 反代均同源） */
  readonly VITE_LEADERBOARD_API_BASE?: string;
  /** 非同源 dev 后备：注入 Authorization Bearer 模拟主站登录（DEV 限定，禁止打进生产构建） */
  readonly VITE_DEV_AUTH_TOKEN?: string;
}
