#!/usr/bin/env node
/**
 * HD 精灵生成器：算法生成 PixelMap → 转 ASCII + palette → patch classic.json
 *
 * 用法：node scripts/generate-hd-sprites.mjs
 * 效果：直接修改 src/assets/themes/classic.json 中指定 sprite 的 palette/pixels
 *
 * 设计原则：
 *   - HD 数据尺寸 = 显示尺寸（scale=1）：保持游戏布局/碰撞不变
 *   - 每个 sprite 自带局部调色板（单字符 key），透明用 '.'
 *   - 算法生成是占位风格，未来美术 PNG → pixel-converter 可整体替换
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLASSIC_JSON = path.join(ROOT, 'src/assets/themes/classic.json');

const PALETTE_CHARS = (
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789' +
  '!@#$%^&*+=<>?~-'
).split('');

// ==================== 通用工具 ====================

/** 生成 W×H 网格，pixel(x,y) 返回 hex 或 null（透明） */
function generateGrid(W, H, pixel) {
  const map = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      row.push(pixel(x, y));
    }
    map.push(row);
  }
  return map;
}

/** PixelMap (颜色数组) → { palette, pixels } 块（ASCII + 局部调色板） */
function toSpriteJson(pixelMap, scale = 1) {
  const usage = new Map();
  for (const row of pixelMap) {
    for (const cell of row) {
      if (cell === null) continue;
      usage.set(cell, (usage.get(cell) || 0) + 1);
    }
  }
  const sorted = Array.from(usage.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length > PALETTE_CHARS.length) {
    throw new Error(`调色板溢出: ${sorted.length}/${PALETTE_CHARS.length}`);
  }
  const palette = {};
  const colorToChar = new Map();
  sorted.forEach(([hex], i) => {
    palette[PALETTE_CHARS[i]] = hex;
    colorToChar.set(hex, PALETTE_CHARS[i]);
  });
  const pixels = pixelMap.map(row =>
    row.map(cell => (cell === null ? '.' : colorToChar.get(cell))).join('')
  );
  return { scale, palette, pixels };
}

// ==================== 算法库 ====================

/**
 * 不规则金块算法（GOLD 系列复用）
 * 7 档明暗色板：HIGHLIGHT/LIGHT/BRIGHT/MID/DARK/SHADOW/OUTLINE
 * 通过 sin/cos 噪声 + dy/dx 分区上色
 */
function makeGoldNugget(W, H, palette) {
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const baseR = Math.min(W, H) / 2 - 1;
  const noiseAmp = baseR * 0.08;

  function radiusAt(theta) {
    return baseR
      + noiseAmp * Math.sin(theta * 5 + 0.3)
      + noiseAmp * 0.6 * Math.sin(theta * 11 + 1.2)
      - baseR * 0.025 * Math.cos(theta);
  }

  // 内部分区阈值按尺寸缩放（GOLD_LARGE 用 48×48 时的相对位置）
  const sScale = Math.min(W, H) / 48;
  const topHl = -12 * sScale;   // 顶部强反光
  const topLt = -8 * sScale;    // 高光带
  const midBr = -2 * sScale;    // 中亮
  const midSplit = 6 * sScale;  // 左明右暗分界 y
  const midDx = 8 * sScale;     // 左明右暗分界 x
  const lowMid = 10 * sScale;
  const lowDk = 14 * sScale;

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const theta = Math.atan2(dy, dx);
    const fe = radiusAt(theta) - r;
    if (fe < 0) return null;
    if (fe < 1.0) return palette.OUTLINE;
    if (fe < 2.2 * sScale) return palette.SHADOW;
    if (dy < topHl && dx > -6 * sScale && dx < 2 * sScale) return palette.HIGHLIGHT;
    if (dy < topLt && dx < 6 * sScale && dx > -10 * sScale) return palette.LIGHT;
    if (dy < midBr && dx < 6 * sScale) return palette.BRIGHT;
    if (dy < midSplit && dx < midDx) return palette.MID;
    if (dy < midSplit && dx >= midDx) return palette.DARK;
    if (dy < lowMid) return palette.MID;
    if (dy < lowDk) return palette.DARK;
    return palette.SHADOW;
  });
}

