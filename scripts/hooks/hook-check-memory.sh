#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# PreToolUse Hook: G2 自动化 — 从 memory/ 中提取与当前任务相关的历史教训
#
# 挂在: PreToolUse hook (AI 写代码前自动触发)
# 机制: 扫描当前 task brief 的关键词 → 匹配 memory/*.md → 输出教训摘要
#        AI harness 读取此输出并注入到 system-reminder 块
# 阻断: 不阻断 (信息注入型, 非门禁型)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# D312 M2: git 操作写窗口守卫 — stash/checkout/reset 期间跳过 memory/STATE 写
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/hook-git-guard.sh" 2>/dev/null || true
SKIP_HOOK_WRITES=0
if git_op_window_active 2>/dev/null; then SKIP_HOOK_WRITES=1; fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MEMORY_DIR="$ROOT/memory"
TODAY=$(date +%Y-%m-%d)

# ── 1. 找到当前 task brief ──
BRIEF=$(find "$ROOT/.claude/task-briefs/" -name "${TODAY}*" 2>/dev/null | head -1)
if [ -z "$BRIEF" ]; then
  echo "[hook-check-memory] 无今日 task brief, 跳过教训注入"
  exit 0
fi

# ── 2. 从 task brief 提取关键词 ──
# 匹配中文术语 + 英文标识符 + 文件路径
KEYWORDS=$(grep -oE '[一-鿿]{2,8}|expert|feishu|memory|sentinel|bridge|connector|graph|store|phase|pipeline|\b[A-Z][a-z]+[A-Z]\w*' "$BRIEF" 2>/dev/null \
  | sort -u | head -30 || true)

if [ -z "$KEYWORDS" ]; then
  echo "[hook-check-memory] task brief 无有效关键词, 跳过"
  exit 0
fi

