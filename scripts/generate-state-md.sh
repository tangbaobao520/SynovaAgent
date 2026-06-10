#!/usr/bin/env bash
# generate-state-md.sh — 从源代码中的 @state: 标记生成 STATE.md
#
# 使用方法: bash scripts/generate-state-md.sh
# 输出: STATE.md (仓库根目录)
#
# 这个脚本扫描所有 .ts 文件中的 @state: 标记，汇总成 STATE.md。
# 每次 git commit 前自动运行；手动运行可刷新全量状态。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$REPO_ROOT/STATE.md"
TEMP=$(mktemp)

cat > "$TEMP" << 'HEADER'
# STATE.md — Synova 代码真实状态

> 自动生成于 $(date "+%Y-%m-%d %H:%M")。
> 每次 commit 前由 pre-commit hook 自动更新。
> 手工运行: `bash scripts/generate-state-md.sh`

## 状态标记说明

| 标记 | 含义 |
|------|------|
| 🟢 @state: real | 生产可用，真实管线——API 已接通，数据真实 |
| 🟡 @state: skeleton | 代码骨架正确，接口完整——但数据源或 API 尚未接入 |
| 🔴 @state: placeholder | 占位——mock 数据，待实现或待替换 |

## 模块状态

HEADER

# 扫描所有 .ts 文件（排除 node_modules, dist, .git, .d.ts, .test.）
find "$REPO_ROOT/src" "$REPO_ROOT/packages" -name '*.ts' \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -path '*/.git/*' \
  -not -name '*.d.ts' \
  2>/dev/null | sort | while read -r file; do

  rel="${file#$REPO_ROOT/}"

  # 提取 @state: 标记
  state_line=$(grep '@state:' "$file" 2>/dev/null | head -1 || true)
  if [ -z "$state_line" ]; then
    # 没有 @state: 标记 → 默认 🔴
    state="🔴"
    desc="缺少 @state: 标记"
  else
    tag=$(echo "$state_line" | grep -oP '@state:\s*\K\w+' || echo "unknown")
    desc=$(echo "$state_line" | sed 's/.*@state:\s*\w*\s*//' | sed 's/^[[:space:]]*\/\/[[:space:]]*//' | sed 's/^[[:space:]]*//')
    case "$tag" in
      real)        state="🟢" ;;
      skeleton)    state="🟡" ;;
      placeholder) state="🔴" ;;
      *)           state="🔴" ;;
    esac
    [ -z "$desc" ] && desc="-"
  fi

  # 按目录分组
  dir=$(dirname "$rel")
  printf "%-6s %-70s %s\n" "$state" "$rel" "$desc" >> "$TEMP.by_dir"

done

# 按目录排序输出
{
  echo ""
  echo "| 状态 | 文件 | 说明 |"
  echo "|------|------|------|"
  sort "$TEMP.by_dir" | while read -r state rest; do
    rel=$(echo "$rest" | awk '{print $1}')
    desc=$(echo "$rest" | cut -d' ' -f2-)
    echo "| $state | $rel | $desc |"
  done
} >> "$TEMP"

# 统计
REAL=$(grep -c '🟢' "$TEMP.by_dir" 2>/dev/null || echo 0)
SKEL=$(grep -c '🟡' "$TEMP.by_dir" 2>/dev/null || echo 0)
PLACE=$(grep -c '🔴' "$TEMP.by_dir" 2>/dev/null || echo 0)
TOTAL=$((REAL + SKEL + PLACE))

{
  echo ""
  echo "## 统计"
  echo ""
  echo "| 状态 | 数量 | 占比 |"
  echo "|------|------|------|"
  printf "| 🟢 real | %d | %.0f%% |\n" "$REAL" "$(echo "scale=0; $REAL*100/$TOTAL" | bc -l 2>/dev/null || echo 0)"
  printf "| 🟡 skeleton | %d | %.0f%% |\n" "$SKEL" "$(echo "scale=0; $SKEL*100/$TOTAL" | bc -l 2>/dev/null || echo 0)"
  printf "| 🔴 placeholder | %d | %.0f%% |\n" "$PLACE" "$(echo "scale=0; $PLACE*100/$TOTAL" | bc -l 2>/dev/null || echo 0)"
  printf "| **总计** | **%d** | **100%%** |\n" "$TOTAL"
} >> "$TEMP"

# 替换占位日期
sed -i "s/\$(date \"+%Y-%m-%d %H:%M\")/$(date '+%Y-%m-%d %H:%M')/g" "$TEMP"

mv "$TEMP" "$OUTPUT"
echo "STATE.md 已生成: $REAL 🟢 / $SKEL 🟡 / $PLACE 🔴 (总计 $TOTAL 文件)"
rm -f "$TEMP.by_dir"
