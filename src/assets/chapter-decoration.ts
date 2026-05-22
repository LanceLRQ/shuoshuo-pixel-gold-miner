/**
 * 章节背景装饰元素
 *
 * 提供两套 API：
 *  - drawChapterStaticDecor: 静态装饰，绘制到背景离屏缓存（零运行时开销）
 *  - createChapterAnimators: 创建该章节的动画器列表（每帧 update/render）
 *
 * 像素风格约束：所有绘制走 ctx.fillRect，禁用曲线/抗锯齿，与 PixelMap 风格保持一致。
 * 装饰元素饱和度/亮度低于矿物，避免抢走视觉焦点。
 */

import type { BackgroundColors } from './theme/types';
import { GROUND_Y } from './background';
import { ChapterId } from '../level/levels';
import { GAME_CONFIG } from '../entity/types';
import type { DecorAnimator } from '../effects/DecorationLayer';
import type { EmitOptions, ParticleSystem } from '../effects/Particle';

const W = GAME_CONFIG.CANVAS_WIDTH;
const H = GAME_CONFIG.CANVAS_HEIGHT;

// ===== 工具：伪随机（保证装饰位置稳定，不依赖运行时 Math.random） =====
function rand01(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ===== 通用 Animator 实现 =====

/** 周期粒子发射器：火把火星、气泡、花瓣等 */
class PeriodicParticleEmitter implements DecorAnimator {
  private cooldown: number;
  constructor(
    private readonly intervalMin: number,
    private readonly intervalMax: number,
    private readonly buildOptions: () => EmitOptions
  ) {
    this.cooldown = intervalMin * 0.5;
  }
  update(dt: number, particles: ParticleSystem): void {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      particles.emit(this.buildOptions());
      this.cooldown = this.intervalMin + Math.random() * (this.intervalMax - this.intervalMin);
    }
  }
  render(): void {
    // 粒子由 ParticleSystem 自身渲染
  }
}

/** 单株摆动竖条：海草 / 旗帜 顶端 sin 摆动，底端固定 */
interface SwaySprite {
  baseX: number;
  baseY: number;
  width: number;
  height: number;
  color: string;
  phaseOffset: number;
}

class SwaySpriteAnimator implements DecorAnimator {
  private t = 0;
  constructor(
    private readonly sprites: readonly SwaySprite[],
    private readonly amplitude: number,
    private readonly period: number
  ) {}
  update(dt: number): void {
    this.t += dt;
  }
  render(ctx: CanvasRenderingContext2D): void {
    const omega = (Math.PI * 2) / this.period;
    for (const s of this.sprites) {
      const wave = Math.sin(this.t * omega + s.phaseOffset);
      ctx.fillStyle = s.color;
      for (let i = 0; i < s.height; i++) {
        const t = i / Math.max(1, s.height - 1);
        const sway = t * wave * this.amplitude;
        ctx.fillRect(Math.round(s.baseX + sway), s.baseY - i, s.width, 1);
      }
    }
  }
}

/** 横向穿越：小鱼 / 小蝙蝠 / 飞鸟 */
interface TraverseActor {
  x: number;
  y: number;
  vx: number;
  tailPhase: number;
  alive: boolean;
}

