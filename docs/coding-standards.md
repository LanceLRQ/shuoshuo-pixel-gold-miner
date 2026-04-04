# 黄金矿工 H5 - 编码规范

## 一、语言与工具链

| 项目 | 规范 |
|------|------|
| 语言 | TypeScript (strict mode) |
| 构建 | Vite |
| 包管理 | npm / pnpm |
| 代码风格 | ESLint + Prettier (如配置) |
| 模块系统 | ES Modules (import/export) |

## 二、命名规范

### 2.1 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 类文件 | PascalCase | `Game.ts`, `MenuScene.ts`, `HookEntity.ts` |
| 工具文件 | camelCase | `math.ts`, `collision.ts`, `random.ts` |
| 类型定义 | camelCase 或 PascalCase | `types.ts` |
| 常量/数据文件 | camelCase | `levels.ts`, `sprites.ts` |

### 2.2 代码命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 类 | PascalCase | `class GameScene`, `class Miner` |
| 接口 | PascalCase + I前缀(可选) | `interface MineralConfig` |
| 枚举 | PascalCase | `enum GameState`, `enum MineralType` |
| 枚举值 | UPPER_SNAKE_CASE | `GameState.PLAYING`, `MineralType.GOLD_SMALL` |
| 常量 | UPPER_SNAKE_CASE | `const MAX_HOOK_LENGTH = 500` |
| 变量/参数 | camelCase | `hookAngle`, `mineralList` |
| 函数/方法 | camelCase | `drawPixelMap()`, `checkCollision()` |
| 私有成员 | camelCase + `private` 关键字 | `private currentState: GameState` |
| 像素数据常量 | UPPER_SNAKE_CASE | `const MINER_IDLE: PixelMap` |

### 2.3 目录命名

全部使用小写字母，无连字符：`core/`, `entity/`, `scene/`, `ui/`, `utils/`, `assets/`, `level/`

## 三、TypeScript 规范

### 3.1 类型定义

```typescript
// 像素数据核心类型
type PixelColor = string | 0;  // 颜色字符串或 0（透明）
type PixelMap = PixelColor[][];

// 游戏配置使用 interface
interface MineralConfig {
  type: MineralType;
  value: number;
  weight: number;
  size: { width: number; height: number };
  sprite: PixelMap;
}

// 枚举用于有限状态
enum GameState {
  MENU = 'MENU',
  READY = 'READY',
  PLAYING = 'PLAYING',
  // ...
}
```

### 3.2 严格模式要求

- 开启 `strict: true`
- 禁止 `any` 类型（特殊情况需注释说明）
- 所有函数必须声明返回类型
- 接口属性必须明确可选性（`?`）

### 3.3 模块导入顺序

```typescript
// 1. 核心模块
import { Game } from '../core/Game';
import { Renderer } from '../core/Renderer';

// 2. 实体模块
import { Miner } from '../entity/Miner';
import { Hook } from '../entity/Hook';

// 3. 工具模块
import { checkCollision } from '../utils/collision';
import { lerp } from '../utils/math';

// 4. 数据/类型
import { MINER_IDLE } from '../assets/sprites';
import type { MineralConfig } from '../entity/types';
```

## 四、像素素材规范

### 4.1 PixelMap 数据格式

```typescript
// 标准格式：每行一个数组，颜色用字符串，透明用 0
export const GOLD_SMALL: PixelMap = [
  [0, 0, '#FFD700', '#FFD700', 0, 0],
  [0, '#FFD700', '#FFF8B0', '#FFD700', '#D4A017', 0],
  ['#FFD700', '#FFF8B0', '#FFD700', '#D4A017', '#D4A017', '#FFD700'],
  // ...
];
```

### 4.2 精灵命名规则

