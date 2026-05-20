/**
 * 主菜单场景
 * 游戏入口画面：开始按钮、继续游戏、音量、主题切换、清存档
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawText, drawTextCentered, drawTextCenteredIn } from '../ui/PixelText';
import { Button } from '../ui/Button';
import { renderBackground } from '../assets/background';
import { pointInRect } from '../utils/collision';

/** 设置面板按钮区域类型 */
interface RectArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class MenuScene extends SceneBase {
  private game: Game;
  private continueButton: Button;
  private newGameButton: Button;
  private loadGameButton: Button;
  private highScore: number;
  private hasProgress: boolean = false;

  /** 设置面板是否打开 */
  private settingsOpen: boolean = false;

  /** 标题动画时间 */
  private animTime: number = 0;

  // 设置面板内的按钮区域（运行时根据 renderer 尺寸计算）
  private settingsBtnArea: RectArea = { x: 0, y: 0, w: 0, h: 0 };
  private muteBtnArea: RectArea = { x: 0, y: 0, w: 0, h: 0 };
  private bgmBtnArea: RectArea = { x: 0, y: 0, w: 0, h: 0 };
  private themeBtnArea: RectArea = { x: 0, y: 0, w: 0, h: 0 };
  private clearProgressBtnArea: RectArea = { x: 0, y: 0, w: 0, h: 0 };
  private closeSettingsBtnArea: RectArea = { x: 0, y: 0, w: 0, h: 0 };
  private volumeMinusArea: RectArea = { x: 0, y: 0, w: 0, h: 0 };
  private volumePlusArea: RectArea = { x: 0, y: 0, w: 0, h: 0 };

  constructor(game: Game) {
    super();
    this.game = game;
    this.highScore = this.game.getStorage().getHighScore();

    // 主按钮（横屏 800x540 居中，竖排）
    const btnW = 200, btnH = 44, btnX = (800 - btnW) / 2;
    this.continueButton = new Button(btnX, 280, btnW, btnH, '继续游戏');
    this.newGameButton = new Button(btnX, 340, btnW, btnH, '新游戏');
    this.loadGameButton = new Button(btnX, 400, btnW, btnH, '读取存档');
  }

  enter(): void {
    this.animTime = 0;
    this.highScore = this.game.getStorage().getHighScore();
    this.hasProgress = this.game.getStorage().hasProgress();
    this.continueButton.disabled = !this.hasProgress;
    this.settingsOpen = false;
    // 暂时禁用首页自动 BGM；用户仍可在设置里手动开启
    // 旧逻辑：
    //   const audio = this.game.getAudio();
    //   if (audio.isBgmEnabled() && !audio.isMuted()) audio.startBgm();
  }

  exit(): void {}

  update(dt: number): void {
    this.animTime += dt;
  }

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();

      // 设置面板优先处理
      if (this.settingsOpen) {
        this.handleSettingsTap(pos.x, pos.y);
        return;
      }

