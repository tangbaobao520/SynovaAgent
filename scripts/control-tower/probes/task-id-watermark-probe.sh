#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# task-id-watermark-probe.sh — D1013 号段水位对账探针（三条对账机制之一）
#
# 目的: 把「已分配 D# 水位」从**手工维护**改为**实测反查**，并让「水位落后于现实」
#       变成一条会自己报警的物理信号（防 D382/D1004 型撞号）。
#
# 契约（铁律 47）:
#   @input  — --watermark <file>  水位文件（默认 <repo>/docs/synova/coordination/号段水位.md）
#             --repo-root <dir>   被扫描的仓库根（默认 CWD 的 git toplevel）
#             --face <union|refs> 判定面（默认 union = 面A refs ∪ 当前工作树 task-state/）
#             --emit              生成模式: 用实测结果重写水位文件（默认只校验不写盘）
#             --with-pr           额外把 GitHub PR 标题并入实测（需 GITHUB_TOKEN；默认关，
#                                 保证离线确定性 —— 见下方 @degraded）
#   @output — stdout: 人读报告，含「共 N 个 ref 被扫描」/ 各实测面最大号 / 声明水位 / 余量
#   @exit   — 0 = 一致（实测 ≤ 声明 且 余量在窗口内）
#             1 = DRIFT（实测 > 声明 ⇒ 存在未登记的更高号 = 撞号风险；
#                       或 声明 − 实测 > 保留窗口 ⇒ 水位虚高，防手改绕过）
#             2 = fail-closed: 无法测量（水位文件缺失 / 无机器可读声明行 / 扫描面零号 /
#                               git 不可用 / 无 Python）—— 绝不与「通过」混同
#   @degraded — PR 源不可用（无 token / 无网络 / 无 curl）→ stdout 显式 DEGRADED 行，
#               不改变退出码（面A + 本地已足以判定），绝不静默跳过
#   @seam   — SYNO_WATERMARK_HEADROOM  保留窗口上限（默认 64）
#             SYNO_WATERMARK_PR_PAGES  PR 分页上限（默认 5）
#   @independent — 不依赖 daily-cto-board.sh，可单独复跑
#   @note   — 扫描面口径（可复现）:
#             面 A = refs/heads ∪ refs/remotes/origin ∪ refs/remotes/ssh（按 SHA 去重）
#             面 B = refs/remotes/origin（GitHub 已推）
#             面 C = 当前工作树 task-state/
#             测量法 = git cat-file --batch 单进程批读（O(n) 次对象读），
#                      不用「每 ref 一个子进程」的 O(n) fork 路径。
# ═══════════════════════════════════════════════════════════════════════════════
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

set -uo pipefail

WATERMARK=""
ROOT=""
FACE="union"
EMIT=0
WITH_PR=0
HEADROOM="${SYNO_WATERMARK_HEADROOM:-64}"
PR_PAGES="${SYNO_WATERMARK_PR_PAGES:-5}"

while [ $# -gt 0 ]; do
  case "$1" in
    --watermark) WATERMARK="${2:-}"; shift 2 ;;
    --repo-root) ROOT="${2:-}"; shift 2 ;;
    --face)      FACE="${2:-}"; shift 2 ;;
    --emit)      EMIT=1; shift ;;
    --with-pr)   WITH_PR=1; shift ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0 ;;
    *)
      echo "未知参数: ${1}" >&2
      exit 2 ;;
  esac
done

case "$FACE" in
  union|refs) ;;
  *) echo "❌ --face 只接受 union|refs（收到 ${FACE}）" >&2; exit 2 ;;
esac

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

