/**
 * Sprite 动画帧索引计算
 *
 * 横向拼帧 spritesheet 方案：cache 仍是单张 canvas（宽 = 单帧宽 × frameCount），
 * 渲染时根据当前时间算出帧切片矩形，传给 Renderer.drawImageSlice 即可。
 *
 * 静态 sprite（frameCount 缺省 / =1）走零开销路径——直接返回整张图。
 */

let startTime = 0;

/** Game 启动时调用一次，作为所有动画 sprite 的统一时间基准 */
export function initAnimation(now: number): void {
  startTime = now;
}

export interface SpriteAnimationMeta {
  frameCount?: number;
  frameDurationMs?: number;
  frameLoop?: boolean;
}

export interface SpriteFrameRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * 根据当前时间算出 sprite 的当前帧切片矩形。
 * @param cache 已预渲染的 spritesheet canvas
 * @param meta 帧元信息（缺省时走静态路径）
 * @param now 当前时间，通常是 performance.now()
 */
export function getSpriteFrame(
  cache: HTMLCanvasElement,
  meta: SpriteAnimationMeta | undefined,
  now: number
): SpriteFrameRect {
  const frameCount = meta?.frameCount ?? 1;
  if (frameCount <= 1) {
    return { sx: 0, sy: 0, sw: cache.width, sh: cache.height };
  }
  const frameW = cache.width / frameCount;
  const dur = meta?.frameDurationMs ?? 100;
  const loop = meta?.frameLoop ?? true;
  const elapsed = Math.max(0, now - startTime);
  let idx = Math.floor(elapsed / dur);
  if (loop) {
    idx = idx % frameCount;
  } else if (idx >= frameCount) {
    idx = frameCount - 1;
  }
  return { sx: idx * frameW, sy: 0, sw: frameW, sh: cache.height };
}
