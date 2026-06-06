/**
 * 上帝模式调试入口（God Mode Cheats）
 *
 * 在浏览器控制台暴露 window.god 对象，提供切关卡 / 设金额 / 发道具 / 切场景等命令。
 *
 * 启用条件（任一）：
 *   1. dev 模式（import.meta.env.DEV === true）→ 自动启用
 *   2. prod 模式 → 启动时探测 `${BASE_URL}whoisyourdaddy.html`，HEAD 200 即启用
 *
 * 部署者按需放置 whoisyourdaddy.html（空文件即可）→ 临时开启 cheat；用完删除即关闭。
 * 不带 cheat 的 prod 用户感知零差异（除了一次 HEAD 探针请求 404）。
 */

import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { Difficulty } from '../level/difficulty';
import { ItemType } from '../scene/ShopScene';
import { AuthService } from '../core/AuthService';
import {
  BOARD_KEY_BY_DIFFICULTY,
  LeaderboardClient,
  type BoardEntry,
  type DisplayMode,
  type SettleEvent,
} from '../core/LeaderboardClient';

/** 启动时调用一次：在 dev 模式或 prod 探针存在时暴露 window.god */
export async function setupGodMode(game: Game): Promise<void> {
  const enabled = await isGodModeEnabled();
  if (!enabled) return;
  installGod(game);
  printBanner();
}