# ── 仓库根 ──
if [ -z "$ROOT" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"  # swallow-ok: 非 git 目录=降级路径，下面显式判定并 exit 2
fi
if [ -z "$ROOT" ] || [ ! -d "$ROOT" ]; then
  echo "❌ fail-closed: 无法确定仓库根（git rev-parse --show-toplevel 失败且未给 --repo-root）"
  exit 2
fi
if [ -z "$WATERMARK" ]; then
  WATERMARK="${ROOT}/docs/synova/coordination/号段水位.md"
fi

# ── 实测（单进程批读）──
MEASURE="$("$PYBIN" - "$ROOT" "$FACE" "$WITH_PR" "$PR_PAGES" <<'PYEOF'
import json, os, re, subprocess, sys, urllib.request

root, face, with_pr, pr_pages = sys.argv[1], sys.argv[2], sys.argv[3] == "1", int(sys.argv[4])
ID_RE = re.compile(r"^D(\d+)\.json$")
out = {}

def run_git(*args, text=True):
    try:
        r = subprocess.run(["git", "-C", root] + list(args), capture_output=True, timeout=120)
    except Exception as exc:                                     # 探测型
        print("ERR_GIT=%s" % exc)
        return None
    if r.returncode != 0:
        return None
    return r.stdout.decode("utf-8", "replace") if text else r.stdout

def batch_objects(shas):
    """一次 cat-file --batch 读入任意多对象（O(1) 进程，O(n) 对象）。"""
    if not shas:
        return {}
    try:
        p = subprocess.run(["git", "-C", root, "cat-file", "--batch"],
                           input=("\n".join(shas) + "\n").encode(),
                           capture_output=True, timeout=300)
    except Exception:                                            # 探测型
        return {}
    if p.returncode != 0:
        return {}
    raw, res, pos = p.stdout, {}, 0
    while pos < len(raw):
        nl = raw.find(b"\n", pos)
        if nl < 0:
            break
        parts = raw[pos:nl].split()
        if len(parts) < 3:
            break
        try:
            size = int(parts[2])
        except ValueError:
            break
        sha, typ = parts[0].decode(), parts[1].decode()
        res[sha] = (typ, raw[nl + 1:nl + 1 + size])
        pos = nl + 1 + size + 1
    return res

def tree_entries(body):
    ents, i = [], 0
    while i < len(body):
        sp = body.find(b" ", i)
        if sp < 0:
            break
        nul = body.find(b"\x00", sp)
        if nul < 0 or len(body) < nul + 21:
            break
        ents.append((body[sp + 1:nul].decode("utf-8", "surrogateescape"), body[nul + 1:nul + 21].hex()))
        i = nul + 21
    return ents

def max_from_tips(tips):
    """各 tip 的根树 → 找 task-state 子树 → 收集 D<n>.json 名，返回 (max, 计数)。"""
    if not tips:
        return 0, 0, 0, 0
    commits = batch_objects(tips)
    root_trees = set()
    for sha, (typ, body) in commits.items():
        if typ != "commit":
            continue
        first = body.split(b"\n", 1)[0]
        if first.startswith(b"tree ") and len(first) >= 45:
            root_trees.add(first[5:45].decode())
    ts_trees = set()
    for sha, (typ, body) in batch_objects(sorted(root_trees)).items():
        if typ != "tree":
            continue
        for name, esha in tree_entries(body):
            if name == "task-state":
                ts_trees.add(esha)
    mx, cnt = 0, 0
    for sha, (typ, body) in batch_objects(sorted(ts_trees)).items():
        if typ != "tree":
            continue
        for name, _esha in tree_entries(body):
            m = ID_RE.match(name)
            if m:
                cnt += 1
                mx = max(mx, int(m.group(1)))
    return mx, len(root_trees), len(ts_trees), cnt

def max_from_dir(d):
    mx, cnt = 0, 0
    try:
        names = os.listdir(d)
    except OSError:
        return 0, 0
    for name in names:
        m = ID_RE.match(name)
        if m:
            cnt += 1
            mx = max(mx, int(m.group(1)))
    return mx, cnt

# ── 面 A: 全 refs ──
allrefs = run_git("for-each-ref", "--format=%(objectname)", "refs/heads",
                  "refs/remotes/origin", "refs/remotes/ssh")
refs_listed = run_git("for-each-ref", "--format=%(refname)", "refs/heads",
                      "refs/remotes/origin", "refs/remotes/ssh")
refs_scanned = len(refs_listed.split()) if refs_listed else 0
tips = sorted(set(allrefs.split())) if allrefs else []
fa_max, fa_root, fa_trees, fa_entries = max_from_tips(tips)

# ── 面 B: 仅 origin ──
origin_refs = run_git("for-each-ref", "--format=%(objectname)", "refs/remotes/origin")
origin_tips = sorted(set(origin_refs.split())) if origin_refs else []
fb_max, _, _, _ = max_from_tips(origin_tips)

# ── 面 C: 当前工作树 ──
fc_max, fc_files = max_from_dir(os.path.join(root, "task-state"))

# ── 可选的 PR 标题面 ──
pr_state = "off"
pr_max, pr_count = 0, 0
if with_pr:
    tok = os.environ.get("GITHUB_TOKEN", "")
    if not tok:
        cred = os.path.join(os.path.expanduser("~"), ".dsh", ".credentials.yaml")
        try:
            with open(cred, "r", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    if re.match(r"^\s*GITHUB_TOKEN:", line):
                        tok = line.split(":", 1)[1].strip()
                        break
        except OSError:
            tok = ""
    if not tok:
        pr_state = "no_token"
    else:
        repo_slug = os.environ.get("SYNO_WATERMARK_REPO", "tangbaobao520/SynovaAgent")
        try:
            for page in range(1, pr_pages + 1):
                url = ("https://api.github.com/repos/%s/pulls?state=all&per_page=100&page=%d"
                       % (repo_slug, page))
                req = urllib.request.Request(url, headers={
                    "Authorization": "token " + tok,
                    "Accept": "application/vnd.github+json"})
                data = json.load(urllib.request.urlopen(req, timeout=30))
                if not data:
                    break
                for pr in data:
                    pr_count += 1
                    for m in re.finditer(r"\bD(\d{3,4})\b", pr.get("title") or ""):
                        pr_max = max(pr_max, int(m.group(1)))
            pr_state = "ok"
        except Exception:                                        # 探测型
            pr_state = "unreachable"

measured_a = max(fa_max, fb_max)
measured = measured_a
if face == "union":
    measured = max(measured, fc_max)

print("REFS_SCANNED=%d" % refs_scanned)
print("TIPS=%d" % len(tips))
print("FACE_A_MAX=%d" % fa_max)
print("FACE_A_ROOT_TREES=%d" % fa_root)
print("FACE_A_TS_TREES=%d" % fa_trees)
print("FACE_A_ENTRIES=%d" % fa_entries)
print("FACE_B_MAX=%d" % fb_max)
print("FACE_C_MAX=%d" % fc_max)
print("FACE_C_FILES=%d" % fc_files)
print("PR_STATE=%s" % pr_state)
print("PR_COUNT=%d" % pr_count)
print("PR_MAX=%d" % pr_max)
print("MEASURED=%d" % measured)
PYEOF
)"

if [ -z "$MEASURE" ]; then
  echo "❌ fail-closed: 实测子进程无输出——无法测量，不与『通过』混同"
  exit 2
fi
if printf '%s\n' "$MEASURE" | grep -q '^ERR_GIT='; then
  echo "❌ fail-closed: git 调用失败（可能不是 git 仓库或 git 不可用）"
  printf '%s\n' "$MEASURE" | grep '^ERR_GIT='
  exit 2
fi

getnum() { printf '%s\n' "$MEASURE" | sed -n "s/^$1=//p" | head -1 | tr -d '\r'; }  # tr: PLATFORM-CHECKLIST §2 CRLF 清洗

REFS_SCANNED="$(getnum REFS_SCANNED)"
TIPS="$(getnum TIPS)"
FACE_A_MAX="$(getnum FACE_A_MAX)"
FACE_A_ROOT_TREES="$(getnum FACE_A_ROOT_TREES)"
FACE_A_TS_TREES="$(getnum FACE_A_TS_TREES)"
FACE_A_ENTRIES="$(getnum FACE_A_ENTRIES)"
FACE_B_MAX="$(getnum FACE_B_MAX)"
FACE_C_MAX="$(getnum FACE_C_MAX)"
FACE_C_FILES="$(getnum FACE_C_FILES)"
PR_STATE="$(getnum PR_STATE)"
PR_COUNT="$(getnum PR_COUNT)"
PR_MAX="$(getnum PR_MAX)"
MEASURED="$(getnum MEASURED)"

case "${MEASURED}" in
  ''|*[!0-9]*)
    echo "❌ fail-closed: 实测最大号非数字（收到 '${MEASURED}'）"
    exit 2 ;;
