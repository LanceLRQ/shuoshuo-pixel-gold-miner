/**
 * 粒子系统
 * 轻量级粒子引擎，使用对象池减少 GC
 * 用于金币闪光、抓取成功、爆炸等视觉特效
 */

import type { Renderer } from '../core/Renderer';

/** 单个粒子状态 */
export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 重力加速度 */
  gravity: number;
  /** 当前生命（秒） */
  life: number;
  /** 生命上限（秒），用于计算 alpha */
  maxLife: number;
  /** 颜色（CSS 颜色字符串） */
  color: string;
  /** 像素大小（边长） */
  size: number;
  /** 是否为闪光（无重力，原地缩小） */
  isSparkle: boolean;
}

/** 粒子发射参数 */
export interface EmitOptions {
  x: number;
  y: number;
  count: number;
  /** 颜色池（每个粒子随机选一个） */
  colors: string[];
  /** 速度范围 */
  speedMin: number;
  speedMax: number;
  /** 生命范围（秒） */
  lifeMin: number;
  lifeMax: number;
  /** 像素大小范围 */
  sizeMin: number;
  sizeMax: number;
  /** 重力（默认 0） */
  gravity?: number;
  /** 是否闪光模式（默认 false） */
  sparkle?: boolean;
  /** 角度范围（弧度），默认 0~2π */
  angleMin?: number;
  angleMax?: number;
}

/** 粒子池容量上限（足够同时容纳多次抓取/爆炸） */
const POOL_SIZE = 200;

export class ParticleSystem {
  private pool: Particle[] = [];

  constructor() {
    // 预分配粒子对象，避免运行时 GC
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push(this.createIdleParticle());
    }
  }

  /** 发射一组粒子 */
  emit(options: EmitOptions): void {
    const angleMin = options.angleMin ?? 0;
    const angleMax = options.angleMax ?? Math.PI * 2;
    const gravity = options.gravity ?? 0;
    const sparkle = options.sparkle ?? false;

    let emitted = 0;
    for (let i = 0; i < this.pool.length && emitted < options.count; i++) {
      const p = this.pool[i]!;
      if (p.active) continue;

      const angle = angleMin + Math.random() * (angleMax - angleMin);
      const speed = options.speedMin + Math.random() * (options.speedMax - options.speedMin);
      const life = options.lifeMin + Math.random() * (options.lifeMax - options.lifeMin);
      const size = options.sizeMin + Math.random() * (options.sizeMax - options.sizeMin);
      const color = options.colors[Math.floor(Math.random() * options.colors.length)] ?? '#FFFFFF';

      p.active = true;
      p.x = options.x;
      p.y = options.y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = gravity;
      p.life = life;
      p.maxLife = life;
      p.color = color;
      p.size = Math.max(1, Math.floor(size));
      p.isSparkle = sparkle;

      emitted++;
    }
  }

  /** 每帧更新所有活跃粒子 */
  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (!p.isSparkle) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
      }
    }
  }

  /** 渲染所有活跃粒子（像素方块绘制） */
  render(renderer: Renderer): void {
    const ctx = renderer.getContext();
    ctx.save();
    for (const p of this.pool) {
      if (!p.active) continue;
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const sz = p.isSparkle ? Math.max(1, Math.floor(p.size * alpha)) : p.size;
      ctx.fillRect(Math.floor(p.x - sz / 2), Math.floor(p.y - sz / 2), sz, sz);
    }
    ctx.restore();
  }

  /** 清空所有粒子（场景切换时调用） */
  clear(): void {
    for (const p of this.pool) {
      p.active = false;
    }
  }

  /** 当前活跃粒子数量（调试用） */
  activeCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  /** 创建未激活的粒子对象 */
  private createIdleParticle(): Particle {
    return {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      gravity: 0,
      life: 0,
      maxLife: 0,
      color: '#FFFFFF',
      size: 1,
      isSparkle: false,
    };
  }
}

/** 预设：金币抓取闪光 */
export const PRESET_GOLD_SPARKLE: Omit<EmitOptions, 'x' | 'y'> = {
  count: 12,
  colors: ['#FFD700', '#FFE066', '#FFF5B0'],
  speedMin: 40,
  speedMax: 120,
  lifeMin: 0.4,
  lifeMax: 0.7,
  sizeMin: 2,
  sizeMax: 3,
  gravity: 80,
};

/** 预设：钻石闪光（更多更亮） */
export const PRESET_DIAMOND_SPARKLE: Omit<EmitOptions, 'x' | 'y'> = {
  count: 18,
  colors: ['#00FFFF', '#FFFFFF', '#88EEFF'],
  speedMin: 30,
  speedMax: 150,
  lifeMin: 0.5,
  lifeMax: 0.9,
  sizeMin: 2,
  sizeMax: 4,
  gravity: 60,
};

/** 预设：石头碎屑 */
export const PRESET_STONE_DUST: Omit<EmitOptions, 'x' | 'y'> = {
  count: 6,
  colors: ['#888888', '#AAAAAA', '#666666'],
  speedMin: 20,
  speedMax: 60,
  lifeMin: 0.3,
  lifeMax: 0.5,
  sizeMin: 2,
  sizeMax: 3,
  gravity: 120,
};

/** 预设：炸药爆炸火花 */
export const PRESET_BOMB_SPARK: Omit<EmitOptions, 'x' | 'y'> = {
  count: 30,
  colors: ['#FF6600', '#FFAA00', '#FFFFFF', '#FF3300'],
  speedMin: 80,
  speedMax: 220,
  lifeMin: 0.4,
  lifeMax: 0.8,
  sizeMin: 2,
  sizeMax: 4,
  gravity: 50,
};
