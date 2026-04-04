#!/bin/bash
# 黄金矿工 H5 - 开发进度自动检查脚本
# 由 Claude Code hook (UserPromptSubmit) 自动触发

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TASKS_FILE="$PROJECT_DIR/TASKS.md"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

total=0
completed=0

# 检查函数：文件是否存在
check_file() {
  [ -f "$PROJECT_DIR/$1" ] && return 0 || return 1
}

# 检查函数：文件是否包含指定内容
check_content() {
  local file="$PROJECT_DIR/$1"
  [ -f "$file" ] && grep -q "$2" "$file" && return 0 || return 1
}

echo ""
echo "========================================="
echo "  黄金矿工 H5 - 开发进度检查"
echo "========================================="
echo ""

# ---- Phase 1 ----
echo -e "${CYAN}[Phase 1 - 基础框架]${NC}"

# 1.1 项目初始化
total=$((total+1))
if check_file "package.json" && check_content "package.json" "vite"; then
  echo -e "  ${GREEN}✓${NC} 1.1 项目初始化"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 1.1 项目初始化"
fi

# 1.2 Canvas 渲染器
total=$((total+1))
if check_file "src/core/Renderer.ts" && check_content "src/core/Renderer.ts" "imageSmoothingEnabled"; then
  echo -e "  ${GREEN}✓${NC} 1.2 Canvas 渲染器"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 1.2 Canvas 渲染器"
fi

# 1.3 游戏主循环
total=$((total+1))
if check_file "src/main.ts" && check_file "src/core/Game.ts" && check_content "src/core/Game.ts" "requestAnimationFrame\|deltaTime\|gameLoop"; then
  echo -e "  ${GREEN}✓${NC} 1.3 游戏主循环"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 1.3 游戏主循环"
fi

# 1.4 输入系统
total=$((total+1))
if check_file "src/core/Input.ts" && check_content "src/core/Input.ts" "isPressed\|onTap"; then
  echo -e "  ${GREEN}✓${NC} 1.4 输入系统"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 1.4 输入系统"
fi

# 1.5 场景管理器
total=$((total+1))
if check_file "src/scene/SceneBase.ts" && check_content "src/scene/SceneBase.ts" "enter\|exit\|update\|render"; then
  echo -e "  ${GREEN}✓${NC} 1.5 场景管理器"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 1.5 场景管理器"
fi

# ---- Phase 2 ----
echo -e "${CYAN}[Phase 2 - 像素素材系统]${NC}"

total=$((total+1))
if check_file "src/assets/sprites.ts" && check_content "src/assets/sprites.ts" "PixelMap"; then
  echo -e "  ${GREEN}✓${NC} 2.1-2.3 PixelMap + 缓存 + 精灵数据"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 2.1-2.3 PixelMap + 缓存 + 精灵数据"
fi

total=$((total+1))
if check_file "src/assets/background.ts" && check_content "src/assets/background.ts" "renderBackground"; then
  echo -e "  ${GREEN}✓${NC} 2.4 背景渲染"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 2.4 背景渲染"
fi

total=$((total+1))
if check_file "src/ui/PixelText.ts" && check_file "src/ui/Button.ts"; then
  echo -e "  ${GREEN}✓${NC} 2.5 像素字体 & UI"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 2.5 像素字体 & UI"
fi

# ---- Phase 3 ----
echo -e "${CYAN}[Phase 3 - 核心玩法]${NC}"

total=$((total+1))
if check_file "src/entity/Miner.ts"; then
  echo -e "  ${GREEN}✓${NC} 3.1 矿工角色"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 3.1 矿工角色"
fi

total=$((total+1))
if check_file "src/entity/Hook.ts" && check_content "src/entity/Hook.ts" "SWINGING\|EXTENDING\|REELING"; then
  echo -e "  ${GREEN}✓${NC} 3.2-3.5 钩爪系统 (摆动/发射/碰撞/收回)"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 3.2-3.5 钩爪系统 (摆动/发射/碰撞/收回)"
fi

total=$((total+1))
if check_file "src/entity/Mineral.ts" && check_file "src/utils/collision.ts"; then
  echo -e "  ${GREEN}✓${NC} 3.4+3.6 碰撞检测 + 矿物生成"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 3.4+3.6 碰撞检测 + 矿物生成"
fi

total=$((total+1))
if check_file "src/ui/HUD.ts"; then
  echo -e "  ${GREEN}✓${NC} 3.7+3.8 计分系统 + HUD"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 3.7+3.8 计分系统 + HUD"
fi

# ---- Phase 4 ----
echo -e "${CYAN}[Phase 4 - 关卡 & 商店]${NC}"

total=$((total+1))
if check_file "src/level/levels.ts" && check_file "src/level/LevelManager.ts"; then
  echo -e "  ${GREEN}✓${NC} 4.1-4.2 关卡数据 + 管理器"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 4.1-4.2 关卡数据 + 管理器"
fi

total=$((total+1))
if check_file "src/scene/ResultScene.ts" && check_file "src/scene/ShopScene.ts"; then
  echo -e "  ${GREEN}✓${NC} 4.3-4.5 结算 + 商店 + 道具"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 4.3-4.5 结算 + 商店 + 道具"
fi

total=$((total+1))
if check_file "src/core/Storage.ts"; then
  echo -e "  ${GREEN}✓${NC} 4.6 存档系统"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 4.6 存档系统"
fi

# ---- Phase 5 ----
echo -e "${CYAN}[Phase 5 - 音效 & 特效]${NC}"

total=$((total+1))
if check_file "src/core/Audio.ts"; then
  echo -e "  ${GREEN}✓${NC} 5.1 音效管理器"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 5.1 音效管理器"
fi

total=$((total+1))
if check_file "src/core/Audio.ts" && check_content "src/core/Audio.ts" "play.*\|BGM\|bgm"; then
  echo -e "  ${GREEN}✓${NC} 5.2-5.5 音效 + 粒子 + 特效 + BGM"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 5.2-5.5 音效 + 粒子 + 特效 + BGM"
fi

# ---- Phase 6 ----
echo -e "${CYAN}[Phase 6 - 打磨 & 发布]${NC}"

total=$((total+1))
if check_file "src/scene/MenuScene.ts" && check_content "src/scene/MenuScene.ts" "highScore\|MENU"; then
  echo -e "  ${GREEN}✓${NC} 6.1-6.5 移动端/性能/平衡/菜单/部署"
  completed=$((completed+1))
else
  echo -e "  ${YELLOW}○${NC} 6.1-6.5 移动端/性能/平衡/菜单/部署"
fi

# ---- 汇总 ----
echo ""
pct=$((completed * 100 / total))
bar_filled=$((pct / 5))
bar_empty=$((20 - bar_filled))
bar=""
for ((i=0; i<bar_filled; i++)); do bar+="█"; done
for ((i=0; i<bar_empty; i++)); do bar+="░"; done

echo "========================================="
echo -e " 进度: ${GREEN}${bar}${NC} ${pct}%"
echo " 完成: ${completed}/${total} 项检查点"
echo "========================================="
echo ""

# 当全部完成时提示移除 hook
if [ "$completed" -eq "$total" ]; then
  echo -e "${GREEN}🎉 所有开发任务已完成！可以移除 hook 了！${NC}"
  echo "运行: claude config remove-hook UserPromptSubmit check-progress"
fi