class TraversalAnimator implements DecorAnimator {
  private actors: TraverseActor[] = [];
  private cooldown: number;
  constructor(
    private readonly spawnIntervalMin: number,
    private readonly spawnIntervalMax: number,
    private readonly speed: number,
    private readonly yMin: number,
    private readonly yMax: number,
    private readonly bodyColor: string,
    private readonly bodySize: number
  ) {
    this.cooldown = spawnIntervalMin;
  }
  update(dt: number): void {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const fromLeft = Math.random() < 0.5;
      this.actors.push({
        x: fromLeft ? -30 : W + 30,
        y: this.yMin + Math.random() * (this.yMax - this.yMin),
        vx: fromLeft ? this.speed : -this.speed,
        tailPhase: 0,
        alive: true,
      });
      this.cooldown =
        this.spawnIntervalMin + Math.random() * (this.spawnIntervalMax - this.spawnIntervalMin);
    }
    for (const a of this.actors) {
      a.x += a.vx * dt;
      a.tailPhase += dt * 8;
      if (a.x < -50 || a.x > W + 50) a.alive = false;
    }
    this.actors = this.actors.filter((a) => a.alive);
  }
  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.bodyColor;
    for (const a of this.actors) {
      const bw = this.bodySize;
      const bh = Math.max(2, Math.floor(this.bodySize * 0.6));
      const x = Math.floor(a.x);
      const y = Math.floor(a.y);
      // 身体（椭圆近似：中间宽、两端窄）
      ctx.fillRect(x, y, bw, bh);
      ctx.fillRect(x + 1, y - 1, bw - 2, 1);
      ctx.fillRect(x + 1, y + bh, bw - 2, 1);
      // 尾巴（根据方向画在身后，sin 摆动）
      const wag = Math.round(Math.sin(a.tailPhase));
      const tx = a.vx > 0 ? x - 3 : x + bw;
      ctx.fillRect(tx, y + 1 + wag, 3, bh - 2);
    }
  }
}

// ===== 静态绘制：三章节实现 =====

function drawCh1MineDecor(ctx: CanvasRenderingContext2D, colors: BackgroundColors): void {
  // --- 钟乳石（HUD (y=0~36) 下方挂出，3 处倒三角阴影） ---
  // top=38 起，避开 HUD 半透明黑条
  const STALACTITE_TOP = 38;
  const stalactites: ReadonlyArray<{ x: number; w: number; h: number }> = [
    { x: 120, w: 14, h: 22 },
    { x: 380, w: 10, h: 16 },
    { x: 620, w: 18, h: 26 },
  ];
  ctx.fillStyle = '#1F140A';
  for (const s of stalactites) {
    for (let row = 0; row < s.h; row++) {
      const shrink = Math.floor((row / s.h) * (s.w / 2));
      ctx.fillRect(s.x + shrink, STALACTITE_TOP + row, s.w - shrink * 2, 1);
    }
  }
  // 钟乳石顶部高光（浅棕，每株左上 2x2，紧贴 HUD 底）
  ctx.fillStyle = '#5A3F28';
  for (const s of stalactites) {
    ctx.fillRect(s.x + 1, STALACTITE_TOP + 1, 2, 2);
  }

  // --- 入口支柱（地表两侧暗色梯形） ---
  ctx.fillStyle = '#2A1A0F';
  for (let y = 80; y < GROUND_Y; y++) {
    const widen = Math.floor(((y - 80) / (GROUND_Y - 80)) * 14);
    // 左侧梯形
    ctx.fillRect(0, y, 14 + widen, 1);
    // 右侧梯形
    ctx.fillRect(W - 14 - widen, y, 14 + widen, 1);
  }

  // --- 火把架（立在地面上，紧邻左右入口支柱内侧） ---
  // 地表 GROUND_Y=140；火把架立柱高 30，顶平台距地表 32 像素，火焰从平台上方喷出
  ctx.fillStyle = '#2A1A0F';
  // 左侧立柱 + 顶平台
  ctx.fillRect(34, GROUND_Y - 30, 4, 30);
  ctx.fillRect(28, GROUND_Y - 32, 16, 3);
  // 右侧立柱 + 顶平台（对称）
  ctx.fillRect(W - 38, GROUND_Y - 30, 4, 30);
  ctx.fillRect(W - 44, GROUND_Y - 32, 16, 3);

  // --- 散落矿石碎块（地下浅层伪随机分布） ---
  for (let i = 0; i < 18; i++) {
    const rx = Math.floor(rand01(i * 31 + 7) * W);
    const ry = 165 + Math.floor(rand01(i * 47 + 13) * 110);
    const isGold = i % 4 === 0;
    ctx.fillStyle = isGold ? colors.groundLight : colors.dirtMid;
    ctx.fillRect(rx, ry, 3, 3);
  }

  // --- 矿车轨道（GROUND_Y 下方一对横向铁轨 + 枕木） ---
  ctx.fillStyle = '#1F140A';
  ctx.fillRect(0, GROUND_Y + 20, W, 1); // 上轨
  ctx.fillRect(0, GROUND_Y + 24, W, 1); // 下轨
  for (let x = 8; x < W; x += 24) {
    ctx.fillRect(x, GROUND_Y + 20, 3, 5); // 枕木
  }

  // --- 矿车（地面右侧，约矿工 60% 尺寸 = 60x40 含金矿堆） ---
  // 整体占 x=688~748, y=100~140；底部 y=140 贴地表，避开右火把架 (x=W-44=756)
  drawMineCart(ctx, 688, 100);

  void colors;
}