esac
if [ "${MEASURED}" -eq 0 ]; then
  echo "❌ fail-closed: 扫描面（${FACE}）内没有任何 task-state/D<n>.json —— 零号不可判定为『一致』"
  echo "   面A=${FACE_A_MAX} 面B=${FACE_B_MAX} 面C=${FACE_C_MAX}（worktree=${ROOT}）"
  exit 2
fi

STAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

report_faces() {
  echo "── 实测扫描面（口径可复现）──"
  echo "  refs 扫描数=${REFS_SCANNED}（refs/heads + refs/remotes/origin + refs/remotes/ssh，按 SHA 去重后 unique tips=${TIPS}）"
  echo "  面 A（全 refs task-state/）= D${FACE_A_MAX}   根树=${FACE_A_ROOT_TREES} task-state 树=${FACE_A_TS_TREES} 条目=${FACE_A_ENTRIES}"
  echo "  面 B（仅 origin 已推）      = D${FACE_B_MAX}"
  echo "  面 C（当前工作树 task-state/）= D${FACE_C_MAX}   文件数=${FACE_C_FILES}"
  if [ "${PR_STATE}" = "ok" ]; then
    echo "  PR 标题面                  = D${PR_MAX}   PR 数=${PR_COUNT}"
  else
    echo "  DEGRADED: PR 标题面未纳入实测（PR_STATE=${PR_STATE}：off=未启用 / no_token=无 GITHUB_TOKEN / unreachable=网络或 API 不可达）——不影响判定，但本方未覆盖 PR 面"
  fi
  echo "  判定面=${FACE} ⇒ 实测最大号 = D${MEASURED}"
}

