/**
 * SHA-256 哈希工具（基于 Web Crypto API）
 * 用于排行榜数据签名校验
 */

/** 签名盐值（混淆拆分存储） */
const _S = [0x47, 0x6f, 0x6c, 0x64, 0x4d, 0x69, 0x6e, 0x65, 0x72];
const SALT = String.fromCharCode(..._S);

/** 对字符串计算 SHA-256 哈希，返回十六进制摘要 */
export async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 为排行榜记录生成签名载荷（同步拼接，异步签名） */
function buildPayload(rawMoney: number, difficulty: string, level: number, date: number): string {
  return `${rawMoney}:${difficulty}:${level}:${date}:${SALT}`;
}

/** 生成签名 */
export async function signEntry(rawMoney: number, difficulty: string, level: number, date: number): Promise<string> {
  return sha256(buildPayload(rawMoney, difficulty, level, date));
}

/** 验证签名 */
export async function verifyEntry(rawMoney: number, difficulty: string, level: number, date: number, sig: string): Promise<boolean> {
  const expected = await sha256(buildPayload(rawMoney, difficulty, level, date));
  return expected === sig;
}
