# HD 素材路线图（矿物 / 钩爪 / 特效）

> 创建：2026-05-19
> 上游：[20260404_pixel-elements-list](20260404_pixel-elements-list.md)
> 已完成参考：commit `113d2c4` 矿工 5 态 32×32 HD（信息密度 ×4）

## 一、背景与目标

### 1.1 现状问题
- 大部分矿物精灵是 **8×8 / 12×12 / 16×16** 低密度 PixelMap
- 显示放大 3 倍后（scale=3）每个数据像素变成 3×3 屏幕色块，**信息密度仅 64~256 cell**
- 在现代设备的大画面下，金块/石头等核心元素呈现"色块感"，难以做出体积、反光、纹理等细腻效果

### 1.2 美术工作流引入（关键变化）
- 美术（朋友、外包）将提供**高清 PNG / AI 矢量稿**作为素材源
- 通过 `tools/pixel-converter.html` 自动转 PixelMap
- 转换工具支持 **最大 64×64 数据 + 64 色调色板**，**信息密度上限是当前的 64 倍**
- 工作流：PNG → 裁剪 → 颜色量化 → 复制 `PixelMap` 代码 → 粘贴到 `sprites.ts`

### 1.3 目标
- 所有矿物、钩爪、UI 图标做 HD 化
- 信息密度提升 **≥9 倍**（数据维度翻 3 倍）
- **不影响游戏逻辑**（碰撞半径、关卡布局、矿工尺寸不变）
- **不影响显示尺寸**（玩家视觉上元素大小一致，只是更精细）

---

## 二、核心约束

### 2.1 显示尺寸守恒
碰撞半径写死在 `MINERAL_CONFIGS.radius`（`src/entity/types.ts:37`），独立于精灵尺寸；
但**显示尺寸**会通过精灵预渲染后的 Canvas 大小影响视觉布局。

**规则：HD 版精灵的"屏幕显示像素数"必须 = 原版的"屏幕显示像素数"**

| 精灵 | 原版 PixelMap × scale | 屏幕显示 | HD 版 PixelMap × scale | 屏幕显示 |
|------|----------------------|---------|-----------------------|---------|
| 8×8 + scale=3 | 24×24 | 24×24 | **24×24 + scale=1** | 24×24 ✅ |
| 12×12 + scale=3 | 36×36 | 36×36 | **36×36 + scale=1** | 36×36 ✅ |
| 16×16 + scale=3 | 48×48 | 48×48 | **48×48 + scale=1** | 48×48 ✅ |

**信息量增益**：8×8 → 24×24 数据，**单精灵从 64 cell 升到 576 cell（×9）**

### 2.2 调色板规模
- pixel-converter 默认 16 色，**建议每个 HD 精灵 ≤16 色**
- 颜色统一管理，避免散落定义（参考 `sprites.ts` 顶部 const 块）

### 2.3 文件组织
- HD 版本与原版**共存**（`MINER_IDLE` ↔ `MINER_IDLE_HD`）
- 主题层切换：classic 主题用 HD，shuoshuo-crystal 等仍可用原版
- 命名规范：`SPRITE_NAME_HD`（已沿用）

---

## 三、架构改造（前置工作）

### 3.1 问题
当前 `createSpriteCacheMap` 在 `src/assets/types.ts:61` 使用**全局统一 scale=3**：
```typescript
createSpriteCacheMap(sprites, scale = 3)
```
若 HD 精灵保持 scale=3，显示尺寸会暴涨 3 倍，破坏布局。

### 3.2 改造方案
增加 **per-sprite scale 覆盖表**：

```typescript
// src/assets/types.ts
export function createSpriteCacheMap(
  sprites: Record<string, PixelMap>,
  defaultScale: number = 3,
  scaleOverrides: Record<string, number> = {}  // 新增
): SpriteCacheMap {
  const cache: SpriteCacheMap = new Map();
  for (const [name, map] of Object.entries(sprites)) {
    const scale = scaleOverrides[name] ?? defaultScale;
    cache.set(name, createSpriteCache(map, scale));
  }
  return cache;
}
```