# ═══ --emit: 由实测重写水位文件（生成段覆盖，MANUAL 段保留）═══
if [ "${EMIT}" -eq 1 ]; then
  MANUAL=""
  if [ -f "$WATERMARK" ]; then
    MANUAL="$(awk '/<!-- MANUAL:BEGIN -->/{f=1} f{print} /<!-- MANUAL:END -->/{if(f){exit}}' "$WATERMARK")"
  fi
  if [ -z "$MANUAL" ]; then
    MANUAL='<!-- MANUAL:BEGIN -->
（人工维护段：号段约定 / 保留号段 / 下一号声明。本段不被 --emit 覆盖。）
<!-- MANUAL:END -->'
  fi
  TMPF="${WATERMARK}.tmp.$$"
  {
    echo "# 号段水位"
    echo ""
    echo "> ⚠️ 本文件由**实测反查生成**——下方「生成段」（本行到 MANUAL:BEGIN 之前）"
    echo ">   每次 \`--emit\` 都会被覆盖，**手工编辑无效**。人写内容只应放在 MANUAL 段内。"
    echo ">"
    echo "> 生成命令: \`bash scripts/control-tower/probes/task-id-watermark-probe.sh --emit\`"
    echo "> 生成时间(UTC): ${STAMP}"
    echo "> 判定面: \`--face ${FACE}\`（面 A 全 refs ∪ 面 C 当前工作树 task-state/）"
    echo "> 探针校验命令: \`bash scripts/control-tower/probes/task-id-watermark-probe.sh\`"
    echo ""
    echo "## 1. 机器判定位（探针校验此值，勿手改）"
    echo ""
    echo "声明水位: D${MEASURED}"
    echo ""
    echo "- 含义: 本次实测范围内**已分配的最大 D#**；下一个可用号 = D$((MEASURED + 1))。"
    echo "- DRIFT 判据①: 实测 > 声明 ⇒ 存在未登记的更高号（撞号风险）→ exit 1"
    echo "- DRIFT 判据②: 声明 − 实测 > 保留窗口（默认 ${HEADROOM}）⇒ 水位虚高，防手改绕过 → exit 1"
    echo ""
    echo "## 2. 实测来源分解"
    echo ""
    echo "| 面 | 口径 | 扫描量 | 最大号 |"
    echo "|---|---|---|---|"
    echo "| A 全 refs | refs/heads + refs/remotes/origin + refs/remotes/ssh（按 SHA 去重） | ${REFS_SCANNED} refs / ${TIPS} unique tips / ${FACE_A_TS_TREES} task-state 树 / ${FACE_A_ENTRIES} 条目 | D${FACE_A_MAX} |"
    echo "| B 已推 origin | refs/remotes/origin | — | D${FACE_B_MAX} |"
    echo "| C 当前工作树 | \`task-state/\` | ${FACE_C_FILES} 文件 | D${FACE_C_MAX} |"
    if [ "${PR_STATE}" = "ok" ]; then
      echo "| PR 标题 | GitHub API \`pulls?state=all\` | ${PR_COUNT} PR | D${PR_MAX} |"
    else
      echo "| PR 标题 | 本次未纳入（PR_STATE=${PR_STATE}，显式降级非静默） | 0 | — |"
    fi
    echo "| **判定** | **面 ${FACE} 上确界** | — | **D${MEASURED}** |"
    echo ""
    echo "## 3. 判定面口径说明"
    echo ""
    echo "- 面 A 是**保守超集**：含本地未推分支 refs，宁可把水位抬高也不漏号。"
    echo "- 面 C 纳入判定：本批占号在未推前只存在于工作树 \`task-state/\`，只扫 refs 会漏掉"
    echo "  正在途中的占号（D1013 卡就是这个场景）。"
    echo "- 面 B 与 PR 面仅作对照，不作判定面（面 B 会漏本地未推号）。"
    echo ""
    echo "${MANUAL}"
  } > "$TMPF" && mv "$TMPF" "$WATERMARK"
  RC=$?
  if [ "${RC}" -ne 0 ] || [ ! -f "$WATERMARK" ]; then
    echo "❌ --emit 写盘失败: ${WATERMARK}"
    exit 2
  fi
  echo "✅ 已由实测重写水位文件（生成段 D${MEASURED}，MANUAL 段保留）"
  report_faces
  echo "   文件: ${WATERMARK}"
  exit 0