/** 钻石算法：菱形 + 半透明蓝晶 + 折射纹 */
function makeDiamond(W, H) {
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  // 菱形轮廓：|dx/rx| + |dy/ry| ≤ 1
  const rx = (W / 2) - 1;
  const ry = (H / 2) - 1;

  const DIAMOND_HL = '#FFFFFF';
  const DIAMOND_LT = '#D0FFFF';
  const DIAMOND_BR = '#80FFFF';
  const DIAMOND_MID = '#40DDFF';
  const DIAMOND_DK = '#00AADD';
  const DIAMOND_SH = '#005577';
  const DIAMOND_OL = '#001A33';

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const d = Math.abs(dx) / rx + Math.abs(dy) / ry;
    if (d > 1.0) return null;
    if (d > 0.92) return DIAMOND_OL;
    if (d > 0.82) return DIAMOND_SH;
    // 上半部：高光为主；下半部：阴影渐变
    if (dy < -ry * 0.4) {
      // 顶部强反光（中央竖直一道）
      if (Math.abs(dx) < rx * 0.2 && dy > -ry * 0.75) return DIAMOND_HL;
      if (dx < 0) return DIAMOND_LT;
      return DIAMOND_BR;
    }
    if (dy < 0) {
      if (dx < -rx * 0.2) return DIAMOND_LT;
      if (dx > rx * 0.3) return DIAMOND_MID;
      return DIAMOND_BR;
    }
    // 下半部
    if (dy < ry * 0.5) {
      if (dx < 0) return DIAMOND_MID;
      return DIAMOND_DK;
    }
    return DIAMOND_DK;
  });
}

/** 石头算法：粗糙不规则圆 + 多个坑洼 + 表面阴影 */
function makeStone(W, H) {
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const baseR = Math.min(W, H) / 2 - 1;

  const STONE_HL = '#C5C5C5';
  const STONE_LT = '#A0A0A0';
  const STONE_MID = '#808080';
  const STONE_DK = '#606060';
  const STONE_SH = '#454545';
  const STONE_OL = '#2A2A2A';

  function radiusAt(theta) {
    return baseR
      + baseR * 0.10 * Math.sin(theta * 7 + 0.5)
      + baseR * 0.06 * Math.cos(theta * 13 + 2.1);
  }

  // 几个坑洼中心（相对中心的偏移）
  const pits = [
    { x: -baseR * 0.3, y: -baseR * 0.2, r: baseR * 0.18 },
    { x: baseR * 0.4, y: baseR * 0.1, r: baseR * 0.15 },
    { x: -baseR * 0.1, y: baseR * 0.45, r: baseR * 0.12 },
  ];

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const theta = Math.atan2(dy, dx);
    const fe = radiusAt(theta) - r;
    if (fe < 0) return null;
    if (fe < 1.0) return STONE_OL;
    if (fe < 1.8) return STONE_SH;

    // 坑洼检查
    for (const pit of pits) {
      const pdx = x - cx - pit.x;
      const pdy = y - cy - pit.y;
      const pd = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pd < pit.r * 0.5) return STONE_SH;
      if (pd < pit.r) return STONE_DK;
    }

    // 顶部高光（光照来自左上）
    if (dy < -baseR * 0.4 && dx < baseR * 0.1) return STONE_HL;
    if (dy < -baseR * 0.1 && dx < baseR * 0.3) return STONE_LT;
    if (dy < baseR * 0.3 && dx < baseR * 0.4) return STONE_MID;
    if (dx > baseR * 0.3) return STONE_DK;
    return STONE_MID;
  });
}

