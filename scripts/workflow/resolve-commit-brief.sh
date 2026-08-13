#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
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
#       bash resolve-commit-brief.sh --session <sid> "<暂存文件列表>"  (D329: session 专属 current-brief 优先)
# 输出: brief 绝对路径; 无可用 brief → exit 1
#
# 性能: 认领计数用单次 python3 完成 (Windows 下逐路径 grep 子进程太慢)
# ═══════════════════════════════════════════════════════════════════════════════
set +e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# D317: brief_parser 是 resolver 的兄弟组件（同仓库）——不能用 $ROOT 定位，
# 测试隔离（临时 repo）或 ROOT 与脚本异仓库时 $ROOT 下没有解析器。
RESOLVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="$RESOLVER_DIR/../control-tower/brief_parser.py"
# Windows python 不认 MSYS 路径（/d/...）→ cygpath 转 C:/...（sys.path 注入用）
PARSER_DIR_W="$(cygpath -w "$RESOLVER_DIR/../control-tower" 2>/dev/null || echo "$RESOLVER_DIR/../control-tower")"
TODAY=$(date +%Y-%m-%d)
STAGED="${1:-}"

# D329: --session <sid> — 优先读 session 专属 current-brief（.claude/current-brief.<sid>），
# 无则回退全局（单 session 语义）。session 专属文件由 attach.py SessionStart 写入。
SESSION_ID=""
if [ "${1:-}" = "--session" ]; then
  SESSION_ID="${2:-}"
  shift 2
  STAGED="${1:-}"
fi

# D317: PYBIN 跨平台 — Windows 部分机器无 python3.exe（仅 python / py -3）。
# 本机实测 python3 可用（WindowsApps shim），但防御性回退防精简 Git/CI runner。
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done

# ── current-brief (当日有效) ──
CUR=""
CUR_SRC="$ROOT/.claude/current-brief"
# D329: session 专属 current-brief 优先；无则回退全局
if [ -n "$SESSION_ID" ] && [ -f "$ROOT/.claude/current-brief.$SESSION_ID" ]; then
  CUR_SRC="$ROOT/.claude/current-brief.$SESSION_ID"
fi
if [ -f "$CUR_SRC" ]; then
  BN=$(cat "$CUR_SRC" 2>/dev/null | tr -d '[:space:]') # swallow-ok: current-brief 缺失/读失败 → BN 空 → 走认领回退（fail-open 不阻断）
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

# ── 认领判定 (单次 python) ──
if [ -z "$PYBIN" ]; then
  # D317: python 不可用 → 无法认领 → 直接走最终回退（回退同样无 python 时 exit 1 fail-open）
  RESULT=""
else
RESULT=$("$PYBIN" -c "
import re, sys
sys.path.insert(0, r'$ROOT/scripts/control-tower')
try:
    from brief_parser import parse_q2, match_path
except ImportError:
    # fail-open: 解析器缺失 → 降级到内联语义（不阻断认领流程）
    def parse_q2(text):
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
        # D329: 对齐 brief_parser.parse_q2 契约（返回 dict）——旧实现返回 list，
        # 调用方 parse_q2(text)['include'] 在解析器缺失路径上 TypeError → 认领恒空
        # 注意: 本段嵌入 bash 双引号串，python 字符串必须用单引号（勿在注释写双引号）
        return {'include': paths, 'exclude': []}
    def match_path(path, pat):
        return re.search(r'(^|/)' + re.escape(pat) + r'\$', path) is not None

staged = [s.strip() for s in '''$STAGED'''.split('\n') if s.strip()]
briefs = [b for b in '''$ALL_TODAY'''.split('\n') if b.strip()]
cur = '''$CUR'''

claims = []
for b in briefs:
    try:
        text = open(b, encoding='utf-8').read()
    except OSError:
        continue
    scope = parse_q2(text)['include']
    n = sum(1 for sf in staged for p in scope if match_path(sf, p))
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
fi

if [ -n "$RESULT" ] && [ -f "$RESULT" ]; then
  echo "$RESULT"
  exit 0
fi

# D317 最终回退: 最新日期 → 最早, 用 brief_parser 验证可解析性 (criteria A-D),
# 选第一个可解析的。全部不可解析或 python 不可用 → exit 1 (fail-open → G12b 跳过),
# 绝不静默返回坏 brief。
# 背景: CI 干净检出无 staged → 认领为空 → 旧逻辑按日期前缀选最新 = D286 (旧格式,
# criteria=null) → G12b 硬阻断 → Iron Laws 红 (D317 根因)。
# 注意: 不能按 mtime — CI 干净检出时所有文件 mtime 相同 (phase34-nodate.md 事故)。
# 性能: 单次 python 批量解析（281 文件 × 逐文件起 python 进程 = 分钟级超时）。
if [ -z "$PYBIN" ]; then
  exit 1
fi
RESULT=$("$PYBIN" -c "
import os, re, sys
sys.path.insert(0, r'$PARSER_DIR_W')
from brief_parser import parse_criteria

briefs = []
for f in os.listdir(r'$ROOT/.claude/task-briefs/'):
    if not f.endswith('.md'):
        continue
    m = re.match(r'(\d{4}-\d{2}-\d{2})', f)
    if m:
        briefs.append((m.group(1), f))
briefs.sort(key=lambda x: x[0], reverse=True)
for _d, _f in briefs:
    try:
        text = open(os.path.join(r'$ROOT/.claude/task-briefs/', _f), encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    if parse_criteria(text):
        print(os.path.join(r'$ROOT/.claude/task-briefs/', _f))
        sys.exit(0)
sys.exit(1)
" 2>/dev/null || true)
[ -n "$RESULT" ] && { echo "$RESULT"; exit 0; }
exit 1
