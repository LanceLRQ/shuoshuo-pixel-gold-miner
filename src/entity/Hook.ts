/**
 * 钩爪实体
 * 独立状态机：SWINGING → EXTENDING → REELING → SWINGING
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';
import { getSpriteFrame } from '../assets/animation';
import type { SpriteMetaProvider } from './Miner';
import type { Mineral } from './Mineral';
import { GAME_CONFIG, MineralType } from './types';
import { pointInCircle } from '../utils/collision';

/** 摇晃饮料单次微调步长（弧度，约 2.86°） */
const SHAKE_ANGLE_STEP = 0.05;

/** 钩爪角度上限安全系数（避免完全水平摆动） */
const HOOK_ANGLE_SAFE_RATIO = 0.95;

/** 绳索下垂偏移系数：sag(px) = weight × SAG_FACTOR */
const ROPE_SAG_FACTOR = 10;

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

/** 炸药桶爆炸事件回调 */
export type BombExplodeCallback = (x: number, y: number) => void;

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

  /** 重量影响系数倍率（由难度配置注入，新手/无限=0 表示无重量影响） */
  weightFactorScale: number = 1;

  /** 收回完成回调 */
  private onComplete: HookCallback | null = null;

  /** 炸药桶爆炸回调 */
  private onBombExplode: BombExplodeCallback | null = null;

  /** 精灵缓存 */
  private spriteCache: SpriteCacheMap;
  /** sprite 动画元数据查询函数（无则视为全部静态） */
  private metaProvider?: SpriteMetaProvider;

  /** 爪子摆动初始方向（随机） */
  private readonly swingDirection: number;

  constructor(anchorX: number, anchorY: number, spriteCache: SpriteCacheMap, metaProvider?: SpriteMetaProvider) {
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.spriteCache = spriteCache;
    this.metaProvider = metaProvider;
    // 随机初始摆动方向
    this.swingDirection = Math.random() > 0.5 ? 1 : -1;
  }

  /** 设置收回完成回调 */
  setOnComplete(cb: HookCallback): void {
    this.onComplete = cb;
  }

  /** 设置炸药桶爆炸回调 */
  setOnBombExplode(cb: BombExplodeCallback): void {
    this.onBombExplode = cb;
  }

  /** 玩家操作：发射钩爪 */
  fire(): void {
    if (this.state !== HookState.SWINGING) return;
    this.state = HookState.EXTENDING;
  }

  /**
   * 玩家操作：钩爪伸出过程中微调角度（摇晃饮料道具效果）
   * 仅在 EXTENDING 状态有效
   * @param direction -1=向左 / +1=向右
   * @param step 单次调整步长（弧度）
   */
  tryAdjustAngle(direction: -1 | 1, step: number = SHAKE_ANGLE_STEP): boolean {
    if (this.state !== HookState.EXTENDING) return false;
    const newAngle = this.angle + direction * step;
    const maxAngle = GAME_CONFIG.HOOK_MAX_ANGLE * HOOK_ANGLE_SAFE_RATIO;
    this.angle = Math.max(-maxAngle, Math.min(maxAngle, newAngle));
    return true;
  }

  /**
   * 玩家操作：引爆当前钩着的矿物（TNT 主动模式）
   * 仅在 REELING_WITH_MINERAL 状态有效，成功返回被引爆的矿物
   * 引爆后状态切换为 REELING_EMPTY，绳索立即开始空收回
   */
  tryDetonate(): Mineral | null {
    if (this.state !== HookState.REELING_WITH_MINERAL || !this.grabbedMineral) return null;
    const mineral = this.grabbedMineral;
    this.grabbedMineral = null;
    this.state = HookState.REELING_EMPTY;
    return mineral;
  }

  /**
   * 当前是否在收回阶段拉着「重物」（封装 grabbedMineral.config.weight 内部细节）
   * 仅 REELING_WITH_MINERAL 状态返回 true（EXTENDING/SWINGING 都不算"在拉"）
   */
  isPullingHeavy(weightThreshold: number): boolean {
    return this.state === HookState.REELING_WITH_MINERAL
        && this.grabbedMineral != null
        && this.grabbedMineral.config.weight >= weightThreshold;
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

  /** 发射状态：沿当前角度匀速延伸，超出边界或最大距离时空收回 */
  private updateExtending(dt: number): void {
    this.ropeLength += GAME_CONFIG.HOOK_EXTEND_SPEED * dt;

    // 计算当前尖端位置
    const tipX = this.anchorX + Math.sin(this.angle) * this.ropeLength;
    const tipY = this.anchorY + Math.cos(this.angle) * this.ropeLength;

    // 超出画布边界，空收回
    if (tipX < 0 || tipX > GAME_CONFIG.CANVAS_WIDTH || tipY < 0 || tipY > GAME_CONFIG.CANVAS_HEIGHT) {
      this.state = HookState.REELING_EMPTY;
      return;
    }

    // 到达最大距离，空收回
    if (this.ropeLength >= GAME_CONFIG.HOOK_MAX_LENGTH) {
      this.state = HookState.REELING_EMPTY;
    }
  }

  /** 收回状态：绳索缩短，速度受矿物重量影响 */
  private updateReeling(dt: number): void {
    // 公式：baseSpeed * multiplier / (1 + weight * factor)
    // 修复点：抓矿物时也乘 multiplier，让力量药水对抓重物生效
    // 难度联动：factor = WEIGHT_FACTOR × weightFactorScale（新手/无限=0 表示无重量影响）
    let reelSpeed = GAME_CONFIG.HOOK_BASE_REEL_SPEED * this.reelSpeedMultiplier;
    if (this.grabbedMineral) {
      const factor = GAME_CONFIG.WEIGHT_FACTOR * this.weightFactorScale;
      reelSpeed = reelSpeed / (1 + this.grabbedMineral.config.weight * factor);
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
        // 炸药桶：碰到立即爆炸，不拉回
        if (mineral.config.type === MineralType.BOMB) {
          mineral.grabbed = true;
          this.state = HookState.REELING_EMPTY;
          if (this.onBombExplode) {
            this.onBombExplode(mineral.x, mineral.y);
          }
          return;
        }

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

    // 绘制绳索：抓重物时用二次贝塞尔曲线模拟下垂感（#17）
    ctx.strokeStyle = '#DEB887';
    ctx.lineWidth = GAME_CONFIG.HOOK_ROPE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(this.anchorX, this.anchorY);
    if (this.grabbedMineral && this.state === HookState.REELING_WITH_MINERAL) {
      const sag = this.grabbedMineral.config.weight * ROPE_SAG_FACTOR;
      const midX = (this.anchorX + this.tipX) / 2;
      const midY = (this.anchorY + this.tipY) / 2 + sag;
      ctx.quadraticCurveTo(midX, midY, this.tipX, this.tipY);
    } else {
      ctx.lineTo(this.tipX, this.tipY);
    }
    ctx.stroke();

    // 绘制钩爪精灵
    const sprite = this.spriteCache.get('HOOK_SPRITE');
    if (sprite) {
      const meta = this.metaProvider?.('HOOK_SPRITE');
      const f = getSpriteFrame(sprite, meta, performance.now());
      // 以绳索连接点（精灵顶部）为旋转中心，角度取反使爪子跟随绳索方向
      ctx.save();
      ctx.translate(this.tipX, this.tipY);
      ctx.rotate(-this.angle);
      renderer.drawImageSlice(sprite, f.sx, f.sy, f.sw, f.sh, -f.dw / 2, 0, f.dw, f.dh);
      ctx.restore();
    }

    // 绘制被抓的矿物（在收回状态下跟随钩爪）
    if (this.grabbedMineral && (this.state === HookState.REELING_WITH_MINERAL)) {
      this.grabbedMineral.renderGrabbed(renderer);
    }
  }
}
