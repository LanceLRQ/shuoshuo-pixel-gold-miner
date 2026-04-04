/**
 * 矿物实体
 * 包含碰撞体、价值属性和精灵渲染
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';
import { MineralType, MINERAL_CONFIGS, type MineralConfig } from './types';
import { randomInt } from '../utils/random';

export class Mineral {
  x: number;
  y: number;
  config: MineralConfig;
  /** 实际价值（神秘袋随机生成） */
  value: number;
  /** 碰撞半径 */
  radius: number;
  /** 是否已被抓取 */
  grabbed: boolean = false;
  /** 精灵缓存引用 */
  private spriteCache: SpriteCacheMap;

  constructor(
    x: number,
    y: number,
    type: MineralType,
    spriteCache: SpriteCacheMap
  ) {
    this.x = x;
    this.y = y;
    this.config = MINERAL_CONFIGS[type];
    this.radius = this.config.radius;
    this.spriteCache = spriteCache;

    // 神秘袋价值随机
    if (type === MineralType.MYSTERY_BAG) {
      this.value = randomInt(50, 889);
    } else {
      this.value = this.config.value;
    }
  }

  /** 更新（矿物静止不动，暂无逻辑） */
  update(_dt: number): void {
    // 矿物不需要主动更新
  }

  /** 渲染矿物（正常场景渲染，被抓时跳过） */
  render(renderer: Renderer): void {
    if (this.grabbed) return;
    this.drawSprite(renderer);
  }

  /** 渲染矿物（无视 grabbed 状态，供钩爪拖拽时使用） */
  renderGrabbed(renderer: Renderer): void {
    this.drawSprite(renderer);
  }

  /** 内部绘制精灵（以中心点为锚点） */
  private drawSprite(renderer: Renderer): void {
    const sprite = this.spriteCache.get(this.config.spriteName);
    if (sprite) {
      renderer.drawImage(sprite, this.x - sprite.width / 2, this.y - sprite.height / 2);
    }
  }
}
