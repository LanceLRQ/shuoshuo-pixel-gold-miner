# GIF 动画素材支持方案

> **状态**：📋 探讨阶段（已选定推荐方案，等待开工指令）
> **创建日期**：2026-05-20
> **关联文档**：
> - [`20260404_game-design.md`](./20260404_game-design.md) §像素素材方案
> - [`20260519_chapter-system.md`](./20260519_chapter-system.md) §七 猪猪公主 / §三 粉宝石闪光帧
> - [`20260404_pixel-elements-list.md`](./20260404_pixel-elements-list.md) Sprite 清单

---

## 一、背景

美术组提交的素材以 **GIF 动画**形式交付（参考：粉色猪猪公主，多帧循环动画 + 飘动小花朵装饰，~64×64 像素级别，10-15 个颜色）。当前项目素材体系是**纯单帧 PixelMap**——所有 sprite 通过代码二维颜色矩阵生成，运行时单次 `drawImage` 绘制。

设计文档（章节系统 §七）已规划：
- Ch3 **猪猪公主** 32×32，2 帧眨眼循环，3 秒周期
- Ch3 **猪猪粉宝石** 10×10 带闪光帧

均未进入代码实施。本文档评估"接入 GIF 动画 sprite"的可行性、改造代价与具体路径。

---

## 二、现状速览

| 维度 | 现状 | 关键路径 |
|---|---|---|
| 数据结构 | `SpriteJson { scale, palette, pixels: string[] }` 单帧 PixelMap | `src/assets/themeLoader.ts:17-24` |
| 缓存 | `Map<string, HTMLCanvasElement>` 一对一映射 | `src/assets/types.ts:13` |
| 缓存生成 | `createSpriteCache(map, scale)` 单 canvas 输出 | `src/assets/types.ts:21-53` |
| 渲染调用点 | 3 处实体：`Miner.ts:75`、`Hook.ts:283`、`Mineral.ts:147`，模式都是 `cache.get(name) → renderer.drawImage(...)` | — |
| 动画机制 | **零**。Miner 5 状态 = 5 张静态图；粒子有时间驱动但无帧概念 | `src/entity/Miner.ts:10-26` |
| 图片转像素工具 | UI 标注支持 GIF，但实际 `<img>` 加载只拿首帧，无帧分解逻辑 | `public/tools/pixel-converter.html:362-374` |

**结论**：项目零动画基础设施，但改造**面中等**——三个实体 render 调用点一致，缓存工具集中。

---

## 三、方案对比

### 方案 A：横向 spritesheet 拼帧（**推荐**）

GIF → N 帧 → 拼接成横向 N 倍宽的单张 PixelMap，存储到一个 `SpriteJson`。

```jsonc
{
  "scale": 1,
  "frameCount": 6,
  "frameDurationMs": 120,
  "palette": { "A": "#FFC0CB", ... },
  "pixels": [
    "....AAA...AAA...AAA...AAA...AAA...AAA....",  // 宽 384 = 64 × 6
    // ... 64 行
  ]
}
```

### 方案 B：frames 数组

`SpriteJson` 新增 `frames: string[][]`，每帧独立 PixelMap。

### 方案 C：保留 GIF 运行时播放

直接 `<img src="data:image/gif">` 不像素化。**否决**——与像素风/调色板/主题切换体系完全脱节。

### 对比表

| 维度 | A. spritesheet | B. frames 数组 |
|---|---|---|
| `SpriteJson` 改动 | 加 `frameCount` 一个字段 | 新增 `frames`，老 `pixels` 字段定位尴尬 |
| `SpriteCacheMap` 类型 | 不变（仍 Map<string, canvas>） | 变成 union，cache.get 处处类型守卫 |
| 现有 30+ 个静态 sprite | 零迁移 | 零迁移（frames 可选）或全迁移 |
| render 调用方 | 3 处改 drawImage 参数 | 3 处加类型守卫 + 帧索引 |
| pixel-converter 实现 | 解 GIF → 横向拼接（最简单） | 解 GIF → 输出 frames 数组 |
| runtime 性能 | 与 B 完全等价（< 1% 差异） | 与 A 完全等价 |
| 内存 | 一张大 canvas | N 张小 canvas + 元素 overhead |

**runtime 性能两者几乎一样**（drawImage 9 参数版本在 Chrome/Safari 都走硬件加速路径）。选 A 的真正理由是**工程最小变更**。

---

## 四、推荐方案：spritesheet 详细设计

### 4.1 数据结构

`SpriteJson` 新增三个**可选**字段，向后兼容：

