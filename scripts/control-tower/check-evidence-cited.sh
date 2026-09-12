#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# check-evidence-cited.sh — D652: evidence 入库铁律
#
# 背景: K3 D651 实测 task-state/D551、D575 引用 evidence/D551、evidence/D575，
#       但 git 全历史零记录（M3/D577 做对过一次——落非忽略目录——但无机制强制）。
#       引用不可见证据 = 声明降级。本门禁把"引用必须 git 跟踪"变成物理校验。
#
# 契约 (铁律 47):
#   @input  — 无参: 校验本次变更触碰的 task-state/*.json
#             (暂存区口径 git diff --cached; CI 语境 SYNO_DIFF_BASE 存在时
#              用 git diff --name-only "$SYNO_DIFF_BASE...HEAD")
#             --staged <file>: 注入缝（每行一个仓库相对路径, 测试用, 生产忽略）
#             --all: 校验全部 task-state/*.json（CI/审计全量口径）
#   @output — 缺失清单（<task-state 文件>: 引用 <路径> 未被 git 跟踪 逐行点名）+ 统计;
#             全过 → "EVIDENCE-OK"; 无触碰 → "SKIP: 无 task-state 变更"
#   @exit   — 0 = 引用全部 git 跟踪 / 无引用 / 无触碰（正常默认）
#             1 = 存在引用了未被 git 跟踪的路径（业务阻断, fail-closed）
#             2 = 检查本身失败/降级（git 不可用 / JSON 解析失败——绝不与通过混同）
#   @degraded — git 命令失败或 JSON 解析失败 → exit 2 + stderr "degraded: <原因>"
#             （铁律 11/24: 显式降级不静默当真; JSON.parse 失败 ≠ ENOENT 正常默认）
#
# 解析范围: task-state/*.json 中所有 key 含 "evidence"（不区分大小写）的字符串值
#           + audit.report 字符串值。提取其中形如仓库相对路径的 token
#           （≥2 段、字符集 [A-Za-z0-9._-]，天然排除 http://、句子、中文描述），
#           对每个 token: git ls-files 非空（本身或其目录下有 tracked 文件）→ 可见。
#
# 不溯及既往: 只校验本次触碰的条目。存量 evidence/ 顶层引用被 .gitignore L76 全局
#             忽略属历史遗留——文件被触碰时即须补交证据入库（D544 P1-2 修复方向）。
#
# 用法: bash scripts/control-tower/check-evidence-cited.sh [--staged <file>|--all]
# 集成: scripts/pre-commit-check.sh 组 14（本地软提示, SYNO_CI=1 硬阻断, D516 权威）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 注入缝（测试隔离, 模式 5）: SYNO_REPO_ROOT 覆盖仓库根——沙箱测试零真实目录
ROOT="${SYNO_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

MODE="auto"
STAGED_FILE=""
for arg in "$@"; do
  case "$arg" in
    --all) MODE="all" ;;
    --staged) STAGED_FILE="__next__" ;;
    --stdin) MODE="stdin" ;;
    *)
      if [ "$STAGED_FILE" = "__next__" ]; then STAGED_FILE="$arg"; else
        echo "degraded: 未知参数 $arg（用法: check-evidence-cited.sh [--staged <file>|--stdin|--all]）" >&2
        exit 2
      fi
      ;;
  esac
done

