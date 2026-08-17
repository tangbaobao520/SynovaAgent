#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-dev-doc-write-set.sh — D313 M3b dev doc 写集验证
#
# 防 D286 类"声明 16 实际 17"漂移: dev doc 写集表声明的文件 vs 代码实际。
#
# 流程: devdoc_writeset.py --extract（4 形态清洗）→ 逐条目核验:
#   (a) 存在性: 归一路径在仓库存在
#   (b) 变更命中: 路径 ∈ git diff HEAD（声明修改但零实际变更 → 漂移）
#   (c) 计数声明: (N 修改 + M 新建) 与 git diff 实际计数对比
#
# 与 verify-parallel.sh 分工: verify-parallel 管"两 doc 零交集"，
# 本脚本管"单 doc 声明 vs 代码真实"，共用 devdoc_writeset.py。
#
# fail-open: doc 缺失/解析异常/无写集表 → SKIP + degraded + exit 0。
# 漂移 exit 1（dev doc 是分发契约，业务阻断）。
#
# 用法: check-dev-doc-write-set.sh [doc-path] [--json]
#   缺省 = 暂存区 docs/plans/codex/implementation/SYNOVA-IMPL-*.md
#   注入缝: SYNO_DEV_DOC / SYNO_DEV_DOC_DIR（测试免跑真实 git diff）
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WRITESET="$REPO_DIR/scripts/control-tower/devdoc_writeset.py"
DEGRADED_LOG="$REPO_DIR/.codex/control-tower/logs/degraded-events.log"
IMPL_DIR="$REPO_DIR/docs/plans/codex/implementation"

JSON_OUT=0
DOC=""
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUT=1 ;;
    *) [ -z "$DOC" ] && DOC="$arg" ;;
  esac
done

log_degraded() {
  mkdir -p "$(dirname "$DEGRADED_LOG")"
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)\", \"component\": \"check-dev-doc-write-set\", \"reason\": \"$1\"}" >> "$DEGRADED_LOG" 2>/dev/null || true
}

# 注入缝: SYNO_DEV_DOC 单文件 / SYNO_DEV_DOC_DIR 目录
if [ -z "$DOC" ] && [ -n "${SYNO_DEV_DOC:-}" ]; then DOC="$SYNO_DEV_DOC"; fi

if [ -z "$DOC" ]; then
  DOCS=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '^docs/plans/codex/implementation/SYNOVA-IMPL-.*\.md$' || true)
  if [ -z "$DOCS" ]; then
    echo "[check-dev-doc-write-set] ✅ 无暂存 dev doc — 跳过"
    exit 0
  fi
  DOC=$(echo "$DOCS" | head -1)
fi

if [ ! -f "$DOC" ]; then
  log_degraded "doc 不存在: $DOC"
  echo "[check-dev-doc-write-set] ⚠️  SKIP $DOC — doc 不存在 (fail-open)"
  exit 0
fi

echo "── check-dev-doc-write-set (D313 M3b): 声明 vs 实际 ──"
echo "  doc: $DOC"

# 提取写集
OUT=$(python3 "$WRITESET" --extract "$DOC" 2>&1 || true)
STATUS=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','skip'))" 2>/dev/null || echo "skip")
if [ "$STATUS" = "skip" ]; then
  REASON=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('reason',''))" 2>/dev/null || echo "解析跳过")
  log_degraded "$DOC: $REASON"
  echo "  ⚠️  SKIP — $REASON (fail-open)"
  exit 0
fi

CLEANED=$(echo "$OUT" | python3 -c "import json,sys; print('\n'.join(json.load(sys.stdin).get('cleaned', [])))" 2>/dev/null || echo "")
if [ -z "$CLEANED" ]; then
  echo "  ⚠️  SKIP — 写集表无有效条目 (fail-open)"
  exit 0
fi

