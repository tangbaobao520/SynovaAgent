#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# resolve-commit-brief.sh — 认领制 brief 解析 (D296, 跨 session 污染根治)
#
# 背景: current-brief 是全局单文件, 多 session 并发时最后启动者覆盖前者。
# 旧解析 (current-brief → find 最新) 让 A session 的提交被 B session 的 brief
# 校验 → 误伤 (D291 事故: D296 的 brief 干扰了 D291 的提交)。
#
# 认领制规则 (每个文件由认领它的 brief 判定):
#   1. current-brief (当日有效) 认领 ≥1 个暂存文件 → 输出它
#   2. 否则 → 今日 brief 中认领暂存文件数最多的 (其他 session 的文件由自己的 brief 认领)
#   3. 无任何认领 → current-brief (当日); 无 → 今日最新
#
# 用法: bash resolve-commit-brief.sh "<暂存文件列表 (换行分隔)>"
# 输出: brief 绝对路径; 无可用 brief → exit 1
#
# 性能: 认领计数用单次 python3 完成 (Windows 下逐路径 grep 子进程太慢)
# ═══════════════════════════════════════════════════════════════════════════════
set +e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TODAY=$(date +%Y-%m-%d)
STAGED="${1:-}"

# ── current-brief (当日有效) ──
CUR=""
if [ -f "$ROOT/.claude/current-brief" ]; then
  BN=$(cat "$ROOT/.claude/current-brief" 2>/dev/null | tr -d '[:space:]')
  BD=$(echo "$BN" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1 || true)
  if [ -n "$BD" ] && [ "$BD" != "$TODAY" ]; then
    :  # 陈旧的 current-brief，忽略
  elif [ -n "$BN" ] && [ -f "$ROOT/.claude/task-briefs/$BN" ]; then
    CUR="$ROOT/.claude/task-briefs/$BN"
  fi
fi

# 今日全部 brief (认领候选)
ALL_TODAY=$(find "$ROOT/.claude/task-briefs/" -maxdepth 1 -name "*.md" -newermt "$TODAY 00:00:00" 2>/dev/null | sort || true)
[ -z "$ALL_TODAY" ] && [ -n "$CUR" ] && ALL_TODAY="$CUR"

if [ -z "$ALL_TODAY" ] && [ -z "$CUR" ]; then
  exit 1
fi

# ── 认领判定 (单次 python3) ──
RESULT=$(python3 -c "
import re, sys

staged = [s.strip() for s in '''$STAGED'''.split('\n') if s.strip()]
briefs = [b for b in '''$ALL_TODAY'''.split('\n') if b.strip()]
cur = '''$CUR'''

def q2_scope(text):
    paths = []
    in_q2 = in_inc = False
    for line in text.split('\n'):
        line = line.rstrip('\r')
        if re.match(r'^## Q2:', line):
            in_q2 = True
            in_inc = False
            continue
        if in_q2 and re.match(r'^## ', line):
            break
        if in_q2 and re.match(r'^不做什么', line):
            in_inc = False
            continue
        if in_q2 and re.match(r'^做什么', line):
            in_inc = True
            continue
        if in_q2 and in_inc and line.startswith('- '):
            p = line[2:].split(':', 1)[0].split('：', 1)[0].split(' — ', 1)[0].strip()
            if p:
                paths.append(p)
    return paths

def matches(path, pat):
    return re.search(r'(^|/)' + re.escape(pat) + r'\$', path) is not None

claims = []
for b in briefs:
    try:
        text = open(b, encoding='utf-8').read()
    except OSError:
        continue
    scope = q2_scope(text)
    n = sum(1 for sf in staged for p in scope if matches(sf, p))
    claims.append((n, b))

# 1. current-brief 认领 ≥1 → 用它
if cur and any(b == cur and n > 0 for n, b in claims):
    print(cur)
    sys.exit(0)

# 2. 认领数最多的 brief
claims.sort(key=lambda x: -x[0])
if claims and claims[0][0] > 0:
    print(claims[0][1])
    sys.exit(0)

# 3. 回退: current-brief
if cur:
    print(cur)
    sys.exit(0)
" 2>/dev/null || true)

if [ -n "$RESULT" ] && [ -f "$RESULT" ]; then
  echo "$RESULT"
  exit 0
fi

# 最终回退: 今日最新 brief
LAST=$(find "$ROOT/.claude/task-briefs/" -type f -name "*.md" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
[ -n "$LAST" ] && { echo "$LAST"; exit 0; }
exit 1
