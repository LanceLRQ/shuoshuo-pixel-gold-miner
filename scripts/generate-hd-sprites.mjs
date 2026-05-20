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

/**
 * PixelMap (颜色数组) → { palette, pixels, displayWidth?, displayHeight? } 块
 *
 * HD 精度方案：pixelMap 是 96×96 的高密度数据，但 displayWidth/Height 让游戏画布
 * 仍按原尺寸渲染（如 24×24）。当 displayWidth/Height 与 PixelMap 尺寸一致时省略字段。
 */
function toSpriteJson(pixelMap, scale = 1, displayWidth, displayHeight) {
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
  const out = { scale, palette, pixels };
  const w = pixels[0]?.length ?? 0;
  const h = pixels.length;
  if (typeof displayWidth === 'number' && displayWidth > 0 && displayWidth !== w) {
    out.displayWidth = displayWidth;
  }
  if (typeof displayHeight === 'number' && displayHeight > 0 && displayHeight !== h) {
    out.displayHeight = displayHeight;
  }
  return out;
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

/**
 * 钩爪算法：保留原版 10×12 钩爪几何（绳→主杆→T头→主体→中杆+两侧爪散开→爪尖延伸）
 * 关键特征：
 *   - 主体最宽 (~60% 总宽)
 *   - 三叉爪分裂：中杆短（branch 段消失），两侧爪持续向外散开到底部
 *   - 金属反光：左明右暗（圆柱形质感）
 */
function makeHook(W = 30, H = 36) {
  const cx = (W - 1) / 2;

  // 颜色（5 档金属 + 2 档绳子）
  const ROPE = '#DEB887';
  const ROPE_DK = '#A07840';
  const HOOK = '#D0D0D0';
  const HOOK_HL = '#FFFFFF';
  const HOOK_DK = '#808080';
  const HOOK_SH = '#3F3F3F';

  // 按原版 12 行结构划分（每段 3 行 HD）
  const ropeEnd = H * 0.083;     // 绳子末端 y=3
  const stemEnd = H * 0.333;     // 主杆 y=4-11
  const headEnd = H * 0.417;     // T 头部 y=12-14
  const mainEnd = H * 0.5;       // 主体 y=15-17
  const branchEnd = H * 0.667;   // 三叉张开 y=18-23
  const tipsStart = H * 0.667;   // 爪尖延伸起 y=24

  // 半宽配置（按原版形状缩放）
  const stemHalfW = W * 0.1;      // 主杆 ~3 px
  const headHalfW = W * 0.2;      // T 头 ~6 px
  const mainHalfW = W * 0.3;      // 主体 ~9 px

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx;
    const adx = Math.abs(dx);

    // 1. 顶部绳子（中央 2 像素宽 + 编织纹）
    if (y < ropeEnd) {
      if (adx < 1.2) {
        if (y % 2 === 0 && adx > 0.4) return ROPE_DK;
        return ROPE;
      }
      return null;
    }

    // 2. 主杆（中央 ~3 像素宽，圆柱反光左明右暗）
    if (y < stemEnd) {
      if (adx >= stemHalfW + 0.5) return null;
      if (dx < -stemHalfW * 0.6) return HOOK_HL;
      if (dx < stemHalfW * 0.3) return HOOK;
      if (dx < stemHalfW * 0.7) return HOOK_DK;
      return HOOK_SH;
    }

    // 3. T 头部（加宽到 ~6 像素，加斜阴影）
    if (y < headEnd) {
      if (adx >= headHalfW + 0.5) return null;
      if (adx >= headHalfW - 0.5) return HOOK_SH;
      if (adx >= headHalfW - 1.5) return HOOK_DK;
      if (dx < -headHalfW * 0.4) return HOOK_HL;
      if (dx < headHalfW * 0.4) return HOOK;
      return HOOK_DK;
    }

    // 4. 主体（最宽 ~9 像素，顶部高光弧）
    if (y < mainEnd) {
      if (adx >= mainHalfW + 0.5) return null;
      if (adx >= mainHalfW - 0.5) return HOOK_SH;
      if (adx >= mainHalfW - 1.5) return HOOK_DK;
      // 顶部弧形高光
      if (y < mainEnd - (mainEnd - headEnd) * 0.6 && adx < mainHalfW * 0.5) return HOOK_HL;
      if (dx < -mainHalfW * 0.3) return HOOK_HL;
      if (dx < mainHalfW * 0.4) return HOOK;
      return HOOK_DK;
    }

    // 5. 三叉张开 (中间杆 + 两侧爪起始向外散)
    if (y < branchEnd) {
      const t = (y - mainEnd) / (branchEnd - mainEnd);  // 0..1
      // 5a. 中间小杆（2 像素宽，仅在前半段存在）
      if (t < 0.5 && adx < stemHalfW + 0.3) {
        if (dx < -stemHalfW * 0.3) return HOOK_HL;
        if (dx < stemHalfW * 0.5) return HOOK;
        return HOOK_DK;
      }
      // 5b. 左爪 + 右爪（从 main 外侧向外斜散）
      // 左爪中心 x: 起 -mainHalfW * 0.7, 终 -mainHalfW * 1.1
      const leftCx = -mainHalfW * 0.7 - mainHalfW * 0.4 * t;
      const rightCx = mainHalfW * 0.7 + mainHalfW * 0.4 * t;
      const armW = 1.6;
      const dl = dx - leftCx;
      const dr = dx - rightCx;
      if (Math.abs(dl) < armW) {
        // 描边在右内侧（朝主轴方向暗，朝外亮）
        if (dl > armW - 0.7) return HOOK_DK;
        if (dl > armW - 1.4) return HOOK;
        return HOOK_HL;
      }
      if (Math.abs(dr) < armW) {
        if (dr < -armW + 0.7) return HOOK_DK;
        if (dr < -armW + 1.4) return HOOK;
        return HOOK_HL;
      }
      return null;
    }

    // 6. 爪尖延伸（只剩两侧爪，向外继续散开 + 渐细 + 钩头收尖）
    if (y < H) {
      const t = (y - tipsStart) / (H - tipsStart);  // 0..1
      // 左爪 x：起 -mainHalfW * 1.1, 终 -mainHalfW * 1.6（更外）
      const leftCx = -mainHalfW * 1.1 - mainHalfW * 0.5 * t;
      const rightCx = mainHalfW * 1.1 + mainHalfW * 0.5 * t;
      // 爪宽渐细（钩尖效果）
      const armW = 1.6 - t * 0.9;  // 1.6 → 0.7
      const dl = dx - leftCx;
      const dr = dx - rightCx;
      if (Math.abs(dl) < armW) {
        if (dl > armW - 0.6) return HOOK_DK;
        return HOOK;
      }
      if (Math.abs(dr) < armW) {
        if (dr < -armW + 0.6) return HOOK_DK;
        return HOOK;
      }
      return null;
    }
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

/** 老鼠：侧面朝右，椭圆身体 + 圆头 + 尖鼻 + 长尾 + 粉耳 */
function makeMouse(W, H) {
  const cy = H / 2;
  const bodyCx = W * 0.42;  // 身体中心
  const bodyRx = W * 0.28;
  const bodyRy = H * 0.32;
  const headCx = W * 0.18;  // 头部中心
  const headRx = W * 0.13;
  const headRy = H * 0.27;
  const tailStartX = bodyCx + bodyRx;  // 尾巴起点

  const M_BODY = '#8B6914';
  const M_BELLY = '#D2B48C';
  const M_EAR = '#FFB6C1';
  const M_NOSE = '#FF6B6B';
  const M_EYE = '#000000';
  const M_HL = '#A88830';
  const M_SH = '#5D4708';
  const M_OL = '#2A2003';

  return generateGrid(W, H, (x, y) => {
    // 尾巴：从 tailStartX 向右斜上的曲线
    const tailY = cy + 2 * Math.sin((x - tailStartX) * 0.4);
    if (x > tailStartX && x < W && Math.abs(y - tailY) < 1) {
      return M_OL;
    }
    if (x > tailStartX && x < W && Math.abs(y - tailY) < 2) {
      return M_BODY;
    }

    // 身体椭圆
    const bdx = x - bodyCx, bdy = y - cy;
    const bD = (bdx * bdx) / (bodyRx * bodyRx) + (bdy * bdy) / (bodyRy * bodyRy);
    // 头部椭圆
    const hdx = x - headCx, hdy = y - cy;
    const hD = (hdx * hdx) / (headRx * headRx) + (hdy * hdy) / (headRy * headRy);

    const inBody = bD <= 1.0;
    const inHead = hD <= 1.0;

    if (!inBody && !inHead) {
      // 耳朵：头顶上方
      const earCx1 = headCx + headRx * 0.5;
      const earCy = cy - headRy * 0.7;
      const eDx = x - earCx1, eDy = y - earCy;
      if (eDx * eDx + eDy * eDy < 4) return M_EAR;
      return null;
    }

    // 描边（接近边缘）
    if (inBody && bD > 0.85) return M_OL;
    if (inHead && hD > 0.85) return M_OL;
    if (inBody && bD > 0.72) return M_SH;
    if (inHead && hD > 0.72) return M_SH;

    // 眼睛：头部前部
    const eyeX = headCx - headRx * 0.3;
    const eyeY = cy - headRy * 0.2;
    if (Math.abs(x - eyeX) < 1 && Math.abs(y - eyeY) < 1.2) return M_EYE;

    // 鼻尖：头部最左侧
    if (inHead && hdx < -headRx * 0.85) return M_NOSE;

    // 腹部（下半部浅色）
    if (inBody && bdy > bodyRy * 0.2) return M_BELLY;
    if (inHead && hdy > headRy * 0.3) return M_BELLY;

    // 高光（顶部）
    if ((inBody || inHead) && bdy < -bodyRy * 0.5) return M_HL;

    return M_BODY;
  });
}

/** 鼹鼠：圆滚正面，大粉鼻头 + 黑眼 + 利爪 */
function makeMole(W, H) {
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const bodyR = Math.min(W, H) * 0.42;

  const ML_BODY = '#6B4226';
  const ML_BELLY = '#C4A882';
  const ML_NOSE = '#FF69B4';
  const ML_NOSE_HL = '#FFB6E5';
  const ML_EYE = '#000000';
  const ML_CLAW = '#F0F0F0';
  const ML_HL = '#8B5A36';
  const ML_SH = '#3F2410';
  const ML_OL = '#1A0F06';

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy;
    // 身体圆形
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > bodyR) {
      // 利爪：底部左右两侧
      if (dy > bodyR * 0.6 && dy < bodyR * 1.1) {
        if (Math.abs(dx + bodyR * 0.5) < 1) return ML_CLAW;
        if (Math.abs(dx - bodyR * 0.5) < 1) return ML_CLAW;
      }
      return null;
    }
    // 边缘描边
    if (r > bodyR - 1) return ML_OL;
    if (r > bodyR - 2) return ML_SH;

    // 大粉鼻头（中央偏下）
    const noseDx = dx, noseDy = dy + bodyR * 0.05;
    const noseR = bodyR * 0.18;
    if (noseDx * noseDx + noseDy * noseDy < noseR * noseR) {
      if (noseDx * noseDx + (noseDy + 1) * (noseDy + 1) < 2) return ML_NOSE_HL;
      return ML_NOSE;
    }

    // 双眼
    const eyeY = cy - bodyR * 0.3;
    if (Math.abs(y - eyeY) < 1.5) {
      if (Math.abs(x - (cx - bodyR * 0.35)) < 1.2) return ML_EYE;
      if (Math.abs(x - (cx + bodyR * 0.35)) < 1.2) return ML_EYE;
    }

    // 腹部（下半浅色）
    if (dy > bodyR * 0.25 && Math.abs(dx) < bodyR * 0.6) return ML_BELLY;

    // 顶部高光（光照来自上方）
    if (dy < -bodyR * 0.5 && Math.abs(dx) < bodyR * 0.4) return ML_HL;

    return ML_BODY;
  });
}

