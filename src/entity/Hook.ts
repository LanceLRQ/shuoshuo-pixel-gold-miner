/**
 * 钩爪实体
 * 独立状态机：SWINGING → EXTENDING → REELING → SWINGING
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';
import type { Mineral } from './Mineral';
import { GAME_CONFIG } from './types';
import { pointInCircle } from '../utils/collision';

/** 钩爪状态 */
export enum HookState {
  /** 摆动中，等待玩家操作 */
  SWINGING = 'SWINGING',
  /** 发射延伸中 */
  EXTENDING = 'EXTENDING',
  /** 带矿物收回中 */
  REELING_WITH_MINERAL = 'REELING_WITH_MINERAL',
  /** 空收回中 */
  REELING_EMPTY = 'REELING_EMPTY',
}

/** 钩爪收回事件回调 */
export type HookCallback = (mineral: Mineral | null) => void;

export class Hook {
  /** 锚点（矿工位置） */
  anchorX: number;
  anchorY: number;

  /** 当前状态 */
  state: HookState = HookState.SWINGING;

  /** 摆动时间累积 */
  private swingTime: number = 0;

  /** 当前角度（弧度，0 = 正下方） */
  angle: number = 0;

  /** 钩爪尖端位置 */
  tipX: number = 0;
  tipY: number = 0;

  /** 绳索长度 */
  ropeLength: number = 30;

  /** 抓取的矿物 */
  grabbedMineral: Mineral | null = null;

  /** 收回速度倍率（受力量药水影响） */
  reelSpeedMultiplier: number = 1;

  /** 收回完成回调 */
  private onComplete: HookCallback | null = null;

  /** 精灵缓存 */
  private spriteCache: SpriteCacheMap;

  /** 爪子摆动初始方向（随机） */
  private readonly swingDirection: number;

  constructor(anchorX: number, anchorY: number, spriteCache: SpriteCacheMap) {
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.spriteCache = spriteCache;
    // 随机初始摆动方向
    this.swingDirection = Math.random() > 0.5 ? 1 : -1;
  }

  /** 设置收回完成回调 */
  setOnComplete(cb: HookCallback): void {
    this.onComplete = cb;
  }

  /** 玩家操作：发射钩爪 */
  fire(): void {
    if (this.state !== HookState.SWINGING) return;
    this.state = HookState.EXTENDING;
  }

  /** 重置钩爪到摆动状态 */
  reset(): void {
    this.state = HookState.SWINGING;
    this.ropeLength = 30;
    this.grabbedMineral = null;
    this.swingTime = 0;
  }

  /** 更新钩爪逻辑 */
  update(dt: number): void {
    switch (this.state) {
      case HookState.SWINGING:
        this.updateSwinging(dt);
        break;
      case HookState.EXTENDING:
        this.updateExtending(dt);
        break;
      case HookState.REELING_WITH_MINERAL:
        this.updateReeling(dt);
        break;
      case HookState.REELING_EMPTY:
        this.updateReeling(dt);
        break;
    }

    // 更新钩爪尖端位置
    this.tipX = this.anchorX + Math.sin(this.angle) * this.ropeLength;
    this.tipY = this.anchorY + Math.cos(this.angle) * this.ropeLength;
  }

  /** 摆动状态：正弦函数控制角度 */
  private updateSwinging(dt: number): void {
    this.swingTime += dt;
    // 摆动公式: sin(t * swingSpeed) * maxAngle
    this.angle = Math.sin(this.swingTime * GAME_CONFIG.HOOK_SWING_SPEED * this.swingDirection) * GAME_CONFIG.HOOK_MAX_ANGLE;
    this.ropeLength = 30;
  }

  /** 发射状态：沿当前角度匀速延伸 */
  private updateExtending(dt: number): void {
    this.ropeLength += GAME_CONFIG.HOOK_EXTEND_SPEED * dt;

    // 到达最大距离，空收回
    if (this.ropeLength >= GAME_CONFIG.HOOK_MAX_LENGTH) {
      this.state = HookState.REELING_EMPTY;
    }
  }

  /** 收回状态：绳索缩短，速度受矿物重量影响 */
  private updateReeling(dt: number): void {
    // 收回速度: baseSpeed * multiplier / (1 + weight * factor)
    let reelSpeed = GAME_CONFIG.HOOK_BASE_REEL_SPEED * this.reelSpeedMultiplier;
    if (this.grabbedMineral) {
      reelSpeed = GAME_CONFIG.HOOK_BASE_REEL_SPEED / (1 + this.grabbedMineral.config.weight * GAME_CONFIG.WEIGHT_FACTOR);
    }

    this.ropeLength -= reelSpeed * dt;

    // 如果抓着矿物，更新矿物位置跟随钩爪（沿绳索方向偏移，让矿物"挂"在钩爪下方）
    if (this.grabbedMineral) {
      const offsetDist = this.grabbedMineral.radius * 0.8;
      this.grabbedMineral.x = this.tipX + Math.sin(this.angle) * offsetDist;
      this.grabbedMineral.y = this.tipY + Math.cos(this.angle) * offsetDist;
    }

    // 收回到矿工位置
    if (this.ropeLength <= 30) {
      const mineral = this.grabbedMineral;
      this.reset();
      // 通知回调
      if (this.onComplete) {
        this.onComplete(mineral);
      }
    }
  }

  /** 检测钩爪与矿物的碰撞 */
  checkCollision(minerals: Mineral[]): void {
    if (this.state !== HookState.EXTENDING) return;

    for (const mineral of minerals) {
      if (mineral.grabbed) continue;
      // 碰撞判定: 钩爪尖端到矿物中心距离 < 矿物碰撞半径
      if (pointInCircle(this.tipX, this.tipY, mineral.x, mineral.y, mineral.radius)) {
        this.grabbedMineral = mineral;
        mineral.grabbed = true;
        this.state = HookState.REELING_WITH_MINERAL;
        return;
      }
    }
  }

  /** 渲染钩爪和绳索 */
  render(renderer: Renderer): void {
    const ctx = renderer.getContext();

    // 绘制绳索
    ctx.strokeStyle = '#DEB887';
    ctx.lineWidth = GAME_CONFIG.HOOK_ROPE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(this.anchorX, this.anchorY);
    ctx.lineTo(this.tipX, this.tipY);
    ctx.stroke();

    // 绘制钩爪精灵
    const sprite = this.spriteCache.get('HOOK_SPRITE');
    if (sprite) {
      // 以绳索连接点（精灵顶部）为旋转中心，角度取反使爪子跟随绳索方向
      ctx.save();
      ctx.translate(this.tipX, this.tipY);
      ctx.rotate(-this.angle);
      renderer.drawImage(sprite, -sprite.width / 2, 0);
      ctx.restore();
    }

    // 绘制被抓的矿物（在收回状态下跟随钩爪）
    if (this.grabbedMineral && (this.state === HookState.REELING_WITH_MINERAL)) {
      this.grabbedMineral.renderGrabbed(renderer);
    }
  }
}