      // 主按钮
      if (this.hasProgress && this.continueButton.containsPoint(pos.x, pos.y)) {
        // 继续游戏：加载自动槽位
        this.game.restoreProgress();
        return;
      }
      if (this.newGameButton.containsPoint(pos.x, pos.y)) {
        // 新游戏：进入难度选择
        this.game.changeScene(GameState.DIFFICULTY_SELECT);
        return;
      }
      if (this.loadGameButton.containsPoint(pos.x, pos.y)) {
        // 读取存档：进入槽位管理
        this.game.changeScene(GameState.SLOT_SELECT);
        return;
      }
      // 设置图标
      if (pointInRect(pos.x, pos.y, this.settingsBtnArea)) {
        this.settingsOpen = true;
        return;
      }
    }

    // 空格：有进度则继续，否则进难度选择（不再直接 PLAYING）
    if (!this.settingsOpen && input.isJustPressed('Space')) {
      if (this.hasProgress) {
        this.game.restoreProgress();
      } else {
        this.game.changeScene(GameState.DIFFICULTY_SELECT);
      }
    }

    // ESC 关闭设置
    if (this.settingsOpen && input.isJustPressed('Escape')) {
      this.settingsOpen = false;
    }
  }

  render(renderer: Renderer): void {
    // 绘制背景（使用当前主题颜色）
    renderBackground(renderer, renderer.width, renderer.height, this.game.getThemeManager().getBackgroundColors());

    // 半透明遮罩
    renderer.fillRect(0, 0, renderer.width, renderer.height, 'rgba(0, 0, 0, 0.3)');

    // 标题（带动画浮动效果）
    const titleY = 120 + Math.sin(this.animTime * 2) * 8;
    drawTextCentered(renderer, '水晶宝石国', titleY, '#FFD700', 'TITLE');
    drawTextCentered(renderer, '猪猪传说', titleY + 45, '#FFA500', 'LARGE');

    // 最高分
    if (this.highScore > 0) {
      drawTextCentered(renderer, `最高分: $${this.highScore}`, 232, '#FFFFFF', 'MEDIUM');
    }

    // 操作提示（与最高分拉开 24px，避免 MEDIUM/SMALL 重叠）
    drawTextCentered(renderer, this.hasProgress ? '按空格继续上次进度' : '按空格直接进入难度选择', 256, '#AAAAAA', 'SMALL');

    // 主按钮（disabled 状态已在 enter 时设定）
    this.continueButton.render(renderer);
    this.newGameButton.render(renderer);
    this.loadGameButton.render(renderer);

    // 右上角设置图标（齿轮简化为方框 + 文字）
    this.renderSettingsIcon(renderer);

    // 设置面板
    if (this.settingsOpen) {
      this.renderSettingsPanel(renderer);
    }
  }

  /** 绘制右上角设置入口（齿轮简化） */
  private renderSettingsIcon(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const x = renderer.width - 70;
    const y = 12;
    const w = 56;
    const h = 26;
    this.settingsBtnArea = { x, y, w, h };

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);
    drawTextCenteredIn(renderer, '设置', { x, y, w, h }, '#FFFFFF', 'SMALL');
  }

  /** 绘制设置面板 */
  private renderSettingsPanel(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const W = renderer.width;
    const H = renderer.height;

    // 背景遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, W, H);

    // 面板
    const pw = 460;
    const ph = 380;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    ctx.fillStyle = '#22223a';
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(px, py, pw, 2);
    ctx.fillRect(px, py + ph - 2, pw, 2);
    ctx.fillRect(px, py, 2, ph);
    ctx.fillRect(px + pw - 2, py, 2, ph);

    // 标题
    drawTextCentered(renderer, '设置', py + 20, '#FFD700', 'LARGE');

    const audio = this.game.getAudio();

    // 静音
    drawText(renderer, '静音:', px + 30, py + 80, '#FFFFFF', 'MEDIUM');
    this.muteBtnArea = { x: px + 200, y: py + 75, w: 100, h: 28 };
    this.drawSettingButton(renderer, this.muteBtnArea, audio.isMuted() ? '已静音' : '正常');

    // 音量
    drawText(renderer, '音量:', px + 30, py + 130, '#FFFFFF', 'MEDIUM');
    const volPercent = Math.round(audio.getVolume() * 100);
    drawText(renderer, `${volPercent}%`, px + 200, py + 130, '#FFD700', 'MEDIUM');
    this.volumeMinusArea = { x: px + 280, y: py + 125, w: 36, h: 28 };
    this.volumePlusArea = { x: px + 326, y: py + 125, w: 36, h: 28 };
    this.drawSettingButton(renderer, this.volumeMinusArea, '-');
    this.drawSettingButton(renderer, this.volumePlusArea, '+');

    // BGM 开关
    drawText(renderer, 'BGM:', px + 30, py + 180, '#FFFFFF', 'MEDIUM');
    this.bgmBtnArea = { x: px + 200, y: py + 175, w: 100, h: 28 };
    this.drawSettingButton(renderer, this.bgmBtnArea, audio.isBgmEnabled() ? '开' : '关');

    // 主题切换
    drawText(renderer, '主题:', px + 30, py + 230, '#FFFFFF', 'MEDIUM');
    const themeName = this.game.getThemeManager().getTheme().name;
    this.themeBtnArea = { x: px + 200, y: py + 225, w: 200, h: 28 };
    this.drawSettingButton(renderer, this.themeBtnArea, themeName);

    // 清除存档
    this.clearProgressBtnArea = { x: px + 30, y: py + 285, w: 180, h: 32 };
    this.drawSettingButton(renderer, this.clearProgressBtnArea, '清除进度', '#AA3333');

    // 关闭按钮
    this.closeSettingsBtnArea = { x: px + pw - 130, y: py + 285, w: 100, h: 32 };
    this.drawSettingButton(renderer, this.closeSettingsBtnArea, '关闭');

    // 底部提示
    drawTextCentered(renderer, 'ESC 关闭设置', py + ph - 30, '#888888', 'SMALL');
  }

  /** 绘制设置面板按钮 */
  private drawSettingButton(renderer: Renderer, area: RectArea, label: string, bg: string = '#3a3a5e'): void {
    const ctx = renderer.getContext();
    ctx.fillStyle = bg;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(area.x, area.y, area.w, 1);
    ctx.fillRect(area.x, area.y + area.h - 1, area.w, 1);
    ctx.fillRect(area.x, area.y, 1, area.h);
    ctx.fillRect(area.x + area.w - 1, area.y, 1, area.h);

    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, area.x + area.w / 2, area.y + area.h / 2);
    ctx.textAlign = 'start';
  }

  /** 处理设置面板内的点击 */
  private handleSettingsTap(x: number, y: number): void {
    const audio = this.game.getAudio();
    const storage = this.game.getStorage();

    if (pointInRect(x, y, this.muteBtnArea)) {
      const muted = audio.toggleMute();
      this.persistSettings();
      // 切回非静音时如果当前在菜单，重新启动 BGM
      if (!muted && audio.isBgmEnabled()) audio.startBgm();
      return;
    }
    if (pointInRect(x, y, this.volumeMinusArea)) {
      audio.setVolume(audio.getVolume() - 0.1);
      this.persistSettings();
      return;
    }
    if (pointInRect(x, y, this.volumePlusArea)) {
      audio.setVolume(audio.getVolume() + 0.1);
      this.persistSettings();
      return;
    }
    if (pointInRect(x, y, this.bgmBtnArea)) {
      const enabled = !audio.isBgmEnabled();
      audio.setBgmEnabled(enabled);
      this.persistSettings();
      if (enabled && !audio.isMuted()) audio.startBgm();
      return;
    }
    if (pointInRect(x, y, this.themeBtnArea)) {
      // 循环切换主题
      const tm = this.game.getThemeManager();
      const themes = tm.getAvailableThemes();
      const idx = themes.findIndex(t => t.id === tm.getCurrentThemeId());
      const next = themes[(idx + 1) % themes.length]!;
      tm.setTheme(next.id);
      return;
    }
    if (pointInRect(x, y, this.clearProgressBtnArea)) {
      this.game.clearProgress();
      storage.clear();
      this.hasProgress = false;
      this.highScore = 0;
      return;
    }
    if (pointInRect(x, y, this.closeSettingsBtnArea)) {
      this.settingsOpen = false;
      return;
    }
  }

  /** 持久化设置 */
  private persistSettings(): void {
    const audio = this.game.getAudio();
    this.game.getStorage().saveSettings({
      volume: audio.getVolume(),
      bgmEnabled: audio.isBgmEnabled(),
      muted: audio.isMuted(),
    });
  }
}