/**
 * 木质独轮手推矿车（参考经典 wheelbarrow 造型）
 * 整体 60x44：车斗前低后高（斜视角）+ 左前大圆轮 + 右后金属推杆 + 顶部堆金矿
 * 起点 (x, y) 是矿车包围盒左上角；底部 y+44 时贴 GROUND_Y=140
 */
function drawMineCart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // ---- 大车轮（左前，深灰圆形，14x14）----
  ctx.fillStyle = '#2A2828';
  // 阶梯近似圆：从 y=28 到 y=42，宽度从中间到两端递减
  ctx.fillRect(x + 4, y + 28, 10, 2);
  ctx.fillRect(x + 3, y + 30, 12, 2);
  ctx.fillRect(x + 2, y + 32, 14, 6);
  ctx.fillRect(x + 3, y + 38, 12, 2);
  ctx.fillRect(x + 4, y + 40, 10, 2);
  // 轮辐高光（中间亮灰，模拟轮毂）
  ctx.fillStyle = '#6A6A72';
  ctx.fillRect(x + 6, y + 33, 6, 4);
  ctx.fillRect(x + 7, y + 32, 4, 6);
  // 轮中心轴（白色亮点）
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x + 8, y + 34, 2, 2);

  // ---- 金属推杆 + 后支脚（右后）----
  ctx.fillStyle = '#4A4A52';
  // 主立柱（后壁外侧的金属杆）
  ctx.fillRect(x + 54, y + 12, 4, 30);
  // 顶部把手（向上翘）
  ctx.fillRect(x + 50, y + 8, 10, 4);
  // 推杆高光
  ctx.fillStyle = '#7A7A82';
  ctx.fillRect(x + 55, y + 14, 1, 26);

  // ---- 车斗后壁（高墙，右侧）----
  ctx.fillStyle = '#5A3A20';
  ctx.fillRect(x + 46, y + 10, 8, 22);
  // 后壁内侧高光（亮棕一道）
  ctx.fillStyle = '#8A6A40';
  ctx.fillRect(x + 46, y + 10, 8, 1);

  // ---- 车斗主体（梯形：左低右高，木板纹理）----
  // 斜面上沿从 (14, 22) 到 (46, 10) 渐升
  for (let col = 0; col < 32; col++) {
    const yTop = 22 - Math.floor((col * 12) / 32);
    // 主体 (深棕)
    ctx.fillStyle = '#5A3A20';
    for (let row = yTop; row < 30; row++) {
      ctx.fillRect(x + 14 + col, y + row, 1, 1);
    }
    // 顶沿亮棕高光
    ctx.fillStyle = '#8A6A40';
    ctx.fillRect(x + 14 + col, y + yTop, 1, 1);
  }

  // 车斗底（深棕加重一层，强化"底板"视觉）
  ctx.fillStyle = '#3A2618';
  ctx.fillRect(x + 14, y + 30, 40, 4);

  // 木板纹理（每 8 像素一道竖向深棕分割线）
  ctx.fillStyle = '#3A2618';
  ctx.fillRect(x + 22, y + 18, 1, 12);
  ctx.fillRect(x + 30, y + 14, 1, 16);
  ctx.fillRect(x + 38, y + 11, 1, 19);
  ctx.fillRect(x + 44, y + 10, 1, 20);
  // 车斗前壁底部加固铁箍
  ctx.fillStyle = '#2A1A0F';
  ctx.fillRect(x + 14, y + 30, 40, 1);

  // ---- 金矿堆（5x5 八边形圆润金块，密集堆叠）----
  // 每颗金块占 5x5 像素：中间 5x3 + 上下各 3x1 收边，呈八边形似圆
  const stones: ReadonlyArray<{ cx: number; cy: number }> = [
    // 底层（紧贴车斗内沿）
    { cx: 18, cy: 16 },
    { cx: 23, cy: 14 },
    { cx: 28, cy: 12 },
    { cx: 33, cy: 10 },
    { cx: 38, cy: 8 },
    { cx: 43, cy: 7 },
    // 中层
    { cx: 21, cy: 11 },
    { cx: 26, cy: 8 },
    { cx: 31, cy: 6 },
    { cx: 37, cy: 3 },
    { cx: 42, cy: 2 },
    // 顶层
    { cx: 24, cy: 4 },
    { cx: 30, cy: 1 },
    { cx: 35, cy: -1 },
  ];
  // 主色金黄（5x5 八边形）
  ctx.fillStyle = '#FFD700';
  for (const s of stones) {
    const cx = x + s.cx;
    const cy = y + s.cy;
    ctx.fillRect(cx - 2, cy - 1, 5, 3);  // 中间 5x3
    ctx.fillRect(cx - 1, cy - 2, 3, 1);  // 顶 3x1
    ctx.fillRect(cx - 1, cy + 2, 3, 1);  // 底 3x1
  }
  // 高光（每颗左上角暖白）
  ctx.fillStyle = '#FFF5B0';
  for (const s of stones) {
    ctx.fillRect(x + s.cx - 1, y + s.cy - 1, 2, 1);
  }
  // 阴影（每颗右下角暗黄）
  ctx.fillStyle = '#C89800';
  for (const s of stones) {
    ctx.fillRect(x + s.cx + 1, y + s.cy + 1, 1, 1);
  }
}