# ── 3. 检查 memory/ 是否有匹配关键词的教训 ──
MATCHED_MEMORIES=""
while IFS= read -r memfile; do
  [ -z "$memfile" ] && continue
  [ ! -f "$memfile" ] && continue
  # 跳过索引文件和纯参考文件
  basename=$(basename "$memfile")
  if echo "$basename" | grep -qE '^MEMORY\.md$|^project-state'; then continue; fi

  while IFS= read -r kw; do
    [ -z "$kw" ] && continue
    [ ${#kw} -lt 2 ] && continue
    if grep -qi "$kw" "$memfile" 2>/dev/null; then
      MATCHED_MEMORIES="${MATCHED_MEMORIES}${memfile}"$'\n'
      break
    fi
  done <<< "$KEYWORDS"
done < <(find "$MEMORY_DIR" -name "*.md" -type f 2>/dev/null || true)

MATCHED_MEMORIES=$(echo "$MATCHED_MEMORIES" | sort -u | grep -v '^$' || true)

if [ -z "$MATCHED_MEMORIES" ]; then
  echo "[hook-check-memory] 无匹配教训"
  exit 0
fi

# ── 4. 输出教训摘要 (harness 读取并注入上下文) ──
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  G2 错误预防: memory/ 中匹配的历史教训                        ║"
echo "╠══════════════════════════════════════════════════════════════╣"

while IFS= read -r memfile; do
  [ -z "$memfile" ] && continue
  name=$(basename "$memfile" .md)
  # 提取 Why: 和 How to apply: 行
  why=$(grep -A1 "^\*\*Why:\*\*" "$memfile" 2>/dev/null | head -2 | tr '\n' ' ' || true)
  how=$(grep -A1 "^\*\*How to apply:\*\*" "$memfile" 2>/dev/null | head -2 | tr '\n' ' ' || true)

  echo "║"
  echo "║  📋 ${name}"
  if [ -n "$why" ]; then
    echo "║     Why: ${why:0:120}"
  fi
  if [ -n "$how" ]; then
    echo "║     How: ${how:0:120}"
  fi
  # 提取关联记忆链接
  links=$(grep -oP '\[\[([^]]+)\]\]' "$memfile" 2>/dev/null | head -5 | tr '\n' ' ' || true)
  if [ -n "$links" ]; then
    echo "║     See also: ${links:0:120}"
  fi
done <<< "$MATCHED_MEMORIES"

echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ═══ V4.1: 免疫细胞自动执行 ═══
# 读取每个匹配 memory 的 constraint 字段 → 执行 bash → 比较 expected
# severity=block → exit 1 阻断 Write
# severity=warn → 写入 STATE.md
IMMUNE_BLOCK=0
STATE_FILE="$ROOT/STATE.md"
TODAY=$(date +%Y-%m-%d)
NOW=$(date +%H:%M)

while IFS= read -r memfile; do
  [ -z "$memfile" ] && continue
  CONSTRAINT=$(awk '/^constraint:/{gsub(/^constraint: *"/,""); gsub(/"$/,""); print; exit}' "$memfile" 2>/dev/null || true)
  [ -z "$CONSTRAINT" ] && continue

  EXPECTED=$(awk '/^expected:/{gsub(/^expected: */,""); print; exit}' "$memfile" 2>/dev/null || true)
  SEVERITY=$(awk '/^severity:/{gsub(/^severity: */,""); print; exit}' "$memfile" 2>/dev/null || echo "warn")
  CLASS=$(awk '/^class:/{gsub(/^class: */,""); print; exit}' "$memfile" 2>/dev/null || echo "unknown")

  # 执行约束命令
  ACTUAL=$(eval "$CONSTRAINT" 2>/dev/null || echo "ERROR")
  # 去除空白字符
  ACTUAL=$(echo "$ACTUAL" | tr -d '[:space:]')
  EXPECTED=$(echo "$EXPECTED" | tr -d '[:space:]')

  if [ "$ACTUAL" != "$EXPECTED" ]; then
    # 更新 occurrences（D312 M2: git 操作窗口内跳过写 — 防 stash/pop 冲突）
    OCCURRENCES=$(awk '/^occurrences:/{gsub(/^occurrences: */,""); print; exit}' "$memfile" 2>/dev/null || echo "0")
    OCCURRENCES=$((OCCURRENCES + 1))
    if [ -z "${SKIP_HOOK_WRITES:-}" ]; then
      sed -i "s/^occurrences:.*/occurrences: $OCCURRENCES/" "$memfile" 2>/dev/null || true
    fi

    if [ "$SEVERITY" = "block" ]; then
      echo ""
      echo "╔══════════════════════════════════════════════════════════════╗"
      echo "║  🛡️  V4.1 免疫阻断 — 历史错误模式检测到                          ║"
      echo "╠══════════════════════════════════════════════════════════════╣"
      echo "║  错误类别: $CLASS"
      echo "║  约束命令: ${CONSTRAINT:0:60}..."
      echo "║  期望输出: $EXPECTED"
      echo "║  实际输出: ${ACTUAL:0:60}..."
      echo "║  累计次数: $OCCURRENCES"
      echo "║  来源: $(basename $memfile)"
      echo "╚══════════════════════════════════════════════════════════════╝"
      echo ""
      IMMUNE_BLOCK=1
    else
      # severity=warn → 写入 STATE.md（D312 M2: git 操作窗口内跳过写）
      if [ -z "${SKIP_HOOK_WRITES:-}" ]; then
        if [ ! -f "$STATE_FILE" ]; then
          echo "# SynovaAgent STATE — Loop Engineering 运行状态" > "$STATE_FILE"
          echo "" >> "$STATE_FILE"
          echo "## 免疫警告" >> "$STATE_FILE"
          echo "" >> "$STATE_FILE"
          echo "| 时间 | 错误类别 | 约束输出 | 累计次数 |" >> "$STATE_FILE"
          echo "|------|---------|---------|---------|" >> "$STATE_FILE"
        fi
        echo "| ${TODAY} ${NOW} | ${CLASS} | ${ACTUAL:0:40} | ${OCCURRENCES} |" >> "$STATE_FILE"
      fi
      echo "[hook-check-memory] ⚠️ 免疫警告: $CLASS (第 ${OCCURRENCES} 次) → STATE.md"
    fi
  fi
done <<< "$MATCHED_MEMORIES"

if [ "$IMMUNE_BLOCK" -eq 1 ]; then
  echo "[hook-check-memory] 🛡️ 免疫阻断 — 禁止写代码"
  exit 1
fi

# ── 5. 输出匹配计数 (供 harness 日志) ──
MATCH_COUNT=$(echo "$MATCHED_MEMORIES" | grep -c . 2>/dev/null) || MATCH_COUNT=0
echo "[hook-check-memory] 注入 ${MATCH_COUNT} 条相关教训到上下文"

exit 0
