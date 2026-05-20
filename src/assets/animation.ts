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
  /** 在游戏画布上的目标显示宽度（缺省 = 单帧源宽，即不缩放） */
  displayWidth?: number;
  /** 在游戏画布上的目标显示高度（缺省 = 源高，即不缩放） */
  displayHeight?: number;
}

export interface SpriteFrameRect {
  /** 源切片：x 起点 */
  sx: number;
  /** 源切片：y 起点 */
  sy: number;
  /** 源切片宽（单帧宽） */
  sw: number;
  /** 源切片高 */
  sh: number;
  /** 目标显示宽（meta.displayWidth ?? sw） */
  dw: number;
  /** 目标显示高（meta.displayHeight ?? sh） */
  dh: number;
}

/**
 * 根据当前时间算出 sprite 的当前帧切片矩形 + 目标显示尺寸。
 *
 * HD 精度方案：PixelMap 可以是 96×96 的高密度数据，但通过 meta.displayWidth/Height
 * 在画布上仍渲染成原显示尺寸（如 24×24），从而做到"细节翻倍 + 布局零改动"。
 *
 * @param cache 已预渲染的 spritesheet canvas
 * @param meta 帧元信息 + 显示尺寸（缺省时走静态 + 1:1 显示路径）
 * @param now 当前时间，通常是 performance.now()
 */
export function getSpriteFrame(
  cache: HTMLCanvasElement,
  meta: SpriteAnimationMeta | undefined,
  now: number
): SpriteFrameRect {
  const frameCount = meta?.frameCount ?? 1;
  let sx = 0;
  let sw: number;
  const sh = cache.height;
  if (frameCount <= 1) {
    sw = cache.width;
  } else {
    sw = cache.width / frameCount;
    const dur = meta?.frameDurationMs ?? 100;
    const loop = meta?.frameLoop ?? true;
    const elapsed = Math.max(0, now - startTime);
    let idx = Math.floor(elapsed / dur);
    if (loop) {
      idx = idx % frameCount;
    } else if (idx >= frameCount) {
      idx = frameCount - 1;
    }
    sx = idx * sw;
  }
  const dw = meta?.displayWidth ?? sw;
  const dh = meta?.displayHeight ?? sh;
  return { sx, sy: 0, sw, sh, dw, dh };
}