function drawCh2SeaDecor(ctx: CanvasRenderingContext2D, colors: BackgroundColors): void {
  // --- 海底淤泥层（屏幕最底部） ---
  ctx.fillStyle = '#050E1A';
  ctx.fillRect(0, H - 10, W, 10);

  // --- 散落贝壳/珊瑚（地下浅层小三角） ---
  const corals: ReadonlyArray<{ x: number; y: number; w: number; h: number; color: string }> = [
    { x: 90, y: 200, w: 5, h: 4, color: '#FF9E80' },
    { x: 200, y: 230, w: 4, h: 3, color: '#FFCC80' },
    { x: 340, y: 215, w: 6, h: 5, color: '#FF9E80' },
    { x: 470, y: 235, w: 5, h: 4, color: '#FFB099' },
    { x: 580, y: 210, w: 4, h: 3, color: '#FFCC80' },
    { x: 700, y: 225, w: 6, h: 5, color: '#FF9E80' },
  ];
  for (const c of corals) {
    ctx.fillStyle = c.color;
    // 阶梯三角
    for (let row = 0; row < c.h; row++) {
      const shrink = Math.floor((row / c.h) * (c.w / 2));
      ctx.fillRect(c.x + shrink, c.y + row, c.w - shrink * 2, 1);
    }
  }

  // --- 沉船残骸剪影（地下深层中央，暗蓝色，远景） ---
  ctx.fillStyle = '#0E1F2F';
  // 船身（梯形）
  for (let row = 0; row < 18; row++) {
    const w = 140 - row * 4;
    const x = 360 + row * 2;
    ctx.fillRect(x, 380 + row, w, 1);
  }
  // 桅杆
  ctx.fillRect(430, 350, 3, 30);
  // 残破斜帆
  ctx.fillRect(424, 354, 12, 2);
  ctx.fillRect(420, 358, 16, 2);

  void colors;
}

