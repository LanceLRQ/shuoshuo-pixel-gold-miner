#!/usr/bin/env node
/**
 * ⚠️ DO NOT RUN — 一次性迁移脚本，sprites.ts 已删除（2026-05-19）
 *
 * 历史用途：sprites.ts (TS 常量定义) → themes/{theme}.json (现行 source of truth)
 * 保留原因：作为 PNG → JSON 工作流的参考实现
 *
 * 设计要点：
 *   - 每个 sprite 自带 palette（局部调色板），单字符 key
 *   - 字符约定：'.' 强制为透明，[A-Za-z0-9!@#$%^&*+=<>?~-] 可作 palette key
 *   - 单个 sprite 最多 ~90 色，总色数无上限（不同 sprite 字符不冲突）
 *   - 未来超 90 色：增加 "format": "v2" 双字符模式，loader 兼容
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SPRITES_TS = path.join(ROOT, 'src/assets/sprites.ts');
const THEMES_DIR = path.join(ROOT, 'src/assets/themes');
const CLASSIC_TS = path.join(ROOT, 'src/assets/theme/classic.ts');
const CRYSTAL_TS = path.join(ROOT, 'src/assets/theme/shuoshuo-crystal.ts');

// 单字符调色板字符集（顺序就是分配优先级，常用色拿易记字符）
// 排除 '.' 保留给透明
const PALETTE_CHARS = (
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789' +
  '!@#$%^&*+=<>?~-'
).split('');

// ==================== 1. 解析 sprites.ts 颜色字典 ====================

const spritesSrc = fs.readFileSync(SPRITES_TS, 'utf-8');

const colorDict = {};
for (const m of spritesSrc.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'(#[0-9A-Fa-f]+)'\s*;/g)) {
  colorDict[m[1]] = m[2].toUpperCase();
}
console.log(`📋 解析到 ${Object.keys(colorDict).length} 个颜色常量`);

// ==================== 2. 解析每个 PixelMap 导出 ====================

const sprites = {};
const spriteExportRE = /export\s+const\s+([A-Z_][A-Z0-9_]*)\s*:\s*PixelMap\s*=\s*(\[[\s\S]*?\n\];)/g;

for (const m of spritesSrc.matchAll(spriteExportRE)) {
  const name = m[1];
  let body = m[2];
  // 替换颜色常量：长名字优先防止 GOLD 被 GOLD_DARK 误伤
  const sortedNames = Object.keys(colorDict).sort((a, b) => b.length - a.length);
  for (const constName of sortedNames) {
    body = body.replace(new RegExp(`\\b${constName}\\b`, 'g'), `'${colorDict[constName]}'`);
  }
  let pixelMap;
  try {
    pixelMap = eval(body);
  } catch (e) {
    console.error(`❌ ${name} eval 失败:`, e.message);
    process.exit(1);
  }
  // 规范化：源数据可能列数不齐（如 HOOK_SPRITE 原始 bug），统一到最大列数 + 短行补 0
  const maxW = Math.max(...pixelMap.map(r => r.length));
  const normalized = pixelMap.map(row => {
    if (row.length === maxW) return row;
    return [...row, ...new Array(maxW - row.length).fill(0)];
  });
  const padded = pixelMap.some((r, i) => r.length !== normalized[i].length);
  if (padded) console.log(`  ⚙️  ${name} 列数对齐到 ${maxW}（修补历史不齐）`);
  sprites[name] = normalized;
}
console.log(`🎨 解析到 ${Object.keys(sprites).length} 个精灵`);

// ==================== 3. 解析主题入口（HD 替换 + scale 覆盖） ====================

const classicSrc = fs.readFileSync(CLASSIC_TS, 'utf-8');
const classicHdMap = {};
const classicHdBlock = classicSrc.match(/HD_CLASSIC_SPRITES[^{]*\{([\s\S]*?)\};/);
if (classicHdBlock) {
  for (const m of classicHdBlock[1].matchAll(/(\w+):\s*(\w+)/g)) {
    classicHdMap[m[1]] = m[2];
  }
}
console.log(`🔵 classic 主题 HD 替换: ${Object.keys(classicHdMap).length} 个`);

const classicScaleOverrides = {};
const classicScaleMatch = classicSrc.match(/HD_SCALE_OVERRIDES[^{]*\{([\s\S]*?)\};/);
if (classicScaleMatch) {
  for (const m of classicScaleMatch[1].matchAll(/(\w+):\s*(\d+)/g)) {
    classicScaleOverrides[m[1]] = parseInt(m[2], 10);
  }
}

const crystalSrc = fs.readFileSync(CRYSTAL_TS, 'utf-8');
const crystalSprites = {};
const crystalMinerMatch = crystalSrc.match(/const\s+MINER_SPRITE\s*:\s*PixelMap\s*=\s*(\[[\s\S]*?\n\])/);
if (crystalMinerMatch) {
  crystalSprites['MINER_SPRITE'] = eval(crystalMinerMatch[1]);
}
const crystalAltMap = {};
const crystalAltMatch = crystalSrc.match(/ALTERNATE_SPRITES[^{]*\{([\s\S]*?)\};/);
if (crystalAltMatch) {
  for (const m of crystalAltMatch[1].matchAll(/(MINER_\w+):\s*MINER_SPRITE/g)) {
    crystalAltMap[m[1]] = 'MINER_SPRITE';
  }
}

// ==================== 4. 工具函数 ====================

/** 收集 PixelMap 用到的颜色 → 字符 分配 */
function buildSpritePalette(pixelMap) {
  const usage = new Map();
  for (const row of pixelMap) {
    for (const cell of row) {
      if (cell === 0) continue;
      usage.set(cell, (usage.get(cell) || 0) + 1);
    }
  }
  const sorted = Array.from(usage.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length > PALETTE_CHARS.length) {
    throw new Error(`单 sprite 调色板溢出: ${sorted.length} > ${PALETTE_CHARS.length}（需升级到 v2 双字符）`);
  }
  const palette = {};
  const colorToChar = new Map();
  sorted.forEach(([hex], i) => {
    const ch = PALETTE_CHARS[i];
    palette[ch] = hex;
    colorToChar.set(hex, ch);
  });
  return { palette, colorToChar };
}

