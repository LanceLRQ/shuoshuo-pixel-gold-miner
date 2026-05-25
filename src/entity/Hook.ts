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
import { pointInCircle, pointInEllipse } from '../utils/collision';

/**
 * 摇晃饮料钩爪微调角速度（弧度/秒，约 45.8°/秒）
 * 调用方需乘以 dt 得到本帧步长，确保刷新率独立
 */
export const SHAKE_ANGLE_RATE = 0.8;

/** 钩爪角度上限安全系数（避免完全水平摆动） */
const HOOK_ANGLE_SAFE_RATIO = 0.95;

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

  /**
   * 甩动速度倍率（由难度配置 motionSpeedScale 注入，HARD=1.0 / NORMAL,NOVICE,INFINITE=0.85 / EXPERT=1.3）
   * 默认 0.85 = NORMAL/NOVICE 基准，让非 GameScene 实例化（如未来工具/测试）时落在宽松速度
   */
  swingSpeedScale: number = 0.85;

  /** 收回完成回调 */
  private onComplete: HookCallback | null = null;

  /** 炸药桶爆炸回调 */
  private onBombExplode: BombExplodeCallback | null = null;

  /** 精灵缓存 */
  private spriteCache: SpriteCacheMap;
  /** sprite 动画元数据查询函数（无则视为全部静态） */
  private metaProvider?: SpriteMetaProvider;

  /** 爪子摆动初始方向（首次随机；reset 时可被 pendingSwingDir 覆写以延续抓取前方向） */
  private swingDirection: number;

  /**
   * 实时观察的甩动方向（+1=角度增大/向右；-1=角度减小/向左；0=未知）
   * 在 updateSwinging 中根据帧间 angle 变化更新，供 fire() 捕获
   */
  private currentSwingDir: -1 | 0 | 1 = 0;

  /** fire() 时捕获的方向，reset() 时用于决定下一轮甩动起始方向 */
  private pendingSwingDir: -1 | 0 | 1 = 0;

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
    // 捕获当前甩动方向，待本轮抓取结束后从同方向继续
    // 首帧 currentSwingDir 可能仍为 0（角度无变化），此时 fallback 到当前 swingDirection
    this.pendingSwingDir = this.currentSwingDir !== 0
      ? this.currentSwingDir
      : (this.swingDirection > 0 ? 1 : -1);
    this.state = HookState.EXTENDING;
  }

  /**
   * 玩家操作：钩爪伸出过程中微调角度（摇晃饮料道具效果）
   * 仅在 EXTENDING 状态有效
   * @param direction -1=向左 / +1=向右
   * @param step 本帧调整量（弧度）。调用方通常传 SHAKE_ANGLE_RATE * dt
   */
  tryAdjustAngle(direction: -1 | 1, step: number): boolean {
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

  /**
   * 重置钩爪到摆动状态
   *
   * 方向记忆设计：reset 后 angle 从 0（竖直中位）开始，但 swingDirection 沿用 fire 时记录的方向，
   * 让钩爪从中位向"上一次抓取前的同向"继续摆。这是有意设计——不延续抓取瞬间的具体角度，
   * 只延续"向左/向右"的运动趋势，避免抓后角度突跳但保留方向连贯感。
   */
  reset(): void {
    this.state = HookState.SWINGING;
    this.ropeLength = 30;
    this.grabbedMineral = null;
    this.swingTime = 0;
    // 沿用 fire 时记录的方向继续甩；未记录时保持上一次 swingDirection
    if (this.pendingSwingDir !== 0) {
      this.swingDirection = this.pendingSwingDir;
      this.pendingSwingDir = 0;
    }
    // currentSwingDir 由下一帧 updateSwinging 重新观察
    this.currentSwingDir = 0;
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
    const prevAngle = this.angle;
    this.swingTime += dt;
    // 摆动公式: sin(t * baseSpeed * swingSpeedScale * swingDirection) * maxAngle
    const omega = GAME_CONFIG.HOOK_SWING_SPEED * this.swingSpeedScale * this.swingDirection;
    this.angle = Math.sin(this.swingTime * omega) * GAME_CONFIG.HOOK_MAX_ANGLE;
    this.ropeLength = 30;
    // 实时记录当前甩动方向（角度增大=向右；减小=向左），供 fire() 时捕获
    if (this.angle > prevAngle) this.currentSwingDir = 1;
    else if (this.angle < prevAngle) this.currentSwingDir = -1;
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
      // 碰撞判定：椭圆（radiusX/radiusY 配置时）或圆形（fallback）
      const cfg = mineral.config;
      const hit = cfg.radiusX !== undefined && cfg.radiusY !== undefined
        ? pointInEllipse(this.tipX, this.tipY, mineral.x, mineral.y, cfg.radiusX, cfg.radiusY)
        : pointInCircle(this.tipX, this.tipY, mineral.x, mineral.y, mineral.radius);
      if (hit) {
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

    // 绘制绳索：直线连接锚点到钩爪尖端
    ctx.strokeStyle = '#DEB887';
    ctx.lineWidth = GAME_CONFIG.HOOK_ROPE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(this.anchorX, this.anchorY);
    ctx.lineTo(this.tipX, this.tipY);
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