async function isGodModeEnabled(): Promise<boolean> {
  if (import.meta.env.DEV) return true;
  try {
    const url = `${import.meta.env.BASE_URL}whoisyourdaddy.html`;
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/** 章节起始关卡映射 */
const CHAPTER_START: Record<number, number> = { 1: 1, 2: 8, 3: 15 };

/** 所有道具的 ID（用于 give / giveAll / items 列表） */
const ALL_ITEMS = Object.values(ItemType);

/** lbSubmit 的 started_at 回推参数：服务端时长 gate 为 25s/局，额外加 60s 余量保证通过 */
const LB_GATE_SEC_PER_LEVEL = 25;
const LB_GATE_MARGIN_SEC = 60;

/** 排行榜命令前置检查：API 走同源 /api，localhost 直连拿不到主站 Cookie/反代，拒绝执行 */
function assertLbOrigin(): boolean {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') {
    console.warn(
      '[GOD] 排行榜 API 需同源访问：请经 https://shuoshuo.sikong.ren/game/gold-miner/ 打开游戏后再执行'
    );
    return false;
  }
  return true;
}

/** 榜单条目 → console.table 行 */
function lbTableRow(e: BoardEntry) {
  return {
    名次: e.rank,
    玩家: e.displayName + (e.anonymous ? '（匿名）' : ''),
    金币: e.metrics.rawMoney ?? 0,
    最高关: e.metrics.highestLevel ?? 0,
    事件: e.event,
    提交时间: new Date(e.submittedAt * 1000).toLocaleString(),
  };
}

function installGod(game: Game): void {
  const lm = game.getLevelManager();
  const themeMgr = game.getThemeManager();

  const cheats = {
    // -------- 帮助 --------
    help() {
      const lines = [
        '%c[GOD MODE] 命令列表',
        '',
        '%c查看状态',
        '  god.state()                            打印当前 state / level / money / items / difficulty / theme',
        '',
        '%c关卡',
        '  god.level(n)                           切到第 n 关（在 GameScene 中立即重载）；不传 = 打印当前',
        '  god.nextLevel()                        下一关',
        '  god.skipToCh(2)                        跳到章节起点（1→L1, 2→L8, 3→L15）',
        '',
        '%c金额',
        '  god.money(99999)                       设置当前累计金额',
        '  god.money()                            打印当前金额',
        '  god.addMoney(500)                      增加 / 减少金额',
        '',
        '%c道具',
        `  god.give('DYNAMITE')                   发指定道具（可选：${ALL_ITEMS.join(' | ')}）`,
        '  god.giveAll()                          一次发齐 8 个道具',
        '  god.clearItems()                       清空所有已有道具',
        '  god.items()                            打印当前已有道具',
        '',
        '%c场景 / 难度 / 主题',
        "  god.scene('PLAYING' | 'MENU' | 'SHOP' | 'RESULT' | 'GAME_OVER' | ...)",
        "  god.difficulty('NOVICE' | 'NORMAL' | 'HARD' | 'EXPERT' | 'INFINITE')",
        '  god.theme(id)                          切主题；不传 = 列出所有主题',
        '',
        '%c排行榜（联调，需经 shuoshuo.sikong.ren 同源访问）',
        '  god.lbSubmit(opts?)                    提交一条成绩（默认当前关卡/金额、匿名、GAME_CLEARED）',
        "    opts: { board, displayMode: 'real'|'anonymous', event, rawMoney, highestLevel, endedAtLevel, sessionLevels }",
        "  god.lbTop(board?, top?)                拉榜打印（默认 'normal' / 10）",
        '  god.lbLogin()                          查主站登录态（实名通道可用性）',
      ];
      const style = (color: string) => `color:${color};font-weight:bold;`;
      console.log(
        lines.join('\n'),
        style('gold'),
        style('cyan'),
        style('cyan'),
        style('cyan'),
        style('cyan'),
        style('cyan'),
        style('cyan'),
      );
    },

    // -------- 状态 --------
    state() {
      return {
        gameState: game.getState(),
        level: lm.currentLevel,
        money: game.getCurrentMoney(),
        items: Array.from(game.getOwnedItems()),
        difficulty: game.getDifficulty(),
        theme: themeMgr.getCurrentThemeId(),
        // 服务端结算 payload（仅 GAME_OVER/VICTORY_END 且 N/H/E 难度下非 null，用于 M2 口径验收）
        settle: game.getPendingSettlePayload(),
      };
    },

    // -------- 关卡 --------
    level(n?: number) {
      if (typeof n !== 'number') {
        console.log(`当前关卡: ${lm.currentLevel}`);
        return lm.currentLevel;
      }
      const lvl = Math.max(1, Math.floor(n));
      lm.setLevel(lvl);
      // 如果当前在游戏中，立即重新进入 PLAYING 以触发关卡重载
      if (game.getState() === GameState.PLAYING) {
        game.changeScene(GameState.PLAYING);
      }
      console.log(`切到第 ${lvl} 关${game.getState() === GameState.PLAYING ? '（已重载）' : '（下次进游戏生效）'}`);
    },

    nextLevel() {
      lm.nextLevel();
      if (game.getState() === GameState.PLAYING) {
        game.changeScene(GameState.PLAYING);
      }
      console.log(`下一关 → L${lm.currentLevel}`);
    },

    skipToCh(ch: number) {
      const start = CHAPTER_START[ch];
      if (!start) {
        console.warn(`未知章节 ${ch}，仅支持 1 / 2 / 3`);
        return;
      }
      cheats.level(start);
    },

    // -------- 金额 --------
    money(n?: number) {
      if (typeof n !== 'number') {
        console.log(`当前金额: $${game.getCurrentMoney()}`);
        return game.getCurrentMoney();
      }
      game.setCurrentMoney(n);
      console.log(`金额已设为 $${game.getCurrentMoney()}`);
    },

    addMoney(n: number) {
      const cur = game.getCurrentMoney();
      game.setCurrentMoney(cur + (n || 0));
      console.log(`金额 ${cur} + ${n} = $${game.getCurrentMoney()}`);
    },

    // -------- 道具 --------
    give(id: string) {
      const norm = String(id).toUpperCase();
      if (!ALL_ITEMS.includes(norm as ItemType)) {
        console.warn(`未知道具 "${id}"，可用：${ALL_ITEMS.join(' | ')}`);
        return;
      }
      game.addOwnedItem(norm as ItemType);
      console.log(`已发放 ${norm}`);
    },

    giveAll() {
      for (const it of ALL_ITEMS) game.addOwnedItem(it as ItemType);
      console.log(`已发齐 ${ALL_ITEMS.length} 个道具`);
    },

    clearItems() {
      game.clearOwnedItems();
      console.log('已清空所有道具');
    },

    items() {
      const owned = Array.from(game.getOwnedItems());
      console.log('当前已有道具:', owned.length === 0 ? '(无)' : owned.join(', '));
      console.log('所有可发道具:', ALL_ITEMS.join(' | '));
      return owned;
    },

    // -------- 场景 / 难度 / 主题 --------
    scene(state: string) {
      const norm = String(state).toUpperCase();
      if (!(norm in GameState)) {
        console.warn(`未知场景 "${state}"，可用：${Object.keys(GameState).join(' | ')}`);
        return;
      }
      game.changeScene(GameState[norm as keyof typeof GameState]);
      console.log(`切到场景 ${norm}`);
    },

    difficulty(d: string) {
      const norm = String(d).toUpperCase();
      if (!(norm in Difficulty)) {
        console.warn(`未知难度 "${d}"，可用：${Object.keys(Difficulty).join(' | ')}`);
        return;
      }
      game.setDifficulty(Difficulty[norm as keyof typeof Difficulty]);
      console.log(`难度已设为 ${norm}`);
    },

    theme(id?: string) {
      if (!id) {
        const list = themeMgr.getAvailableThemes();
        console.log('可用主题：');
        for (const t of list) {
          console.log(`  ${t.id === themeMgr.getCurrentThemeId() ? '*' : ' '} ${t.id}  -  ${t.name}`);
        }
        return list;
      }
      themeMgr.setTheme(id);
      console.log(`主题已设为 ${themeMgr.getCurrentThemeId()}`);
    },

    // -------- 排行榜（联调，§9.3） --------
    async lbSubmit(
      opts: {
        board?: string;
        displayMode?: DisplayMode;
        event?: SettleEvent;
        rawMoney?: number;
        highestLevel?: number;
        endedAtLevel?: number;
        sessionLevels?: number;
      } = {}
    ) {
      if (!assertLbOrigin()) return;
      // 默认取当前游戏真实状态，opts 可逐项覆盖
      const level = lm.currentLevel;
      const metrics = {
        rawMoney: opts.rawMoney ?? game.getCurrentMoney(),
        highestLevel: opts.highestLevel ?? level,
        endedAtLevel: opts.endedAtLevel ?? level,
        sessionLevels: opts.sessionLevels ?? Math.max(1, level),
      };
      const boardKey = opts.board ?? BOARD_KEY_BY_DIFFICULTY[game.getDifficulty()];
      if (!boardKey) {
        console.warn(
          `当前难度 ${game.getDifficulty()} 不上榜（NOVICE/INFINITE），可传 { board: 'normal' | 'hard' | 'expert' } 指定`
        );
        return;
      }
      const displayMode = opts.displayMode ?? 'anonymous';
      const event = opts.event ?? 'GAME_CLEARED';
      // started_at 回推：durationSec 由服务端按 ended_at − started_at 注入，回推量过时长 gate
      const runStartedAt =
        Date.now() - (LB_GATE_SEC_PER_LEVEL * metrics.sessionLevels + LB_GATE_MARGIN_SEC) * 1000;
      console.log(`[GOD] lbSubmit → 榜=${boardKey} 模式=${displayMode} 事件=${event}`, metrics);
      const result = await LeaderboardClient.settle(
        {
          event,
          boardKey,
          tracking: {
            sessionId: crypto.randomUUID(),
            runStartedAt,
            sessionLevels: metrics.sessionLevels,
            retries: 0,
          },
          metrics,
          extra: { retries: 0, itemsPurchased: [], clientVersion: __APP_VERSION__ },
        },
        displayMode
      );
      if (result.ok) {
        console.log(
          `✅ 上榜成功：以「${result.displayName}」之名，当前第 ${result.rank || '?'} 名${result.personalBest ? '（个人新高）' : ''}`
        );
      } else {
        console.warn(`❌ 提交失败 code=${result.code} reason=${result.reason}：${result.message}`);
      }
      return result;
    },

    async lbTop(board = 'normal', top = 10) {
      if (!assertLbOrigin()) return;
      try {
        const data = await LeaderboardClient.fetchBoard(board, top);
        console.log(`[GOD] ${board} 榜 Top${top}（30s 缓存）`);
        console.table(data.list.map(lbTableRow));
        if (data.around.length > 0) {
          console.log('我的附近（around ±5）：');
          console.table(data.around.map(lbTableRow));
        }
        return data;
      } catch (e) {
        console.warn(`❌ 拉榜失败：${(e as Error).message}`);
      }
    },

    async lbLogin() {
      if (!assertLbOrigin()) return;
      const st = await AuthService.refresh();
      console.log(
        st.login
          ? `已登录：${st.nickName}（account_id=${st.accountId}）— 实名 / 匿名通道均可用`
          : '未登录 — 仅匿名通道可用（实名需先在主站登录）'
      );
      return st;
    },
  };

  (window as unknown as { god: typeof cheats }).god = cheats;
}

function printBanner(): void {
  const style = [
    'background: linear-gradient(90deg, #5a1, #ff0, #f70)',
    'color: #1a1a1a',
    'font-weight: bold',
    'font-size: 14px',
    'padding: 6px 12px',
    'border-radius: 4px',
  ].join(';');
  console.log(
    '%c[GOD MODE]%c 已启用 — 输入 %cgod.help()%c 查看所有命令',
    style,
    'color: #888',
    'color: gold; font-weight: bold',
    'color: #888'
  );
}
