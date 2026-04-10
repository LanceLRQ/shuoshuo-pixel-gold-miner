/**
 * 道具商店场景
 * 展示 4 种道具，购买后扣除金额
 */

import { SceneBase } from './SceneBase';
import type { Renderer } from '../core/Renderer';
import type { Input } from '../core/Input';
import type { Game } from '../core/Game';
import { GameState } from '../core/Game';
import { drawText, drawTextCentered } from '../ui/PixelText';
import { Button } from '../ui/Button';

/** 道具配置 */
interface ShopItem {
  name: string;
  price: number;
  description: string;
  owned: boolean;
  type: ItemType;
}

/** 道具效果类型 */
export enum ItemType {
  DYNAMITE = 'DYNAMITE',
  STRENGTH_POTION = 'STRENGTH_POTION',
  LUCKY_CLOVER = 'LUCKY_CLOVER',
  STONE_BOOK = 'STONE_BOOK',
}

/** 道具配置表 */
const SHOP_ITEMS: ShopItem[] = [
  { name: '炸药', price: 150, description: '抓到石头时自动炸毁', owned: false, type: ItemType.DYNAMITE },
  { name: '力量药水', price: 200, description: '收回速度 +50%', owned: false, type: ItemType.STRENGTH_POTION },
  { name: '幸运草', price: 100, description: '神秘袋最低 200$', owned: false, type: ItemType.LUCKY_CLOVER },
  { name: '石头书', price: 80, description: '石头价值 x3', owned: false, type: ItemType.STONE_BOOK },
];

export class ShopScene extends SceneBase {
  private game: Game;
  private money: number;
  private items: ShopItem[];
  private nextButton: Button;

  constructor(game: Game, money: number) {
    super();
    this.game = game;
    this.money = money;

    // 复制道具列表
    this.items = SHOP_ITEMS.map(item => ({ ...item }));

    // 下一关按钮（横屏 800x540 居中底部）
    this.nextButton = new Button(330, 470, 140, 44, '下一关');
  }

  enter(): void {
    // 重置购买状态
    this.items = SHOP_ITEMS.map(item => ({ ...item, owned: false }));
  }

  exit(): void {}

  update(_dt: number): void {}

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();

      // 检测道具购买（每个道具卡片区域）
      const itemButtons = this.getItemButtons();
      for (let i = 0; i < itemButtons.length; i++) {
        const btn = itemButtons[i]!;
        if (btn.containsPoint(pos.x, pos.y)) {
          this.buyItem(i);
          return;
        }
      }

      // 下一关按钮
      if (this.nextButton.update(pos.x, pos.y, true)) {
        this.game.changeScene(GameState.PLAYING);
      }
    } else {
      this.nextButton.update(0, 0, false);
    }

    // 空格跳过商店
    if (input.isJustPressed('Space')) {
      this.game.changeScene(GameState.PLAYING);
    }
  }

  render(renderer: Renderer): void {
    renderer.clear('#1a1a2e');

    // 标题
    drawTextCentered(renderer, '道具商店', 25, '#FFD700', 'LARGE');

    // 当前金额
    drawTextCentered(renderer, `持有金额: $${this.money}`, 60, '#FFD700', 'MEDIUM');

    // 道具列表（2x2 网格布局适配横屏）
    const cardW = 350;
    const cardH = 80;
    const gapX = 20;
    const gapY = 15;
    const startX = (800 - cardW * 2 - gapX) / 2;
    const startY = 100;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);

      // 道具卡片背景
      const bgColor = item.owned ? '#2a4a2a' : '#2a2a4a';
      renderer.fillRect(x, y, cardW, cardH, bgColor);
      renderer.fillRect(x, y, cardW, 2, '#444466');
      renderer.fillRect(x, y + cardH - 2, cardW, 2, '#444466');

      // 道具信息
      const textColor = item.owned ? '#888888' : '#FFFFFF';
      drawText(renderer, item.name, x + 20, y + 12, textColor, 'MEDIUM');
      drawText(renderer, item.description, x + 20, y + 38, '#AAAAAA', 'SMALL');

      // 价格/已购买
      if (item.owned) {
        drawText(renderer, '已购买', x + cardW - 70, y + 18, '#00FF00', 'SMALL');
      } else if (this.money < item.price) {
        drawText(renderer, `$${item.price}`, x + cardW - 60, y + 18, '#FF4444', 'SMALL');
      } else {
        drawText(renderer, `$${item.price}`, x + cardW - 60, y + 18, '#FFD700', 'SMALL');
      }
    }

    // 下一关按钮
    this.nextButton.render(renderer);
  }

  /** 获取道具按钮区域列表（与渲染布局一致 2x2 网格） */
  private getItemButtons(): Button[] {
    const cardW = 350;
    const cardH = 80;
    const gapX = 20;
    const gapY = 15;
    const startX = (800 - cardW * 2 - gapX) / 2;
    const startY = 100;

    return this.items.map((_, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return new Button(
        startX + col * (cardW + gapX),
        startY + row * (cardH + gapY),
        cardW,
        cardH,
        ''
      );
    });
  }

  /** 购买道具 */
  private buyItem(index: number): void {
    const item = this.items[index];
    if (!item || item.owned) return;
    if (this.money < item.price) return;

    this.money -= item.price;
    item.owned = true;
    this.game.addOwnedItem(item.type);
  }

  /** 获取当前剩余金额（供 Game 同步使用） */
  getMoney(): number {
    return this.money;
  }
}