# 逐条目核验: (a) 存在性 (b) git diff 命中
DRIFT=""
CHECKED=0
while IFS= read -r entry; do
  entry=$(echo "$entry" | tr -d '\r')  # 剥 CR（Windows CRLF）
  [ -z "$entry" ] && continue
  CHECKED=$((CHECKED + 1))
  # 目录级声明 → 检查目录存在
  if [ "${entry: -1}" = "/" ]; then
    if [ -d "$REPO_DIR/$entry" ]; then
      :
    else
      DRIFT="${DRIFT}  ${entry}（目录不存在）\n"
    fi
    continue
  fi
  # D316: 非文件条目（操作类，如 "git 推送"，无扩展名）→ 不参与文件核验
  if ! echo "$entry" | grep -q '\.'; then
    continue
  fi
  # 文件存在性
  if [ ! -f "$REPO_DIR/$entry" ]; then
    DRIFT="${DRIFT}  ${entry}（文件不存在）\n"
    continue
  fi
  # D316: gitignore 文件（运行时产物，如 logs/version.log）→ 存在即声明满足
  if git check-ignore -q "$REPO_DIR/$entry" 2>/dev/null; then  # swallow-ok: 探测型（ignore 判定失败走 else）
    continue
  fi
  # git diff 命中（声明"修改"但零实际变更 → 漂移；SYNO_DEV_DOC 注入时跳过此检查）
  # D316: grep -qiF 大小写不敏感（VERSION.md vs clean 后 version.md）
  if [ -z "${SYNO_DEV_DOC:-}" ]; then
    if ! git diff HEAD --name-only 2>/dev/null | grep -qiF "$entry"; then
      if ! git diff --cached --name-only 2>/dev/null | grep -qiF "$entry"; then
        DRIFT="${DRIFT}  ${entry}（声明修改但零实际变更）\n"
      fi
    fi
  fi
done <<< "$CLEANED"

# U2a/D415: 反向对账 — 实际变更的代码文件须已登记进写集（改了没登记 → 漂移, M2/M7）
# 豁免口径对齐 G12 skip_re（.claude/docs/memory/task-state/.codex/.github/scripts/workflow 豁免, 原则 7 文档豁免）
# ACTUAL 注入缝: SYNO_STAGED_FILES（测试免真实 git 暂存）; 否则 git diff --cached
REVERSE_DRIFT=$(CLEANED_ENTRIES="$CLEANED" python3 - "$REPO_DIR" <<'PYEOF'
import os, subprocess, sys, re
repo = sys.argv[1]
declared = set(l.strip().rstrip("\r").lower() for l in os.environ.get("CLEANED_ENTRIES","").split("\n") if l.strip())
inj = os.environ.get("SYNO_STAGED_FILES")
if inj is not None:
    out = inj
else:
    try:
        out = subprocess.run(["git","diff","--cached","--name-only","--diff-filter=ACMR"],capture_output=True,text=True,cwd=repo).stdout
    except Exception:
        out = ""
CODE = re.compile(r'\.(ts|tsx|js|jsx|py|sh|json)$')
SKIP = re.compile(r'^(\.claude/|docs/|memory/|task-state/|\.codex/|\.github/|scripts/workflow/)')
drift = []
for af in out.split("\n"):
    af = af.strip()
    if not af or not CODE.search(af) or SKIP.search(af):
        continue
    afl = af.lower()
    if afl in declared or any(d.endswith("/") and afl.startswith(d) for d in declared):
        continue
    drift.append("  " + af + "（实际变更但未登记进写集）")
print("\n".join(drift))
PYEOF
)
if [ -n "$REVERSE_DRIFT" ]; then
  DRIFT="${DRIFT}${REVERSE_DRIFT}\n"
fi

echo "  声明 $CHECKED 条 | 漂移 $(echo -e "$DRIFT" | grep -c '^  ' || echo 0) 条"
if [ -n "$DRIFT" ]; then
  echo -e "  ❌ 写集漂移:"
  echo -e "$DRIFT"
  if [ "$JSON_OUT" -eq 1 ]; then
    echo "{\"status\":\"block\",\"doc\":\"$DOC\",\"declared\":$CHECKED,\"drift\":$(echo -e "$DRIFT" | grep '^  ' | wc -l)}"
  fi
  exit 1
fi

echo "  ✅ 声明与实际一致"
if [ "$JSON_OUT" -eq 1 ]; then
  echo "{\"status\":\"pass\",\"doc\":\"$DOC\",\"declared\":$CHECKED,\"drift\":0}"
fi
exit 0
