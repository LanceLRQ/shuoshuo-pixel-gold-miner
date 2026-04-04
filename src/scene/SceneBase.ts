/**
 * 场景基类
 * 所有游戏场景必须继承此类并实现生命周期方法
 */

import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';

export abstract class SceneBase {
  /** 进入场景时调用，用于初始化场景资源 */
  abstract enter(): void;

  /** 离开场景时调用，用于清理场景资源 */
  abstract exit(): void;

  /** 每帧逻辑更新 */
  abstract update(dt: number): void;

  /** 每帧渲染 */
  abstract render(renderer: Renderer): void;

  /** 输入处理（可选，子类按需覆写） */
  handleInput(_input: Input): void {
    // 默认空实现
  }
}
