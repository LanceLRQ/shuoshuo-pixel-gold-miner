/**
 * 排行榜提交签名工具（HMAC-SHA256，基于 Web Crypto API）
 *
 * 与服务端（shuoshuo-crystal）buildCanonical / CanonicalPayload 完全对齐：
 *   - canonical 串键名为 camelCase（注意：HTTP 请求体是 snake_case，两套命名并存）
 *   - 字段集：固定三项 sessionId / event / endedAt + 全部客户端原始 metrics
 *     （服务端注入的 durationSec 不参与签名）
 *   - 所有键按字典序升序（ASCII 字节序，与 Go sort.Strings 一致），拼 `key=value` 用 `&` 连接
 *   - 数值用最短十进制表示（本游戏 metrics 全 int，String() 无歧义）
 *
 * canonical 示例：
 *   endedAt=1749102800000&endedAtLevel=22&event=GAME_CLEARED&highestLevel=22
 *   &rawMoney=24500&sessionId=550e8400-...&sessionLevels=24
 *
 * 设计文档：docs/design/20260605_leaderboard-server-integration.md §4.3
 */

/** 构造待签名的 canonical 串 */
export function buildCanonical(p: {
  sessionId: string;
  event: string;
  endedAt: number;
  metrics: Record<string, number>;
}): string {
  const fields: Record<string, string> = {
    sessionId: p.sessionId,
    event: p.event,
    endedAt: String(p.endedAt),
  };
  for (const [k, v] of Object.entries(p.metrics)) fields[k] = String(v); // int → 无浮点歧义
  return Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // 不用 localeCompare：必须是字节序而非本地化排序
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/** HMAC-SHA256 签名，返回十六进制串；secret 按 ASCII 字节处理（与服务端 []byte(secret) 一致） */
export async function hmacSha256Hex(secretHex: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