/** 水晶柱算法：六边形竖直柱体 + 内部反射纹（Ch1 收藏品差异化于钻石） */
function makeCrystalOre(W, H) {
  const cx = (W - 1) / 2;
  const topY = 2;
  const botY = H - 3;
  const taperW = 3;     // 顶部窄
  const baseW = W / 2 - 1;

  const CRY_HL = '#FFFFFF';
  const CRY_BR = '#D0F8FF';
  const CRY_LT = '#80E0FF';
  const CRY_MID = '#5AB8E0';
  const CRY_DK = '#3A88B5';
  const CRY_SH = '#1F5577';
  const CRY_OL = '#0A2A44';

  // 计算每行的半宽（梯形 + 顶尖 + 底尖）
  function halfWAt(y) {
    if (y < topY) return 0;
    if (y < topY + 2) return taperW * (y - topY) / 2;
    if (y > botY) return 0;
    if (y > botY - 2) return baseW * (botY - y) / 2;
    // 主体段：上窄下宽
    const t = (y - topY - 2) / (botY - 2 - topY - 2 || 1);
    return taperW + (baseW - taperW) * t;
  }

  return generateGrid(W, H, (x, y) => {
    const hw = halfWAt(y);
    const dx = x - cx;
    if (Math.abs(dx) > hw) return null;
    // 边缘描边
    if (Math.abs(dx) > hw - 1) return CRY_OL;
    if (Math.abs(dx) > hw - 2) return CRY_SH;
    // 中央竖直高光带
    if (Math.abs(dx) < 1.2 && y > topY + 1 && y < botY - 1) return CRY_HL;
    if (Math.abs(dx) < 2.2 && y > topY + 1 && y < botY - 1) return CRY_BR;
    // 左明右暗（左侧浅色，右侧深色）
    if (dx < 0) {
      if (dx > -hw * 0.6) return CRY_LT;
      return CRY_MID;
    }
    if (dx < hw * 0.6) return CRY_MID;
    return CRY_DK;
  });
}

/** 蟹甲算法：菱形 + 内部 3 道横向鳞片暗纹（Ch2 收藏品） */
function makeCrabShell(W, H) {
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const rx = (W / 2) - 1;
  const ry = (H / 2) - 1;

  const SHL_HL = '#FFFFFF';
  const SHL_BR = '#D0FFE5';
  const SHL_LT = '#80FFB0';
  const SHL_MID = '#3AC080';
  const SHL_DK = '#1A8050';
  const SHL_SH = '#0A4A2A';
  const SHL_OL = '#062A18';

  // 鳞片纹位置（y 偏移）
  const scaleLines = [-ry * 0.35, 0, ry * 0.35];

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const d = Math.abs(dx) / rx + Math.abs(dy) / ry;
    if (d > 1.0) return null;
    if (d > 0.92) return SHL_OL;
    if (d > 0.82) return SHL_SH;
    // 鳞片纹（横向暗线）
    for (const sy of scaleLines) {
      if (Math.abs(dy - sy) < 0.6 && Math.abs(dx) < rx * 0.7) return SHL_DK;
    }
    // 顶部高光（光照来自上方）
    if (dy < -ry * 0.5 && Math.abs(dx) < rx * 0.4) return SHL_HL;
    if (dy < -ry * 0.2 && dx < rx * 0.2) return SHL_BR;
    if (dy < 0 && dx < 0) return SHL_LT;
    if (dy < 0) return SHL_MID;
    if (dx < 0) return SHL_MID;
    return SHL_DK;
  });
}

