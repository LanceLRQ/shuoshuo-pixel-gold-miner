# 黄金矿工 H5 - 经典版差距与实施路线图

> 本文档作为项目**核心实施总纲**，整合：
> 1. 与 2004 经典 Flash 黄金矿工的玩法差距
> 2. 新增需求（5 档难度系统 + 11 槽位存档系统 + 收回速度 Bug 修复）
> 3. 详细的 Phase 实施路线图（A → G，按依赖关系排序）
>
> **状态说明**：`[ ]` 待开发 / `[~]` 部分实现 / `[x]` 已完成
>
> **关联文档**：
> - [`difficulty-system.md`](./difficulty-system.md) - 5 档难度系统设计
> - [`save-slot-system.md`](./save-slot-system.md) - 11 槽位存档系统设计

---

## 〇、完成状态总览

| 类别 | 已完成 | 待完成 | 总数 |
|------|--------|--------|------|
| 灵魂三件套（#1-#4） | 4 | 0 | 4 |
| 玩法机制补齐（#5-#8） | 2 | 2 | 4 |
| 关卡 & 内容扩充（#9-#14） | 0 | 6 | 6 |
| 视听细节（#15-#18） | 0 | 4 | 4 |
| 元系统（#19-#21） | 0 | 3 | 3 |
| **新增：难度系统（D1-D5）** | 0 | 5 | 5 |
| **新增：存档系统（S1-S5）** | 0 | 5 | 5 |
| **新增：Bug 修复（B1-B2）** | 0 | 2 | 2 |
| **总计** | **6** | **22** | **33** |

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

## 一、Phase A：核心基础设施 🔥🔥🔥

> 难度系统 + 存档槽位是后续所有功能的地基，必须先做。

- [ ] **A1. Difficulty 模块定义**
  - 文件：新建 `src/level/difficulty.ts`
  - 内容：`Difficulty` 枚举（NOVICE/NORMAL/HARD/EXPERT/INFINITE）+ `DIFFICULTY_CONFIGS` 配置表
  - 参数：valueScale / timeScale / weightFactorScale / shopEnabled / infiniteItems / mineralBudgetRatio
  - 详见：[`difficulty-system.md`](./difficulty-system.md) §二
  - 工作量：小

- [ ] **A2. Storage 11 槽位重构**
  - 文件：`src/core/Storage.ts` 大改
  - 新增：自动槽位（0）+ 手动槽位（1-10）API
  - 方法：autoSave / loadAutoSlot / resetAutoSlot / saveToManualSlot / loadManualSlot / deleteManualSlot / listAllSlots
  - 兼容：旧 PROGRESS_KEY/STORAGE_KEY 迁移到自动槽位
  - 详见：[`save-slot-system.md`](./save-slot-system.md) §五
  - 工作量：中

- [ ] **A3. Game 状态管理改造**
  - 文件：`src/core/Game.ts`
  - 新增字段：`currentDifficulty: Difficulty` / `activeSlot: number | null`
  - 新增方法：`commitLevelResult()` / `saveAsManualSlot()` / `loadFromManualSlot()` / `startNewGame(difficulty)`
  - 新增 GameState：`SLOT_SELECT` / `DIFFICULTY_SELECT`
  - 工作量：中

- [ ] **A4. 旧存档迁移逻辑**
  - 文件：`Storage.ts` 启动时检测
  - 行为：检测旧 key 存在 + 自动槽位为空 → 复制到自动槽位 + 清除旧 key
  - 难度默认填 NORMAL
  - 工作量：小

- [ ] **A5. 难度独立高分系统**
  - 文件：`Storage.ts` GlobalData 结构
  - 新增：`highScoresByDifficulty: Record<Difficulty, number>` + `getGlobalHighScore()` + `updateAllHighScores()`
  - 工作量：小

---

## 二、Phase B：游戏机制改造 🔥🔥🔥

> 重量 Bug 是当前实际存在的隐患（力量药水对抓矿物不生效），优先修复。
> 矿物预算生成器解决"抽到全石头无法通关"的极端情况。

- [ ] **B1. 重量机制 Bug 修复 + 难度联动**
  - 文件：`src/entity/Hook.ts:152-157` + `src/entity/types.ts`
  - **修复 Bug**：抓矿物时收回速度公式补乘 `reelSpeedMultiplier`（让力量药水生效）
  - **调整基准**：`GAME_CONFIG.WEIGHT_FACTOR: 0.5 → 1.0`（重量差距更明显）
  - **难度联动**：注入 `difficulty.weightFactorScale`（新手 0 / 一般 1.0 / 困难 1.5 / 高手 2.0 / 无限 0）
  - 详见：[`difficulty-system.md`](./difficulty-system.md) §2.4
  - 工作量：小

