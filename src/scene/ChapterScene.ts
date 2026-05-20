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

  // enter() 计算一次的渲染数据（避免每帧重算 switch / 字符串切片）
  private introLines: string[] = [];
  private ordinal: string = '';
  private displayName: string = '';
  private bgColor: string = '#1a1a2e';
  private accentColor: string = '#FFD700';

  constructor(game: Game, chapterId: ChapterId) {
    super();
    this.game = game;
    this.chapterId = chapterId;
  }

  enter(): void {
    this.elapsed = 0;
    const info = CHAPTER_INFO[this.chapterId];
    const chapterIndex = CHAPTER_ORDER.indexOf(this.chapterId);
    this.ordinal = CHAPTER_ORDINAL[chapterIndex] ?? '';
    this.displayName = info.displayName;
    this.bgColor = info.bgColor;
    this.accentColor = info.accentColor;
    this.introLines = wrapText(info.intro, MAX_CHARS_PER_LINE);
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
    renderer.clear(this.bgColor);

    drawTextCentered(renderer, this.ordinal, LAYOUT.chapterIndexY, '#AAAAAA', 'MEDIUM');
    drawTextCentered(renderer, this.displayName, LAYOUT.chapterNameY, this.accentColor, 'LARGE');

    for (let i = 0; i < this.introLines.length; i++) {
      drawTextCentered(renderer, this.introLines[i]!, LAYOUT.introStartY + i * LAYOUT.introLineHeight, '#FFFFFF', 'MEDIUM');
    }

    // 跳过提示闪烁（500ms 周期）
    if (Math.floor(this.elapsed * 2) % 2 === 0) {
      drawTextCentered(renderer, '按任意键跳过 · 2.5s 后自动进入', LAYOUT.hintY, '#888888', 'SMALL');
    }

    // 倒计时进度条（底部 2px）
    const progress = Math.min(this.elapsed / AUTO_SKIP_SECONDS, 1);
    renderer.fillRect(0, 538, renderer.width * progress, 2, this.accentColor);
  }

  private skipToPlaying(): void {
    this.game.changeScene(GameState.PLAYING);
  }
}

/** CJK 文本按字符数硬切换行（无单词识别，适用于中文短文本） */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (text.length <= maxCharsPerLine) return [text];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxCharsPerLine) {
    lines.push(text.slice(i, i + maxCharsPerLine));
  }
  return lines;
}