/** 骨头：横向，两端关节球 + 中段细 + 米黄渐变 */
function makeBone(W, H) {
  const cy = (H - 1) / 2;
  const knobR = H * 0.42;  // 端部关节球半径
  const knobLeftCx = knobR + 1;
  const knobRightCx = W - knobR - 2;
  const stemH = H * 0.45;  // 中段粗细

  const B_BODY = '#F5F5DC';
  const B_HL = '#FFFFF0';
  const B_SH = '#C8C0A0';
  const B_DK = '#9B9474';
  const B_OL = '#5C5740';

  return generateGrid(W, H, (x, y) => {
    const dy = y - cy;

    // 关节球（两侧各两个 — 上下两个突起组成 H 形）
    function inKnob(cxK) {
      const dxK = x - cxK;
      // 上球
      const upDy = dy + knobR * 0.4;
      if (dxK * dxK + upDy * upDy < knobR * knobR) return 'in';
      // 下球
      const dnDy = dy - knobR * 0.4;
      if (dxK * dxK + dnDy * dnDy < knobR * knobR) return 'in';
      return null;
    }
    const inLK = inKnob(knobLeftCx);
    const inRK = inKnob(knobRightCx);

    // 中段（细杆）
    const inStem = x > knobLeftCx && x < knobRightCx && Math.abs(dy) < stemH / 2;

    if (!inLK && !inRK && !inStem) return null;

    // 边缘描边判定
    function isEdge() {
      if (inLK || inRK) {
        const cxK = inLK ? knobLeftCx : knobRightCx;
        const dxK = x - cxK;
        const upDy = dy + knobR * 0.4;
        const dnDy = dy - knobR * 0.4;
        const upR = Math.sqrt(dxK * dxK + upDy * upDy);
        const dnR = Math.sqrt(dxK * dxK + dnDy * dnDy);
        return Math.min(upR, dnR) > knobR - 1;
      }
      // 中段
      return Math.abs(dy) > stemH / 2 - 1;
    }
    if (isEdge()) return B_OL;

    // 顶部高光
    if (dy < -knobR * 0.4) return B_HL;
    if (dy < 0) return B_BODY;
    if (dy < knobR * 0.3) return B_SH;
    return B_DK;
  });
}

