/**
 * 矿物实体
 * 包含碰撞体、价值属性和精灵渲染
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';
import { getSpriteFrame } from '../assets/animation';
import type { SpriteMetaProvider } from './Miner';
import { MineralType, MINERAL_CONFIGS, type MineralConfig } from './types';
import { randomInt, pickWeightedContent } from '../utils/random';

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

/** 木箱抽奖内容类型（详见 docs/design/20260519_chapter-system.md #12） */
export enum BoxContent {
  /** 大奖：钻石 +800 */
  PRIZE_DIAMOND = 'PRIZE_DIAMOND',
  /** 中奖：金币 +500 */
  PRIZE_GOLD = 'PRIZE_GOLD',
  /** 小奖：金币 +200 */
  PRIZE_COIN = 'PRIZE_COIN',
  /** 空盒：+0 */
  EMPTY = 'EMPTY',
  /** 大骷髅：-300 */
  SKULL_LARGE = 'SKULL_LARGE',
  /** 小骷髅：-100 */
  SKULL_SMALL = 'SKULL_SMALL',
}

/** 木箱内容配置：权重 + 价值 + 提示文字（玩家抓到后通过飘字显示） */
const BOX_CONTENTS: { type: BoxContent; weight: number; value: number; label: string }[] = [
  { type: BoxContent.PRIZE_DIAMOND, weight: 10, value: 800, label: '钻石大奖！' },
  { type: BoxContent.PRIZE_GOLD, weight: 20, value: 500, label: '金币 +500' },
  { type: BoxContent.PRIZE_COIN, weight: 30, value: 200, label: '金币 +200' },
  { type: BoxContent.EMPTY, weight: 15, value: 0, label: '空盒……' },
  { type: BoxContent.SKULL_LARGE, weight: 10, value: -300, label: '骷髅 -300' },
  { type: BoxContent.SKULL_SMALL, weight: 15, value: -100, label: '小骷髅 -100' },
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
  /** 木箱内容类型（仅 WOODEN_BOX 有效） */
  boxContent: BoxContent | null = null;
  /** 木箱内容描述（飘字显示用） */
  boxLabel: string = '';
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
  /** sprite 动画元数据查询函数（无则视为全部静态） */
  private metaProvider?: SpriteMetaProvider;

  constructor(
    x: number,
    y: number,
    type: MineralType,
    spriteCache: SpriteCacheMap,
    metaProvider?: SpriteMetaProvider
  ) {
    this.x = x;
    this.y = y;
    this.config = MINERAL_CONFIGS[type];
    this.radius = this.config.radius;
    this.spriteCache = spriteCache;
    this.metaProvider = metaProvider;

    // 鼹鼠 30% 概率带钻石
    if (type === MineralType.MOLE) {
      this.hasDiamond = Math.random() < 0.3;
    }

    // 神秘袋内容随机
    if (type === MineralType.MYSTERY_BAG) {
      const content = pickWeightedContent(MYSTERY_CONTENTS);
      if (content) {
        this.mysteryContent = content.type;
        this.mysteryLabel = content.label;
      }
      // 根据内容类型设定价值（道具类内容由 onHookComplete 处理，value=0）
      if (this.mysteryContent === MysteryContent.CASH_SMALL) {
        this.value = randomInt(50, 200);
      } else if (this.mysteryContent === MysteryContent.CASH_LARGE) {
        this.value = randomInt(400, 800);
      } else {
        this.value = 0;
      }
    } else if (type === MineralType.WOODEN_BOX) {
      // 木箱抽奖：构造时随机决定内容（玩家抓到才看到结果）
      const content = pickWeightedContent(BOX_CONTENTS);
      if (content) {
        this.boxContent = content.type;
        this.boxLabel = content.label;
        this.value = content.value;
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
    if (!sprite) return;
    const meta = this.metaProvider?.(this.config.spriteName);
    const f = getSpriteFrame(sprite, meta, performance.now());
    // 移动小动物按 vx 方向翻转：sprite 默认朝右，vx<0 时水平翻转
    const flip = this.config.flipOnDirection === true && this.vx < 0;
    if (flip) {
      const ctx = renderer.getContext();
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(-1, 1);
      renderer.drawImageSlice(sprite, f.sx, f.sy, f.sw, f.sh, -f.dw / 2, -f.dh / 2, f.dw, f.dh);
      ctx.restore();
    } else {
      renderer.drawImageSlice(
        sprite,
        f.sx,
        f.sy,
        f.sw,
        f.sh,
        this.x - f.dw / 2,
        this.y - f.dh / 2,
        f.dw,
        f.dh
      );
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
