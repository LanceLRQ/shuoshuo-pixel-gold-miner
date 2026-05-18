/**
 * HUD 界面
 * 显示时间、当前金额、目标金额
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';
import { drawText } from './PixelText';

/** HUD 顶部面板高度 */
export const HUD_HEIGHT = 36;

export class HUD {
  /** 剩余时间（秒） */
  timeLeft: number;
  /** 当前金额 */
  money: number;
  /** 目标金额 */
  targetMoney: number;

  /** 精灵缓存 */
  private spriteCache: SpriteCacheMap;

  constructor(spriteCache: SpriteCacheMap, targetMoney: number, initialTime: number = 0) {
    this.spriteCache = spriteCache;
    this.timeLeft = initialTime;
    this.money = 0;
    this.targetMoney = targetMoney;
  }

  /** 达标高亮闪烁累计时间（用于颜色循环） */
  private highlightTime: number = 0;

  /** 更新 HUD */
  update(dt: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.isTargetReached()) {
      this.highlightTime += dt;
    } else {
      this.highlightTime = 0;
    }
  }

  /** 渲染 HUD */
  render(renderer: Renderer): void {
    // HUD 背景面板
    renderer.fillRect(0, 0, renderer.width, HUD_HEIGHT, 'rgba(0, 0, 0, 0.7)');

    // 时间
    const timeColor = this.timeLeft <= 10 ? '#FF4444' : '#FFFFFF';
    drawText(renderer, `${Math.ceil(this.timeLeft)}s`, 8, 8, timeColor, 'MEDIUM');

    // 金币图标
    const coinSprite = this.spriteCache.get('COIN_ICON');
    if (coinSprite) {
      renderer.drawImage(coinSprite, 80, 7);
    }

    // 当前金额（达标后金色高亮 + 闪烁）
    const reached = this.isTargetReached();
    const moneyColor = reached
      ? (Math.floor(this.highlightTime * 4) % 2 === 0 ? '#FFFF00' : '#FFD700')
      : '#FFD700';
    drawText(renderer, `$${this.money}`, 108, 8, moneyColor, 'MEDIUM');

    // 目标金额（达标后变绿色对勾色）
    const targetColor = reached ? '#88FF88' : '#AAAAAA';
    drawText(renderer, `/ $${this.targetMoney}`, 200, 8, targetColor, 'MEDIUM');
  }

  /** 时间是否用尽 */
  isTimeUp(): boolean {
    return this.timeLeft <= 0;
  }

  /** 是否达标 */
  isTargetReached(): boolean {
    return this.money >= this.targetMoney;
  }
}