/** 粉钻算法：菱形 + 中央心形高光（Ch3 收藏品） */
function makePiggyGem(W, H) {
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const rx = (W / 2) - 1;
  const ry = (H / 2) - 1;

  const PNK_HL = '#FFFFFF';
  const PNK_BR = '#FFE0F8';
  const PNK_LT = '#FFB6E5';
  const PNK_MID = '#FF80C0';
  const PNK_DK = '#CC4A90';
  const PNK_SH = '#882560';
  const PNK_OL = '#440A30';

  /** 心形判定：以 (hx, hy) 为中心，半径 hr。心形公式简化版 */
  function inHeart(x, y) {
    const hx = cx, hy = cy - ry * 0.15;
    const hr = Math.min(rx, ry) * 0.3;
    const px = (x - hx) / hr;
    const py = (y - hy) / hr;
    // 心形参数方程的近似：(x² + y² - 1)³ - x²y³ ≤ 0
    const v = Math.pow(px * px + py * py - 1, 3) - px * px * py * py * py;
    return v <= 0 && py > -1.2 && py < 1.2;
  }

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const d = Math.abs(dx) / rx + Math.abs(dy) / ry;
    if (d > 1.0) return null;
    if (d > 0.92) return PNK_OL;
    if (d > 0.82) return PNK_SH;
    // 心形高光
    if (inHeart(x, y)) return PNK_HL;
    // 上半亮，下半暗
    if (dy < -ry * 0.4) {
      if (dx < 0) return PNK_BR;
      return PNK_LT;
    }
    if (dy < 0) {
      if (dx < 0) return PNK_LT;
      return PNK_MID;
    }
    if (dy < ry * 0.5) {
      if (dx < 0) return PNK_MID;
      return PNK_DK;
    }
    return PNK_DK;
  });
}

/** 钩爪算法：垂直绳 + T 形挂钩 + 三叉爪（保留原版几何特征） */
function makeHook(W, H) {
  const cx = (W - 1) / 2;
  // 区域划分（按 H=36 比例）
  const sH = H / 12;
  const ropeY = 1 * sH;       // 顶部绳子末端
  const stemY = 2 * sH;       // 主杆起始
  const headY = 4 * sH;       // T 头部加宽起始
  const mainY = 6 * sH;       // 主体（最宽）起始
  const branchY = 7 * sH;     // 三叉爪分叉点
  const tipY = 11 * sH;       // 爪尖

  // 颜色
  const ROPE = '#DEB887';
  const HOOK = '#D0D0D0';
  const HOOK_HL = '#FFFFFF';
  const HOOK_DK = '#808080';
  const HOOK_SH = '#3F3F3F';

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx;
    // 顶部绳子
    if (y < ropeY) {
      if (Math.abs(dx) < 1.2) return ROPE;
      return null;
    }
    // 主杆（中央 2-3 列）
    if (y < stemY) {
      if (Math.abs(dx) < 1.5) return HOOK;
      return null;
    }
    // 主杆 + 描边
    if (y < headY) {
      if (Math.abs(dx) <= 0.5) return HOOK_HL;
      if (Math.abs(dx) < 2) return HOOK;
      return null;
    }
    // T 形加宽
    if (y < mainY) {
      const halfW = (W * 0.18) * ((y - headY) / (mainY - headY));
      if (Math.abs(dx) > halfW + 2) return null;
      if (Math.abs(dx) > halfW + 1) return HOOK_SH;
      if (dx < -halfW * 0.3) return HOOK_HL;
      if (dx < halfW * 0.3) return HOOK;
      return HOOK_DK;
    }
    // 主体（最宽部分）
    if (y < branchY) {
      const halfW = W * 0.22;
      if (Math.abs(dx) > halfW + 2) return null;
      if (Math.abs(dx) > halfW + 1) return HOOK_SH;
      if (dx < -halfW * 0.3) return HOOK_HL;
      if (dx < halfW * 0.3) return HOOK;
      return HOOK_DK;
    }
    // 三叉爪分叉
    if (y < tipY) {
      const t = (y - branchY) / (tipY - branchY);
      // 左爪：x 中心从 -halfW * 0.5 渐变到 -halfW
      const leftCx = -W * 0.11 - (W * 0.28 - W * 0.11) * t;
      const rightCx = W * 0.11 + (W * 0.28 - W * 0.11) * t;
      const midCx = 0;
      const armW = 1.5 - t * 0.8;  // 爪臂越往下越细
      for (const ax of [leftCx, midCx, rightCx]) {
        if (Math.abs(dx - ax) < armW) {
          // 描边
          if (Math.abs(dx - ax) > armW - 0.8) return HOOK_SH;
          return HOOK;
        }
      }
      return null;
    }
    // 爪尖（最底部 1-2 行）
    return null;
  });
}

