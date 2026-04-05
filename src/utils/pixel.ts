/**
 * PixelMap 工具函数
 */

import type { PixelColor, PixelMap } from '../assets/types';

/**
 * 将 PixelMap 按指定倍数放大
 * 每个像素变成 factor x factor 的色块
 */
export function scalePixelMap(map: PixelMap, factor: number): PixelMap {
  const result: PixelMap = [];
  for (const row of map) {
    const scaledRow: PixelColor[] = [];
    for (const pixel of row) {
      for (let i = 0; i < factor; i++) {
        scaledRow.push(pixel);
      }
    }
    for (let i = 0; i < factor; i++) {
      result.push([...scaledRow]);
    }
  }
  return result;
}