### 3.3 ThemeManager 接入
```typescript
// src/assets/theme/types.ts - 扩展 ThemeDefinition
interface ThemeDefinition {
  // ... existing fields
  spriteScaleOverrides?: Record<string, number>;  // 新增可选字段
}

// src/assets/theme/ThemeManager.ts:49-51
getSpriteCache(): SpriteCacheMap {
  if (!this.currentCache) {
    const theme = this.getTheme();
    this.currentCache = createSpriteCacheMap(
      theme.sprites,
      3,
      theme.spriteScaleOverrides ?? {}
    );
  }
  return this.currentCache;
}
```

### 3.4 classic 主题接入 HD 表
```typescript
// src/assets/theme/classic.ts
export const CLASSIC_THEME: ThemeDefinition = {
  // ...
  sprites: { ...ALL_SPRITES, ...HD_CLASSIC_SPRITES },
  spriteScaleOverrides: {
    GOLD_SMALL: 1,    // HD 24×24 数据 + scale=1
    GOLD_MEDIUM: 1,   // HD 36×36 数据 + scale=1
    GOLD_LARGE: 1,    // HD 48×48 数据 + scale=1
    // ... 其他 HD 精灵
  },
};
```

**工时估计**：架构改造 **30 分钟**（包含 TS 类型 + 主题接入 + 测试）

---

## 四、HD 素材清单 + 目标尺寸

> 全部按 "HD 数据尺寸 + scale=1 = 原显示尺寸" 设计

### 4.1 矿物（高出镜率，优先级 P0）

| 精灵 | 原 PixelMap | 显示 | **HD 目标** | 信息增益 | 风格描述 |
|------|------------|------|------------|---------|---------|
| GOLD_SMALL | 8×8 | 24×24 | **24×24** | ×9 | 块状反光 + 边缘暗角 |
| GOLD_MEDIUM | 12×12 | 36×36 | **36×36** | ×9 | 多面晶体 + 顶部强高光 |
| GOLD_LARGE | 16×16 | 48×48 | **48×48** | ×9 | 复杂晶面 + 边缘暗影 + 中央明亮 |
| DIAMOND_SPRITE | 8×8 | 24×24 | **24×24** | ×9 | 半透明蓝晶 + 内部折射纹 |
| STONE_SPRITE | 12×12 | 36×36 | **36×36** | ×9 | 粗糙石质 + 阴影坑洼 + 边缘风化 |

### 4.2 生物（中出镜率，优先级 P1）

| 精灵 | 原 PixelMap | 显示 | **HD 目标** | 信息增益 | 风格描述 |
|------|------------|------|------------|---------|---------|
| MOUSE_SPRITE | 12×8 | 36×24 | **36×24** | ×9 | 毛发肌理 + 红眼睛 + 长尾 |
| MOLE_SPRITE | 12×10 | 36×30 | **36×30** | ×9 | 圆滚身形 + 大鼻头 + 利爪 |
| BONE_SPRITE | 12×6 | 36×18 | **36×18** | ×9 | 关节凹凸 + 米黄渐变 |

### 4.3 道具与抽奖（中出镜，优先级 P1）

| 精灵 | 原 PixelMap | 显示 | **HD 目标** | 信息增益 | 风格描述 |
|------|------------|------|------------|---------|---------|
| BOMB_SPRITE | 8×8 | 24×24 | **24×24** | ×9 | 黑铁球 + 引信火花 + 反光 |
| MYSTERY_BAG | 8×8 | 24×24 | **24×24** | ×9 | 麻布纹理 + 红绳系口 + 金币凸起 |
| WOODEN_BOX_SPRITE | 8×8 | 24×24 | **24×24** | ×9 | 木纹 + 铁皮包角 + 中央锁扣 |

### 4.4 章节专属收藏品（特殊视觉重点，优先级 P0）

| 精灵 | 原 PixelMap | 显示 | **HD 目标** | 信息增益 | 风格描述 |
|------|------------|------|------------|---------|---------|
| CRYSTAL_ORE_SPRITE | 8×8 | 24×24 | **24×24** | ×9 | Ch1 蓝晶柱 + 多层折射 |
| CRAB_SHELL_SPRITE | 10×10 | 30×30 | **30×30** | ×9 | Ch2 翠绿菱形 + 鳞片纹 |
| PIGGY_GEM_SPRITE | 12×12 | 36×36 | **36×36** | ×9 | Ch3 粉钻 + 心形高光 |

