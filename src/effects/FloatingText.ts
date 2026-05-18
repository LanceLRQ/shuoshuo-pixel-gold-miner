/**
 * 飘字特效系统
 * 抓取矿物时显示 +$XXX 等飘动数字，向上飘动并渐隐
 * 使用对象池减少 GC
 */

import type { Renderer } from '../core/Renderer';

/** 飘字尺寸枚举（与 PixelText FONT_SIZES 对应） */
export type FloatingTextSize = 'SMALL' | 'MEDIUM' | 'LARGE';

/** 单个飘字状态 */
interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  /** 当前生命（秒） */
  life: number;
  /** 总生命（秒），用于计算 alpha */
  maxLife: number;
  /** 显示文字 */
  text: string;
  /** 文字颜色 */
  color: string;
  /** 字体大小 */
  size: FloatingTextSize;
  /** 向上飘动总距离（px） */
  driftDistance: number;
}

/** 飘字池容量上限（同屏不会超过这个数） */
const POOL_SIZE = 50;

/** 飘字默认生命周期（秒） */
const DEFAULT_LIFE = 1.2;

/** 飘字向上飘动距离（px） */
const DEFAULT_DRIFT = 60;

/** 字号像素映射（与 PixelText 保持一致） */
const FONT_SIZE_MAP: Record<FloatingTextSize, number> = {
  SMALL: 12,
  MEDIUM: 16,
  LARGE: 22,
};

export class FloatingTextSystem {
  private pool: FloatingText[] = [];

  constructor() {
    // 预分配，避免运行时 GC
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push(this.createIdle());
    }
  }

  /**
   * 发射一条飘字
   * @param x 起始 X
   * @param y 起始 Y
   * @param text 显示文字（如 "+$500"）
   * @param color 文字颜色（默认金色）
   * @param size 字体大小（默认 MEDIUM）
   */
  emit(
    x: number,
    y: number,
    text: string,
    color: string = '#FFD700',
    size: FloatingTextSize = 'MEDIUM'
  ): void {
    // 寻找空闲槽位
    for (const slot of this.pool) {
      if (slot.active) continue;

      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.life = DEFAULT_LIFE;
      slot.maxLife = DEFAULT_LIFE;
      slot.text = text;
      slot.color = color;
      slot.size = size;
      slot.driftDistance = DEFAULT_DRIFT;
      return;
    }
    // 池满则丢弃（极端情况，正常游戏不会发生）
  }

  /** 每帧更新所有活跃飘字 */
  update(dt: number): void {
    for (const t of this.pool) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
      }
    }
  }

  /** 渲染所有活跃飘字（向上飘 + 渐隐） */
  render(renderer: Renderer): void {
    const ctx = renderer.getContext();
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.imageSmoothingEnabled = false;

    // 缓存上一个 font，避免循环内重复设置同字号
    let lastSize: FloatingTextSize | null = null;

    for (const t of this.pool) {
      if (!t.active) continue;

      const progress = 1 - t.life / t.maxLife;
      const offsetY = progress * t.driftDistance;
      // 透明度：前 70% 保持 1，后 30% 线性渐隐
      const alpha = progress < 0.7 ? 1 : Math.max(0, 1 - (progress - 0.7) / 0.3);

      ctx.globalAlpha = alpha;
      if (t.size !== lastSize) {
        ctx.font = `bold ${FONT_SIZE_MAP[t.size]}px monospace`;
        lastSize = t.size;
      }

      // 黑色描边偏移 1px 增强可读性
      ctx.fillStyle = '#000000';
      ctx.fillText(t.text, t.x + 1, t.y - offsetY + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - offsetY);
    }

    ctx.restore();
  }

  /** 清空所有飘字（场景切换时调用） */
  clear(): void {
    for (const t of this.pool) {
      t.active = false;
    }
  }

  /** 创建未激活的飘字对象 */
  private createIdle(): FloatingText {
    return {
      active: false,
      x: 0,
      y: 0,
      life: 0,
      maxLife: 0,
      text: '',
      color: '#FFD700',
      size: 'MEDIUM',
      driftDistance: DEFAULT_DRIFT,
    };
  }
}
