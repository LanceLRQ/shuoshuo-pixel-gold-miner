/**
 * 矿物实体
 * 包含碰撞体、价值属性和精灵渲染
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';
import { MineralType, MINERAL_CONFIGS, type MineralConfig } from './types';
import { randomInt, weightedRandom } from '../utils/random';

/** 神秘袋内容类型 */
export enum MysteryContent {
  CASH_SMALL = 'CASH_SMALL',
  CASH_LARGE = 'CASH_LARGE',
  STRENGTH_POTION = 'STRENGTH_POTION',
  DYNAMITE = 'DYNAMITE',
}

/** 神秘袋内容配置 */
const MYSTERY_CONTENTS: { type: MysteryContent; weight: number; label: string }[] = [
  { type: MysteryContent.CASH_SMALL, weight: 35, label: '少量现金' },
  { type: MysteryContent.CASH_LARGE, weight: 15, label: '大量现金' },
  { type: MysteryContent.STRENGTH_POTION, weight: 20, label: '大力药剂' },
  { type: MysteryContent.DYNAMITE, weight: 30, label: '炸药' },
];

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
  /** 神秘袋内容类型 */
  mysteryContent: MysteryContent | null = null;
  /** 神秘袋内容描述 */
  mysteryLabel: string = '';
  /** 水平移动速度（正=向右，负=向左，0=静止） */
  vx: number = 0;
  /** 移动左边界 */
  moveLeft: number = 0;
  /** 移动右边界 */
  moveRight: number = 0;
  /** 鼹鼠是否带着钻石 */
  hasDiamond: boolean = false;
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

    // 鼹鼠 30% 概率带钻石
    if (type === MineralType.MOLE) {
      this.hasDiamond = Math.random() < 0.3;
    }

    // 神秘袋内容随机
    if (type === MineralType.MYSTERY_BAG) {
      const weights = MYSTERY_CONTENTS.map(c => c.weight);
      const idx = weightedRandom(weights);
      const content = MYSTERY_CONTENTS[idx];
      if (content) {
        this.mysteryContent = content.type;
        this.mysteryLabel = content.label;
      }
      // 根据内容类型设定价值和重量
      if (this.mysteryContent === MysteryContent.CASH_SMALL) {
        this.value = randomInt(50, 200);
      } else if (this.mysteryContent === MysteryContent.CASH_LARGE) {
        this.value = randomInt(400, 800);
      } else {
        this.value = 0;
      }
    } else if (type === MineralType.STONE) {
      // 石头价值随机 $10-$20
      this.value = randomInt(10, 20);
    } else {
      this.value = this.config.value;
    }
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

  /** 更新移动矿物位置 */
  update(dt: number): void {
    if (this.grabbed || this.vx === 0) return;

    this.x += this.vx * dt;

    // 碰到边界反弹
    if (this.x <= this.moveLeft) {
      this.x = this.moveLeft;
      this.vx = Math.abs(this.vx);
    } else if (this.x >= this.moveRight) {
      this.x = this.moveRight;
      this.vx = -Math.abs(this.vx);
    }
  }
}