/** 炸弹：黑铁球 + 反光 + 引信 + 火花 */
function makeBomb(W, H) {
  const cx = (W - 1) / 2;
  const bodyCy = H * 0.62;
  const bodyR = Math.min(W, H) * 0.36;
  const fuseTopY = H * 0.18;

  const BMB_BODY = '#2A2A2A';
  const BMB_HL = '#5A5A5A';
  const BMB_DK = '#000000';
  const FUSE = '#5C3317';
  const SPARK = '#FFFF00';
  const SPARK2 = '#FF4400';

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx;
    // 火花（顶部）
    if (y < fuseTopY) {
      const sDx = x - cx, sDy = y - fuseTopY * 0.3;
      const sR = Math.sqrt(sDx * sDx + sDy * sDy);
      if (sR < 2) return SPARK;
      if (sR < 3.5) return SPARK2;
      return null;
    }
    // 引信（弯曲）
    const fuseY = fuseTopY + (H * 0.22 - fuseTopY) * 0.5;
    if (y < bodyCy - bodyR + 1) {
      const fuseCurveX = cx + 1.5 * Math.sin((y - fuseTopY) * 0.5);
      if (Math.abs(x - fuseCurveX) < 0.8) return FUSE;
      return null;
    }
    // 炸弹球体
    const bdx = x - cx, bdy = y - bodyCy;
    const r = Math.sqrt(bdx * bdx + bdy * bdy);
    if (r > bodyR) return null;
    if (r > bodyR - 1) return BMB_DK;
    // 左上反光（小高光圆）
    const hlDx = x - (cx - bodyR * 0.4);
    const hlDy = y - (bodyCy - bodyR * 0.4);
    if (hlDx * hlDx + hlDy * hlDy < 4) return BMB_HL;
    return BMB_BODY;
  });
}

