/**
 * 黄金矿工 H5 - 游戏入口
 * 初始化渲染器、游戏实例，启动主循环
 */

import { Renderer } from './core/Renderer';
import { Game } from './core/Game';

// 逻辑分辨率常量（横屏）
const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 540;

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

// 初始化渲染器
const renderer = new Renderer(canvas, LOGICAL_WIDTH, LOGICAL_HEIGHT);

// 初始化游戏主控
const game = new Game(renderer);
game.start();

// 上帝模式调试入口（dev 自动启用 / prod 探测 whoisyourdaddy.html 启用）
// 动态 import：prod 用户不需要时该 chunk 不下载
void import('./dev/godMode').then(({ setupGodMode }) => setupGodMode(game));