/**
 * 城堡塔（含 1 主塔 + 1 副塔），起点 (x, y) 是城堡组左上角
 * 默认布局：副塔在左 (x~x+32) + 主塔在右 (x+38~x+88)，整体宽 88 高 70
 * mirror=true 时翻转：主塔在左 + 副塔在右，用于右侧城堡形成镜像对称
 */
function drawCastleTower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bodyColor: string,
  sideColor: string,
  windowColor: string,
  mirror = false
): void {
  // 副塔/主塔 x 偏移：mirror 时副塔靠右 (x+56)、主塔靠左 (x+0)
  const sideX = x + (mirror ? 56 : 0);
  const mainX = x + (mirror ? 0 : 38);

  // 副塔（矮些）
  ctx.fillStyle = sideColor;
  ctx.fillRect(sideX, y + 25, 32, 45);
  // 副塔屋顶（▲ 金字塔阶梯：顶尖窄，底部宽）
  for (let row = 0; row < 12; row++) {
    const shrink = 11 - row;
    ctx.fillRect(sideX + shrink, y + 13 + row, 32 - shrink * 2, 1);
  }
  // 副塔小窗
  ctx.fillStyle = windowColor;
  ctx.fillRect(sideX + 13, y + 36, 6, 9);

  // 主塔（高些）
  ctx.fillStyle = bodyColor;
  ctx.fillRect(mainX, y + 18, 50, 52);
  // 主塔屋顶（▲ 更陡的阶梯：顶尖窄，底部宽）
  for (let row = 0; row < 16; row++) {
    const shrink = Math.floor((15 - row) * 1.5);
    ctx.fillRect(mainX + shrink, y + 2 + row, 50 - shrink * 2, 1);
  }
  // 主塔窗户
  ctx.fillStyle = windowColor;
  ctx.fillRect(mainX + 20, y + 32, 10, 14);
  // 窗框（顶部亮一道）
  ctx.fillStyle = bodyColor;
  ctx.fillRect(mainX + 20, y + 32, 10, 2);
}