/** PixelMap → ASCII 字符串数组 */
function pixelMapToAscii(pixelMap, colorToChar) {
  return pixelMap.map(row => row.map(cell => {
    if (cell === 0) return '.';
    const ch = colorToChar.get(cell);
    if (!ch) throw new Error(`未找到 ${cell} 的字符映射`);
    return ch;
  }).join(''));
}

/** 构建主题 sprites JSON 块 */
function buildSpritesJson(spriteData, scaleOverrides) {
  const out = {};
  for (const [name, pm] of Object.entries(spriteData)) {
    if (!pm) {
      console.warn(`⚠️  ${name} 数据为空，跳过`);
      continue;
    }
    const { palette, colorToChar } = buildSpritePalette(pm);
    out[name] = {
      scale: scaleOverrides[name] ?? 3,
      palette,
      pixels: pixelMapToAscii(pm, colorToChar),
    };
  }
  return out;
}

// ==================== 5. 主题精灵集合 ====================

const ALL_SPRITE_NAMES = [
  'MINER_IDLE', 'MINER_PULL', 'MINER_HAPPY', 'MINER_SAD', 'MINER_STRAIN',
  'HOOK_SPRITE',
  'GOLD_SMALL', 'GOLD_MEDIUM', 'GOLD_LARGE',
  'DIAMOND_SPRITE', 'STONE_SPRITE', 'BOMB_SPRITE', 'MYSTERY_BAG',
  'BONE_SPRITE', 'MOUSE_SPRITE', 'MOLE_SPRITE',
  'CRYSTAL_ORE_SPRITE', 'CRAB_SHELL_SPRITE', 'PIGGY_GEM_SPRITE',
  'WOODEN_BOX_SPRITE',
  'COIN_ICON',
];

const BACKGROUND_CLASSIC = {
  skyTop: '#87CEEB',
  skyBottom: '#B0E0FF',
  groundColor: '#4CAF50',
  groundDark: '#388E3C',
  groundLight: '#66BB6A',
  dirtLight: '#8B6914',
  dirtMid: '#6B4C12',
  dirtDark: '#4A3508',
  rockColor: '#5D4E37',
  rockDark: '#3E3226',
};

// ==================== 6. classic 主题 ====================

const classicSpriteData = {};
for (const name of ALL_SPRITE_NAMES) {
  if (!sprites[name]) { console.warn(`⚠️  ${name} 未找到`); continue; }
  const hdName = classicHdMap[name];
  classicSpriteData[name] = hdName ? sprites[hdName] : sprites[name];
}

const classicJson = {
  id: 'classic',
  name: '经典',
  description: '黄金矿工原味配色（矿工 5 态 + 大金块 HD）',
  sprites: buildSpritesJson(classicSpriteData, classicScaleOverrides),
  background: BACKGROUND_CLASSIC,
};

// ==================== 7. shuoshuo-crystal 主题 ====================

const crystalSpriteData = {};
for (const name of ALL_SPRITE_NAMES) {
  if (crystalAltMap[name]) {
    crystalSpriteData[name] = crystalSprites['MINER_SPRITE'];
  } else if (sprites[name]) {
    crystalSpriteData[name] = sprites[name];
  }
}

const crystalJson = {
  id: 'shuoshuo_crystal',
  name: '说说Crystal',
  description: '说说Crystal 矿工形象（其他矿物与背景同 classic）',
  sprites: buildSpritesJson(crystalSpriteData, {}),
  background: BACKGROUND_CLASSIC,
};

// ==================== 8. 写文件 ====================

if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true });
fs.writeFileSync(path.join(THEMES_DIR, 'classic.json'), JSON.stringify(classicJson, null, 2));
fs.writeFileSync(path.join(THEMES_DIR, 'shuoshuo-crystal.json'), JSON.stringify(crystalJson, null, 2));

// 统计
const classicMaxColors = Math.max(...Object.values(classicJson.sprites).map(s => Object.keys(s.palette).length));
const crystalMaxColors = Math.max(...Object.values(crystalJson.sprites).map(s => Object.keys(s.palette).length));
console.log('\n✅ 转换完成（每 sprite 独立调色板）:');
console.log(`  classic.json: ${Object.keys(classicJson.sprites).length} 精灵，最大单 sprite 用色 ${classicMaxColors}/${PALETTE_CHARS.length}`);
console.log(`  shuoshuo-crystal.json: ${Object.keys(crystalJson.sprites).length} 精灵，最大单 sprite 用色 ${crystalMaxColors}/${PALETTE_CHARS.length}`);