/** 金币图标算法：圆形金币 + 边缘暗光 + 中央 "$" 装饰 */
function makeCoinIcon(W, H) {
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const R = Math.min(W, H) / 2 - 1;

  const COIN_HL = '#FFFEDA';
  const COIN_LT = '#FFF8B0';
  const COIN_MID = '#FFD700';
  const COIN_DK = '#DAA520';
  const COIN_SH = '#A8830C';
  const COIN_OL = '#604808';

  // 中央 "$" 简化版：竖线 + 上下两道横线
  function isDollar(x, y) {
    const dx = x - cx;
    const dy = y - cy;
    if (Math.abs(dx) < 0.7 && Math.abs(dy) < R * 0.55) return true;  // 竖线
    if (Math.abs(dx) < R * 0.3 && Math.abs(dy + R * 0.35) < 0.7) return true;  // 上横
    if (Math.abs(dx) < R * 0.3 && Math.abs(dy - R * 0.35) < 0.7) return true;  // 下横
    return false;
  }

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > R) return null;
    if (r > R - 1) return COIN_OL;
    if (r > R - 2) return COIN_SH;
    // "$" 字符
    if (isDollar(x, y)) return COIN_OL;
    // 内部光照（左上亮）
    if (dy < -R * 0.4 && dx < R * 0.3) return COIN_HL;
    if (dy < -R * 0.1 && dx < R * 0.3) return COIN_LT;
    if (dy < R * 0.3 && dx < R * 0.3) return COIN_MID;
    if (dx > R * 0.3) return COIN_DK;
    return COIN_MID;
  });
}

// ==================== HD 精灵列表 ====================

// 金块共用调色板（与 classic.json 中现有 GOLD_LARGE_HD 一致）
const GOLD_PALETTE = {
  HIGHLIGHT: '#FFFEDA',
  LIGHT: '#FFF8B0',
  BRIGHT: '#FFE556',
  MID: '#FFD700',
  DARK: '#DAA520',
  SHADOW: '#A8830C',
  OUTLINE: '#604808',
};

const SPRITES_TO_GENERATE = {
  GOLD_SMALL: () => toSpriteJson(makeGoldNugget(24, 24, GOLD_PALETTE), 1),
  GOLD_MEDIUM: () => toSpriteJson(makeGoldNugget(36, 36, GOLD_PALETTE), 1),
  DIAMOND_SPRITE: () => toSpriteJson(makeDiamond(24, 24), 1),
  STONE_SPRITE: () => toSpriteJson(makeStone(36, 36), 1),
  CRYSTAL_ORE_SPRITE: () => toSpriteJson(makeCrystalOre(24, 24), 1),
  CRAB_SHELL_SPRITE: () => toSpriteJson(makeCrabShell(30, 30), 1),
  PIGGY_GEM_SPRITE: () => toSpriteJson(makePiggyGem(36, 36), 1),
  HOOK_SPRITE: () => toSpriteJson(makeHook(33, 36), 1),
  COIN_ICON: () => toSpriteJson(makeCoinIcon(24, 24), 1),
};

// ==================== 主流程：patch classic.json ====================

const classicJson = JSON.parse(fs.readFileSync(CLASSIC_JSON, 'utf-8'));
const stats = [];

for (const [name, generator] of Object.entries(SPRITES_TO_GENERATE)) {
  const sprite = generator();
  if (!classicJson.sprites[name]) {
    console.warn(`⚠️  ${name} 不在 classic.json 中，跳过`);
    continue;
  }
  classicJson.sprites[name] = sprite;
  stats.push({
    name,
    size: `${sprite.pixels[0].length}×${sprite.pixels.length}`,
    colors: Object.keys(sprite.palette).length,
  });
}

fs.writeFileSync(CLASSIC_JSON, JSON.stringify(classicJson, null, 2));

console.log('✅ HD 精灵已写入 classic.json:');
for (const s of stats) {
  console.log(`  ${s.name.padEnd(18)} ${s.size.padEnd(8)} ${s.colors} 色`);
}
