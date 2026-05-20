# 黄金矿工 H5 - 架构设计文档

## 一、技术架构总览

```
┌────────────────────────────────────────────┐
│                  index.html                │
│              (入口页面, Canvas)              │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│               main.ts                      │
│         (入口, 初始化, 游戏主循环)           │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│              core/Game.ts                  │
│           (游戏主控 & 状态机)               │
├────────────┬───────────┬───────────────────┤
│  Renderer  │   Input   │  Audio / Storage  │
│ (渲染引擎)  │ (输入系统) │  (音效 / 存档)    │
└─────┬──────┴─────┬─────┴───────────────────┘
      │            │
┌─────▼────────────▼─────────────────────────┐
│              scene/ (场景层)                │
│  MenuScene │ GameScene │ ShopScene │ Result │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│             entity/ (实体层)                │
│     Miner │ Hook │ Mineral │ types          │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│        支撑层: ui/ │ level/ │ assets/ │ utils/ │
└────────────────────────────────────────────┘
```

## 二、核心模块职责

### 2.1 core/ - 核心引擎层

| 模块 | 职责 | 关键接口 |
|------|------|---------|
| **Game.ts** | 游戏主控，管理状态机和场景切换 | `start()`, `changeScene()`, `getCurrentState()` |
| **Renderer.ts** | Canvas 渲染器，处理自适应缩放和像素清晰渲染 | `clear()`, `drawPixelMap()`, `drawImage()`, `resize()` |
| **Input.ts** | 统一输入管理（键盘/鼠标/触摸） | `isPressed()`, `onTap()`, `update()` |
| **Audio.ts** | Web Audio API 音效管理 | `play()`, `stopAll()`, `setVolume()` |
| **Storage.ts** | localStorage 存档管理 | `save()`, `load()`, `getHighScore()` |

### 2.2 entity/ - 游戏实体层

| 模块 | 职责 | 关键机制 |
|------|------|---------|
| **Miner.ts** | 矿工角色，含动画状态（待机/拉拽/开心/难过） | 帧动画切换 |
| **Hook.ts** | 钩爪系统（摆动→发射→碰撞→收回） | 状态机驱动，摆动公式 `sin(t*speed)*maxAngle` |
| **Mineral.ts** | 矿物基类，包含碰撞体和价值属性 | 圆形碰撞检测 |
| **types.ts** | 矿物类型枚举和配置数据 | 价值/重量/尺寸配置表 |

### 2.3 scene/ - 场景层

| 模块 | 职责 |
|------|------|
| **SceneBase.ts** | 场景抽象基类，定义 `update()` / `render()` / `enter()` / `exit()` 生命周期 |
| **MenuScene.ts** | 主菜单（开始游戏、最高分显示） |
| **GameScene.ts** | 核心游戏场景（矿工+钩爪+矿物+HUD+计时） |
| **ShopScene.ts** | 道具商店（关卡间购买道具） |
| **ResultScene.ts** | 结算界面（达标/未达标判定） |

### 2.4 支撑模块

| 模块 | 职责 |
|------|------|
| **level/LevelManager.ts** | 关卡加载、切换、进度管理 |
| **level/levels.ts** | 关卡数据配置（目标金额、矿物概率、难度参数） |
| **ui/HUD.ts** | 游戏内信息显示（时间、金额、目标） |
| **ui/Button.ts** | 像素风通用按钮组件 |
| **ui/PixelText.ts** | 像素字体渲染 |
| **assets/sprites.ts** | 所有像素精灵 PixelMap 数据定义 |
| **utils/math.ts** | 数学工具（向量、角度、插值） |
| **utils/collision.ts** | 碰撞检测（圆形碰撞） |
| **utils/random.ts** | 随机数与概率分布工具 |

## 三、核心数据流

### 3.1 游戏主循环

```
requestAnimationFrame
    │
    ▼
calcDeltaTime() ──► Input.update()
                        │
                        ▼
                  currentScene.update(dt)
                        │
                        ▼
                  Renderer.clear()
                        │
                        ▼
                  currentScene.render(renderer)
                        │
                        ▼
                  下一帧 ◄─────────────────┘
```

### 3.2 钩爪状态机

```
SWINGING (摆动)
    │ 玩家输入
    ▼
EXTENDING (发射延伸)
    │ 碰到矿物 / 到达最大距离
    ├── 碰到 ──► REELING_WITH_MINERAL (带矿物收回)
    └── 未碰到 ──► REELING_EMPTY (空收回)
    │
    ▼
SWINGING (回到摆动状态)
```

### 3.3 像素素材渲染管线

```
PixelMap (二维颜色数组)
    │
    ▼ createSpriteCache()
离屏 Canvas (预渲染缓存)
    │
    ▼ drawImage()
主 Canvas (实际显示)
```

## 四、状态机设计

### 4.1 游戏全局状态

```typescript
enum GameState {
  MENU,      // 主菜单
  READY,     // 倒计时准备
  PLAYING,   // 游戏进行
  REELING,   // 钩爪收回中
  RESULT,    // 关卡结算
  SHOP,      // 道具商店
  GAME_OVER  // 游戏结束
}
```

### 4.2 状态转换规则

| 当前状态 | 触发条件 | 目标状态 |
|---------|---------|---------|
| MENU | 点击开始 | READY |
| READY | 倒计时结束 | PLAYING |
| PLAYING | 玩家输入发射 | PLAYING (钩爪状态变化) |
| PLAYING | 钩爪碰到矿物 | REELING |
| REELING | 矿物收回到矿工 | PLAYING |
| PLAYING | 时间到 | RESULT |
| RESULT | 达标 | SHOP |
| SHOP | 确认/跳过 | READY (下一关) |
| RESULT | 未达标 | GAME_OVER |
| GAME_OVER | 重新开始 | MENU |

## 五、碰撞检测方案

采用**圆形碰撞检测**，每个矿物有一个包围圆：

```typescript
// 碰撞检测核心
function checkCollision(
  hookTip: { x: number; y: number },
  mineral: { x: number; y: number; radius: number }
): boolean {
  const dx = hookTip.x - mineral.x;
  const dy = hookTip.y - mineral.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < mineral.radius;
}
```

钩爪尖端为点，矿物为圆，判断距离即可。

## 六、自适应缩放方案

```
逻辑分辨率: 480 x 640 (固定)
    │
    ▼ 计算缩放因子
scale = min(screenWidth / 480, screenHeight / 640)
    │
    ▼ 应用到 Canvas
canvas.style.width = 480 * scale
canvas.style.height = 640 * scale
canvas.width = 480  (逻辑像素不变)
canvas.height = 640
imageSmoothingEnabled = false (保持像素锐利)
```

## 七、性能优化策略

| 策略 | 说明 |
|------|------|
| **精灵预渲染** | PixelMap → 离屏 Canvas 缓存，后续用 drawImage 绘制 |
| **对象池** | 矿物、粒子等频繁创建/销毁的对象使用对象池复用 |
| **脏矩形** | 仅重绘变化区域（可选优化） |
| **固定时间步长** | deltaTime 控制逻辑更新，避免帧率波动影响游戏逻辑 |