- [ ] **B2. 矿物预算驱动生成器**
  - 文件：`src/scene/GameScene.ts` `generateMinerals()` 重构
  - 替换：纯加权随机 → 预算驱动（生成后总价值 ≥ `target × budgetRatio / valueScale`）
  - 新增：VALUE_UPGRADE_CHAIN 升级链（BONE → STONE → MOUSE → GOLD_SMALL → ... → GOLD_LARGE）
  - 算法：基础加权生成 → 总价值不足时替换低价值矿物为高价值 → 仍不足则追加大金块
  - 详见：[`difficulty-system.md`](./difficulty-system.md) §七
  - 工作量：中

- [ ] **B3. 矿物金额按难度缩放**
  - 文件：`src/scene/GameScene.ts` `onHookComplete()` + Mineral.value 引用处
  - 行为：`finalValue = mineral.value × difficulty.valueScale`
  - 范围：含主路径矿物 + 神秘袋内容 + 鼹鼠带钻石
  - **不缩放**：Bonus 时间奖励（独立于矿物经济）
  - 工作量：小

- [ ] **B4. 关卡时间按难度缩放**
  - 文件：`src/scene/GameScene.ts` `enter()`
  - 行为：`timeLimit = levelConfig.timeLimit × difficulty.timeScale + EXTRA_TIME_BONUS（如有）`
  - 工作量：极小

---

## 三、Phase C：UI 场景层 🔥🔥

> 玩家可视化的入口，做完后整套难度+存档系统才能玩起来。

- [ ] **C1. DifficultyScene（难度选择）**
  - 文件：新建 `src/scene/DifficultyScene.ts`
  - 布局：5 张难度卡片（新手/一般/困难/高手/无限火力）
  - 显示：每档的金额×、时间×、重量×、商店、道具机制 4 行简介
  - 触发：MenuScene "新游戏" 按钮 → DifficultyScene → 重置自动槽位 → PLAYING
  - 工作量：中

- [ ] **C2. SlotSelectScene（11 槽位列表）**
  - 文件：新建 `src/scene/SlotSelectScene.ts`
  - 布局：自动槽位独占第一行（宽卡） + 10 手动槽位 2×5 网格
  - 自动槽位按钮：[继续] / [覆盖（新游戏）]
  - 手动槽位按钮：[载入] / [删除]（二次确认）
  - 详见：[`save-slot-system.md`](./save-slot-system.md) §6.2-6.4
  - 工作量：中

- [ ] **C3. MenuScene 主菜单流程重构**
  - 文件：`src/scene/MenuScene.ts`
  - 按钮调整：[继续游戏] / [新游戏] / [读取存档] / [设置]
  - "继续游戏"：自动加载自动槽位（为空则禁用）
  - "新游戏"：进 DifficultyScene
  - "读取存档"：进 SlotSelectScene
  - 工作量：小

- [ ] **C4. 暂停菜单"另存为..." + SaveAsDialog**
  - 文件：`src/scene/GameScene.ts` 暂停层 + 新建 `src/scene/SaveAsDialog.ts`
  - 行为：玩家 ESC 暂停 → 点"💾 另存为..." → 弹出 10 手动槽位选择对话框
  - 覆盖警告：非空槽位选择时二次确认
  - 工作量：中

- [ ] **C5. ResultScene 即时存档（修复 Bonus 丢失隐患）**
  - 文件：`src/scene/ResultScene.ts` `enter()`
  - 行为：动画初始化前调用 `game.commitLevelResult(earned + bonus)`
  - 效果：玩家看到结算页 = 自动槽位已固化（关浏览器 Bonus 不丢）
  - 详见：[`save-slot-system.md`](./save-slot-system.md) §9.3
  - 工作量：极小

- [ ] **C6. HUD 显示难度 + 槽位标识**
  - 文件：`src/ui/HUD.ts`
  - 显示：右下角小字 "难度: 高手 · 自动存档（来自槽位 3）"
  - 工作量：极小

---

## 四、Phase D：难度门控功能（#7 #8 + INFINITE）🔥🔥

> 玩法机制补齐的剩余两项，配合难度门控规则实施。

- [ ] **#7. 摇晃饮料 / 震动器** ⚠️ 仅新手/一般可用
  - 价格：180$，描述"钩爪伸出中 ← / → 微调角度"
  - 文件：`Hook.ts` 加 `tryAdjustAngle(direction)` + `ShopScene.ts` 按难度过滤
  - 难度门控：困难/高手商店隐藏卡片，`tryAdjustAngle` 强制 return
  - 限制：仅 EXTENDING 状态有效，角度调整步长 0.05 rad，限制在 ±HOOK_MAX_ANGLE
  - 工作量：中