### 4.5 钩爪与 UI（优先级 P0）

| 精灵 | 原 PixelMap | 显示 | **HD 目标** | 信息增益 | 风格描述 |
|------|------------|------|------------|---------|---------|
| HOOK_SPRITE | 10×12 | 30×36 | **30×36** | ×9 | 三叉钩 + 金属反光 + 绳头收口 |
| COIN_ICON | 8×8 | 24×24 | **24×24** | ×9 | HUD 用，金币圆面 + 边缘暗光 |

### 4.6 矿工（已完成参考）✅
- MINER_IDLE/PULL/HAPPY/SAD/STRAIN
- 32×32 + scale=3 = 96×96 display（已 HD，commit `113d2c4`）
- 暂不重画

---

## 五、美术工作流（给协作美术）

### 5.1 输入要求
- **格式**：PNG（首选，支持透明） / JPG / GIF / WebP
- **建议尺寸**：素材源至少 **256×256** 像素，保证 64×64 量化后细节不丢
- **风格**：扁平卡通 / 像素风皆可，工具会自动量化色板
- **比例**：参考 [§4 HD 目标尺寸列表](#四hd-素材清单--目标尺寸)（矿物长宽比固定）

### 5.2 转换步骤
1. 打开 `tools/pixel-converter.html`（直接双击在浏览器打开）
2. 拖入 PNG 素材
3. **自动抠图**（去除透明背景）
4. **比例约束** 选对应矿物比例（如金块 1:1，骨头 2:1）
5. **输出像素宽** 滑块设为目标尺寸（GOLD_SMALL=24, GOLD_LARGE=48, etc.）
6. **颜色数量** 默认 16（复杂素材可调到 24~32）
7. **透明阈值** 默认 128
8. 点击「转换」预览
9. （可选）通过「颜色替换」面板手动微调调色板（确保色彩协调）
10. 修改「变量名」为目标常量名（如 `GOLD_LARGE_HD`）
11. **复制代码** 粘贴到 `src/assets/sprites.ts`

### 5.3 常见调参提示

| 现象 | 调整 |
|-----|-----|
| 边缘锯齿/残影 | 提高「透明阈值」到 180+ |
| 调色板太杂 | 降低「颜色数量」到 8-12 |
| 背景白色没去掉 | 「去背景亮度」拉到 240 |
| 主体丢细节 | 提高「输出像素宽」+ 颜色数 |
| 想要剪影效果 | 勾选「轮廓模式」 |

### 5.4 美术输出建议命名
```
gold-small-v1.png       → GOLD_SMALL_HD
gold-medium-v1.png      → GOLD_MEDIUM_HD
stone-v2-darker.png     → STONE_SPRITE_HD
mole-with-claws.png     → MOLE_SPRITE_HD
```

---

## 六、实施波次

### Phase 1：架构改造（必做前置）
- ✅ 改 `createSpriteCacheMap` 加 scaleOverrides 参数
- ✅ 扩展 `ThemeDefinition` 加 `spriteScaleOverrides`
- ✅ ThemeManager 透传
- ✅ classic 主题增加空 overrides 字段（向后兼容）
- 🧪 验证：所有现有精灵显示尺寸不变

**工时**：30 分钟

### Phase 2：高频核心（金块 + 石头 + 钩爪）
| 任务 | 工时 |
|------|------|
| GOLD_SMALL_HD | 美术 + 接入 20min |
| GOLD_MEDIUM_HD | 美术 + 接入 25min |
| GOLD_LARGE_HD | 美术 + 接入 30min |
| STONE_SPRITE_HD | 美术 + 接入 20min |
| HOOK_SPRITE_HD | 美术 + 接入 25min |
| COIN_ICON_HD | 美术 + 接入 15min |

**小计**：2-3 小时（含等美术 + 测试）

### Phase 3：章节收藏品 + 钻石（视觉重点）
| 任务 | 工时 |
|------|------|
| DIAMOND_SPRITE_HD | 美术 + 接入 20min |
| CRYSTAL_ORE_SPRITE_HD | 美术 + 接入 20min |
| CRAB_SHELL_SPRITE_HD | 美术 + 接入 25min |
| PIGGY_GEM_SPRITE_HD | 美术 + 接入 30min |

**小计**：~1.5 小时

### Phase 4：生物 + 道具
| 任务 | 工时 |
|------|------|
| MOUSE_SPRITE_HD | 美术 + 接入 25min |
| MOLE_SPRITE_HD | 美术 + 接入 30min |
| BONE_SPRITE_HD | 美术 + 接入 15min |
| BOMB_SPRITE_HD | 美术 + 接入 20min |
| MYSTERY_BAG_HD | 美术 + 接入 20min |
| WOODEN_BOX_SPRITE_HD | 美术 + 接入 20min |

**小计**：~2 小时

### Phase 5（远期）：背景元素 / 章节装饰
- 草地纹理、岩石块、矿洞墙壁、章节装饰图等
- 暂缓，等核心矿物 HD 化完成后规划

---

## 七、验收标准

每个 HD 精灵接入后必须满足：

1. **视觉**
   - [ ] 显示尺寸与原版完全一致（截屏对比）
   - [ ] 信息密度明显提升（细节、阴影、高光肉眼可辨）
   - [ ] 与场景/其他元素风格协调

2. **代码**
   - [ ] TS 类型检查通过
   - [ ] 命名遵守 `SPRITE_NAME_HD` 规范
   - [ ] 调色板 ≤16 色（特殊例外需说明）
   - [ ] 在 `ALL_SPRITES` 中注册
   - [ ] 在 classic 主题的 `spriteScaleOverrides` 中声明 scale=1
   - [ ] simplify review 通过

3. **游戏逻辑**
   - [ ] 碰撞行为不变（`MINERAL_CONFIGS.radius` 未改动）
   - [ ] 关卡平衡不变（矿物价值、生成规则不动）
   - [ ] 章节切换不报错（其他主题保持原版）

4. **回归**
   - [ ] 至少完整玩 1 关验证抓取、收回、结算正常
   - [ ] FPS 不下降（HD 精灵预渲染缓存只跑 1 次，运行时只是 drawImage）

---

## 八、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| HD 精灵颜色与背景冲突 | 矿物在土色背景下不显眼 | 美术阶段加边缘暗轮廓；接入后截图对比 |
| 美术输出风格不一致 | 多个 HD 矿物风格各异 | 提供 GOLD_SMALL_HD 作为"风格模板"先做 |
| 调色板膨胀 | 每个 HD 16 色 × 14 个 = 224 色 | sprites.ts 顶部 const 块统一管理，相似色合并 |
| 性能下降 | HD 精灵 96×96 缓存 ×14 = ~5MB | 实测；Canvas 缓存是一次性，运行时只 drawImage |
| 主题切换闪烁 | 切换主题时重建 cache | 已有懒构建机制（ThemeManager.ts:50） |

---

## 九、下一步

按用户决策选择起点：

- **方案 A（推荐）**：先做 Phase 1 架构改造（30min），然后做 **GOLD_LARGE_HD** 作为风格模板（金块是出镜率最高的核心矿物，立标杆）
- **方案 B**：先批量做 Phase 1 + Phase 2 的全部 6 个 HD 素材（一波铺到位）
- **方案 C**：等美术输出第一张 PNG 后再启动（推美术先动）

老王推荐 **A**：架构 + 1 张样板 → 美术参考样板风格 → 批量铺开。

---

## 十、相关文档

- [20260404_pixel-elements-list.md](20260404_pixel-elements-list.md) — 当前像素素材清单
- [20260518_classic-feature-gaps.md](20260518_classic-feature-gaps.md) — 总体路线图
- [20260519_chapter-system.md](20260519_chapter-system.md) — 章节系统（含收藏品）
- `tools/pixel-converter.html` — 美术工作流核心工具
