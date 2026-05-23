# 黄金矿工 H5 - 经典版差距与实施路线图

> 本文档作为项目**核心实施总纲**，整合：
> 1. 与 2004 经典 Flash 黄金矿工的玩法差距
> 2. 新增需求（5 档难度系统 + 11 槽位存档系统 + 收回速度 Bug 修复）
> 3. 详细的 Phase 实施路线图（A → G，按依赖关系排序）
>
> **状态说明**：`[ ]` 待开发 / `[~]` 部分实现 / `[x]` 已完成
>
> **关联文档**：
> - [`20260518_difficulty-system.md`](./20260518_difficulty-system.md) - 5 档难度系统设计
> - [`20260518_save-slot-system.md`](./20260518_save-slot-system.md) - 11 槽位存档系统设计
> - [`20260519_chapter-system.md`](./20260519_chapter-system.md) - Phase E 章节系统详细方案（3 章节 21 关骨架）

---

## 〇、完成状态总览

| 类别 | 已完成 | 待完成 | 总数 |
|------|--------|--------|------|
| 灵魂三件套（#1-#4） | 4 | 0 | 4 |
| 玩法机制补齐（#5-#8） | 4 | 0 | 4 |
| 关卡 & 内容扩充（#9-#14） | 5 | 1 | 6 |
| 视听细节（#15-#18） | 4 | 0 | 4 |
| 元系统（#19 / #14；#20/#21 已取消） | 1 | 1 | 2 |
| **新增：难度系统（D1-D5）** | 5 | 0 | 5 |
| **新增：存档系统（S1-S5）** | 5 | 0 | 5 |
| **新增：Bug 修复（B1-B2）** | 2 | 0 | 2 |
| **新增：累加目标模式** | 1 | 0 | 1 |
| **总计** | **31** | **2** | **33** |

**Phase 完成度**：Phase A ✅ · Phase B ✅ · Phase C ✅ · Phase D ✅ · Phase E ✅ · Phase F ✅ · Phase G 🔥 部分完成（#19 ✅ / #14 ⏳）

> 🎉 **经典版差距全部填平！** Phase A-F 全部完成 + Phase G #19 无尽模式落地。剩余仅 #14 关卡布局模板化（大工作量，按需做）。

---

## 🗺️ 实施路线图（核心：Phase A → G）

```
┌────────────────────────────────────────────────────────────────┐
│  Phase A：核心基础设施（难度模块 + 存档槽位重构）                  │ ← 必须先做
│  ↓                                                              │
│  Phase B：游戏机制改造（重量 Bug 修复 + 矿物预算生成器）           │ ← 可与 A 并行
│  ↓                                                              │
│  Phase C：UI 场景层（DifficultyScene + SlotSelectScene + 流转）  │ ← 依赖 A
│  ↓                                                              │
│  Phase D：难度门控功能（#7 摇晃饮料 + #8 跨关道具 + INFINITE）    │ ← 依赖 A+B+C
│  ↓                                                              │
│  Phase E：内容扩充（关卡扩展 + 章节主题 + 收藏品 + 木箱）          │ ← 独立可做
│  ↓                                                              │
│  Phase F：视听打磨（用力动画 + 金属摩擦音 + 下垂感 + 达标反馈）     │ ← 独立可做
│  ↓                                                              │
│  Phase G：元系统（无尽模式 + 成就 + 结算赌局 + 关卡布局）          │ ← 最后
└────────────────────────────────────────────────────────────────┘
```

**执行原则**：
- **A → C 必须按顺序**（Storage/Game 状态机的强依赖）
- **B 可与 A 并行**（重量 Bug 修复独立，但 difficulty.weightFactorScale 接入需等 A）
- **D 依赖 A+B+C 全部完成**（门控逻辑要查难度）
- **E/F/G 独立**，可在 D 之后任意顺序
- 每个 Phase 完成后**老王跑一次 /simplify 三方审查**

---

## 一、Phase A：核心基础设施 🔥🔥🔥 ✅ 已完成

> 难度系统 + 存档槽位是后续所有功能的地基，必须先做。
> **提交记录**：`4229475 feat(phase-A): 核心基础设施（难度系统 + 11 槽位存档 + Game 状态机）`

- [x] **A1. Difficulty 模块定义** —— `src/level/difficulty.ts:1-127`（5 档配置 + isHardcore）
- [x] **A2. Storage 11 槽位重构** —— `src/core/Storage.ts`（autoSave/manualSlot 全套 API + @deprecated 兼容层）
- [x] **A3. Game 状态管理改造** —— `src/core/Game.ts`（currentDifficulty/activeSlot + commitLevelResult/startNewGame/saveAsManualSlot）
- [x] **A4. 旧存档迁移逻辑** —— `Storage.ts` migrateLegacyIfNeeded（自动迁移到槽位 0）
- [x] **A5. 难度独立高分系统** —— GlobalData.highScoresByDifficulty + 难度分项排行

