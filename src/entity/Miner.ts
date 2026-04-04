/**
 * 矿工角色实体
 * 管理矿工动画状态和精灵渲染
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';

/** 矿工动画状态 */
export enum MinerState {
  IDLE = 'IDLE',
  PULL = 'PULL',
  HAPPY = 'HAPPY',
  SAD = 'SAD',
}

/** 矿工状态到精灵名称映射 */
const STATE_SPRITE_MAP: Record<MinerState, string> = {
  [MinerState.IDLE]: 'MINER_IDLE',
  [MinerState.PULL]: 'MINER_PULL',
  [MinerState.HAPPY]: 'MINER_HAPPY',
  [MinerState.SAD]: 'MINER_SAD',
};

export class Miner {
  x: number;
  y: number;
  state: MinerState = MinerState.IDLE;
  /** 精灵缓存引用 */
  private spriteCache: SpriteCacheMap;

  /** 状态恢复计时器 */
  private stateTimer: number = 0;
  /** 状态恢复阈值（秒） */
  private static readonly STATE_RESET_TIME = 1.5;

  constructor(x: number, y: number, spriteCache: SpriteCacheMap) {
    this.x = x;
    this.y = y;
    this.spriteCache = spriteCache;
  }

  /** 切换到临时状态（HAPPY/SAD 会自动恢复为 IDLE） */
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
    if (sprite) {
      // 精灵尺寸 16x16，缩放 2x 后为 32x32，以矿工位置为中心
      renderer.drawImage(sprite, this.x - sprite.width / 2, this.y - sprite.height / 2);
    }
  }
}
