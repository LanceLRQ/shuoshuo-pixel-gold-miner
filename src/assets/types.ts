/**
 * 像素素材核心类型定义
 * PixelMap: 二维颜色数组，0 表示透明，字符串表示颜色值 (#RRGGBB)
 */

/** 单个像素颜色：字符串为颜色值 (#RRGGBB)，数字 0 为透明 */
export type PixelColor = string | 0;

/** 像素数据矩阵：每行一个数组 */
export type PixelMap = PixelColor[][];

/** 精灵缓存映射：名称 → 离屏 Canvas */
export type SpriteCacheMap = Map<string, HTMLCanvasElement>;

/**
 * 将 PixelMap 预渲染到离屏 Canvas 进行缓存
 * @param map 像素数据矩阵
 * @param scale 缩放倍数（默认 2x，使像素更清晰）
 * @returns 缓存的离屏 Canvas 元素
 */
export function createSpriteCache(map: PixelMap, scale: number = 3): HTMLCanvasElement {
  const rows = map.length;
  if (rows === 0) {
    throw new Error('PixelMap 数据为空');
  }
  const cols = map[0]!.length;

  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = rows * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建离屏 Canvas 上下文');
  }

  // 禁用平滑，保持像素锐利
  ctx.imageSmoothingEnabled = false;

  // 逐像素绘制
  for (let y = 0; y < rows; y++) {
    const row = map[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const color = row[x]!;
      if (color === 0) continue; // 透明像素跳过
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  return canvas;
}

/**
 * 批量预渲染精灵数据到缓存 Map
 * @param sprites 精灵名称到 PixelMap 的映射
 * @param scale 缩放倍数
 * @returns 缓存映射
 */
export function createSpriteCacheMap(
  sprites: Record<string, PixelMap>,
  scale: number = 3
): SpriteCacheMap {
  const cache: SpriteCacheMap = new Map();
  for (const [name, map] of Object.entries(sprites)) {
    cache.set(name, createSpriteCache(map, scale));
  }
  return cache;
}