| 类别 | 命名模式 | 示例 |
|------|---------|------|
| 角色 | `MINER_{STATE}` | `MINER_IDLE`, `MINER_PULL`, `MINER_HAPPY` |
| 矿物 | `{TYPE}` 或 `{TYPE}_{SIZE}` | `GOLD_SMALL`, `GOLD_LARGE`, `DIAMOND` |
| UI | `UI_{NAME}` | `UI_BUTTON`, `UI_DIGITS` |
| 特效 | `FX_{NAME}` | `FX_SPARKLE`, `FX_EXPLOSION` |
| 道具 | `ITEM_{NAME}` | `ITEM_DYNAMITE`, `ITEM_POTION` |

### 4.3 颜色使用规范

- 所有颜色使用 6 位十六进制格式：`#RRGGBB`
- 透明像素统一使用 `0`（数字零），不使用 `null` 或空字符串
- 同一精灵的颜色在项目配色参考范围内选取
- 像素数据通过 `tools/pixel-converter.html` 工具辅助生成

## 五、场景与实体规范

### 5.1 场景类结构

```typescript
export class XxxScene extends SceneBase {
  // 生命周期方法（必须实现）
  enter(): void { }       // 进入场景时初始化
  exit(): void { }        // 离开场景时清理
  update(dt: number): void { }  // 逻辑更新
  render(renderer: Renderer): void { }  // 渲染

  // 可选方法
  handleInput(input: Input): void { }  // 输入处理
}
```

### 5.2 实体类结构

```typescript
export class XxxEntity {
  // 位置与状态
  x: number;
  y: number;
  
  // 必须方法
  update(dt: number): void { }
  render(renderer: Renderer): void { }
  
  // 碰撞相关
  getBounds(): { x: number; y: number; radius: number } { }
}
```

## 六、注释规范

### 6.1 必须添加注释的场景

- 物理公式和数学计算（如钩爪摆动公式、碰撞检测算法）
- 游戏平衡性参数（如矿物价值、重量系数）
- 状态机转换逻辑
- 性能优化的关键代码
- 非直观的业务逻辑

### 6.2 注释语言

- 代码注释统一使用**中文**，与项目设计文档保持一致
- JSDoc 注释的 `@param` / `@returns` 描述使用中文

### 6.3 注释格式

```typescript
/**
 * 将 PixelMap 预渲染到离屏 Canvas 进行缓存
 * @param map 像素数据矩阵
 * @param scale 缩放倍数
 * @returns 缓存的离屏 Canvas 元素
 */
function createSpriteCache(map: PixelMap, scale: number = 2): HTMLCanvasElement {
  // ...
}

// 钩爪摆动公式: 正弦函数控制角度，swingSpeed 控制频率，maxAngle 控制幅度
const angle = Math.sin(time * this.swingSpeed) * this.maxAngle;

// 收回速度受矿物重量影响: 重量越大，收回越慢
const reelSpeed = BASE_SPEED / (1 + mineral.weight * 0.5);
```

## 七、数值配置规范

游戏平衡性相关的数值**必须定义为命名常量**，集中管理：

```typescript
// ✅ 正确：集中定义，易于调参
export const GAME_CONFIG = {
  HOOK_SWING_SPEED: 2,
  HOOK_MAX_ANGLE: Math.PI / 3,
  HOOK_EXTEND_SPEED: 300,
  HOOK_BASE_REEL_SPEED: 200,
  LEVEL_TIME_LIMIT: 60,
  WEIGHT_FACTOR: 0.5,
} as const;

// ❌ 错误：魔法数字散落在代码中
const angle = Math.sin(time * 2) * 1.047;
```

## 八、Git 规范

### 8.1 Commit Message 格式

```
<type>: <description>

type:
  feat     新功能
  fix      修复 bug
  refactor 重构
  style    样式/格式调整
  perf     性能优化
  docs     文档
  chore    构建/工具链
  assets   像素素材数据
```

### 8.2 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 稳定版本 |
| `dev` | 开发分支 |
| `feat/*` | 功能分支 |
| `fix/*` | 修复分支 |
