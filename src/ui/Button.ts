/**
 * 通用按钮组件
 * 支持正常/高亮/按下三种状态
 */

import type { Renderer } from '../core/Renderer';

/** 按钮状态 */
export enum ButtonState {
  NORMAL = 'NORMAL',
  HOVER = 'HOVER',
  PRESSED = 'PRESSED',
}

/** 按钮颜色配置 */
const BUTTON_COLORS = {
  NORMAL: {
    bg: '#4169E1',
    border: '#2B4DA0',
    text: '#FFFFFF',
  },
  HOVER: {
    bg: '#5B82FF',
    border: '#4169E1',
    text: '#FFFFFF',
  },
  PRESSED: {
    bg: '#2B4DA0',
    border: '#1E3A6F',
    text: '#DDDDDD',
  },
} as const;

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

  /** 是否被点击 */
  private clicked: boolean = false;

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
    const colors = BUTTON_COLORS[this.state];
    const ctx = renderer.getContext();

    // 按钮背景
    ctx.fillStyle = colors.bg;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // 按钮边框（像素风格，2px）
    ctx.fillStyle = colors.border;
    ctx.fillRect(this.x, this.y, this.width, 2);
    ctx.fillRect(this.x, this.y + this.height - 2, this.width, 2);
    ctx.fillRect(this.x, this.y, 2, this.height);
    ctx.fillRect(this.x + this.width - 2, this.y, 2, this.height);

    // 高亮效果（顶部亮边）
    if (this.state === ButtonState.NORMAL || this.state === ButtonState.HOVER) {
      ctx.fillStyle = this.state === ButtonState.HOVER ? '#88AAFF' : '#6688CC';
      ctx.fillRect(this.x + 2, this.y + 2, this.width - 4, 2);
    }

    // 按钮文字（居中）
    const fontSize = Math.min(this.height - 8, 20);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.label, this.x + this.width / 2, this.y + this.height / 2);
    ctx.textAlign = 'start'; // 复位
  }
}
