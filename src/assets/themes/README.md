# 主题 JSON 编辑指南

> 适用对象：美术 / 喜欢直接改像素的开发者
> 主题 JSON 是游戏唯一的素材 source of truth — 直接改 JSON，游戏热重载生效。

---

## 〇、快速开始

```bash
cd /path/to/goldminer
npm install          # 首次需要
npm run dev          # 启动开发服务器（约 1 秒）
# → 打开 http://localhost:3000/
```

现在用任何文本编辑器（VSCode / Sublime / Notepad++）打开 `src/assets/themes/classic.json`，
修改任意像素或调色板颜色，**保存** — 浏览器**自动热重载**，立刻看到效果。

**遇到错误怎么办？**
- 浏览器画面里出现**品红黑棋盘格**的精灵 → 该精灵的 JSON 解析失败（其他精灵不受影响）
- 打开浏览器开发者工具（F12）→ Console 标签 → 看 `[themeLoader] sprite "..." ...` 报错
- 按报错提示修复 JSON 即可

---

## 一、文件位置

```
src/assets/themes/
├── classic.json            # 经典主题（黄金矿工原味）
├── shuoshuo-crystal.json   # 说说Crystal 矿工形象主题
└── README.md               # 本文件
```

新增主题：复制 `classic.json` → `my-theme.json`，改 `id` / `name`，编辑内部精灵即可。
注册到游戏：编辑 `src/main.ts`，import 新主题并 `themeManager.register(...)`。

---

## 二、JSON 结构概览

```json
{
  "id": "classic",
  "name": "经典",
  "description": "...",

  "sprites": {
    "MINER_IDLE": {
      "scale": 3,
      "palette": { "H": "#8B4513", "S": "#FFCC99", "E": "#000000" },
      "pixels": [
        "..HHHHHH..",
        ".HSSSSSSH.",
        ".HSEMMESH.",
        "..HHHHHH.."
      ]
    },
    "GOLD_LARGE_HD": { ... }
  },

  "background": {
    "skyTop": "#87CEEB",
    ...
  }
}
```

### 三大核心字段

| 字段 | 含义 |
|------|------|
| `sprites.{NAME}.scale` | 缓存放大倍数。**HD 高密度精灵用 1**（数据维度=显示维度），**普通精灵用 3** |
| `sprites.{NAME}.palette` | **该精灵专属**调色板。单字符 → `#RRGGBB`。透明强制用 `.`（不可作 palette key） |
| `sprites.{NAME}.pixels` | 字符串数组。每行一个字符串，每字符 = 一个像素，字符必须在 palette 中 |

---

## 三、像素编辑流程

### 3.1 用普通文本编辑器手改

每个 sprite 就是一组等长字符串，**直接像 ASCII art 一样编辑**：

```
MINER_IDLE.pixels:
".............HHHHHH............."   ← 帽子轮廓
"...........HHHLLLLHHH..........."   ← H 是 HAT，L 是 HAT_LIGHT 高光
".........HHHLLLLLLLLHHHH........"
"........HHLLLLLLHHHHHHHHE......."   ← E 是 HAT_DARK 阴影
```

### 3.2 用 pixel-converter 工具

如果你画了 PNG 素材想转 PixelMap：

1. 打开 `tools/pixel-converter.html`（浏览器双击）
2. 拖入 PNG → 自动抠图 → 设置输出宽度
3. 工具目前输出 TS 格式 `export const X: PixelMap = [...]`
4. **TODO**：将工具升级为直接输出 JSON `sprites.{NAME}` 块（待美术工作流稳定后做）
5. 暂时手动转换：把 PixelMap 的颜色值 + 字符映射填入 JSON

### 3.3 调色板分配建议

调色板字符**自定义**，但有约定：

