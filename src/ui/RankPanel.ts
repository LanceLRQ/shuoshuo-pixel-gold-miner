/**
 * 结算「三选一」上榜面板（Canvas 像素模态组件）
 *
 * GameOverScene / VictoryEndScene 复用：SettlePayload 非 null（N/H/E 难度结算）时展示，
 * 玩家选择 实名上榜 / 匿名上榜 / 暂不上榜；选择后由 LeaderboardClient.settle 一气呵成提交。
 *
 * 状态机：choosing → (login-waiting) → submitting → success / error → closed
 * 嵌入约定：场景 handleInput 中若 isActive() 则把输入全权交给面板；render 最后调用（覆盖全屏遮罩）。
 *
 * 设计文档：docs/design/20260605_leaderboard-server-integration.md §6.3
 */

import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import { Button } from './Button';
import { drawTextCentered } from './PixelText';
import { STRINGS } from './strings';
import { AuthService } from '../core/AuthService';
import {
  LeaderboardClient,
  type DisplayMode,
  type SettlePayload,
  type SettleResult,
} from '../core/LeaderboardClient';

/** 面板状态 */
type PanelState = 'choosing' | 'login-waiting' | 'submitting' | 'success' | 'error' | 'closed';

/** 面板几何（800×540 居中） */
const PANEL_W = 440;
const PANEL_H = 280;
const PANEL_X = (800 - PANEL_W) / 2;
const PANEL_Y = (540 - PANEL_H) / 2;

/** 面板内按钮几何 */
const BTN_W = 300;
const BTN_H = 40;
const BTN_X = PANEL_X + (PANEL_W - BTN_W) / 2;

/** 主站登录页（同源相对路径，新窗口打开） */
const LOGIN_URL = '/login';

/** 提交中省略号动画周期（秒/个） */
const DOT_INTERVAL_SEC = 0.4;

const T = STRINGS.leaderboard.panel;

export class RankPanel {
  private state: PanelState = 'choosing';
  private readonly payload: SettlePayload;
  private result: SettleResult | null = null;
  /** login-waiting 态的附加提示（刷新后仍未登录时显示） */
  private loginHint: string = '';
  /** submitting 态省略号动画计时 */
  private dotTimer: number = 0;
  /** 上次提交使用的显名模式（error 态「重试」复用同一身份重新提交） */
  private lastMode: DisplayMode = 'anonymous';
  /** 当前状态下可点的按钮（rebuildButtons 按状态重建） */
  private buttons: { btn: Button; onClick: () => void }[] = [];

  constructor(payload: SettlePayload) {
    this.payload = payload;
    this.rebuildButtons();
    // 启动时 refresh 可能尚未返回：补拉一次登录态，回来后若仍在选择页则刷新按钮文案
    if (!AuthService.current.login) {
      void AuthService.refresh().then((st) => {
        if (st.login && this.state === 'choosing') this.rebuildButtons();
      });
    }
  }

  /** 面板是否仍占用交互（场景以此决定是否把输入交给面板 + 是否绘制） */
  isActive(): boolean {
    return this.state !== 'closed';
  }

