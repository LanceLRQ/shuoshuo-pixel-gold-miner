# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

黄金矿工 H5 - 经典黄金矿工像素风复刻游戏。纯 HTML5 Canvas + TypeScript + Vite 实现，零图片资源依赖，所有像素素材通过代码数据矩阵（PixelMap）生成。

## 技术栈

- **渲染引擎：** HTML5 Canvas 2D
- **开发语言：** TypeScript (strict mode)
- **构建工具：** Vite
- **像素素材：** 代码数据矩阵（PixelMap），Canvas 逐像素绘制，离屏 Canvas 预渲染缓存
- **音效：** Web Audio API
- **存储：** localStorage
- **逻辑分辨率：** 480 x 640（竖屏）

## 常用命令

```bash
npm run dev       # 启动开发服务器
npm run build     # 生产构建
npm run preview   # 预览构建产物
```

## 项目结构

```
src/
├── main.ts               # 入口 & 游戏主循环
├── core/                  # 核心引擎（Game 状态机、Renderer、Input、Audio、Storage）
├── entity/                # 游戏实体（Miner 矿工、Hook 钩爪、Mineral 矿物）
├── scene/                 # 场景系统（Menu、Game、Shop、Result + SceneBase 基类）
├── level/                 # 关卡管理（LevelManager + 关卡数据配置）
├── ui/                    # UI 组件（HUD、Button、PixelText 像素字体）
├── assets/                # 像素精灵数据（PixelMap 定义，替代图片资源）
└── utils/                 # 工具函数（math、collision 碰撞检测、random）
tools/
└── pixel-converter.html   # 图片转像素数据工具（浏览器中打开使用）
```

## 核心架构要点

- **像素素材方案：** 所有精灵定义为 `PixelMap`（二维颜色数组），运行时通过 `fillRect` 逐像素绘制，再用离屏 Canvas 预渲染缓存为 `HTMLCanvasElement`，后续用 `drawImage` 复用
- **状态机驱动：** 游戏全局状态（MENU→READY→PLAYING→REELING→RESULT→SHOP→GAME_OVER）驱动场景切换
- **钩爪系统：** 独立状态机（SWINGING→EXTENDING→REELING），摆动公式 `sin(t*speed)*maxAngle`，收回速度 `baseSpeed/(1+weight*0.5)`
- **碰撞检测：** 圆形碰撞，钩爪尖端（点）vs 矿物包围圆
- **自适应缩放：** 逻辑分辨率固定 480x640，`imageSmoothingEnabled = false` 保持像素锐利

## 关键编码规范

- **PixelMap 数据中**：颜色用 `#RRGGBB` 字符串，透明用 `0`（数字零）
- **注释语言：** 中文
- **游戏数值：** 平衡性参数必须定义为命名常量集中管理，禁止魔法数字
- **精灵命名：** `MINER_IDLE`、`GOLD_SMALL`、`UI_BUTTON`、`FX_SPARKLE`、`ITEM_DYNAMITE` 等 UPPER_SNAKE_CASE
- **场景类必须实现：** `enter()`、`exit()`、`update(dt)`、`render(renderer)` 生命周期方法
- **性能要求：** 精灵必须预渲染缓存后再绘制，粒子使用对象池

## 设计文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 游戏设计文档 | `docs/game-design.md` | 完整玩法设计、矿物体系、关卡系统、状态机、文件结构 |
| 像素元素清单 | `docs/pixel-elements-list.md` | 所有像素精灵制作清单与进度追踪 |
| 架构设计文档 | `docs/architecture.md` | 模块职责、数据流、状态机设计、碰撞和缩放方案 |
| 编码规范 | `docs/coding-standards.md` | 命名规范、TypeScript 规范、像素素材规范、Git 规范 |
| 质量标准 | `docs/quality-standards.md` | 性能/兼容性/体验标准、发布前检查清单 |
| 执行计划 | `docs/execution-plan.md` | 6 阶段开发计划、任务清单、依赖关系、验收标准 |
| 设计概述 | `docs/design-overview.md` | 核心玩法和参数速查表 |