function drawCh3CastleDecor(ctx: CanvasRenderingContext2D, colors: BackgroundColors): void {
  // --- 远景城堡剪影（屏幕两侧镜像对称，避开中央矿工区 + HUD） ---
  // HUD 在 y=0~36；矿工 x=400 y=92；GROUND_Y=140 是地表
  // y 起点 70：城堡总高 70 像素，底部 y=140 正好贴地表
  // 左城堡：副塔在左 + 主塔在右；右城堡 mirror=true：主塔在左 + 副塔在右 → 整体左右对称
  drawCastleTower(ctx, 70, 70, '#F0A8C8', '#E090B8', '#6A1F3A', false);
  drawCastleTower(ctx, 640, 70, '#F0A8C8', '#E090B8', '#6A1F3A', true);

  // --- 城墙地表：替换 GROUND_Y 处的草地为城墙石材 + 顶部锯齿垛口 ---
  // 覆盖原 drawGround 草尖区域 (y=138~156)，画粉色石墙 + battlements 锯齿顶
  // 城墙主体（y=140~156，整宽，粉白石材）
  ctx.fillStyle = '#F0D5E0';
  ctx.fillRect(0, GROUND_Y, W, 16);
  // 石材缝隙阴影（深粉横线，分割上下两层）
  ctx.fillStyle = '#C880A8';
  ctx.fillRect(0, GROUND_Y + 7, W, 1);
  // 石材分块竖线（每 24px 一道竖向缝隙，模拟砖块拼接）
  for (let x = 12; x < W; x += 24) {
    const yMid = GROUND_Y + 8;
    ctx.fillRect(x, GROUND_Y, 1, 7);
    ctx.fillRect(x + 12, yMid, 1, 7); // 错位的下半层缝
  }
  // 顶部锯齿垛口（battlements）：每 22px 一周期，14 凸 + 8 凹，加高至 14px 更醒目
  // 凸起部分 y=126~140 (14 px 高)，凹陷部分露出天空背景
  ctx.fillStyle = '#F0D5E0';
  for (let bx = 0; bx < W; bx += 22) {
    ctx.fillRect(bx, GROUND_Y - 14, 14, 14);
  }
  // 垛口侧壁深色描边（每个垛口左右各 1px 阴影，强化立体感）
  ctx.fillStyle = '#C880A8';
  for (let bx = 0; bx < W; bx += 22) {
    ctx.fillRect(bx + 13, GROUND_Y - 14, 1, 14); // 右侧阴影
    ctx.fillRect(bx, GROUND_Y - 14, 14, 1);       // 顶部阴影
  }
  // 城墙顶面（垛口之间的"墙顶"，y=139 一条深色横线，区分垛口与墙身）
  ctx.fillStyle = '#A86090';
  ctx.fillRect(0, GROUND_Y - 1, W, 1);

  // --- 蝴蝶结/丝带装饰（地表两侧粉红） ---
  ctx.fillStyle = '#FF6FA8';
  // 左：蝴蝶结
  ctx.fillRect(12, 128, 4, 6);
  ctx.fillRect(10, 130, 8, 2);
  ctx.fillRect(8, 127, 2, 3);
  ctx.fillRect(18, 127, 2, 3);
  // 右：对称蝴蝶结
  ctx.fillRect(W - 16, 128, 4, 6);
  ctx.fillRect(W - 18, 130, 8, 2);
  ctx.fillRect(W - 10, 127, 2, 3);
  ctx.fillRect(W - 20, 127, 2, 3);

  // --- 散落糖果/蛋糕（地下浅层小方块组合） ---
  const candies: ReadonlyArray<{ x: number; y: number; type: 'cake' | 'sweet' }> = [
    { x: 110, y: 205, type: 'cake' },
    { x: 210, y: 235, type: 'sweet' },
    { x: 350, y: 220, type: 'cake' },
    { x: 490, y: 240, type: 'sweet' },
    { x: 610, y: 215, type: 'cake' },
    { x: 700, y: 235, type: 'sweet' },
  ];
  for (const c of candies) {
    if (c.type === 'cake') {
      // 三层蛋糕
      ctx.fillStyle = '#FFE0EC';
      ctx.fillRect(c.x, c.y + 4, 8, 3); // 底层
      ctx.fillStyle = '#FFC0DC';
      ctx.fillRect(c.x + 1, c.y + 2, 6, 2); // 中层
      ctx.fillStyle = '#FFA0CC';
      ctx.fillRect(c.x + 2, c.y, 4, 2); // 顶层
      ctx.fillStyle = '#D81E5B';
      ctx.fillRect(c.x + 3, c.y - 1, 2, 1); // 樱桃
    } else {
      // 糖果（包装糖）
      ctx.fillStyle = '#FF6FA8';
      ctx.fillRect(c.x + 1, c.y, 5, 4);
      ctx.fillStyle = '#FFE0EC';
      ctx.fillRect(c.x, c.y + 1, 1, 2);
      ctx.fillRect(c.x + 6, c.y + 1, 1, 2);
    }
  }

  void colors;
}

const STATIC_DRAW_BY_CHAPTER: Record<ChapterId, (ctx: CanvasRenderingContext2D, colors: BackgroundColors) => void> = {
  [ChapterId.CRYSTAL_MINE]: drawCh1MineDecor,
  [ChapterId.CRAB_BAY]: drawCh2SeaDecor,
  [ChapterId.PIGGY_THRONE]: drawCh3CastleDecor,
};