---

## 二、Phase B：游戏机制改造 🔥🔥🔥 ✅ 已完成

> 重量 Bug 是当前实际存在的隐患（力量药水对抓矿物不生效），优先修复。
> 矿物预算生成器解决"抽到全石头无法通关"的极端情况。
> **提交记录**：`db6652c feat(phase-B): 游戏机制改造（重量 Bug 修复 + 矿物预算 + 难度缩放）`

- [x] **B1. 重量机制 Bug 修复 + 难度联动** —— Hook.updateReeling 补乘 reelSpeedMultiplier + WEIGHT_FACTOR 0.5→1.0 + weightFactorScale 注入
- [x] **B2. 矿物预算驱动生成器** —— GameScene.upgradeMineralsToReachBudget + appendMineralsToReachBudget（升级链 BONE→...→GOLD_LARGE）
- [x] **B3. 矿物金额按难度缩放** —— GameScene.onHookComplete 应用 valueScale（含神秘袋/水晶蟹钻石）
- [x] **B4. 关卡时间按难度缩放** —— GameScene.enter() timeLimit × timeScale + EXTRA_TIME_BONUS

---

## 三、Phase C：UI 场景层 🔥🔥 ✅ 已完成

> 玩家可视化的入口，做完后整套难度+存档系统才能玩起来。
> **提交记录**：`e7a5e65 feat(phase-C): UI 场景层（难度/槽位/主菜单/暂停另存为 + simplify 修复）`

- [x] **C1. DifficultyScene** —— `src/scene/DifficultyScene.ts:1-190`（5 张卡片 + hover 高亮 + 难度色边框）
- [x] **C2. SlotSelectScene** —— `src/scene/SlotSelectScene.ts:1-290`（自动槽宽卡 + 10 手动槽 2×5 + 删除二次确认 + formatTime）
- [x] **C3. MenuScene 主菜单流程重构** —— [继续游戏]/[新游戏]/[读取存档]（无进度时 continueButton.disabled=true）
- [x] **C4. 暂停菜单"另存为..."** —— GameScene 暂停层 3 按钮 + SaveAs 子层 + 覆盖确认 + cachedManualSlots 性能优化
- [x] **C5. ResultScene 即时存档** —— enter() 通过时调用 game.commitLevelResult(totalMoney)，Bonus 不再丢
- [x] **C6. HUD 难度标识** —— `src/ui/HUD.ts` difficultyLabel 字段 + 达标闪烁

---

## 四、Phase D：难度门控功能（#7 #8 + INFINITE）🔥🔥 ✅ 已完成

> 玩法机制补齐的剩余两项，配合难度门控规则实施。
> **提交记录**：`62e61dc feat(phase-D): 难度门控功能（#7 摇晃饮料 + #8 跨关道具 + INFINITE 模式 + simplify 修复）`

- [x] **#7. 摇晃饮料 / 震动器** ⚠️ 仅新手/一般可用
  - 实现：Hook.tryAdjustAngle(direction, step=0.05) 仅 EXTENDING 生效
  - GameScene.tryShakeAdjust 监听 ←/→ 持续按住调整
  - 商店难度过滤：buildItemsFromOwned 在困难/高手时排除 SHAKE_DRINK
  - 角度限制：±HOOK_MAX_ANGLE × 95%

- [x] **#8. 持久道具跨关保留** ⚠️ 仅新手/一般生效
  - ShopScene ShopItem 加 persistent 字段 + 导出 SHOP_ITEMS_CONFIG
  - Game.clearLevelBuffs() 重构：按 difficulty 决定是否清除 persistent 道具
    * INFINITE：保留所有
    * HARD/EXPERT：清除全部 persistent
    * NOVICE/NORMAL：保留 persistent（跨关投资）
  - 持久型（6 种）：力量药水/幸运草/爱心增幅器/猪猪魔法/绮彩变色油/摇晃饮料
  - 消耗品（2 种）：炸药/额外时间（使用时已 delete）

- [x] **D9. INFINITE 模式实现**
  - 跳过商店：ResultScene.handlePrimary 检测 !shopEnabled 时直接 PLAYING
  - Game.changeScene PLAYING 支持从 RESULT 直跳（累加金额 + nextLevel）
  - 开局加全 buff：GameScene 构造时 INFINITE 遍历 ItemType 全部 addOwnedItem
  - 道具不消耗：tryDetonate 检测 infiniteItems 时跳过 delete
  - HUD 标识：🔥 难度名（替换"难度: X"前缀）

