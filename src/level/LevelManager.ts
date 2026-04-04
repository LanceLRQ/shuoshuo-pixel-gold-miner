/**
 * 关卡管理器
 * 管理关卡加载、切换、进度追踪
 */

import { getLevelConfig, TOTAL_LEVELS, type LevelConfig } from './levels';

export class LevelManager {
  /** 当前关卡编号（1-based） */
  currentLevel: number = 1;

  /** 累计金额 */
  totalMoney: number = 0;

  /** 当前关卡配置 */
  getCurrentConfig(): LevelConfig {
    return getLevelConfig(this.currentLevel);
  }

  /** 进入下一关 */
  nextLevel(): void {
    this.currentLevel++;
  }

  /** 是否还有下一关 */
  hasNextLevel(): boolean {
    return this.currentLevel < TOTAL_LEVELS;
  }

  /** 重置到第一关 */
  reset(): void {
    this.currentLevel = 1;
    this.totalMoney = 0;
  }

  /** 添加金额 */
  addMoney(amount: number): void {
    this.totalMoney += amount;
  }

  /** 获取累计金额 */
  getTotalMoney(): number {
    return this.totalMoney;
  }
}
