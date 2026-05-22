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
import { STRINGS } from '../ui/strings';

/** 道具配置 */
interface ShopItem {
  name: string;
  price: number;
  description: string;
  owned: boolean;
  type: ItemType;
  /** 是否持久型（仅新手/一般难度跨关保留；困难/高手强制当关失效） */
  persistent: boolean;
}

/** 道具效果类型 */
export enum ItemType {
  DYNAMITE = 'DYNAMITE',
  STRENGTH_POTION = 'STRENGTH_POTION',
  LUCKY_CLOVER = 'LUCKY_CLOVER',
  STONE_BOOK = 'STONE_BOOK',
  MOUSE_POISON = 'MOUSE_POISON',
  DIAMOND_OIL = 'DIAMOND_OIL',
  EXTRA_TIME = 'EXTRA_TIME',
  SHAKE_DRINK = 'SHAKE_DRINK',
}

/** 道具配置表
 *  - persistent=true：buff 类道具，新手/一般可跨关保留；困难/高手每关清除
 *  - persistent=false：消耗品，任何难度用完即弃 */
const SHOP_ITEMS: ShopItem[] = [
  { name: STRINGS.shop.items.dynamite.name, price: 150, description: STRINGS.shop.items.dynamite.desc, owned: false, type: ItemType.DYNAMITE, persistent: false },
  { name: STRINGS.shop.items.strengthPotion.name, price: 200, description: STRINGS.shop.items.strengthPotion.desc, owned: false, type: ItemType.STRENGTH_POTION, persistent: true },
  { name: STRINGS.shop.items.lucky.name, price: 100, description: STRINGS.shop.items.lucky.desc, owned: false, type: ItemType.LUCKY_CLOVER, persistent: true },
  { name: STRINGS.shop.items.stoneBook.name, price: 80, description: STRINGS.shop.items.stoneBook.desc, owned: false, type: ItemType.STONE_BOOK, persistent: true },
  { name: STRINGS.shop.items.ratPoison.name, price: 120, description: STRINGS.shop.items.ratPoison.desc, owned: false, type: ItemType.MOUSE_POISON, persistent: true },
  { name: STRINGS.shop.items.diamondGloss.name, price: 250, description: STRINGS.shop.items.diamondGloss.desc, owned: false, type: ItemType.DIAMOND_OIL, persistent: true },
  { name: STRINGS.shop.items.extraTime.name, price: 80, description: STRINGS.shop.items.extraTime.desc, owned: false, type: ItemType.EXTRA_TIME, persistent: false },
  { name: STRINGS.shop.items.shakySoda.name, price: 180, description: STRINGS.shop.items.shakySoda.desc, owned: false, type: ItemType.SHAKE_DRINK, persistent: true },
];

/**
 * 持久道具列表（模块加载时预计算）
 * 用途：
 * - 关卡结束清理（硬核难度清掉，辅助难度跨关保留）
 * - INFINITE 模式开局自动加全部持久 buff
 */
export const PERSISTENT_ITEM_TYPES: readonly ItemType[] = SHOP_ITEMS
  .filter(item => item.persistent)
  .map(item => item.type);

/** 商店卡片布局参数（3列 x 2行） */
const CARD_LAYOUT = {
  cardW: 230,
  cardH: 80,
  gapX: 15,
  gapY: 12,
  startY: 100,
  cols: 3,
} as const;

export class ShopScene extends SceneBase {
  private game: Game;
  private money: number;
  private items: ShopItem[];
  private nextButton: Button;
  /** 缓存道具按钮区域（避免每次点击重建） */
  private itemButtons: Button[] = [];

  constructor(game: Game, money: number) {
    super();
    this.game = game;
    this.money = money;

    // 复制道具列表（owned 状态从 Game 同步，避免重复购买）
    this.items = this.buildItemsFromOwned();

    // 下一关按钮（横屏 800x540 居中底部）
    this.nextButton = new Button(330, 470, 140, 44, STRINGS.shop.nextLevel);

    this.rebuildItemButtons();
  }