/** 静态装饰统一入口。chapter=null 时不绘制（用于主菜单等场景） */
export function drawChapterStaticDecor(
  ctx: CanvasRenderingContext2D,
  chapter: ChapterId | null,
  colors: BackgroundColors
): void {
  if (chapter === null) return;
  const fn = STATIC_DRAW_BY_CHAPTER[chapter];
  if (fn) fn(ctx, colors);
}

// ===== 动画器工厂 =====

function buildCh1Animators(): DecorAnimator[] {
  const torchColors = ['#FFAA33', '#FF6F1A', '#FFE066', '#FFC844'];
  // 火把粒子：非 sparkle 模式（sparkle 会让粒子原地不动），让火星向上飘动
  // 加上负重力让火苗"先快后慢"，模拟自然火焰上升曲线
  const torchEmit = (x: number, y: number): EmitOptions => ({
    x,
    y,
    count: 2,
    colors: torchColors,
    speedMin: 20,
    speedMax: 38,
    lifeMin: 0.6,
    lifeMax: 1.1,
    sizeMin: 3,
    sizeMax: 5,
    gravity: -15,
    sparkle: false,
    angleMin: -Math.PI / 2 - 0.35,
    angleMax: -Math.PI / 2 + 0.35,
  });
  // 火把架顶平台在 y=GROUND_Y-32=108，粒子从平台略上 (y=106) 喷出
  const leftTorch = new PeriodicParticleEmitter(0.05, 0.12, () => torchEmit(36, 106));
  const rightTorch = new PeriodicParticleEmitter(0.05, 0.12, () => torchEmit(W - 36, 106));
  // 偶发灰尘下落（地下浅层）
  const dust = new PeriodicParticleEmitter(2.5, 5.0, () => ({
    x: 100 + Math.random() * (W - 200),
    y: 150,
    count: 3,
    colors: ['#7A5A38', '#5A3F28'],
    speedMin: 5,
    speedMax: 12,
    lifeMin: 1.2,
    lifeMax: 2.0,
    sizeMin: 1,
    sizeMax: 2,
    gravity: 20,
    angleMin: Math.PI / 2 - 0.2,
    angleMax: Math.PI / 2 + 0.2,
  }));
  return [leftTorch, rightTorch, dust];
}

function buildCh2Animators(): DecorAnimator[] {
  // 海草丛（左右两侧，加宽加高让其更显眼）
  const seaweedColor = '#3FBB7A';
  const seaweedDark = '#2D8C5C';
  const seaweed = new SwaySpriteAnimator(
    [
      { baseX: 28, baseY: GROUND_Y + 2, width: 3, height: 28, color: seaweedColor, phaseOffset: 0 },
      { baseX: 40, baseY: GROUND_Y + 2, width: 3, height: 22, color: seaweedDark, phaseOffset: 0.6 },
      { baseX: 52, baseY: GROUND_Y + 2, width: 3, height: 30, color: seaweedColor, phaseOffset: 1.2 },
      { baseX: 64, baseY: GROUND_Y + 2, width: 3, height: 20, color: seaweedDark, phaseOffset: 1.8 },
      { baseX: W - 30, baseY: GROUND_Y + 2, width: 3, height: 28, color: seaweedColor, phaseOffset: 0.3 },
      { baseX: W - 42, baseY: GROUND_Y + 2, width: 3, height: 22, color: seaweedDark, phaseOffset: 0.9 },
      { baseX: W - 54, baseY: GROUND_Y + 2, width: 3, height: 30, color: seaweedColor, phaseOffset: 1.5 },
      { baseX: W - 66, baseY: GROUND_Y + 2, width: 3, height: 20, color: seaweedDark, phaseOffset: 2.1 },
    ],
    3,
    2.5
  );

  // 气泡上升
  const bubbles = new PeriodicParticleEmitter(0.5, 1.0, () => ({
    x: 60 + Math.random() * (W - 120),
    y: H - 20,
    count: 1,
    colors: ['#B0E0FF', '#E0F0FF', '#80C0E0'],
    speedMin: 18,
    speedMax: 32,
    lifeMin: 2.5,
    lifeMax: 4.0,
    sizeMin: 2,
    sizeMax: 4,
    gravity: -8,
    sparkle: false,
    angleMin: -Math.PI / 2 - 0.15,
    angleMax: -Math.PI / 2 + 0.15,
  }));

  // 远景小鱼
  const fish = new TraversalAnimator(6, 12, 60, 200, 320, '#5AA5CC', 6);

  return [seaweed, bubbles, fish];
}

