/**
 * 输入系统
 * 统一封装键盘、鼠标、触摸事件
 */

/** 点击回调函数类型 */
type TapCallback = (x: number, y: number) => void;

export class Input {
  /** 当前按住的按键集合 */
  private keysDown: Set<string> = new Set();

  /** 本帧刚按下的按键集合 */
  private keysJustPressed: Set<string> = new Set();

  /** 点击回调列表 */
  private tapCallbacks: TapCallback[] = [];

  /** 本帧是否有点击事件 */
  private _tapped: boolean = false;

  /** 点击位置（逻辑坐标） */
  private _tapX: number = 0;
  private _tapY: number = 0;

  /** 缩放因子和偏移量，用于将屏幕坐标转换为逻辑坐标 */
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;

  constructor(canvas: HTMLCanvasElement, logicalWidth: number, _logicalHeight: number) {
    // 键盘事件
    window.addEventListener('keydown', (e) => {
      if (!this.keysDown.has(e.code)) {
        this.keysJustPressed.add(e.code);
      }
      this.keysDown.add(e.code);
      // 阻止空格滚动页面
      if (e.code === 'Space') {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    // 计算坐标转换参数
    const updateTransform = (): void => {
      const rect = canvas.getBoundingClientRect();
      this.scale = rect.width / logicalWidth;
      this.offsetX = rect.left;
      this.offsetY = rect.top;
    };

    // 鼠标点击
    canvas.addEventListener('mousedown', (e) => {
      updateTransform();
      this.handleTap(
        (e.clientX - this.offsetX) / this.scale,
        (e.clientY - this.offsetY) / this.scale
      );
    });

    // 触摸事件
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      updateTransform();
      const touch = e.touches[0];
      if (touch) {
        this.handleTap(
          (touch.clientX - this.offsetX) / this.scale,
          (touch.clientY - this.offsetY) / this.scale
        );
      }
    }, { passive: false });

    // 窗口大小变化时更新变换参数
    window.addEventListener('resize', updateTransform);
  }

  /** 处理点击/触摸事件 */
  private handleTap(x: number, y: number): void {
    this._tapped = true;
    this._tapX = x;
    this._tapY = y;
    // 通知所有注册的点击回调
    for (const cb of this.tapCallbacks) {
      cb(x, y);
    }
  }

  /** 查询指定按键是否按住 */
  isPressed(code: string): boolean {
    return this.keysDown.has(code);
  }

  /** 查询指定按键是否在本帧刚按下 */
  isJustPressed(code: string): boolean {
    return this.keysJustPressed.has(code);
  }

  /** 注册点击/触摸回调 */
  onTap(callback: TapCallback): void {
    this.tapCallbacks.push(callback);
  }

  /** 本帧是否有点击 */
  wasTapped(): boolean {
    return this._tapped;
  }

  /** 获取点击逻辑坐标 */
  getTapPosition(): { x: number; y: number } {
    return { x: this._tapX, y: this._tapY };
  }

  /**
   * 每帧结束时调用，清除本帧状态
   * 必须在游戏主循环中每帧调用一次
   */
  update(): void {
    this.keysJustPressed.clear();
    this._tapped = false;
  }
}
