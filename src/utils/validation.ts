/**
 * 排行榜数据合理性校验
 * 基于难度乘数 + 关卡矿物数计算理论分数上限，拒绝不可能的分数
 */

import { getLevelConfig } from '../level/levels';
import { getDifficultyConfig, type Difficulty } from '../level/difficulty';

/**
 * 单矿最高原价：猪猪粉宝石 1500
 * 木箱抽奖最高 800，神秘袋最高现金 250，都低于 1500
 */
const MAX_MINERAL_BASE_VALUE = 1500;

/** 合理性容差系数（覆盖商店 Bonus、章节收藏品倾斜等边缘情况） */
const PLAUSIBILITY_TOLERANCE = 1.5;

/** 计算指定难度 + 关卡的累计金额理论上限 */
export function getMaxPlausibleScore(difficulty: Difficulty, level: number): number {
  const diffConfig = getDifficultyConfig(difficulty);
  const maxMineralValue = MAX_MINERAL_BASE_VALUE * diffConfig.valueScale;

  let maxTotal = 0;
  for (let i = 1; i <= level; i++) {
    const cfg = getLevelConfig(i);
    // 每关矿物数 + L5+ 追加 1 个木箱
    const mineralCount = cfg.mineralCount + (i >= 5 ? 1 : 0);
    maxTotal += mineralCount * maxMineralValue;
  }
  return Math.floor(maxTotal * PLAUSIBILITY_TOLERANCE);
}

/** 排行榜记录校验结果 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** 校验排行榜记录是否合理 */
export function validateLeaderboardEntry(
  rawMoney: number,
  difficulty: Difficulty,
  level: number,
): ValidationResult {
  if (rawMoney < 0) {
    return { valid: false, reason: `分数为负: ${rawMoney}` };
  }

  if (level < 1) {
    return { valid: false, reason: `关卡编号无效: ${level}` };
  }

  const maxScore = getMaxPlausibleScore(difficulty, level);
  if (rawMoney > maxScore) {
    return { valid: false, reason: `分数超出合理范围: ${rawMoney} > ${maxScore} (难度=${difficulty}, 关卡=${level})` };
  }

  return { valid: true };
}