fi

# ═══ 校验模式 ═══
if [ ! -f "$WATERMARK" ]; then
  echo "❌ fail-closed: 水位文件不存在: ${WATERMARK}"
  echo "   无法比对『声明水位 vs 实测最大号』⇒ 不与『通过』混同（先跑 --emit 生成）"
  exit 2
fi

DECLARED_RAW="$(grep -E '^声明水位: D[0-9]+$' "$WATERMARK" | head -1)"
if [ -z "$DECLARED_RAW" ]; then
  echo "❌ fail-closed: 水位文件无机器可读声明行（需形如 \`声明水位: D1234\`）: ${WATERMARK}"
  exit 2
fi
DECLARED="$(printf '%s' "$DECLARED_RAW" | sed -E 's/^声明水位: D([0-9]+)$/\1/')"
case "${DECLARED}" in
  ''|*[!0-9]*)
    echo "❌ fail-closed: 声明水位解析失败: '${DECLARED_RAW}'"
    exit 2 ;;
esac

HEADROOM_N="${HEADROOM}"
case "${HEADROOM_N}" in
  ''|*[!0-9]*) HEADROOM_N=64 ;;
esac

echo "── 号段水位对账（task-id-watermark-probe）──"
echo "  水位文件: ${WATERMARK}"
echo "  声明水位: D${DECLARED}"
report_faces
echo "  余量（声明 − 实测）= $((DECLARED - MEASURED))，保留窗口上限 = ${HEADROOM_N}"

if [ "${MEASURED}" -gt "${DECLARED}" ]; then
  echo "DRIFT: 实测最大号 D${MEASURED} > 声明水位 D${DECLARED}"
  echo "       存在未被水位文件登记的更高占用号 ⇒ 有撞号风险。"
  echo "       处置: 核实该号归属后跑 --emit 刷新水位（并核对号段约定）。"
  exit 1
fi

GAP=$((DECLARED - MEASURED))
if [ "${GAP}" -gt "${HEADROOM_N}" ]; then
  echo "DRIFT: 声明水位 D${DECLARED} 比实测 D${MEASURED} 高出 ${GAP}，超过保留窗口 ${HEADROOM_N}"
  echo "       水位虚高会让『实测 > 声明』永不成立 ⇒ 探针失效。处置: 跑 --emit 重新生成。"
  exit 1
fi

echo "✅ 水位一致（实测 D${MEASURED} ≤ 声明 D${DECLARED}，余量 ${GAP} ≤ ${HEADROOM_N}）"
exit 0