  enter(): void {
    // 从 Game 同步已购买状态，防止重复购买扣钱
    this.items = this.buildItemsFromOwned();
    this.rebuildItemButtons();
  }

  /**
   * 根据 Game.ownedItems 构建 items，已购道具 owned=true
   * 难度门控：硬核难度过滤掉摇晃饮料（仅辅助难度可用）
   */
  private buildItemsFromOwned(): ShopItem[] {
    const ownedSet = this.game.getOwnedItems();
    const isHardcore = this.game.getDifficultyConfig().isHardcore;
    return SHOP_ITEMS
      .filter(item => !(isHardcore && item.type === ItemType.SHAKE_DRINK))
      .map(item => ({ ...item, owned: ownedSet.has(item.type) }));
  }

  exit(): void {}

  update(_dt: number): void {}

  handleInput(input: Input): void {
    if (input.wasTapped()) {
      const pos = input.getTapPosition();

      // 检测道具购买
      for (let i = 0; i < this.itemButtons.length; i++) {
        const btn = this.itemButtons[i]!;
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
    drawTextCentered(renderer, STRINGS.shop.title, 25, '#FFD700', 'LARGE');

    // 当前金额
    drawTextCentered(renderer, `${STRINGS.shop.moneyLabel}${this.money}`, 60, '#FFD700', 'MEDIUM');

    // 道具列表（3列网格布局适配横屏）
    const startX = (800 - CARD_LAYOUT.cardW * CARD_LAYOUT.cols - CARD_LAYOUT.gapX * (CARD_LAYOUT.cols - 1)) / 2;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const col = i % CARD_LAYOUT.cols;
      const row = Math.floor(i / CARD_LAYOUT.cols);
      const x = startX + col * (CARD_LAYOUT.cardW + CARD_LAYOUT.gapX);
      const y = CARD_LAYOUT.startY + row * (CARD_LAYOUT.cardH + CARD_LAYOUT.gapY);

      // 道具卡片背景
      const bgColor = item.owned ? '#2a4a2a' : '#2a2a4a';
      renderer.fillRect(x, y, CARD_LAYOUT.cardW, CARD_LAYOUT.cardH, bgColor);
      renderer.fillRect(x, y, CARD_LAYOUT.cardW, 2, '#444466');
      renderer.fillRect(x, y + CARD_LAYOUT.cardH - 2, CARD_LAYOUT.cardW, 2, '#444466');

      // 道具信息
      const textColor = item.owned ? '#888888' : '#FFFFFF';
      drawText(renderer, item.name, x + 20, y + 12, textColor, 'MEDIUM');
      drawText(renderer, item.description, x + 20, y + 38, '#AAAAAA', 'SMALL');

      // 价格/已购买
      if (item.owned) {
        drawText(renderer, STRINGS.common.purchased, x + CARD_LAYOUT.cardW - 70, y + 18, '#00FF00', 'SMALL');
      } else if (this.money < item.price) {
        drawText(renderer, `$${item.price}`, x + CARD_LAYOUT.cardW - 60, y + 18, '#FF4444', 'SMALL');
      } else {
        drawText(renderer, `$${item.price}`, x + CARD_LAYOUT.cardW - 60, y + 18, '#FFD700', 'SMALL');
      }
    }

    // 下一关按钮
    this.nextButton.render(renderer);
  }

  /** 重建道具按钮区域缓存 */
  private rebuildItemButtons(): void {
    const startX = (800 - CARD_LAYOUT.cardW * CARD_LAYOUT.cols - CARD_LAYOUT.gapX * (CARD_LAYOUT.cols - 1)) / 2;
    this.itemButtons = this.items.map((_, i) => {
      const col = i % CARD_LAYOUT.cols;
      const row = Math.floor(i / CARD_LAYOUT.cols);
      return new Button(
        startX + col * (CARD_LAYOUT.cardW + CARD_LAYOUT.gapX),
        CARD_LAYOUT.startY + row * (CARD_LAYOUT.cardH + CARD_LAYOUT.gapY),
        CARD_LAYOUT.cardW,
        CARD_LAYOUT.cardH,
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