---

## 五、Phase E：内容扩充 🔥 ✅ 已完成

> 让游戏不那么"10 关玩完就没了"，扩充关卡数量和环境多样性。
> **📋 详细方案**：[`20260519_chapter-system.md`](./20260519_chapter-system.md)（世界观 / 21 关数值表 / ChapterScene 过场 / 末关收藏品倾斜机制）
> **提交记录**：5 commits + simplify 修复（187c14a → ee5a07e）

- [x] **#13. 关卡扩展至 21 关 + chapter 字段** —— `src/level/levels.ts`（21 关数据 + ChapterId 枚举 + CHAPTER_INFO + 工具函数 getChapterByLevel/isChapterFirstLevel）
- [x] **#9. ChapterScene 章节过场** —— `src/scene/ChapterScene.ts` + Game 状态机加 CHAPTER_TRANSITION（自动 2.5s 跳过 + Space/Enter/点击立即跳过 + INFINITE 守卫）
- [x] **#10. 章节背景色板差异化** —— `src/assets/background.ts` 新增 CHAPTER_COLOR_OVERRIDES + getChapterBackgroundColors（Ch2 深蓝磷光 / Ch3 粉白宫殿）
- [x] **#11. 章节专属收藏品 + 末关 30% 倾斜** —— 3 个新精灵（水晶矿石 / 水晶蟹甲 / 猪猪粉宝石）+ MineralType 扩展 + tryAddChapterCollectible
- [x] **#12. 木箱抽奖箱** —— BoxContent 6 种结果（钻石 +800$ / 金币 +500/+200 / 空盒 / 大小骷髅扣分）+ L5+ 每关追加 + handleWoodenBox 反馈

【simplify 修复】commit ee5a07e
- 抽 pickWeightedContent 工具 / 抽 playValueFeedback / 抽 tryAddBonusMineral
- CHAPTER_INFO 加 bgColor + accentColor 字段，ChapterScene 删 switch
- GameScene chapterColors 字段缓存 + ChapterScene enter() 缓存渲染数据

---

## 六、Phase F：视听打磨 ⏳

## 六、Phase F：视听打磨 🔥 ✅ 已完成

> 提升经典版"那味儿"，原版黄金矿工的视听细节齐了。
> **提交记录**：`e052f09 feat(phase-F #18 #16)` + #15/#17 + simplify 修复

- [x] **#18. 金额达标视觉反馈** —— HUD 闪烁（金色 #FFFF00↔#FFD700 高频交替）+ 上升沿触发 TARGET_REACHED 双声"叮咚"
- [x] **#16. 钩绳金属摩擦循环音** —— Audio.startRopeFriction/stopRopeFriction（锯齿波 520Hz + LFO 9Hz/80Hz 调频 + fade-in/out 防爆音），REELING 系列状态启停
- [x] **#15. 矿工 STRAIN 用力动画** —— MINER_STRAIN 精灵（脸颊腮红 #FF8888 + 抿嘴咬牙横线）+ Miner 状态扩展 + Hook.isPullingHeavy(threshold) 封装泄漏
- [x] **#17. 钩绳重物拖拽下垂感** —— Hook.render 用 quadraticCurveTo 画下垂曲线（sag = weight × 10px），抓 STONE/GOLD_LARGE/BONE 时绳索明显绷紧

【封装优化】Hook 新增 `isPullingHeavy(threshold)` API，GameScene 不再跨层读 Mineral.config.weight

---

## 七、Phase G：元系统（最后）

> 长期留存机制，按需实施。

- [x] **#19. 无尽模式 / 挑战模式** —— commit `898dffb`
  - levels.ts 新增 getEndlessLevelConfig 算法（target 累计递增 + time/矿数曲线）
  - L21 通关后无感衔接 L22+（沿用 SHOP→PLAYING 流程）
  - HUD 显示 `⚡ 无尽 L1/L2...`，GameOverScene 显示「坚持到无尽第 N 关」
  - 极简版：未新建场景，复用 GameScene + LevelManager（去掉 setLevel TOTAL_LEVELS clamp）

- [~] ~~**#20. 成就 / 收藏图鉴系统**~~ 已决策不做（用户取消）
  - 原计划："抓到全部 N 种矿物" / "单关 5000+ 金" / "10 秒连抓 5 个" 等
  - 取消理由：不在当前迭代优先级

