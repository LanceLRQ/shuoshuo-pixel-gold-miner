/**
 * 游戏主控
 * 管理状态机、场景切换和游戏主循环
 */

import { Renderer } from './Renderer';
import { Input } from './Input';
import { SceneBase } from '../scene/SceneBase';
import { MenuScene } from '../scene/MenuScene';
import { GameScene } from '../scene/GameScene';
import { ResultScene } from '../scene/ResultScene';
import { ShopScene } from '../scene/ShopScene';
import { Storage } from './Storage';
import { ThemeManager } from '../assets/theme/ThemeManager';
import { CLASSIC_THEME } from '../assets/theme/classic';

/** 游戏全局状态枚举 */
export enum GameState {
  MENU = 'MENU',
  READY = 'READY',
  PLAYING = 'PLAYING',
  REELING = 'REELING',
  RESULT = 'RESULT',
  SHOP = 'SHOP',
  GAME_OVER = 'GAME_OVER',
}

/** FPS 统计更新间隔（毫秒） */
const FPS_UPDATE_INTERVAL = 1000;

/** 是否显示 FPS */
let showFps = true;

export class Game {
  private renderer: Renderer;
  private input: Input;
  private storage: Storage;
  private themeManager: ThemeManager;

  /** 当前游戏状态 */
  private state: GameState = GameState.MENU;

  /** 已注册的场景映射 */
  private scenes: Map<GameState, SceneBase> = new Map();

  /** 当前活跃场景 */
  private currentScene: SceneBase | null = null;

  /** 上一帧时间戳 */
  private lastTime: number = 0;

  /** 动画帧 ID，用于取消主循环 */
  private animFrameId: number = 0;

  /** 当前关卡的金额信息（用于场景间传递） */
  private lastEarnedMoney: number = 0;
  private lastTargetMoney: number = 200;
  private currentMoney: number = 0;

  // FPS 统计
  private frameCount: number = 0;
  private fpsTime: number = 0;
  private fps: number = 0;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.storage = new Storage();
    this.input = new Input(
      renderer.getContext().canvas,
      renderer.width,
      renderer.height
    );

    // 初始化主题管理器
    this.themeManager = new ThemeManager();
    this.themeManager.register(CLASSIC_THEME);
    this.themeManager.restoreTheme();
  }

  /** 注册场景到指定状态 */
  registerScene(state: GameState, scene: SceneBase): void {
    this.scenes.set(state, scene);
  }

  /** 切换到指定状态对应的场景 */
  changeScene(state: GameState): void {
    // 退出当前场景
    if (this.currentScene) {
      // 如果从 GameScene 退出，保存金额数据
      if (this.state === GameState.PLAYING && this.currentScene instanceof GameScene) {
        this.lastEarnedMoney = this.currentScene.getMoney();
        this.lastTargetMoney = this.currentScene.getTargetMoney();
        this.currentMoney += this.lastEarnedMoney;
      }
      this.currentScene.exit();
    }

    // 切换状态
    this.state = state;

    // 根据状态创建对应场景（动态创建，传递数据）
    let scene: SceneBase | null = null;

    switch (state) {
      case GameState.MENU:
        scene = new MenuScene(this);
        this.currentMoney = 0; // 重置金额
        break;
      case GameState.PLAYING:
        scene = new GameScene(this, this.lastTargetMoney);
        break;
      case GameState.RESULT:
        scene = new ResultScene(this, this.lastEarnedMoney, this.lastTargetMoney);
        break;
      case GameState.SHOP:
        scene = new ShopScene(this, this.currentMoney);
        break;
      case GameState.GAME_OVER:
        // 更新最高分
        this.storage.updateHighScore(this.currentMoney);
        scene = new MenuScene(this);
        break;
    }

    if (scene) {
      // 先移除旧场景
      this.scenes.delete(state);
      this.scenes.set(state, scene);
      this.currentScene = scene;
      scene.enter();
    } else {
      this.currentScene = null;
    }
  }

  /** 获取当前游戏状态 */
  getState(): GameState {
    return this.state;
  }

  /** 获取输入系统实例 */
  getInput(): Input {
    return this.input;
  }

  /** 获取渲染器实例 */
  getRenderer(): Renderer {
    return this.renderer;
  }

  /** 获取主题管理器 */
  getThemeManager(): ThemeManager {
    return this.themeManager;
  }

  /** 启动游戏主循环 */
  start(): void {
    this.changeScene(GameState.MENU);

    this.lastTime = performance.now();
    this.fpsTime = this.lastTime;
    this.loop(this.lastTime);
  }

  /** 停止游戏主循环 */
  stop(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  /** 切换 FPS 显示 */
  toggleFps(visible: boolean): void {
    showFps = visible;
  }

  /** 游戏主循环 */
  private loop = (timestamp: number): void => {
    // 计算 deltaTime（秒），上限 50ms 防止大跳帧
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    // FPS 统计
    this.frameCount++;
    if (timestamp - this.fpsTime >= FPS_UPDATE_INTERVAL) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = timestamp;
    }

    // 更新当前场景
    if (this.currentScene) {
      this.currentScene.handleInput(this.input);
      this.currentScene.update(dt);
      this.currentScene.render(this.renderer);
    }

    // FPS 显示
    if (showFps) {
      this.renderFps();
    }

    // 清除本帧输入状态
    this.input.update();

    // 下一帧
    this.animFrameId = requestAnimationFrame(this.loop);
  };

  /** 渲染 FPS 信息 */
  private renderFps(): void {
    this.renderer.fillText(
      `FPS: ${this.fps}`,
      this.renderer.width - 80,
      this.renderer.height - 20,
      '#00FF0088',
      '12px monospace'
    );
  }
}
