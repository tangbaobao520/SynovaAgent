#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# docs-registry-probe.sh — D973 文档登记对账探针（三条对账机制之一）
#
# 目的: 把「registry 声明」vs「实际文档」的差异变成**会自己报警的物理信号**。
#       背景: `scripts/doc-system/doc-registry-gate.sh` 只在提交路径上检查
#       「untracked 新增 ∪ staged 新增」，无暂存时恒输出「检查 0 个文档」⇒
#       存量未登记文档**永远不被任何机制看见**（本卡实测：面内 29 份未登记）。
#
# 契约（铁律 47）:
#   @input  — --registry <file>   台账（默认 <repo>/docs/authority/DOCS-REGISTRY.yaml）
#             --repo-root <dir>   被扫描仓库根（默认 CWD 的 git toplevel）
#             --prefixes <a,b,c>  覆盖判定面（默认见下；逗号分隔的前缀匹配）
#             --list              只打印未登记清单（脚本可消费）；**不改退出码语义**——
#                                 与不带 --list 同码（D973 退修，见下 @exit）
#   @output — stdout: 面内文档数 / 已登记数 / **未登记清单**（逐条点名）
#             --list 时 stdout 仅清单行（消费方读 stdout + rc）
#   @exit   — 0 = 未登记 0（一致）／1 = DRIFT（存在未登记文档 ⇒ 台账落后于现实）
#             ／2 = fail-closed（台账缺失 / git 不可用 / 面内零文档 / 无 Python）
#             **--list 与不带 --list 完全同码**（无例外分支）
#   @exit-exception — 仅 `--help` 退出 0（打印用法，不作「一致」声明）
#   @degraded — 无 Python → 显式 fail-closed exit 2（不静默当作通过）
#   @seam   — SYNO_DOCS_REGISTRY_EXCLUDE 覆盖排除正则（默认与登记门禁同款）
#   @independent — 不依赖 daily-cto-board.sh，可单独复跑
#
# 判定面 v1（D973 定义，D333 参考系见交付回执）:
#   1. docs/authority/                                  治理锚点核心（台账自述的权威层）
#   2. docs/synova/coordination/CTO-                    控制塔/CTO 产出面
#   3. docs/synova/coordination/号段水位.md             号段水位锚点（D974）
#   4. docs/synova/product-lines/evidence/              交付回执面（M5 强制落点）
#   —— 排除正则与门禁 EXCLUDE 同款（audit-reports / chronicle-drafts / archive 等）
#   —— **为什么不取全仓**: 全仓 tracked .md/.yaml 有 2188 份，全量登记既不现实也不承载治理语义；
#      本面是「台账能真正拥有」的最小有义面（第一性原理）。
# ═══════════════════════════════════════════════════════════════════════════════
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

set -uo pipefail

REGISTRY=""
ROOT=""
PREFIXES="docs/authority/,docs/synova/coordination/CTO-,docs/synova/coordination/号段水位.md,docs/synova/product-lines/evidence/"
LIST_ONLY=0
# 排除正则与 scripts/doc-system/doc-registry-gate.sh 的 EXCLUDE 同款（保持一致，不另立口径）
EXCLUDE="${SYNO_DOCS_REGISTRY_EXCLUDE:-^tmp/|\\.claude/|memory/|docs/plans/codex/implementation/|docs/synova/audit-reports/|docs/authority/chronicle-drafts/|docs/synova/DASHBOARD.*\\.md$|/archive/|/Archive/}"

while [ $# -gt 0 ]; do
  case "$1" in
    --registry)  REGISTRY="${2:-}"; shift 2 ;;
    --repo-root) ROOT="${2:-}"; shift 2 ;;
    --prefixes)  PREFIXES="${2:-}"; shift 2 ;;
    --list)      LIST_ONLY=1; shift ;;
    -h|--help)   sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "未知参数: ${1}" >&2; exit 2 ;;
  esac
done

# ── PYBIN 三级探测（禁裸 python3；探存在性 + 试运行可用性，D328/D513）──
PYBIN=""
for _c in python3 python py; do  # D520: 按 PLATFORM-CHECKLIST §1 探测（含试运行校验）
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then
    PYBIN="$_c"
    break
  fi
done
if [ -z "$PYBIN" ]; then
  echo "❌ fail-closed: PYBIN 三级探测（python3→python→py）全空或全部不可用——无法测量，不与『通过』混同"
  exit 2
fi

