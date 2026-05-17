# 黄金矿工 H5 - 游戏设计文档

## 一、项目概述

经典黄金矿工像素风复刻，纯 HTML5 Canvas + TypeScript 实现，零图片资源依赖，所有像素素材通过代码数据矩阵生成。

### 技术选型

| 项目       | 方案                                    |
| ---------- | --------------------------------------- |
| 渲染引擎   | HTML5 Canvas 2D                         |
| 开发语言   | TypeScript                              |
| 构建工具   | Vite                                    |
| 像素素材   | 代码数据矩阵（32x32），Canvas 逐像素绘制 |
| 音效       | Web Audio API                           |
| 数据存储   | localStorage（存档/最高分）              |
| 部署       | 静态页面，可托管 GitHub Pages            |

### 设计分辨率

- 逻辑分辨率：480 x 640（竖屏，适配移动端）
- 像素精灵尺寸：32x32
- 渲染缩放：Canvas `imageSmoothingEnabled = false` 保持像素锐利
- 自适应：根据屏幕尺寸等比缩放

---

## 二、像素素材方案

### 2.1 核心思路

所有精灵定义为二维颜色数组（`PixelMap`），运行时通过 Canvas `fillRect` 逐像素绘制，无需任何外部图片文件。

```typescript
// 像素数据类型定义
type PixelColor = string | 0; // 颜色字符串或 0（透明）
type PixelMap = PixelColor[][];

// 渲染函数
function drawPixelMap(
  ctx: CanvasRenderingContext2D,
  map: PixelMap,
  x: number,
  y: number,
  scale: number = 2
): void {
  for (let row = 0; row < map.length; row++) {
    for (let col = 0; col < map[row].length; col++) {
      const color = map[row][col];
      if (color) {
        ctx.fillStyle = color as string;
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  }
}
```

### 2.2 性能说明

- 每个 32x32 精灵 = 1024 个像素点
- 单次绘制约 1024 次 `fillRect` 调用
- 同屏 50 个精灵 ≈ 51200 次调用，Canvas 2D 完全无压力
- 可通过离屏 Canvas 预渲染为 ImageData 缓存，进一步提升性能

### 2.3 优化策略：预渲染缓存

```typescript
// 将 PixelMap 预渲染到离屏 Canvas，之后用 drawImage 绘制
function createSpriteCache(map: PixelMap, scale: number = 2): HTMLCanvasElement {
  const width = map[0].length * scale;
  const height = map.length * scale;
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  drawPixelMap(ctx, map, 0, 0, scale);
  return offscreen;
}
```

### 2.4 精灵清单

| 分类     | 精灵名称         | 尺寸   | 说明               |
| -------- | ---------------- | ------ | ------------------ |
| 角色     | 矿工（待机帧）   | 32x32  | 坐在地面，上下晃动 |
| 角色     | 矿工（拉拽帧）   | 32x32  | 用力拉绳动画       |
| 钩爪     | 钩爪             | 16x16  | 三叉钩造型         |
| 矿物     | 小金块           | 16x16  | 小巧的金块         |
| 矿物     | 大金块           | 32x32  | 大块黄金           |
| 矿物     | 钻石             | 16x16  | 闪烁的钻石         |
| 矿物     | 石头             | 24x24  | 灰色岩石           |
| 矿物     | 炸弹             | 16x16  | 圆形炸弹           |
| 矿物     | 神秘袋           | 16x16  | 带问号的袋子       |
| 矿物     | 骨头             | 24x12  | 白色骨头           |
| 背景     | 天空层           | 全宽   | 渐变蓝天           |
| 背景     | 地表层           | 全宽   | 草地+泥土          |
| 背景     | 地下层           | 全宽   | 深色土壤+石头纹理  |
| UI       | 按钮基础         | 96x32  | 像素风按钮         |
| UI       | 数字 0-9         | 8x8    | 像素字体           |
| 特效     | 金币闪光粒子     | 4x4    | 金色粒子           |
| 特效     | 抓取成功特效     | 16x16  | 星星迸发           |

---

## 三、游戏核心玩法

### 3.1 基本流程

```
主菜单 → 关卡选择(可选) → 游戏进行 → 结算界面 → 下一关 / 游戏结束
```

### 3.2 核心机制

**矿工 & 钩爪系统：**