- [~] ~~**#21. 结算赌局 / 拍卖**~~ 已决策不做（用户取消）
  - 原计划：结算后花费部分金币参与赌局（如猜大小翻倍）
  - 取消理由：与原版风格略远，不在当前迭代优先级

- [ ] **#14. 关卡布局模板化设计**
  - 文件：`GameScene.tryPlaceMineral()` 支持 `mineralLayout` 字段
  - 内容：手工设计部分关卡的固定布局（特殊缝隙、岩石屏障）
  - 工作量：大

---

## 八、已完成项归档

### 灵魂三件套（Phase 0 已完成 ✅）

- [x] **#1. 矿工拟人化语音** - playVoice 公共方法 + Happy/Normal/Sad
- [x] **#2. 剩余时间转金币 Bonus** - ResultScene 3 阶段 tween 动画
- [x] **#3. 达标后允许提前结算** - HUD 闪烁 + 完关按钮 + Button.disabled
- [x] **#4. 抓物金额飘字效果** - FloatingText 对象池 + 分档着色

### 玩法机制补齐（已完成 ✅）

- [x] **#5. TNT 主动引爆** - Hook.tryDetonate() + F/↑ 键监听
- [x] **#6. +10秒额外时间道具** - ShopScene EXTRA_TIME + GameScene 应用

---

## 九、ROI 总览（待完成项）

| Phase | 项目 | 工作量 | 优先级 | 收益 |
|-------|------|--------|--------|------|
| **A** | A1-A5 核心基础设施 | 中-大 | 🔥🔥🔥 | 所有新功能的地基 |
| **B** | B1-B4 游戏机制改造 | 中 | 🔥🔥🔥 | 修 Bug + 难度可用 |
| **C** | C1-C6 UI 场景层 | 中-大 | 🔥🔥 | 用户可访问 |
| **D** | #7 #8 D9 难度门控 | 中 | 🔥🔥 | 玩法补齐 + 硬核体验 |
| **E** | #9-#13 内容扩充 | 大 | 🔥 | 长期可玩性 |
| **F** | #15-#18 视听打磨 | 中 | ⏳ | 经典感 |
| **G** | #14 #19-#21 元系统 | 大 | ⏳ | 长期留存 |

---

## 十、推荐迭代节奏

**Sprint A+B（2-3 天）**：基础设施 + Bug 修复 + 矿物预算
→ 核心数据层完成，可在控制台测试

**Sprint C（2-3 天）**：UI 场景层
→ 玩家可看到难度选择 + 槽位管理界面

**Sprint D（1-2 天）**：#7 #8 + INFINITE 模式
→ 玩法补齐全栏勾完，难度系统功能闭环

**Sprint E（3-5 天）**：内容扩充
→ 关卡 20+ + 章节主题，长期可玩性提升

**Sprint F（1-2 天）**：视听打磨
→ "那味儿"接近经典

**Sprint G（按需，3-5 天）**：元系统
→ 长期留存机制

**预计总工期**：12-20 天（取决于打磨程度）

---

## 十一、实施过程纪律

1. **每个 Phase 完成后**：
   - 跑 `npm run build` 确保 TS 编译通过
   - 跑 `/simplify` 三方审查（复用 / 质量 / 效率）
   - 提交 Git（按 Phase 一次 commit，便于回滚）
   - 更新本文档对应项状态 `[ ]` → `[x]`

2. **跨 Phase 依赖检查**：
   - C 开干前确认 A 全部完成
   - D 开干前确认 A+B+C 全部完成
   - E/F/G 可独立穿插

3. **应急回退**：
   - 若 A 阶段 Storage 重构破坏现有游戏 → 暂时保留旧 API 双轨运行
   - 若 B1 重量 Bug 修复后玩家反馈"太难" → 调小 WEIGHT_FACTOR 到 0.7

---

> 文档创建日期：2026-05-18
> 最近更新：2026-05-19（Phase A-F 全部完成 + 累加目标模式落地，仅剩 Phase G 元系统按需做）
> 维护：每个 Phase 完成后更新进度并标记 `[x]`

---

## 十二、下一步：剩余可选项

经典版差距已全部填平 + 无尽模式已落地。**#20 成就 / #21 赌局已决策不做**。剩余仅：

1. **#14 关卡布局模板化**（大）—— 部分关卡固定布局（特殊缝隙/岩石屏障）

也可以做：
- **视觉资产补完**：章节装饰图层（粉色云朵/蕾丝/蛋糕宫殿等）、猪猪公主吉祥物精灵
- **平衡性微调**：累加目标 + 商店压力实战测试后调参
- **发布准备**：build 优化 / README 更新 / 部署到 Github Pages 等