/** 神秘袋：麻布袋 + 红绳系口 + 中央金币凸起 */
function makeMysteryBag(W, H) {
  const cx = (W - 1) / 2;
  const bagTopY = H * 0.22;
  const tieY = H * 0.30;
  const bagBotY = H * 0.92;

  const BAG = '#B8860B';
  const BAG_HL = '#D9A028';
  const BAG_SH = '#7F5C08';
  const TIE = '#8B0000';
  const TIE_HL = '#C03030';
  const COIN = '#FFD700';
  const COIN_HL = '#FFF8B0';
  const OUTLINE = '#3F2A02';

  return generateGrid(W, H, (x, y) => {
    const dx = x - cx;
    // 红绳系口
    if (y >= tieY - 1 && y <= tieY + 1) {
      const halfW = W * 0.30;
      if (Math.abs(dx) < halfW) {
        if (y === Math.floor(tieY)) return TIE_HL;
        return TIE;
      }
    }
    // 袋口（窄）
    if (y < tieY) {
      const halfW = W * 0.18 + (y - bagTopY) * 0.4;
      if (Math.abs(dx) < halfW) {
        if (y < bagTopY) return null;
        if (Math.abs(dx) > halfW - 1) return OUTLINE;
        return BAG_SH;
      }
      return null;
    }
    // 袋身（宽，弧形底）
    if (y < bagBotY) {
      const t = (y - tieY) / (bagBotY - tieY);
      const halfW = W * 0.32 + W * 0.10 * Math.sin(t * Math.PI);
      if (Math.abs(dx) < halfW) {
        if (Math.abs(dx) > halfW - 1) return OUTLINE;
        if (Math.abs(dx) > halfW - 2) return BAG_SH;
        // 中央金币凸起
        const cnDx = x - cx;
        const cnDy = y - H * 0.6;
        if (cnDx * cnDx + cnDy * cnDy < 9) {
          if (cnDx * cnDx + (cnDy + 1) * (cnDy + 1) < 2) return COIN_HL;
          return COIN;
        }
        // 左明右暗
        if (dx < 0) return BAG_HL;
        return BAG;
      }
    }
    return null;
  });
}

