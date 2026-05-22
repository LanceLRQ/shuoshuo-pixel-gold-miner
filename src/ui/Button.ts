/**
 * 通用按钮组件
 * 青蓝色像素风：实心 bg + 黑色描边 + 内边高光 + 两端钉饰
 * 支持正常/高亮/按下/禁用四种状态
 *
 * 渲染优先级：主题里有 MENU_BUTTON_BG sprite → 用 3-slice 横向拉伸；否则 fallback 几何绘制
 */

import type { Renderer } from '../core/Renderer';
import type { SpriteCacheMap } from '../assets/types';

/** sprite 提供器接口（避免 Button 强依赖 ThemeManager） */
export interface ButtonSpriteProvider {
  getSpriteCache(): SpriteCacheMap;
}

/**
 * 3-slice 切片比例：左右端各占 sprite 矩阵宽度的 25%（中间 50% 横向拉伸）
 * 适用于任意宽高 sprite（左右两端结构对称即可），不依赖固定像素值
 */
const SLICE_RATIO = 0.25;

/** 按钮状态 */
export enum ButtonState {
  NORMAL = 'NORMAL',
  HOVER = 'HOVER',
  PRESSED = 'PRESSED',
}

/** 按钮颜色配置（青蓝色像素风，文字统一黑色） */
const BUTTON_COLORS = {
  NORMAL: {
    bg: '#5DC4DD',
    border: '#1F5F7A',
    highlight: '#8FE0F5',
    text: '#000000',
  },
  HOVER: {
    bg: '#7DDFF0',
    border: '#2D85A8',
    highlight: '#B0EFFF',
    text: '#000000',
  },
  PRESSED: {
    bg: '#2D85A8',
    border: '#1A4A60',
    highlight: '#5DC4DD',
    text: '#1A1A1A',
  },
  DISABLED: {
    bg: '#6F8590',
    border: '#3A4A55',
    highlight: '#92A6AF',
    text: '#3A3A3A',
  },
} as const;

/** 钉饰尺寸（左右两端，黑色描边像素三角+方块） */
const DECOR_W = 7;
const DECOR_H = 10;

export class Button {
  /** 按钮位置和尺寸 */
  x: number;
  y: number;
  width: number;
  height: number;

  /** 按钮文字 */
  label: string;

  /** 当前状态 */
  state: ButtonState = ButtonState.NORMAL;

  /** 禁用状态（置灰、不响应点击/悬停） */
  disabled: boolean = false;

  /** 是否被点击 */
  private clicked: boolean = false;

  /** 全局 sprite 提供器（Game 启动时调 Button.setSpriteProvider 注入） */
  private static spriteProvider: ButtonSpriteProvider | null = null;
  /** sprite 渲染时使用的 sprite key（可被 setSpriteKey 覆盖，比如设置按钮用 MENU_SETTINGS_BG） */
  private spriteKey: string = 'MENU_BUTTON_BG';

  /** 一次性注入主题素材源，全场景 Button 共享 */
  static setSpriteProvider(provider: ButtonSpriteProvider): void {
    Button.spriteProvider = provider;
  }

  /** 覆盖此按钮使用的 sprite key（默认 MENU_BUTTON_BG） */
  setSpriteKey(key: string): void {
    this.spriteKey = key;
  }