| 字符 | 推荐用途 |
|------|---------|
| `.` | **透明（保留）** |
| `A-Z` | 主体色（皮肤、衣服、矿物主色等） |
| `a-z` | 辅助色（高光、阴影、装饰色） |
| `0-9` | 特殊色（火焰、电光、效果色） |
| `!@#$%^&*+=<>?~-` | 备用（避免 `,` `[` `]` `"` `{` `}` `:` `/` `\` 等 JSON 元字符） |

单 sprite 最多 **~90 色**（A-Z + a-z + 0-9 + 部分符号）。HD 精灵 7 档色板远低于此 — 完全够用。

**未来 90 色不够怎么办？** Loader 已预留 `format: "v2"` 字段位，届时扩展为双字符（如 `AA`/`Z9`），单 sprite 容量飙到 3844 色，向后兼容。

---

## 四、新增 / 修改一个精灵

### 4.1 修改现有精灵颜色

最常见：要把矿工帽改色。打开 `classic.json`，找到 `MINER_IDLE.palette.H`：
```json
"palette": {
  "H": "#8B4513",   ← 改这里，比如改成 "#FF0000" 让帽子变红
  ...
}
```
保存 → vite 自动热重载 → 浏览器立刻看到效果。

### 4.2 修改像素布局

直接改 `pixels` 字符串。**注意**：
- 每行必须**等长**（loader 会报错）
- 字符必须在 `palette` 中（或是透明 `.`）

### 4.3 新增精灵

在 `sprites` 对象里加一项：
```json
"MY_NEW_SPRITE": {
  "scale": 3,
  "palette": { "A": "#FF0000" },
  "pixels": [
    "....",
    ".AA.",
    ".AA.",
    "...."
  ]
}
```
游戏代码引用：使用 `themeManager.getSpriteCache().get('MY_NEW_SPRITE')` 拿到预渲染缓存。

---

## 五、scale 参数详解

```
最终显示尺寸（屏幕像素）= PixelMap 维度 × scale
```

| 场景 | PixelMap 维度 | scale | 屏幕显示 |
|------|-------------|-------|---------|
| 普通小金块 | 8×8 | 3 | 24×24 px |
| HD 大金块 | 48×48 | **1** | 48×48 px |
| HD 矿工 | 32×32 | 3 | 96×96 px |

**HD 精灵的规则**：数据维度 = 屏幕显示维度，scale **必须 = 1**。这样 PNG 转换工具可以直接出原尺寸 ASCII，不用考虑缩放。

---

## 六、验证与调试

修改 JSON 后：

1. **TS 检查**：`npm run build` 验证 JSON 结构正确（id/name/sprites/background 字段齐全）
2. **运行游戏**：`npm run dev`，vite 自动热重载，浏览器立刻看效果
3. **错误模式**：单个 sprite 解析失败**不会让整个游戏 crash** — 出问题的精灵显示为**品红/黑棋盘格**，控制台输出报错原因。其他精灵照常工作。

### 常见报错速查

| 控制台报错 | 原因 | 修复 |
|-----------|------|------|
| `sprite "X" 的 pixels 为空` | `"pixels": []` | 补充 pixels 数组 |
| `sprite "X" 第 0 行宽度为 0` | `"pixels": [""]` | 行内至少 1 个字符 |
| `sprite "X" 第 Y 行长度 N ≠ 期望 M` | 行长度不齐 | 检查每行字符数一致（透明用 `.` 占位） |
| `sprite "X" 第 Y 行第 Z 列字符 "?" 未在调色板中` | 像素用了 palette 里没声明的字符 | 在 palette 中加这个字符，或改成已有字符 |
| `sprite "X" 调色板不能用 "."` | palette 里把 `.` 当 key 了 | `.` 是保留透明字符，删掉这个 key |
| TS 编译 `Type '...' is not assignable to type 'string'` | JSON 字段类型不对（如 `scale: "3"` 字符串） | 数字不要加引号 |

### JSON 编辑常见坑

- **末尾多逗号**：`{"a":1,}` → JSON 不允许，去掉最后一个 `,`
- **字符串里有 `"`**：`pixels: ["A"B"]` → 错。用单字符调色板基本不会遇到
- **混了 Tab 和空格**：pixels 字符串里不要有 Tab/空格，全是单字符像素
- **palette key 大小写敏感**：`"H"` 和 `"h"` 是不同字符

---

## 七、相关文件

- `src/assets/themeLoader.ts` — JSON → ThemeDefinition 加载器
- `src/assets/theme/classic.ts` — `loadTheme(classicJson)` 一行接入
- `src/assets/types.ts` — PixelMap 类型与 createSpriteCacheMap
- `tools/pixel-converter.html` — PNG → PixelMap 转换工具
- `scripts/sprites-to-json.mjs` — 一次性 TS → JSON 迁移脚本（已用完，保留作参考）
- `docs/design/20260519_hd-sprite-roadmap.md` — HD 素材路线图
