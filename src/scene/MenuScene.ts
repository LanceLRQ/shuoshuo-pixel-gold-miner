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
import { STRINGS } from '../ui/strings';
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
    this.continueButton = new Button(btnX, 280, btnW, btnH, STRINGS.common.continueGame);
    this.newGameButton = new Button(btnX, 340, btnW, btnH, STRINGS.menu.newGame);
    this.loadGameButton = new Button(btnX, 400, btnW, btnH, STRINGS.menu.loadSave);
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
    // 绘制背景（使用当前主题颜色，菜单不加章节装饰）
    renderBackground(renderer, renderer.width, renderer.height, this.game.getThemeManager().getBackgroundColors());

    // 四角装饰（D-Pad / B/R / 靶心，纯装饰不响应点击）
    this.renderCornerDecorations(renderer);

    // 标题方块字（5 个浅青蓝方块，每块装一字）
    this.renderTitleBlocks(renderer);

    // 水晶猫吉祥物 + 3 心飘（标题右侧）
    this.renderMascotAndHearts(renderer);

    // 副标题 "··· 猪猪传说 ···"（金色）
    this.renderSubtitle(renderer);

    // 最高分
    if (this.highScore > 0) {
      drawTextCentered(renderer, `${STRINGS.menu.highScoreLabel}: $${this.highScore}`, 232, '#FFFFFF', 'MEDIUM');
    }

    // 操作提示（与最高分拉开 24px，避免 MEDIUM/SMALL 重叠）
    drawTextCentered(renderer, this.hasProgress ? STRINGS.menu.pressSpaceContinue : STRINGS.menu.pressSpaceNewGame, 256, '#AAAAAA', 'SMALL');

    // 主按钮（disabled 状态已在 enter 时设定）
    this.continueButton.render(renderer);
    this.newGameButton.render(renderer);
    this.loadGameButton.render(renderer);

    // 右上角设置图标（深棕金边像素风）
    this.renderSettingsIcon(renderer);

    // 设置面板
    if (this.settingsOpen) {
      this.renderSettingsPanel(renderer);
    }
  }

  /** 标题"水晶宝石国" - 5 个浅青蓝方块字（Minecraft 风），偏左留出右侧水晶猫位置 */
  private renderTitleBlocks(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const title = STRINGS.menu.titleLine1; // '水晶宝石国'
    const chars = Array.from(title);

    // 方块布局：每块 64×64，间距 2px，整体居中偏左（标题中心 x=380，让出右侧给猫）
    const blockSize = 64;
    const gap = 2;
    const totalW = blockSize * chars.length + gap * (chars.length - 1);
    const centerX = 380;
    const startX = centerX - totalW / 2;
    const blockY = 92;

    // 块颜色（青蓝主题）
    const BLOCK_FILL = '#5DC4DD';
    const BLOCK_INNER = '#2D85A8';
    const BLOCK_OUTLINE = '#000000';

    for (let i = 0; i < chars.length; i++) {
      const x = startX + i * (blockSize + gap);
      const y = blockY;

      // 黑色外描边（3px）
      ctx.fillStyle = BLOCK_OUTLINE;
      ctx.fillRect(x - 3, y - 3, blockSize + 6, blockSize + 6);

      // 内部浅青蓝填充
      ctx.fillStyle = BLOCK_FILL;
      ctx.fillRect(x, y, blockSize, blockSize);

      // 内边深蓝阴影（下、右 4px 模拟立体感）
      ctx.fillStyle = BLOCK_INNER;
      ctx.fillRect(x, y + blockSize - 5, blockSize, 5);
      ctx.fillRect(x + blockSize - 5, y, 5, blockSize);

      // 顶部高光（2px 浅色）
      ctx.fillStyle = '#A3E5F5';
      ctx.fillRect(x + 3, y + 3, blockSize - 8, 3);

      // 块内大字（白色加粗，垂直居中）
      ctx.font = `bold 48px monospace`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(chars[i]!, x + blockSize / 2, y + blockSize / 2 + 2);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'top';

    // 顶部水晶装饰：第 1、4 块上方
    this.drawCrystalCluster(ctx, startX + blockSize / 2, blockY);
    this.drawCrystalCluster(ctx, startX + (blockSize + gap) * 3 + blockSize / 2, blockY);
  }

  /** 顶部水晶簇（深蓝倒三角 + 浅蓝高光，纯 fillRect 像素几何） */
  private drawCrystalCluster(ctx: CanvasRenderingContext2D, centerX: number, baseY: number): void {
    // 中间高水晶
    const cx = Math.floor(centerX);
    const cy = baseY;
    // 黑色描边
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx - 7, cy - 32, 14, 33);
    // 深蓝主体
    ctx.fillStyle = '#3DA9D9';
    ctx.fillRect(cx - 6, cy - 31, 12, 31);
    // 浅蓝高光
    ctx.fillStyle = '#A3E5F5';
    ctx.fillRect(cx - 5, cy - 30, 4, 26);

    // 左侧矮水晶
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx - 16, cy - 20, 9, 21);
    ctx.fillStyle = '#3DA9D9';
    ctx.fillRect(cx - 15, cy - 19, 7, 19);
    ctx.fillStyle = '#A3E5F5';
    ctx.fillRect(cx - 14, cy - 18, 2, 16);

    // 右侧矮水晶
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx + 7, cy - 18, 9, 19);
    ctx.fillStyle = '#3DA9D9';
    ctx.fillRect(cx + 8, cy - 17, 7, 17);
    ctx.fillStyle = '#A3E5F5';
    ctx.fillRect(cx + 9, cy - 16, 2, 14);
  }

  /** 副标题 "··· 猪猪传说 ···" 金色 */
  private renderSubtitle(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const text = `··· ${STRINGS.menu.titleLine2} ···`;
    const y = 178;
    ctx.font = `bold 24px monospace`;
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // 黑色描边阴影（1px 偏移）
    ctx.fillStyle = '#000000';
    ctx.fillText(text, 380 + 2, y + 2);
    ctx.fillStyle = '#FFD700';
    ctx.fillText(text, 380, y);
    ctx.textAlign = 'start';
  }

  /** 标题右侧水晶猫 + 飘心装饰 */
  private renderMascotAndHearts(renderer: Renderer): void {
    // 水晶猫 sprite（标题右侧、地面线之上）
    this.drawSprite(renderer, 'MENU_MASCOT_CAT', 580, 60);
    // 3 心飘装饰（一张整图覆盖蓝/粉/黄三心，飘在猫右上方）
    this.drawSprite(renderer, 'MENU_HEARTS_DECOR', 695, 50);
  }

  /** 四角装饰：左下 D-Pad + 左下角靶心 + 右下 B/R 金币 */
  private renderCornerDecorations(renderer: Renderer): void {
    // 左下：D-Pad
    this.drawSprite(renderer, 'MENU_DPAD_DECOR', 20, 410);
    // 左下角更下：靶心音乐图标
    this.drawSprite(renderer, 'MENU_BULLSEYE_ICON', 18, 502);
    // 右下：B/R 两个金币
    this.drawSprite(renderer, 'MENU_BUTTON_B', 660, 470);
    this.drawSprite(renderer, 'MENU_BUTTON_R', 730, 470);
  }

  /** 从主题 sprite cache 取 canvas 绘制；找不到则跳过（优雅降级） */
  private drawSprite(renderer: Renderer, spriteName: string, x: number, y: number): boolean {
    const cache = this.game.getThemeManager().getSpriteCache();
    const sprite = cache.get(spriteName);
    if (!sprite) return false;
    const meta = this.game.getThemeManager().getSpriteMeta(spriteName);
    const dw = meta?.displayWidth ?? sprite.width;
    const dh = meta?.displayHeight ?? sprite.height;
    renderer.drawImageSlice(sprite, 0, 0, sprite.width, sprite.height, x, y, dw, dh);
    return true;
  }

  /** 绘制右上角设置入口（深棕金边像素风） */
  private renderSettingsIcon(renderer: Renderer): void {
    const ctx = renderer.getContext();
    const w = 72;
    const h = 32;
    const x = renderer.width - w - 14;
    const y = 12;
    this.settingsBtnArea = { x, y, w, h };

    // 黑色外描边（3px）
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    // 深棕背景
    ctx.fillStyle = '#3A2A1A';
    ctx.fillRect(x, y, w, h);
    // 金黄边框（2px）
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);
    drawTextCenteredIn(renderer, STRINGS.menu.settings, { x, y, w, h }, '#FFD700', 'MEDIUM');
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
    drawTextCentered(renderer, STRINGS.menu.settingsTitle, py + 20, '#FFD700', 'LARGE');

    const audio = this.game.getAudio();

    // 静音
    drawText(renderer, `${STRINGS.menu.mutedLabel}:`, px + 30, py + 80, '#FFFFFF', 'MEDIUM');
    this.muteBtnArea = { x: px + 200, y: py + 75, w: 100, h: 28 };
    this.drawSettingButton(renderer, this.muteBtnArea, audio.isMuted() ? STRINGS.menu.muted : STRINGS.menu.normal);

    // 音量
    drawText(renderer, `${STRINGS.menu.volumeLabel}:`, px + 30, py + 130, '#FFFFFF', 'MEDIUM');
    const volPercent = Math.round(audio.getVolume() * 100);
    drawText(renderer, `${volPercent}%`, px + 200, py + 130, '#FFD700', 'MEDIUM');
    this.volumeMinusArea = { x: px + 280, y: py + 125, w: 36, h: 28 };
    this.volumePlusArea = { x: px + 326, y: py + 125, w: 36, h: 28 };
    this.drawSettingButton(renderer, this.volumeMinusArea, '-');
    this.drawSettingButton(renderer, this.volumePlusArea, '+');

    // BGM 开关
    drawText(renderer, `${STRINGS.menu.bgmLabel}:`, px + 30, py + 180, '#FFFFFF', 'MEDIUM');
    this.bgmBtnArea = { x: px + 200, y: py + 175, w: 100, h: 28 };
    this.drawSettingButton(renderer, this.bgmBtnArea, audio.isBgmEnabled() ? STRINGS.menu.on : STRINGS.menu.off);

    // 主题切换
    drawText(renderer, `${STRINGS.menu.themeLabel}:`, px + 30, py + 230, '#FFFFFF', 'MEDIUM');
    const themeName = this.game.getThemeManager().getTheme().name;
    this.themeBtnArea = { x: px + 200, y: py + 225, w: 200, h: 28 };
    this.drawSettingButton(renderer, this.themeBtnArea, themeName);

    // 清除存档
    this.clearProgressBtnArea = { x: px + 30, y: py + 285, w: 180, h: 32 };
    this.drawSettingButton(renderer, this.clearProgressBtnArea, STRINGS.menu.clearProgress, '#AA3333');

    // 关闭按钮
    this.closeSettingsBtnArea = { x: px + pw - 130, y: py + 285, w: 100, h: 32 };
    this.drawSettingButton(renderer, this.closeSettingsBtnArea, STRINGS.common.close);

    // 底部提示
    drawTextCentered(renderer, STRINGS.menu.escCloseSettings, py + ph - 30, '#888888', 'SMALL');
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