function buildCh3Animators(): DecorAnimator[] {
  // 飘落花瓣（颜色对比要强：纯白 + 深玫红 + 鲜粉，避免和粉背景融为一体）
  const flowers = new PeriodicParticleEmitter(0.7, 1.5, () => ({
    x: 50 + Math.random() * (W - 100),
    y: 40,
    count: 1,
    colors: ['#FFFFFF', '#D81E5B', '#FF1493', '#FFE066'],
    speedMin: 15,
    speedMax: 28,
    lifeMin: 3.5,
    lifeMax: 5.5,
    sizeMin: 2,
    sizeMax: 4,
    gravity: 5,
    angleMin: Math.PI / 2 - 0.4,
    angleMax: Math.PI / 2 + 0.4,
  }));

  // 城堡顶旗帜：4 座塔顶各 1 面（左城堡 副+主 / 右城堡 mirror 后 主+副）
  // 左城堡 x=70：副塔尖 (85, 83) 主塔尖 (130, 72)
  // 右城堡 x=640 mirror=true：主塔尖 (665, 72) 副塔尖 (712, 83)
  const flags = new SwaySpriteAnimator(
    [
      { baseX: 85, baseY: 83, width: 7, height: 7, color: '#FF1493', phaseOffset: 0 },
      { baseX: 130, baseY: 72, width: 8, height: 8, color: '#D81E5B', phaseOffset: 0.5 },
      { baseX: 665, baseY: 72, width: 8, height: 8, color: '#D81E5B', phaseOffset: 1.0 },
      { baseX: 712, baseY: 83, width: 7, height: 7, color: '#FF1493', phaseOffset: 1.5 },
    ],
    2,
    1.5
  );

  // 偶发爱心粒子
  const hearts = new PeriodicParticleEmitter(2.5, 4.5, () => ({
    x: 150 + Math.random() * (W - 300),
    y: GROUND_Y,
    count: 1,
    colors: ['#FF6FA8', '#FFB6E5'],
    speedMin: 30,
    speedMax: 50,
    lifeMin: 1.2,
    lifeMax: 1.8,
    sizeMin: 3,
    sizeMax: 4,
    gravity: -10,
    angleMin: -Math.PI / 2 - 0.3,
    angleMax: -Math.PI / 2 + 0.3,
  }));

  return [flags, flowers, hearts];
}

const ANIMATOR_FACTORY_BY_CHAPTER: Record<ChapterId, () => DecorAnimator[]> = {
  [ChapterId.CRYSTAL_MINE]: buildCh1Animators,
  [ChapterId.CRAB_BAY]: buildCh2Animators,
  [ChapterId.PIGGY_THRONE]: buildCh3Animators,
};

/** 创建该章节的动画器列表。chapter=null 时返回空数组（主菜单等场景） */
export function createChapterAnimators(chapter: ChapterId | null): DecorAnimator[] {
  if (chapter === null) return [];
  const factory = ANIMATOR_FACTORY_BY_CHAPTER[chapter];
  return factory ? factory() : [];
}