if [ -z "$ROOT" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"  # swallow-ok: 非 git 目录=降级路径，下面显式判定并 exit 2
fi
if [ -z "$ROOT" ] || [ ! -d "$ROOT" ]; then
  echo "❌ fail-closed: 无法确定仓库根（git rev-parse --show-toplevel 失败且未给 --repo-root）"
  exit 2
fi
if [ -z "$REGISTRY" ]; then
  REGISTRY="${ROOT}/docs/authority/DOCS-REGISTRY.yaml"
fi
if [ ! -f "$REGISTRY" ]; then
  echo "❌ fail-closed: 台账不存在: ${REGISTRY}"
  echo "   无法比对『registry 声明 vs 实际文档』⇒ 不与『通过』混同"
  exit 2
fi

SCAN="$("$PYBIN" - "$ROOT" "$REGISTRY" "$PREFIXES" "$EXCLUDE" <<'PYEOF'
import fnmatch, os, re, subprocess, sys

root, registry, prefixes_csv, exclude = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
prefixes = [p for p in prefixes_csv.split(",") if p]
exclude_re = re.compile(exclude)

try:
    with open(registry, "r", encoding="utf-8", errors="replace") as fh:
        reg_text = fh.read()
except OSError as exc:                                   # 探测型
    print("ERR=registry_unreadable")
    sys.exit(0)

# 台账声明面：**解析真实 path 值**，不用「整文本子串匹配」。
# 为什么不用子串: 子串匹配会把「注释/正文/别人条目里出现过该名字」误判为已登记
#   （D973 实证: `docs/synova/product-lines/evidence/README.md` 因 D:/ 遗留条目里的
#   `README.md` 子串被误判为已登记；同时把某条 path 改坏也检不出来 ⇒ 探针失效）。
# 声明语义三种: 精确路径 / 目录前缀（尾 `/`）/ 通配（含 `*`，按 basename 匹配，如 WORKLOG-*.md）
declared = [m.strip().strip('"').strip("'") for m in re.findall(r'^\s+path:\s*(.+?)\s*$', reg_text, re.M)]
dirs   = {d for d in declared if d.endswith("/")}
globs  = {d for d in declared if "*" in d}
exacts = {d for d in declared if not d.endswith("/") and "*" not in d}

def registered(rel):
    if rel in exacts:
        return True
    if any(rel.startswith(d) for d in dirs):
        return True
    base = rel.split("/")[-1]
    return any(fnmatch.fnmatch(base, g) for g in globs)

try:
    out = subprocess.run(["git", "-C", root, "ls-files", "-z"],
                         capture_output=True, timeout=180)
except Exception:                                        # 探测型
    print("ERR=git_unavailable")
    sys.exit(0)
if out.returncode != 0:
    print("ERR=git_unavailable")
    sys.exit(0)

files = [b.decode("utf-8", "surrogateescape") for b in out.stdout.split(b"\0") if b]
face, unreg = [], []
for rel in files:
    if exclude_re.search(rel) is not None:
        continue
    if not (rel.endswith(".md") or rel.endswith(".yaml")):
        continue
    if rel == "docs/authority/DOCS-REGISTRY.yaml":
        continue
    if not any(rel == p or rel.startswith(p) for p in prefixes):
        continue
    face.append(rel)
    if not registered(rel):
        unreg.append(rel)

print("FACE=%d" % len(face))
print("DECLARED=%d" % len(declared))
print("UNREG=%d" % len(unreg))
for rel in sorted(unreg):
    print("UNREG_FILE=%s" % rel)
PYEOF
)"

if [ -z "$SCAN" ]; then
  echo "❌ fail-closed: 扫描子进程无输出——无法测量，不与『通过』混同"
  exit 2
fi
case "$SCAN" in
  *ERR=governance*) : ;;
esac
if printf '%s\n' "$SCAN" | grep -q '^ERR='; then
  echo "❌ fail-closed: $(printf '%s\n' "$SCAN" | grep '^ERR=' | head -1)"
  exit 2
fi

FACE="$(printf '%s\n' "$SCAN" | sed -n 's/^FACE=//p' | head -1 | tr -d '\r')"
UNREG="$(printf '%s\n' "$SCAN" | sed -n 's/^UNREG=//p' | head -1 | tr -d '\r')"
UNREG_LIST="$(printf '%s\n' "$SCAN" | sed -n 's/^UNREG_FILE=//p' | tr -d '\r')"

case "${FACE}${UNREG}" in
  ''|*[!0-9]*) echo "❌ fail-closed: 计数非数字（FACE='${FACE}' UNREG='${UNREG}'）"; exit 2 ;;
esac
if [ "${FACE}" -eq 0 ]; then
  echo "❌ fail-closed: 判定面内零文档 —— 零面不可判定为『一致』（面=${PREFIXES}）"
  exit 2
fi

if [ "${LIST_ONLY}" -eq 1 ]; then
  # D973 退修（verifier 方案①）: --list 只改**输出形态**，不改**退出码语义** ——
  #   与不带 --list 完全同码（0 一致 / 1 DRIFT / 2 fail-closed）。
  #   原实现无条件 exit 0 ⇒ 有未登记时消费方看 rc 会误判为「一致」（契约头 :9-11 无 --list 例外）。
  printf '%s\n' "$UNREG_LIST"
  if [ "${UNREG}" -gt 0 ]; then
    exit 1
  fi
  exit 0
fi

echo "── 文档登记对账（docs-registry-probe / 判定面 v1）──"
echo "  台账: ${REGISTRY}"
echo "  判定面: ${PREFIXES}"
echo "  面内文档数 = ${FACE}"
echo "  已登记数   = $((FACE - UNREG))"
echo "  未登记数   = ${UNREG}"

if [ "${UNREG}" -gt 0 ]; then
  echo "DRIFT: 以下 ${UNREG} 份文档在判定面内但未登记进台账："
  printf '%s\n' "$UNREG_LIST" | sed 's/^/    ❌ /'
  echo "  处置: 追加进 ${REGISTRY}（schema: id/type/path/status/owner；id 续编现有最大号）"
  exit 1
fi

echo "✅ 登记一致（判定面内 ${FACE} 份文档全部已登记）"
exit 0
