/**
 * 章节过场场景
 * 进入新章节首关（L1/L8/L15）之前显示一句剧情文字，2.5s 后自动跳关
 * 玩家可按 Space/Enter 或鼠标点击立即跳过
 * 详见 docs/design/20260519_chapter-system.md §六
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawTextCentered } from '../ui/PixelText';
import { CHAPTER_INFO, CHAPTER_ORDER, type ChapterId } from '../level/levels';

/** 自动跳过等待时间（秒） */
const AUTO_SKIP_SECONDS = 2.5;

/** 文字最大单行字符数（CJK 字符宽度估算，超出换行） */
const MAX_CHARS_PER_LINE = 20;

/** UI 布局常量（800×540 横屏） */
const LAYOUT = {
  chapterIndexY: 170,
  chapterNameY: 230,
  introStartY: 320,
  introLineHeight: 32,
  hintY: 460,
} as const;

/** 章节序号汉字（用于"第 N 章"展示） */
const CHAPTER_ORDINAL = ['第 一 章', '第 二 章', '第 三 章'] as const;

export class ChapterScene extends SceneBase {
  private game: Game;
  private chapterId: ChapterId;
  private elapsed: number = 0;

  constructor(game: Game, chapterId: ChapterId) {
    super();
    this.game = game;
    this.chapterId = chapterId;
  }

  enter(): void {
    this.elapsed = 0;
  }

  exit(): void {}

  update(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed >= AUTO_SKIP_SECONDS) {
      this.skipToPlaying();
    }
  }

  handleInput(input: Input): void {
    // Space / Enter / 鼠标点击 → 立即跳过
    if (input.isJustPressed('Space') || input.isJustPressed('Enter') || input.wasTapped()) {
      this.skipToPlaying();
    }
  }

  render(renderer: Renderer): void {
    const info = CHAPTER_INFO[this.chapterId];
    const chapterIndex = CHAPTER_ORDER.indexOf(this.chapterId);
    const ordinal = CHAPTER_ORDINAL[chapterIndex] ?? '';

    // 背景：根据章节微调主色调（弱化版，过场不喧宾夺主）
    renderer.clear(this.getChapterBgColor());

    // 第 X 章（小字）
    drawTextCentered(renderer, ordinal, LAYOUT.chapterIndexY, '#AAAAAA', 'MEDIUM');

    // 章名（大字 + 章节主色）
    drawTextCentered(renderer, info.displayName, LAYOUT.chapterNameY, this.getChapterAccentColor(), 'LARGE');

    // 剧情文字（中字，过长自动换行）
    const lines = this.wrapIntro(info.intro);
    for (let i = 0; i < lines.length; i++) {
      drawTextCentered(renderer, lines[i]!, LAYOUT.introStartY + i * LAYOUT.introLineHeight, '#FFFFFF', 'MEDIUM');
    }

    // 跳过提示（淡灰小字 + 闪烁，提示玩家可交互）
    if (Math.floor(this.elapsed * 2) % 2 === 0) {
      drawTextCentered(renderer, '按任意键跳过 · 2.5s 后自动进入', LAYOUT.hintY, '#888888', 'SMALL');
    }

    // 倒计时进度条（底部，2px 高）
    const progress = Math.min(this.elapsed / AUTO_SKIP_SECONDS, 1);
    const barWidth = renderer.width * progress;
    renderer.fillRect(0, 538, barWidth, 2, this.getChapterAccentColor());
  }

  /** 简易 CJK 换行（按字符数硬切，不做单词识别） */
  private wrapIntro(text: string): string[] {
    if (text.length <= MAX_CHARS_PER_LINE) return [text];
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += MAX_CHARS_PER_LINE) {
      lines.push(text.slice(i, i + MAX_CHARS_PER_LINE));
    }
    return lines;
  }

  /** 章节背景色（深色调，过场氛围） */
  private getChapterBgColor(): string {
    switch (this.chapterId) {
      case 'CRYSTAL_MINE':
        return '#2A1F14'; // 矿洞棕黑
      case 'CRAB_BAY':
        return '#0D1F35'; // 海湾深蓝
      case 'PIGGY_THRONE':
        return '#3A2540'; // 王座紫暗
      default:
        return '#1a1a2e';
    }
  }

  /** 章节强调色（用于章名/进度条） */
  private getChapterAccentColor(): string {
    switch (this.chapterId) {
      case 'CRYSTAL_MINE':
        return '#FFD27C'; // 暖金黄
      case 'CRAB_BAY':
        return '#7CD9FF'; // 海湾青蓝
      case 'PIGGY_THRONE':
        return '#FFB6E5'; // 粉色公主
      default:
        return '#FFD700';
    }
  }

  /** 跳关：进入实际 PLAYING 场景（Game 内部识别 previousState 跳过 nextLevel） */
  private skipToPlaying(): void {
    this.game.changeScene(GameState.PLAYING);
  }
}