/** 木箱：木纹 + 铁皮包角 + 中央锁扣 */
function makeWoodenBox(W, H) {
  const margin = 1;
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;

  const WOOD = '#8B4513';
  const WOOD_HL = '#B0732F';
  const WOOD_DK = '#5C2F0A';
  const METAL = '#C0C0C0';
  const METAL_HL = '#FFFFFF';
  const METAL_DK = '#606060';
  const LOCK = '#DAA520';
  const OUTLINE = '#2A1305';

  // 包角占据角落 4×4 区域
  const cornerSize = Math.floor(W * 0.18);

  return generateGrid(W, H, (x, y) => {
    if (x < margin || x >= W - margin || y < margin || y >= H - margin) return null;
    // 边缘描边
    if (x === margin || x === W - margin - 1 || y === margin || y === H - margin - 1) {
      return OUTLINE;
    }
    // 铁皮包角
    const inCorner =
      (x < margin + cornerSize && y < margin + cornerSize) ||
      (x >= W - margin - cornerSize && y < margin + cornerSize) ||
      (x < margin + cornerSize && y >= H - margin - cornerSize) ||
      (x >= W - margin - cornerSize && y >= H - margin - cornerSize);
    if (inCorner) {
      if (x === margin + 1 || x === W - margin - 2 || y === margin + 1 || y === H - margin - 2) {
        return METAL_DK;
      }
      // 包角内部一个高光斑
      const inThisCorner = (x < W / 2) ? (y < H / 2) : (y < H / 2);
      if ((x % 3 === 0) && (y % 3 === 0)) return METAL_HL;
      return METAL;
    }
    // 中央锁扣（小金色圆）
    const ldx = x - cx, ldy = y - cy;
    if (ldx * ldx + ldy * ldy < 5) return LOCK;
    // 木纹横线（每 3 行一条暗纹）
    if (y % 3 === 0) return WOOD_DK;
    // 左明右暗
    if (x < cx) return WOOD_HL;
    return WOOD;
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

/**
 * HD 精度方案：所有 sprite 升级到 96×96 PixelMap（非正方形按比例最长边 96），
 * displayWidth/Height 保持原显示尺寸 → 游戏布局/碰撞零改动，细节翻 5-16 倍。
 *
 * 配置：[PixelMap 尺寸, 显示尺寸] = [新精度, 老显示]
 */
const HD = 96;
const SPRITES_TO_GENERATE = {
  // 正方形 96×96 内画图，按 displayWidth/Height 缩到原显示尺寸
  GOLD_SMALL:         () => toSpriteJson(makeGoldNugget(HD, HD, GOLD_PALETTE), 1, 24, 24),
  GOLD_MEDIUM:        () => toSpriteJson(makeGoldNugget(HD, HD, GOLD_PALETTE), 1, 36, 36),
  GOLD_LARGE:         () => toSpriteJson(makeGoldNugget(HD, HD, GOLD_PALETTE), 1, 48, 48),
  DIAMOND_SPRITE:     () => toSpriteJson(makeDiamond(HD, HD), 1, 24, 24),
  STONE_SPRITE:       () => toSpriteJson(makeStone(HD, HD), 1, 36, 36),
  CRYSTAL_ORE_SPRITE: () => toSpriteJson(makeCrystalOre(HD, HD), 1, 24, 24),
  CRAB_SHELL_SPRITE:  () => toSpriteJson(makeCrabShell(HD, HD), 1, 30, 30),
  PIGGY_GEM_SPRITE:   () => toSpriteJson(makePiggyGem(HD, HD), 1, 36, 36),
  COIN_ICON:          () => toSpriteJson(makeCoinIcon(HD, HD), 1, 24, 24),
  BOMB_SPRITE:        () => toSpriteJson(makeBomb(HD, HD), 1, 24, 24),
  MYSTERY_BAG:        () => toSpriteJson(makeMysteryBag(HD, HD), 1, 24, 24),
  WOODEN_BOX_SPRITE:  () => toSpriteJson(makeWoodenBox(HD, HD), 1, 24, 24),
  // 非正方形：按原长宽比把最长边放大到 96
  HOOK_SPRITE:        () => toSpriteJson(makeHook(80, HD), 1, 30, 36),   // 30:36 → 80:96
  MOUSE_SPRITE:       () => toSpriteJson(makeMouse(HD, 64), 1, 36, 24),  // 36:24 → 96:64
  MOLE_SPRITE:        () => toSpriteJson(makeMole(HD, 80), 1, 36, 30),   // 36:30 → 96:80
  BONE_SPRITE:        () => toSpriteJson(makeBone(HD, 48), 1, 36, 18),   // 36:18 → 96:48
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

// ==================== 同步到 shuoshuo-crystal.json（保留矿工 5 态） ====================

const CRYSTAL_JSON = path.join(ROOT, 'src/assets/themes/shuoshuo-crystal.json');
const MINER_KEYS = ['MINER_IDLE', 'MINER_PULL', 'MINER_HAPPY', 'MINER_SAD', 'MINER_STRAIN'];

const crystalJson = JSON.parse(fs.readFileSync(CRYSTAL_JSON, 'utf-8'));
const preservedMiners = {};
for (const k of MINER_KEYS) {
  if (crystalJson.sprites[k]) preservedMiners[k] = crystalJson.sprites[k];
}

// 用 classic.json 的所有 sprite 覆盖（深拷贝避免共享引用）
crystalJson.sprites = JSON.parse(JSON.stringify(classicJson.sprites));
// 恢复矿工 5 态
for (const [k, v] of Object.entries(preservedMiners)) {
  crystalJson.sprites[k] = v;
}

fs.writeFileSync(CRYSTAL_JSON, JSON.stringify(crystalJson, null, 2));
console.log(`\n🔄 shuoshuo-crystal.json 已同步 ${Object.keys(classicJson.sprites).length - MINER_KEYS.length} 个非矿工精灵（矿工 5 态保留）`);
