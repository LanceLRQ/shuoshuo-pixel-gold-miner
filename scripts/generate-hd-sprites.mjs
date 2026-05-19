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