- [ ] **#8. 持久道具跨关保留** ⚠️ 仅新手/一般生效
  - 文件：`ShopScene.ts` 加 `persistent: boolean` 字段 + `Game.clearLevelBuffs()` 重构
  - 道具分类：
    - 持久型（6 种）：力量药水/幸运草/石头书/老鼠药/钻石变色油/摇晃饮料
    - 消耗品（2 种）：炸药/额外时间（任何难度都用完即弃）
  - 难度门控：困难/高手强制清除全部 persistent 道具
  - 详见：[`difficulty-system.md`](./difficulty-system.md) §九
  - 工作量：中

- [ ] **D9. INFINITE 模式实现**
  - 跳过商店：`Game.changeScene(SHOP)` 时 INFINITE 直接转 PLAYING
  - 开局加全 buff：`GameScene.enter()` 中 INFINITE 自动 `addOwnedItem(全部 ItemType)`
  - 道具不消耗：`tryDetonate()` 等检测 INFINITE 时跳过 `items.delete()`
  - HUD 标识："🔥 无限火力"
  - 工作量：中

---

## 五、Phase E：内容扩充 🔥

> 让游戏不那么"10 关玩完就没了"，扩充关卡数量和环境多样性。

- [ ] **#13. 关卡扩展至 20+ 关**
  - 文件：`src/level/levels.ts`
  - 内容：当前 10 关 → 20-30 关，按 3 章节制划分
  - 难度递增：目标金额 / 矿物分布 / 时间 / 矿物随机性
  - 工作量：中

- [ ] **#9. 章节主题包装**
  - 文件：`levels.ts` 加 `chapter` 字段 + 新建 `ChapterScene.ts`
  - 内容：3 章节（如 "金矿镇" / "深海遗迹" / "外星基地"）
  - 章节间过场：显示章节标题 + 简短剧情文字
  - 工作量：中

- [ ] **#10. 章节背景变化**
  - 文件：`assets/background.ts` + `ThemeManager` 接受章节参数
  - 内容：不同章节地下背景色 + 装饰元素差异（沙漠 / 火山 / 冰川）
  - 工作量：中

- [ ] **#11. 高分特殊收藏品**
  - 文件：`entity/types.ts` 扩展 MineralType + `assets/sprites.ts` 新精灵
  - 内容：每章节 1-2 种独特高分物（皇冠 800$ / 陶罐 400$ / 恐龙骨 600$ / 海星 500$）
  - 工作量：中

- [ ] **#12. 木箱 / 抽奖箱**
  - 文件：`Mineral.ts` 增加 `WOODEN_BOX` 类型 + 抽奖逻辑
  - 内容：抓到木箱后随机开出（钻石 / 金币 / 蜘蛛跳走扣血 / 骷髅扣分）
  - 工作量：中

---

## 六、Phase F：视听打磨 ⏳

> 提升经典版"那味儿"，但属于锦上添花。

- [ ] **#18. 金额达标视觉反馈**
  - 文件：`src/ui/HUD.ts`
  - 内容：HUD 达标瞬间金光闪烁 + "叮"音效
  - 工作量：小

- [ ] **#15. 拉重物"用力 / 涨红脸"动画**
  - 文件：`Miner.ts` 增加 STRAIN 状态 + 重物阈值检测
  - 内容：拉大金块/石头时矿工身体后倾、脸红、咬牙
  - 工作量：中（需新精灵帧）

- [ ] **#16. 钩绳金属"叮叮叮"摩擦音**
  - 文件：`core/Audio.ts` 增加循环音效支持
  - 内容：钩爪 EXTENDING 时循环播放绳索摩擦金属链声
  - 工作量：小

- [ ] **#17. 钩绳重物拖拽下垂感**
  - 文件：`Hook.ts` 渲染逻辑
  - 内容：拉巨型物时绳索向下绷紧曲线、矿工身体微微前倾
  - 工作量：中（视觉调试）

---

## 七、Phase G：元系统（最后）

> 长期留存机制，按需实施。

- [ ] **#19. 无尽模式 / 挑战模式**
  - 通关后解锁，矿物循环刷新 + 难度递增
  - 文件：新建 `EndlessScene.ts`
  - 工作量：中

- [ ] **#20. 成就 / 收藏图鉴系统**
  - 内容："抓到全部 N 种矿物" / "单关 5000+ 金" / "10 秒连抓 5 个" 等
  - 文件：新建 `src/core/Achievement.ts` + localStorage 持久化
  - 工作量：中

- [ ] **#21. 结算赌局 / 拍卖**
  - 内容：结算后花费部分金币参与赌局（如猜大小翻倍）
  - 文件：`ResultScene.ts` 增可选赌博按钮 + 转盘动画
  - 工作量：中

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
> 维护：每个 Phase 完成后更新进度并标记 `[x]`