```ts
interface SpriteJson {
  scale: number;
  palette: Record<string, string>;
  pixels: string[];           // 横向拼帧后的整张图
  frameCount?: number;        // 默认 1。>1 表示 pixels 宽度 = 单帧宽 × frameCount
  frameDurationMs?: number;   // 默认 100。每帧停留毫秒
  frameLoop?: boolean;        // 默认 true。false = 播完停在最后一帧
}
```

约束：
- 单帧宽 = `pixels[0].length / frameCount`，必须整除（导入时校验）
- 所有帧共享同一 palette（GIF 解帧时做全局色量化）
- 单 sprite 调色板仍受 `PALETTE_CHARS` ~90 色上限约束

### 4.2 改造点清单

| 文件 | 改动 | 工作量 |
|---|---|---|
| `src/assets/themeLoader.ts:17-24` | `SpriteJson` 加 3 个可选字段 | XS |
| `src/assets/types.ts:21-53` | `createSpriteCache` 不变（拼接图整体当一张缓存） | 零 |
| `src/assets/types.ts:13` | `SpriteCacheMap` 类型不变 | 零 |
| `src/core/Renderer.ts` | 新增 `drawImageSlice(canvas, sx, sy, sw, sh, dx, dy, dw, dh)` helper | XS |
| 新建 `src/assets/animation.ts` | `pickFrame(spriteName, now): { sx, sw }` 工具，按 frameDurationMs 算当前帧 | S |
| `src/entity/Miner.ts:75` | `drawImage(cache, x, y)` → 查动画帧 → `drawImageSlice(...)` | XS |
| `src/entity/Hook.ts:283` | 同上 | XS |
| `src/entity/Mineral.ts:147` | 同上 | XS |
| `public/tools/pixel-converter.html` | 加 GIF 输入处理：`gifuct-js`（成熟库 ~25KB）或浏览器原生 `ImageDecoder`（Chrome 94+） | M |
| `src/asset-manager/components/SpriteGrid.tsx` | 缩略图取 `pixels.slice(0, frameWidth)` 第一帧；卡片可选加 frameCount 角标 | XS |
| `src/asset-manager/components/PixelEditorDialog.tsx` | 一期不动（编辑器不分帧手画，靠 pixel-converter 重新生成） | 零 |
| `src/asset-manager/ThemeStore.ts:128-147` | `validateThemeJson` 加 frameCount 校验 | XS |

**预计工时**：1.5-2 个工作日。重点工时在 pixel-converter 的 GIF 解帧 + 跨帧调色板合并。

### 4.3 不在范围（二期）

- **像素编辑器内逐帧手绘**：一期靠"在外部画好 GIF → 导入"。如果美术后续要在网页内调一两帧，二期再加 PixelEditorDialog 帧切换 UI。
- **同 sprite 多动画**（idle / hurt / win 等）：当前用"多个 sprite 各自循环"已能覆盖（如 MINER_IDLE / MINER_HAPPY 各自一个动画）。
- **逐帧调色板**（每帧不同 palette）：所有帧共享 sprite 内 palette。

---

## 五、推荐实施顺序

1. **pixel-converter 加 GIF 解帧 + spritesheet 拼接导出**（独立工具升级，不动游戏代码，可先验证素材形态）
2. 扩 `SpriteJson` 三个字段 + 新建 `animation.ts` + `Renderer.drawImageSlice` + 改 3 处 render（动游戏代码，但有兜底——老 sprite 行为不变）
3. 美术做出猪猪公主 GIF → 转为 sprite → 替换 `PIGGY_GEM_SPRITE` 测试 → 再正式接入 Ch3 章节

每步均可独立验证、独立 commit。

---

## 六、决策开关

✅ **可行**，改动面中等，向后兼容，对运行时性能无负面影响
⚠️ **关键依赖**：pixel-converter 需引入 GIF 解码库（gifuct-js ~25KB），或用浏览器原生 ImageDecoder（兼容性 Chrome 94+ / Safari 17+）
🚦 **触发时机**：
  - **现在做**：适合马上要落地 Ch3 章节系统 + 猪猪公主动画
  - **延后**：等 Ch3 真正开工时一并做（本文档作为预案存档）

---

## 七、验证

- pixel-converter 拖入猪猪 GIF → 输出 frameCount=N 的 JSON → 文件大小 / 调色板色数符合预期
- 游戏里替换 `PIGGY_GEM_SPRITE` 为动画版 → 关卡里出现的粉宝石按 120ms/帧循环
- 老 sprite（MINER_IDLE 等）行为完全不变，无 console error
- 帧切换不引入额外 GC / FPS 跌幅（实测 60 → 60）