# ── 触碰集合 ──
TOUCHED=""
if [ "$MODE" = "all" ]; then
  TOUCHED=$(cd "$ROOT" && ls task-state/*.json 2>/dev/null || true)
elif [ "$MODE" = "stdin" ]; then
  # pre-commit 接线模式: 触碰集合由调用方管道喂入（调用方是集合权威, 消除双取缝隙）
  TOUCHED=$(cat 2>/dev/null || true)
elif [ "$STAGED_FILE" != "__next__" ] && [ -n "$STAGED_FILE" ]; then
  # 注入缝（测试）: 显式文件列表
  TOUCHED=$(cat "$STAGED_FILE" 2>/dev/null || true)
elif [ -n "${SYNO_DIFF_BASE:-}" ]; then
  # CI 语境: diff base...HEAD（三点 = merge-base, 与 ci.yml docsonly 口径一致）
  if ! TOUCHED=$(git -C "$ROOT" diff --name-only "${SYNO_DIFF_BASE}...HEAD" -- task-state/ 2>&1); then
    echo "degraded: git diff 失败——$TOUCHED" >&2
    exit 2
  fi
else
  # pre-commit 本地语境: 暂存区
  if ! TOUCHED=$(git -C "$ROOT" diff --cached --name-only -- task-state/ 2>&1); then
    echo "degraded: git diff --cached 失败（git 不可用?）——$TOUCHED" >&2
    exit 2
  fi
fi

# 过滤: 只留 task-state/*.json 且工作树仍存在的条目（删除中的文件无引用可校验）
TOUCHED=$(echo "$TOUCHED" | grep -E '^task-state/[^/]+\.json$' | while IFS= read -r f; do
  [ -f "$ROOT/$f" ] && echo "$f"
done)
if [ -z "$TOUCHED" ]; then
  echo "SKIP: 无 task-state 变更（D652 跳过, 正常默认）"
  exit 0
fi

# ── 校验（python3 解析 JSON + 提取路径 token; bash 逐 token git ls-files）──
# 顶层目录锚定（V3.6 误报教训）: impl.evidence 是自由文本（真实仓库形态）, 任意
# token 都可能混入（实测: "2-1/2-2/2-5"、"origin/main"、"test/at"）。只收
# 第一段 ∈ (tracked 顶层目录 ∪ evidence) 的 token——evidence/ 被 .gitignore
# 忽略故不在 ls-tree, 但它正是 K3 点名的坏引用形态（evidence/D551、D575）, 必抓。
TOP_DIRS="$(git -C "$ROOT" ls-tree -d --name-only HEAD 2>/dev/null | tr '\n' ',')evidence,"
# 降级: ls-tree 失败（空仓库等）→ 内置默认集, 不静默当空（铁律 11 语义）
if [ "$TOP_DIRS" = "evidence," ]; then
  TOP_DIRS="docs,scripts,tests,src,packages,task-state,extensions,expert,knowledge,theory,skills,memory,config,data,patches,.github,security,providers,store,cron,evidence,"
fi
# PYBIN 三级探测（D520 checklist #1: Windows 部分机器无 python3.exe, 损坏 shim 探存在性不探可用性）
PYBIN=""
for _c in python3 python py; do  # PYBIN 候选链（D520 checklist #1）
  command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1 && PYBIN="$_c" && break
done
if [ -z "$PYBIN" ]; then
  echo "degraded: python 不可用（PYBIN 三级探测失败, D520 checklist #1——fail-closed）" >&2
  exit 2
fi
RESULT=$("$PYBIN" - "$ROOT" "$TOP_DIRS" $TOUCHED <<'PYEOF'
import json, re, sys, os

root = sys.argv[1]
anchors = {a for a in sys.argv[2].split(",") if a}
files = sys.argv[3:]
# 路径 token: ≥2 段, 字符集安全（无 glob/空格/中文/中缀+）, 天然停在中文标点前
TOKEN_RE = re.compile(r'[A-Za-z0-9._][A-Za-z0-9._+@-]*(?:/[A-Za-z0-9._+@-]+)+')
# 尾部剥离标点: 码点构造, 避免引号字符在 heredoc 中的转义歧义（D370 同型教训）
# 46=. 44=, 59=; 58=: 12289=、 65292=， 12290=。 65307=； 65306=： 65289=） 41=) 12305=】 12299=》 34=" 39=' 8217=' 8221="
TRAILING = ''.join(map(chr, [46, 44, 59, 58, 12289, 65292, 12290, 65307, 65306, 65289, 41, 12305, 12299, 34, 39, 8217, 8221]))

def collect(obj, out):
    """递归收集 key 含 evidence 的字符串值 + audit.report 值"""
    if isinstance(obj, dict):
        for k, v in obj.items():
            kl = k.lower()
            if isinstance(v, str) and ("evidence" in kl or (kl == "report")):
                out.append(v)
            else:
                collect(v, out)
    elif isinstance(obj, list):
        for it in obj:
            collect(it, out)

bad = []      # (file, token)
degraded = [] # (file, reason)
checked = 0
for f in files:
    path = os.path.join(root, f)
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as e:
        degraded.append((f, f"JSON 解析失败: {e}"))
        continue
    except OSError as e:
        degraded.append((f, f"读取失败: {e}"))
        continue
    vals: list = []
    collect(data, vals)
    for v in vals:
        for tok in TOKEN_RE.findall(v):
            tok = tok.rstrip(TRAILING)
            if "/" not in tok.strip("/"):
                continue
            tok = tok.strip("/")
            if not tok or tok.startswith(("http", "node_modules")):
                continue
            # 顶层锚定: 第一段必须是仓库已知顶层目录（自由文本误报防线, V3.6 教训）
            if tok.split("/", 1)[0] not in anchors:
                continue
            checked += 1
            bad.append((f, tok))
print("__META__")
print(f"{len(bad)}\t{checked}\t{len(degraded)}")
print("__BAD__")
for f, t in bad:
    print(f"{f}\t{t}")
print("__DEGRADED__")
for f, r in degraded:
    print(f"{f}\t{r}")
PYEOF
) || { echo "degraded: PY 解析器执行失败（$PYBIN, D520 checklist #1）" >&2; exit 2; }

META=$(echo "$RESULT" | sed -n '/^__META__$/,/^__BAD__$/p' | sed '1d;$d' | head -1)
BAD=$(echo "$RESULT" | sed -n '/^__BAD__$/,/^__DEGRADED__$/p' | sed '1d;$d')
DEGRADED=$(echo "$RESULT" | sed -n '/^__DEGRADED__$/,$p' | sed '1d')
BAD_COUNT=$(echo "$META" | cut -f1)
CHECKED=$(echo "$META" | cut -f2)
DEG_COUNT=$(echo "$META" | cut -f3)

# ── 降级优先: JSON 坏 = 无法证明该条目合规 = fail-closed（铁律 24）──
if [ "${DEG_COUNT:-0}" -gt 0 ]; then
  echo "$DEGRADED" | while IFS=$'\t' read -r f r; do
    echo "degraded: $f — $r" >&2
  done
  echo "❌ D652: ${DEG_COUNT} 个 task-state 文件无法解析（fail-closed, 不当作无引用）"
  exit 2
fi

if [ -z "$BAD" ]; then
  echo "EVIDENCE-OK: ${CHECKED} 个引用路径全部 git 跟踪（D652 通过）"
  exit 0
fi

# ── 逐 token 物理校验 git 跟踪态 ──
MISSING=""
while IFS=$'\t' read -r f tok; do
  [ -z "$tok" ] && continue
  if ! git -C "$ROOT" -c core.quotepath=off ls-files -- "$tok" "$tok/" 2>/dev/null | grep -q .; then
    MISSING="${MISSING}${f}: 引用 ${tok} 未被 git 跟踪"$'\n'
  fi
done <<< "$BAD"

if [ -n "$MISSING" ]; then
  echo "❌ D652: evidence 引用未入库（引用不可见证据 = 声明降级, M3/D577 先例）:"
  echo "$MISSING" | grep -v '^$' | sed 's/^/  - /'
  echo "  修复: 证据落盘到非忽略目录（docs/synova/audit-reports/ 先例 @D577）并 git add, 或改引用为真实路径"
  exit 1
fi

echo "EVIDENCE-OK: ${CHECKED} 个引用路径全部 git 跟踪（D652 通过）"
exit 0
