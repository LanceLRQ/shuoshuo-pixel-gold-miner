/**
 * Canvas 渲染器
 * 处理自适应缩放，保持像素锐利渲染
 */

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  /** 逻辑分辨率宽度 */
  readonly width: number;
  /** 逻辑分辨率高度 */
  readonly height: number;

  /** 当前缩放因子 */
  private scale: number = 1;

  constructor(canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number) {
    this.canvas = canvas;
    this.width = logicalWidth;
    this.height = logicalHeight;

    // 设置逻辑分辨率
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法获取 Canvas 2D 上下文');
    }
    this.ctx = ctx;

    // 禁用平滑，保持像素锐利
    this.ctx.imageSmoothingEnabled = false;

    // 监听窗口大小变化
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** 自适应缩放：保持比例填满窗口 */
  private resize(): void {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // 计算缩放因子，保持宽高比
    this.scale = Math.min(
      screenWidth / this.width,
      screenHeight / this.height
    );

    // 设置 Canvas 实际显示大小
    this.canvas.style.width = `${Math.floor(this.width * this.scale)}px`;
    this.canvas.style.height = `${Math.floor(this.height * this.scale)}px`;
  }

  /** 清空画布 */
  clear(color: string = '#000000'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** 获取 2D 上下文（供场景绘制使用） */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /** 绘制矩形 */
  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  /** 绘制图像 */
  drawImage(
    image: HTMLCanvasElement | HTMLImageElement,
    dx: number,
    dy: number,
    dw?: number,
    dh?: number
  ): void {
    if (dw !== undefined && dh !== undefined) {
      this.ctx.drawImage(image, dx, dy, dw, dh);
    } else {
      this.ctx.drawImage(image, dx, dy);
    }
  }

  /** 绘制文本 */
  fillText(text: string, x: number, y: number, color: string, font: string = '16px monospace'): void {
    this.ctx.fillStyle = color;
    this.ctx.font = font;
    this.ctx.fillText(text, x, y);
  }

  /** 获取当前缩放因子 */
  getScale(): number {
    return this.scale;
  }
}
