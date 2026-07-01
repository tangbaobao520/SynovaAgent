#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# merge-expert-files.sh — 专家文件合并重构 (10→5)
#
# 用法: bash scripts/merge-expert-files.sh [expert_name]
#   - 不传参数: 对全部 8 位专家执行
#   - 传参数: 只对指定专家执行 (如 bash merge-expert-files.sh strategy)
#
# 约束:
# - 不改变任何文件的内容——只做合并
# - 保持原有标题层级（原一级标题变二级，原二级变三级）
# - 文件之间用 --- 分隔
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
EXPERTS=("strategy" "org" "finance" "tech" "marketing" "action" "business_model" "knowledge")

# ═══ 辅助函数 ═══

# 标题层级提升: 所有标题增加一个 # (H1→H2, H2→H3, H3→H4)
# 跳过 frontmatter (--- 包围的 YAML 块)
shift_headings() {
  local in_frontmatter=0
  while IFS= read -r line; do
    if [[ "$line" =~ ^---$ ]]; then
      if [ $in_frontmatter -eq 0 ]; then
        in_frontmatter=1
        echo "$line"
      else
        in_frontmatter=0
        echo "$line"
      fi
    elif [ $in_frontmatter -eq 1 ]; then
      echo "$line"
    elif [[ "$line" =~ ^(#) ]]; then
      echo "#$line"
    else
      echo "$line"
    fi
  done
}

# 读取文件并 shift 标题
read_and_shift() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 1
  fi
  shift_headings < "$file"
  return 0
}

# 读取文件原样输出 (不 shift)
read_raw() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 1
  fi
  cat "$file"
  return 0
}

# 检查文件是否有内容（不包含仅 frontmatter）
has_content() {
  local file="$1"
  if [ ! -f "$file" ]; then return 1; fi
  # 检查是否有非 frontmatter 的标题行
  local lines_after_fm=$(awk 'BEGIN{c=0} /^---$/{c++;next} c>=2 && NF' "$file" | head -3)
  if [ -z "$lines_after_fm" ]; then
    # 没有 frontmatter 或 frontmatter 后无内容
    local no_fm_lines=$(awk '!/^---$/' "$file" | grep -c . || true)
    [ "$no_fm_lines" -gt 0 ] && return 0 || return 1
  fi
  return 0
}

# ═══ 主逻辑 ═══

merge_expert() {
  local type="$1"
  local dir="$ROOT/expert/$type"

  echo "────────────────────────────────────────"
  echo "  合并: $type ($dir)"
  echo "────────────────────────────────────────"

  if [ ! -d "$dir" ]; then
    echo "  [SKIP] 目录不存在: $dir"
    return
  fi

  # 验证所有源文件存在
  local missing=0
  for f in THEORY.md SOUL.md KNOWLEDGE.md FORMULAS.md RULES.md STAGE_LOGIC.md OUTPUT_SCHEMA.md; do
    if [ ! -f "$dir/$f" ]; then
      echo "  [WARN] 缺少文件: $dir/$f"
      missing=$((missing + 1))
    fi
  done

  # ═══ 生成新的 THEORY.md ═══
  echo "  生成 THEORY.md (合并 THEORY + SOUL(方法论) + KNOWLEDGE + FORMULAS)..."

  # 备份原文件
  cp "$dir/THEORY.md" "$dir/.THEORY.md.bak"

  {
    # 1. 原 THEORY.md 内容
    read_raw "$dir/THEORY.md"

    echo ""
    echo "---"
    echo ""

    # 2. SOUL.md 作为诊断方法论 (shift headings)
    if [ -f "$dir/SOUL.md" ]; then
      # SOUL.md 已有的 H2 → H3, H3 → H4
      # 添加 ## 诊断方法论 标题
      echo "## 诊断方法论"
      echo ""
      # 提取 SOUL.md 中非 frontmatter 内容，shift headings
      awk 'BEGIN{in_fm=0} /^---$/{in_fm++; next} in_fm>=2 || in_fm==0' "$dir/SOUL.md" | shift_headings
    fi

    echo ""
    echo "---"
    echo ""

    # 3. KNOWLEDGE.md (shift headings)
    if has_content "$dir/KNOWLEDGE.md"; then
      # KNOWLEDGE.md 的 H1 → H2, H2 → H3
      read_and_shift "$dir/KNOWLEDGE.md"

      echo ""
      echo "---"
      echo ""
    fi

    # 4. FORMULAS.md (shift headings)
    if has_content "$dir/FORMULAS.md"; then
      echo "## 计算公式参考"
      echo ""
      awk 'BEGIN{in_fm=0} /^---$/{in_fm++; next} in_fm>=2 || in_fm==0' "$dir/FORMULAS.md" | shift_headings
    fi
  } > "$dir/THEORY.md.new"

  mv "$dir/THEORY.md.new" "$dir/THEORY.md"

  # ═══ 生成新的 RULES.md ═══
  echo "  生成 RULES.md (合并 RULES + SOUL(边界) + STAGE_LOGIC + OUTPUT_SCHEMA)..."

  cp "$dir/RULES.md" "$dir/.RULES.md.bak"

  # 检查 SOUL.md 是否有边界/局限内容
  local has_boundary=false
  if [ -f "$dir/SOUL.md" ]; then
    if grep -qi "边界\|局限\|限制\|不适用\|注意" "$dir/SOUL.md" 2>/dev/null; then
      has_boundary=true
    fi
  fi

  {
    # 1. 原 RULES.md
    read_raw "$dir/RULES.md"

    echo ""
    echo "---"
    echo ""

    # 2. SOUL.md 的边界/局限 (如果有)
    if $has_boundary; then
      echo "## 诊断边界与局限"
      echo ""
      # 从 SOUL.md 提取含边界/局限的段落
      awk 'BEGIN{found=0} /边界|局限|限制|不适用|注意/{found=1} found' "$dir/SOUL.md" | shift_headings
      echo ""
      echo "---"
      echo ""
    fi

    # 3. STAGE_LOGIC.md (shift headings)
    if has_content "$dir/STAGE_LOGIC.md"; then
      echo "## 规模自适应规则"
      echo ""
      read_and_shift "$dir/STAGE_LOGIC.md"

      echo ""
      echo "---"
      echo ""
    fi

    # 4. OUTPUT_SCHEMA.md (shift headings)
    if has_content "$dir/OUTPUT_SCHEMA.md"; then
      echo "## 输出格式规范"
      echo ""
      read_and_shift "$dir/OUTPUT_SCHEMA.md"
    fi
  } > "$dir/RULES.md.new"

  mv "$dir/RULES.md.new" "$dir/RULES.md"

  # ═══ 删除旧文件 ═══
  echo "  删除旧文件: SOUL.md KNOWLEDGE.md FORMULAS.md STAGE_LOGIC.md OUTPUT_SCHEMA.md"
  rm -f "$dir/SOUL.md" "$dir/KNOWLEDGE.md" "$dir/FORMULAS.md" "$dir/STAGE_LOGIC.md" "$dir/OUTPUT_SCHEMA.md"

  # ═══ 清理备份 ═══
  rm -f "$dir/.THEORY.md.bak" "$dir/.RULES.md.bak"

  echo "  [OK] $type 合并完成"
  echo ""
}

# ═══ 执行 ═══

# 如果传了参数，只合并指定专家
if [ $# -ge 1 ]; then
  merge_expert "$1"
else
  for expert in "${EXPERTS[@]}"; do
    merge_expert "$expert"
  done
fi

echo "════════════════════════════════════════"
echo "  全部合并完成"
echo "════════════════════════════════════════"

# 验证: 检查每个专家目录只留 5 个文件
FAIL=0
for expert in "${EXPERTS[@]}"; do
  dir="$ROOT/expert/$expert"
  if [ -d "$dir" ]; then
    count=$(ls "$dir"/*.md 2>/dev/null | wc -l)
    if [ "$count" -ne 5 ]; then
      echo "  [WARN] $expert: 期望 5 个 .md 文件, 实际 $count"
      FAIL=$((FAIL + 1))
    fi
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "  全部专家目录验证通过 (5 文件)"
else
  echo "  $FAIL 个专家目录文件数异常"
fi
