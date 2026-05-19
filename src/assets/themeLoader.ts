/**
 * 主题 JSON 加载器
 *
 * 把 themes/*.json 解析为 ThemeDefinition：
 *  - 每个 sprite 自带调色板（key 单字符 → hex 颜色）
 *  - pixels 是 ASCII 字符串数组，每字符 = 一个像素
 *  - 透明强制用 '.'（不可作 palette key）
 *  - 单 sprite 最多支持 PALETTE_CHARS 个不同颜色（当前 ~90，未来 v2 双字符可扩展）
 *
 * 详见 src/assets/themes/README.md
 */

import type { PixelColor, PixelMap } from './types';
import type { ThemeDefinition, BackgroundColors } from './theme/types';

/** JSON 中单个 sprite 的描述 */
export interface SpriteJson {
  /** 缓存放大倍数：HD 精灵通常 1（数据 = 显示），普通 3 */
  scale: number;
  /** 局部调色板：单字符 → '#RRGGBB' hex 颜色 */
  palette: Record<string, string>;
  /** 像素数据：每行一个字符串，每字符代表一个像素（'.' = 透明） */
  pixels: string[];
}

/** 完整主题 JSON 结构 */
export interface ThemeJson {
  id: string;
  name: string;
  description: string;
  sprites: Record<string, SpriteJson>;
  background: BackgroundColors;
}

/** 透明像素的固定字符（不可作 palette key） */
const TRANSPARENT_CHAR = '.';

/** 加载失败时的占位精灵：8×8 品红/黑棋盘格（"missing texture" 模式，肉眼一眼可辨） */
const MISSING_SPRITE: PixelMap = Array.from({ length: 8 }, (_, y) =>
  Array.from({ length: 8 }, (_, x) => ((x + y) % 2 === 0 ? '#FF00FF' : '#000000'))
);

/**
 * 把单个 SpriteJson 解析为 PixelMap
 * @throws 当格式不合法时（被 loadTheme 的 try/catch 捕获并替换为 MISSING_SPRITE）
 */
export function spriteJsonToPixelMap(name: string, sprite: SpriteJson): PixelMap {
  const { palette, pixels } = sprite;
  if (TRANSPARENT_CHAR in palette) {
    throw new Error(
      `sprite "${name}" 调色板不能用 "${TRANSPARENT_CHAR}"（保留给透明像素）`
    );
  }
  if (pixels.length === 0) {
    throw new Error(`sprite "${name}" 的 pixels 为空`);
  }
  const width = pixels[0]!.length;
  if (width === 0) {
    throw new Error(`sprite "${name}" 第 0 行宽度为 0`);
  }
  const result: PixelMap = [];
  for (let y = 0; y < pixels.length; y++) {
    const row = pixels[y]!;
    if (row.length !== width) {
      throw new Error(
        `sprite "${name}" 第 ${y} 行长度 ${row.length} ≠ 期望 ${width}`
      );
    }
    const out: PixelColor[] = new Array(width);
    for (let x = 0; x < width; x++) {
      const ch = row[x]!;
      if (ch === TRANSPARENT_CHAR) {
        out[x] = 0;
        continue;
      }
      const hex = palette[ch];
      if (hex === undefined) {
        throw new Error(
          `sprite "${name}" 第 ${y} 行第 ${x} 列字符 "${ch}" 未在调色板中`
        );
      }
      out[x] = hex;
    }
    result.push(out);
  }
  return result;
}

/**
 * 把完整 ThemeJson 解析为 ThemeDefinition
 *
 * **错误处理策略**：单个 sprite 解析失败时，记录 console.error 并用 MISSING_SPRITE 占位 —
 * 整个游戏依然能跑，坏掉的精灵在画面上显示为品红/黑棋盘格，美术一眼可辨。
 * 这对美术 hot-reload 工作流至关重要：不能因为一个字符 typo 让全游戏 crash。
 */
export function loadTheme(json: ThemeJson): ThemeDefinition {
  const sprites: Record<string, PixelMap> = {};
  const scaleOverrides: Record<string, number> = {};

  for (const [name, sprite] of Object.entries(json.sprites)) {
    try {
      sprites[name] = spriteJsonToPixelMap(name, sprite);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[themeLoader] ${msg} → 使用占位棋盘格`);
      sprites[name] = MISSING_SPRITE;
    }
    if (sprite.scale !== 3) {
      scaleOverrides[name] = sprite.scale;
    }
  }

  return {
    id: json.id,
    name: json.name,
    description: json.description,
    sprites,
    backgroundColors: json.background,
    spriteScaleOverrides: Object.keys(scaleOverrides).length > 0 ? scaleOverrides : undefined,
  };
}
