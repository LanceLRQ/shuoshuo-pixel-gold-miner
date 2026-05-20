/**
 * 矿工角色实体
 * 管理矿工动画状态和精灵渲染
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';
import { getSpriteFrame, type SpriteAnimationMeta } from '../assets/animation';

/** 查询 sprite 动画元数据的回调（缺省/静态 sprite 返回 undefined） */
export type SpriteMetaProvider = (name: string) => SpriteAnimationMeta | undefined;

/** 矿工动画状态 */
export enum MinerState {
  IDLE = 'IDLE',
  PULL = 'PULL',
  HAPPY = 'HAPPY',
  SAD = 'SAD',
  /** 拉重物用力态（Phase F #15）：涨红脸 + 咬牙，由 GameScene 按 hook.grabbedMineral.weight 阈值切换 */
  STRAIN = 'STRAIN',
}

/** 矿工状态到精灵名称映射 */
const STATE_SPRITE_MAP: Record<MinerState, string> = {
  [MinerState.IDLE]: 'MINER_IDLE',
  [MinerState.PULL]: 'MINER_PULL',
  [MinerState.HAPPY]: 'MINER_HAPPY',
  [MinerState.SAD]: 'MINER_SAD',
  [MinerState.STRAIN]: 'MINER_STRAIN',
};

export class Miner {
  x: number;
  y: number;
  state: MinerState = MinerState.IDLE;
  /** 精灵缓存引用 */
  private spriteCache: SpriteCacheMap;
  /** sprite 动画元数据查询函数（无则视为全部静态） */
  private metaProvider?: SpriteMetaProvider;

  /** 状态恢复计时器 */
  private stateTimer: number = 0;
  /** 状态恢复阈值（秒） */
  private static readonly STATE_RESET_TIME = 1.5;

  constructor(x: number, y: number, spriteCache: SpriteCacheMap, metaProvider?: SpriteMetaProvider) {
    this.x = x;
    this.y = y;
    this.spriteCache = spriteCache;
    this.metaProvider = metaProvider;
  }

  /**
   * 切换状态
   * - HAPPY / SAD：临时态，1.5s 后自动回 IDLE
   * - STRAIN / PULL / IDLE：持续态，由调用方控制何时退出
   */
  setState(state: MinerState): void {
    this.state = state;
    if (state === MinerState.HAPPY || state === MinerState.SAD) {
      this.stateTimer = 0;
    }
  }

  /** 更新矿工状态 */
  update(dt: number): void {
    // 自动恢复临时状态
    if (this.state === MinerState.HAPPY || this.state === MinerState.SAD) {
      this.stateTimer += dt;
      if (this.stateTimer >= Miner.STATE_RESET_TIME) {
        this.state = MinerState.IDLE;
      }
    }
  }

  /** 渲染矿工 */
  render(renderer: Renderer): void {
    const spriteName = STATE_SPRITE_MAP[this.state];
    const sprite = this.spriteCache.get(spriteName);
    if (!sprite) return;
    const meta = this.metaProvider?.(spriteName);
    const f = getSpriteFrame(sprite, meta, performance.now());
    renderer.drawImageSlice(sprite, f.sx, f.sy, f.sw, f.sh, this.x - f.sw / 2, this.y - f.sh / 2);
  }
}
