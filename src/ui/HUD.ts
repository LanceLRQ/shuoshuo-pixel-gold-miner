/**
 * HUD 界面
 * 显示时间、当前金额、目标金额
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';
import { getSpriteFrame } from '../assets/animation';
import type { SpriteMetaProvider } from '../entity/Miner';
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
  /** sprite 元数据查询函数（无则视为全部静态、1:1 显示） */
  private metaProvider?: SpriteMetaProvider;

  /** 难度显示标签（如 "一般" "高手"），由 GameScene 注入 */
  difficultyLabel: string = '';

  constructor(
    spriteCache: SpriteCacheMap,
    targetMoney: number,
    initialTime: number = 0,
    metaProvider?: SpriteMetaProvider
  ) {
    this.spriteCache = spriteCache;
    this.timeLeft = initialTime;
    this.money = 0;
    this.targetMoney = targetMoney;
    this.metaProvider = metaProvider;
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

    // 金币图标（走 getSpriteFrame 路径：支持 HD 精度 + displayWidth/Height 缩放）
    const coinSprite = this.spriteCache.get('COIN_ICON');
    if (coinSprite) {
      const meta = this.metaProvider?.('COIN_ICON');
      const f = getSpriteFrame(coinSprite, meta, performance.now());
      renderer.drawImageSlice(coinSprite, f.sx, f.sy, f.sw, f.sh, 80, 7, f.dw, f.dh);
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

    // 难度标签（HUD 中部偏右，小字）
    if (this.difficultyLabel) {
      drawText(renderer, this.difficultyLabel, 350, 12, '#AAAAFF', 'SMALL');
    }
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