  update(dt: number): void {
    if (this.state === 'submitting') this.dotTimer += dt;
  }

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();
      for (const { btn, onClick } of this.buttons) {
        if (btn.update(pos.x, pos.y, true)) {
          onClick();
          return;
        }
      }
    } else {
      for (const { btn } of this.buttons) btn.update(0, 0, false);
    }
  }

  render(renderer: Renderer): void {
    if (this.state === 'closed') return;
    const ctx = renderer.getContext();

    // 全屏遮罩 + 金边面板（与设置面板同风格）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    ctx.fillStyle = '#22223a';
    ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, 2);
    ctx.fillRect(PANEL_X, PANEL_Y + PANEL_H - 2, PANEL_W, 2);
    ctx.fillRect(PANEL_X, PANEL_Y, 2, PANEL_H);
    ctx.fillRect(PANEL_X + PANEL_W - 2, PANEL_Y, 2, PANEL_H);

    switch (this.state) {
      case 'choosing':
      case 'login-waiting':
        this.renderChoices(renderer);
        break;
      case 'submitting': {
        const dots = '.'.repeat(1 + (Math.floor(this.dotTimer / DOT_INTERVAL_SEC) % 3));
        drawTextCentered(renderer, `${T.submitting}${dots}`, PANEL_Y + 130, '#FFD700', 'LARGE');
        break;
      }
      case 'success':
        this.renderSuccess(renderer);
        break;
      case 'error':
        this.renderError(renderer);
        break;
    }

    for (const { btn } of this.buttons) btn.render(renderer);
  }

  // ==================== 各状态渲染 ====================

  private renderChoices(renderer: Renderer): void {
    const title = this.state === 'login-waiting' ? T.loginWaitTitle : T.title;
    drawTextCentered(renderer, title, PANEL_Y + 22, '#FFD700', 'LARGE');
    // 匿名小字提示（紧贴匿名按钮下方）
    drawTextCentered(renderer, T.anonymousHint, PANEL_Y + 162, '#888888', 'SMALL');
    if (this.state === 'login-waiting' && this.loginHint) {
      drawTextCentered(renderer, this.loginHint, PANEL_Y + 250, '#FF8888', 'SMALL');
    }
  }

  private renderSuccess(renderer: Renderer): void {
    const r = this.result;
    if (!r || !r.ok) return;
    drawTextCentered(renderer, `${T.displayPrefix}${r.displayName}${T.displaySuffix}`, PANEL_Y + 46, '#FFFFFF', 'MEDIUM');
    if (r.rank > 0) {
      drawTextCentered(renderer, `${T.rankPrefix}${r.rank}${T.rankSuffix}`, PANEL_Y + 92, '#FFD700', 'TITLE');
    } else {
      drawTextCentered(renderer, T.recorded, PANEL_Y + 92, '#FFD700', 'LARGE');
    }
    if (r.personalBest) {
      drawTextCentered(renderer, T.personalBest, PANEL_Y + 145, '#B4F0FF', 'MEDIUM');
    }
  }

  private renderError(renderer: Renderer): void {
    const r = this.result;
    if (!r || r.ok) return;
    drawTextCentered(renderer, T.title, PANEL_Y + 22, '#FFD700', 'LARGE');
    drawTextCentered(renderer, r.message, PANEL_Y + 90, '#FF8888', 'MEDIUM');
  }

  // ==================== 状态流转 ====================

  /** 按当前状态重建按钮组（按钮纵向布局：y 从面板顶部偏移定位） */
  private rebuildButtons(): void {
    this.buttons = [];
    switch (this.state) {
      case 'choosing': {
        const auth = AuthService.current;
        if (auth.login) {
          this.addButton(`${T.submitRealPrefix}${auth.nickName}${T.submitRealSuffix}`, 64, () => this.doSettle('real'));
        } else {
          this.addButton(T.loginThenSubmit, 64, () => this.gotoLogin());
        }
        this.addButton(T.submitAnonymous, 116, () => this.doSettle('anonymous'));
        this.addButton(T.skip, 196, () => this.close(), 34);
        break;
      }
      case 'login-waiting':
        this.addButton(T.refreshAndSubmit, 64, () => this.refreshAndSubmit());
        this.addButton(T.submitAnonymous, 116, () => this.doSettle('anonymous'));
        this.addButton(T.back, 196, () => this.backToChoosing(), 34);
        break;
      case 'submitting':
        break; // 提交中无按钮
      case 'success':
        this.addButton(T.close, 200, () => this.close(), 34);
        break;
      case 'error': {
        // 重试：复用上次身份重新提交（网络/限速等场景有意义；门槛等必然失败也尊重用户主动重试）
        this.addButton(T.retry, 116, () => this.doSettle(this.lastMode));
        // 实名需登录被拒：额外保留匿名通道兜底（§五 5041011 引导改选匿名）
        if (this.result && !this.result.ok && this.result.reason === 'need_login') {
          this.addButton(T.submitAnonymous, 160, () => this.doSettle('anonymous'));
        }
        this.addButton(T.close, 210, () => this.close(), 34);
        break;
      }
      case 'closed':
        break;
    }
  }

  /** 在面板内偏移 offsetY 处加一个居中按钮 */
  private addButton(label: string, offsetY: number, onClick: () => void, height: number = BTN_H): void {
    const btn = new Button(BTN_X, PANEL_Y + offsetY, BTN_W, height, label);
    btn.fontSize = 18;
    this.buttons.push({ btn, onClick });
  }

  private setState(state: PanelState): void {
    this.state = state;
    this.rebuildButtons();
  }

  /** 开会话 + 签名 + 提交（错误码已在协议层消化为 SettleResult） */
  private doSettle(mode: DisplayMode): void {
    this.lastMode = mode; // 记住身份，error 态「重试」复用
    this.dotTimer = 0;
    this.setState('submitting');
    void LeaderboardClient.settle(this.payload, mode).then((res) => {
      if (this.state !== 'submitting') return; // 已被关闭等异常流转，丢弃结果
      this.result = res;
      this.setState(res.ok ? 'success' : 'error');
    });
  }

  /** 新窗口打开主站登录页，面板转入等待登录态 */
  private gotoLogin(): void {
    window.open(LOGIN_URL, '_blank');
    this.loginHint = '';
    this.setState('login-waiting');
  }

  /** 登录窗口完成后：刷新登录态，成功即实名提交 */
  private refreshAndSubmit(): void {
    void AuthService.refresh().then((st) => {
      if (this.state !== 'login-waiting') return;
      if (st.login) {
        this.doSettle('real');
      } else {
        this.loginHint = T.stillNotLoggedIn;
      }
    });
  }

  private backToChoosing(): void {
    this.loginHint = '';
    this.setState('choosing');
  }

  /** 暂不上榜 / 完成后关闭：面板收起，场景恢复正常交互（本地榜已在 changeScene 双写） */
  private close(): void {
    this.setState('closed');
  }
}