  constructor(x: number, y: number, width: number, height: number, label: string) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.label = label;
  }

  /** 检测点击坐标是否在按钮范围内 */
  containsPoint(px: number, py: number): boolean {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  }

  /** 处理输入更新按钮状态 */
  update(tapX: number, tapY: number, isTapped: boolean): boolean {
    this.clicked = false;

    // 禁用态：不响应任何交互，强制保持 NORMAL
    if (this.disabled) {
      this.state = ButtonState.NORMAL;
      return false;
    }

    const isInside = this.containsPoint(tapX, tapY);

    if (isTapped && isInside) {
      this.state = ButtonState.PRESSED;
      this.clicked = true;
    } else if (isInside) {
      this.state = ButtonState.HOVER;
    } else {
      this.state = ButtonState.NORMAL;
    }

    return this.clicked;
  }

  /** 判断按钮是否被点击 */
  wasClicked(): boolean {
    return this.clicked;
  }

  /** 渲染按钮 */
  render(renderer: Renderer): void {
    const colors = this.disabled ? BUTTON_COLORS.DISABLED : BUTTON_COLORS[this.state];
    const ctx = renderer.getContext();
    const { x, y, width: w, height: h } = this;

    // 优先 sprite 渲染（3-slice 横向拉伸），找不到 sprite 时 fallback 到几何绘制
    const sprite = Button.spriteProvider?.getSpriteCache().get(this.spriteKey);
    if (sprite) {
      this.drawSprite3Slice(ctx, sprite);
      // 按下/禁用态：盖一层透明色叠加表示状态
      if (this.state === ButtonState.PRESSED && !this.disabled) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(x, y, w, h);
      } else if (this.disabled) {
        ctx.fillStyle = 'rgba(40, 40, 40, 0.5)';
        ctx.fillRect(x, y, w, h);
      }
    } else {
      this.drawGeometryFallback(ctx, colors);
    }

    // 按钮文字（居中，按下时下沉 1px 模拟手感）
    const fontSize = Math.min(h - 12, 22);
    const textOffsetY = this.state === ButtonState.PRESSED && !this.disabled ? 1 : 0;
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.label, x + w / 2, y + h / 2 + textOffsetY);
    ctx.textAlign = 'start';
  }

  /**
   * 3-slice 横向拉伸绘制：sprite 左/右端按 H 等比缩放，中部横向拉伸填满
   * 切片比例 SLICE_RATIO（默认 0.25），适配任意宽高的 sprite
   */
  private drawSprite3Slice(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement): void {
    const { x, y, width: w, height: h } = this;
    const srcW = sprite.width;
    const srcH = sprite.height;
    const sliceSrcW = Math.floor(srcW * SLICE_RATIO);
    // 整体按按钮高度等比缩放，决定左右端宽度
    const scaleY = h / srcH;
    const leftW = sliceSrcW * scaleY;
    const rightW = sliceSrcW * scaleY;
    const midW = Math.max(0, w - leftW - rightW);

    // 左端
    ctx.drawImage(sprite, 0, 0, sliceSrcW, srcH, x, y, leftW, h);
    // 中部横向拉伸
    if (midW > 0) {
      const srcMidW = srcW - sliceSrcW * 2;
      ctx.drawImage(sprite, sliceSrcW, 0, srcMidW, srcH, x + leftW, y, midW, h);
    }
    // 右端
    ctx.drawImage(sprite, srcW - sliceSrcW, 0, sliceSrcW, srcH, x + leftW + midW, y, rightW, h);
  }

  /** 几何 fallback 绘制（无 sprite 时使用） */
  private drawGeometryFallback(ctx: CanvasRenderingContext2D, colors: typeof BUTTON_COLORS[keyof typeof BUTTON_COLORS]): void {
    const { x, y, width: w, height: h } = this;
    // 内填充
    ctx.fillStyle = colors.bg;
    ctx.fillRect(x, y, w, h);
    // 黑色外描边（2px）
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);
    // 内边深蓝阴影
    ctx.fillStyle = colors.border;
    ctx.fillRect(x + 2, y + 2, w - 4, 2);
    ctx.fillRect(x + 2, y + h - 4, w - 4, 2);
    ctx.fillRect(x + 2, y + 2, 2, h - 4);
    ctx.fillRect(x + w - 4, y + 2, 2, h - 4);
    // 顶部亮带
    if (!this.disabled && (this.state === ButtonState.NORMAL || this.state === ButtonState.HOVER)) {
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(x + 4, y + 4, w - 8, 2);
    }
    // 两端钉饰
    this.drawEndDecor(ctx);
  }

  /** 绘制按钮左右两端的像素钉饰（黑色描边小三角+方块） */
  private drawEndDecor(ctx: CanvasRenderingContext2D): void {
    const cy = this.y + this.height / 2;
    const topY = Math.floor(cy - DECOR_H / 2);

    // 左端：贴左边，向左凸出 DECOR_W 像素
    this.drawDecorPixel(ctx, this.x - DECOR_W + 1, topY, true);
    // 右端：贴右边，向右凸出 DECOR_W 像素
    this.drawDecorPixel(ctx, this.x + this.width - 1, topY, false);
  }

  /**
   * 单个钉饰：黑色像素小三角 + 方块
   * 形状（左端，右端对称翻转）：
   *   ▓░
   *   ▓▓░
   *   ▓▓▓░
   *   ▓▓▓░
   *   ▓▓▓░
   *   ▓▓░
   *   ▓░
   * 整体 7w × 10h，纯黑像素，简单几何
   */
  private drawDecorPixel(ctx: CanvasRenderingContext2D, x: number, y: number, isLeft: boolean): void {
    ctx.fillStyle = '#000000';
    // 钉饰使用上、中、下三段简化梯形
    // 第 0/9 行（上下尖端）：1px 黑
    // 第 1/8 行：2px 黑
    // 第 2-7 行：3-4px 黑（中间最宽）
    const rows = [
      { offset: 0, len: 2 },
      { offset: 0, len: 3 },
      { offset: 0, len: 4 },
      { offset: 0, len: 5 },
      { offset: 0, len: 5 },
      { offset: 0, len: 5 },
      { offset: 0, len: 5 },
      { offset: 0, len: 4 },
      { offset: 0, len: 3 },
      { offset: 0, len: 2 },
    ];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const drawX = isLeft ? x + DECOR_W - row.len : x;
      ctx.fillRect(drawX, y + i, row.len, 1);
    }
  }
}