- 矿工固定在画面顶部，钩爪以矿工为圆心左右摆动
- 摆动公式：`angle = sin(time * swingSpeed) * maxAngle`
- 玩家点击/按空格发射钩爪向下抓取
- 钩爪沿当前角度方向匀速延伸
- 碰到矿物 → 自动收回（速度受重量影响）
- 未碰到 → 到达最大距离后收回

**重量与速度公式：**

```
收回速度 = baseSpeed / (1 + weight * 0.5)
```

### 3.3 矿物体系

| 矿物   | 价值   | 重量系数 | 尺寸   | 特殊效果       |
| ------ | ------ | -------- | ------ | -------------- |
| 小金块 | 50$    | 0.3      | 16x16  | -              |
| 大金块 | 200$   | 0.8      | 32x32  | -              |
| 钻石   | 600$   | 0.2      | 16x16  | -              |
| 石头   | 10$    | 1.5      | 24x24  | -              |
| 炸弹   | -100$  | 0.2      | 16x16  | 扣钱           |
| 神秘袋 | 随机   | 0.2      | 16x16  | 50~888$ 随机   |
| 骨头   | 5$     | 0.1      | 24x12  | -              |

### 3.4 关卡系统

- 每关有目标金额 + 时间限制（60秒）
- 达标 → 进入下一关，未达标 → Game Over
- 关卡递进：目标金额递增，矿物位置更刁钻，石头/炸弹更多
- 每关矿物随机生成，但稀有矿物概率受关卡配置控制

### 3.5 道具商店

关卡之间可购买道具：

| 道具       | 价格  | 效果                       | 持续时间 |
| ---------- | ----- | -------------------------- | -------- |
| 炸药       | 150$  | 抓到石头时自动炸毁         | 当关     |
| 力量药水   | 200$  | 收回速度 +50%              | 当关     |
| 幸运草     | 100$  | 神秘袋最低金额提升至 200$  | 当关     |
| 石头收集书 | 80$   | 石头价值 x3                | 当关     |

---

## 四、游戏状态机

```
                    ┌─────────────┐
                    │    MENU     │
                    └──────┬──────┘
                           │ 开始游戏
                    ┌──────▼──────┐
                    │    READY    │ ← 3,2,1 倒计时
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   PLAYING   │◄──────────┐
                    └──┬───┬──┬───┘           │
                       │   │  │                │
              时间到   │   │  │ 抓到东西       │
                       │   │  │                │
                  ┌────▼┐  │  └──────┐         │
                  │RESULT│ │   ┌─────▼───┐     │
                  └──┬───┘ │   │ REELING │     │
              失败  │     │   └────┬────┘     │
                   │  成功│        │收回       │
              ┌────▼──┐  │        └───────────┘
              │GAME   │  │
              │OVER   │  │
              └───────┘  │
                     ┌────▼─────┐
                     │   SHOP   │
                     └────┬─────┘
                          │ 下一关
                     ┌────▼─────┐
                     │   READY  │
                     └──────────┘
```

---

## 五、项目文件结构

```
goldminer/
├── index.html                # 入口页面
├── vite.config.ts            # Vite 配置
├── tsconfig.json             # TypeScript 配置
├── package.json              # 依赖管理
├── src/
│   ├── main.ts               # 入口 & 游戏循环
│   ├── core/
│   │   ├── Game.ts           # 游戏主控（状态机）
│   │   ├── Renderer.ts       # Canvas 渲染器 & 缩放适配
│   │   ├── Input.ts          # 输入管理（键鼠 + 触摸）
│   │   ├── Audio.ts          # 音效管理
│   │   └── Storage.ts        # localStorage 存档
│   ├── entity/
│   │   ├── Miner.ts          # 矿工（含动画状态）
│   │   ├── Hook.ts           # 钩爪（摆动、发射、收回）
│   │   ├── Mineral.ts        # 矿物基类
│   │   └── types.ts          # 矿物类型定义 & 配置
│   ├── scene/
│   │   ├── SceneBase.ts      # 场景基类
│   │   ├── MenuScene.ts      # 主菜单场景
│   │   ├── GameScene.ts      # 游戏场景（核心）
│   │   ├── ShopScene.ts      # 商店场景
│   │   └── ResultScene.ts    # 结算场景
│   ├── level/
│   │   ├── LevelManager.ts   # 关卡管理
│   │   └── levels.ts         # 关卡数据配置
│   ├── ui/
│   │   ├── HUD.ts            # 游戏内 HUD（时间、金额、目标）
│   │   ├── Button.ts         # 像素风按钮
│   │   └── PixelText.ts      # 像素字体渲染
│   ├── assets/
│   │   └── sprites.ts        # 所有像素数据定义（替代图片资源）
│   └── utils/
│       ├── math.ts           # 数学工具
│       ├── collision.ts      # 碰撞检测
│       └── random.ts         # 随机数 & 概率工具
├── public/
│   └── audio/                # 音效文件（可选）
└── doc/
    └── game-design.md        # 本文档
```

