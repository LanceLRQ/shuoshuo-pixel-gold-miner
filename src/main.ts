/**
 * 黄金矿工 H5 - 游戏入口
 * 初始化渲染器、游戏实例，启动主循环
 */

import { Renderer } from './core/Renderer';
import { Game } from './core/Game';
import { CodexModal } from './ui/CodexModal';
import { LeaderboardModal } from './ui/LeaderboardModal';
import { AuthService } from './core/AuthService';

// 逻辑分辨率常量（横屏）
const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 540;

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

// 初始化渲染器
const renderer = new Renderer(canvas, LOGICAL_WIDTH, LOGICAL_HEIGHT);

// 初始化游戏主控
const game = new Game(renderer);

// 矿物图鉴 DOM 弹窗（覆盖在 canvas 之上）+ 打开时通知 Game 暂停游戏逻辑
const codexModal = new CodexModal(game.getThemeManager());
codexModal.onToggle = (open) => game.setPausedByExternal(open);
game.setCodexModal(codexModal);

// 在线排行榜 DOM 弹窗（主菜单入口，复用同一暂停机制防止空格误触）
const leaderboardModal = new LeaderboardModal();
leaderboardModal.onToggle = (open) => game.setPausedByExternal(open);
game.setLeaderboardModal(leaderboardModal);

// 启动时拉取主站登录态并缓存（异步、不阻塞首屏；失败按未登录处理，仍可匿名上榜）
void AuthService.refresh();

game.start();

// 上帝模式调试入口（dev 自动启用 / prod 探测 whoisyourdaddy.html 启用）
// 动态 import：prod 用户不需要时该 chunk 不下载
void import('./dev/godMode').then(({ setupGodMode }) => setupGodMode(game));