---

## 六、开发阶段规划

### Phase 1 - 基础框架

> 搭建项目骨架，实现渲染和输入系统

- [ ] 项目初始化（Vite + TypeScript）
- [ ] Canvas 渲染器（自适应缩放、像素清晰渲染）
- [ ] 游戏主循环（requestAnimationFrame + deltaTime）
- [ ] 输入系统（键盘 + 鼠标 + 触摸统一封装）
- [ ] 场景管理器 + 状态机基础

### Phase 2 - 像素素材系统

> 建立纯代码像素素材体系

- [ ] PixelMap 类型定义 & 渲染函数
- [ ] 预渲染缓存系统
- [ ] 绘制核心精灵数据（矿工、钩爪、矿物）
- [ ] 背景像素数据（天空、地表、地下）
- [ ] 像素字体 & UI 元素

### Phase 3 - 核心玩法

> 实现游戏最核心的抓取循环

- [ ] 矿工角色（待机动画）
- [ ] 钩爪系统（摆动 → 发射 → 碰撞 → 收回）
- [ ] 矿物生成 & 碰撞检测
- [ ] 计时器 + 目标金额判定
- [ ] HUD 界面（时间、当前金额、目标金额）

### Phase 4 - 关卡 & 商店

> 完善游戏循环

- [ ] 关卡数据配置（目标金额、矿物分布、难度参数）
- [ ] 关卡管理器（加载、切换、进度）
- [ ] 关卡结算界面（达标/未达标）
- [ ] 道具商店（购买 & 使用逻辑）
- [ ] localStorage 存档（进度、最高分）

### Phase 5 - 音效 & 特效

> 增加游戏体验

- [ ] Web Audio API 音效管理
- [ ] 游戏音效（发射、抓取、成功、失败、倒计时）
- [ ] 粒子特效（金币闪光、抓取成功、炸药爆炸）
- [ ] 背景音乐（可选，像素风 8-bit）

### Phase 6 - 打磨 & 发布

> 优化体验并部署

- [ ] 移动端适配 & 触摸优化
- [ ] 性能优化（精灵缓存、对象池）
- [ ] 游戏平衡性调参
- [ ] 主菜单 & 完整 UI 流程
- [ ] 部署上线

---

## 七、关键技术要点

| 技术点         | 实现方式                                          |
| -------------- | ------------------------------------------------- |
| 钩爪摆动       | `angle = sin(time * speed) * maxAngle`            |
| 钩爪发射       | 沿角度方向匀速延伸，`dx = cos(angle) * speed`     |
| 碰撞检测       | 圆形碰撞（钩爪尖端 vs 矿物包围圆）                |
| 重量系统       | 收回速度 = `baseSpeed / (1 + weight * 0.5)`       |
| 钩爪绘制       | 从矿工位置到钩爪尖端的线段 + 钩爪精灵             |
| 像素清晰渲染   | `imageSmoothingEnabled = false`                    |
| 帧率控制       | `requestAnimationFrame` + deltaTime 固定步长       |
| 精灵缓存       | 离屏 Canvas 预渲染，`drawImage` 复用               |
| 自适应缩放     | 根据窗口尺寸计算 scale，等比缩放逻辑分辨率         |
| 触摸适配       | touchstart/touchend 映射为统一输入事件             |

---

## 八、配色参考

```
天空渐变:   #87CEEB → #4A90D9
地表草地:   #4CAF50, #388E3C
地下土壤:   #8B5E3C, #6D4C2A
深层土壤:   #5D3A1A, #4A2E15
金块:       #FFD700, #D4A017, #FFF8B0
钻石:       #B9F2FF, #00CED1, #E0FFFF
石头:       #808080, #696969, #A9A9A9
炸弹:       #2C2C2C, #FF4444
UI主色:     #8B4513 (棕木色，复古感)
UI强调色:   #FFD700 (金色)
```
