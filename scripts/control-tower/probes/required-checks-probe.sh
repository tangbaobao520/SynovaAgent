#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# required-checks-probe.sh — D971 必需检查对账探针（三条对账机制之一）
#
# 目的: 把「必需检查结构性无法满足」从**事后 block** 变成**可对账的 DRIFT**——
#   逐日比对「branch protection 声明的 required contexts」vs「近 N 日**实际被报告过**的
#   check/job 名」。任一必需 context 未被实际报告（例如 job 因 `needs` 级联被 skip ⇒
#   GitHub 上报的是字面未展开的 `Vitest (${{ matrix.shard }})`）即报 DRIFT。
#
# 契约（铁律 47）:
#   @input  — 环境变量:
#               SYNO_REPO_SLUG        仓库 slug（默认 tangbaobao520/SynovaAgent）
#               SYNO_PROBE_BRANCH     被查分支（默认 main）
#               SYNO_PROBE_DAYS       观察窗口天数（默认 7）
#               SYNO_PROBE_MAX_RUNS   最多翻查多少个 run 的 jobs（默认 20；控 API 成本）
#               SYNO_CRED_FILE        凭据文件（默认 $HOME/.dsh/.credentials.yaml，取 `GITHUB_TOKEN:`）
#               SYNO_PROBE_FIXTURE_DIR 测试注入缝: 目录内 `required.json` + `jobs.txt`
#                                      ⇒ 走**离线夹具**路径（不发网络请求；用于密封测试）|
#   @output — stdout: 人读报告；末行 `REQUIRED-CHECKS: OK | DRIFT(n) | DEGRADED`
#   @exit   — 0 一致 / 1 DRIFT（必需 context 未被实际报告）/ 2 无法测量（无 token / 网络不可用 /
#             解析失败 / 夹具退化）—— 三态 fail-closed，**绝不把「测不了」当「通过」**
#   @degraded — exit 2 一律在 stderr 显式点名原因（铁律 11，不静默）
#   @security — **绝不打印 token**：token 仅经 stdin 传给子进程，不出现在 argv/env/日志
#   @wire   — 可独立复跑（不依赖 daily-cto-board.sh）；被 daily-cto-board 的通用 runner 自动发现
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# PYBIN 三级探测（D520/V5；禁裸 python3）
PYBIN="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || command -v py 2>/dev/null || true)"  # swallow-ok: 三级探测，全缺失时下方显式 degraded
if [ -z "$PYBIN" ]; then
  echo "degraded: 无可用 python（PYBIN 三级探测均失败）— 无法查询 GitHub API" >&2
  echo "REQUIRED-CHECKS: DEGRADED"
  exit 2
fi

REPO_SLUG="${SYNO_REPO_SLUG:-tangbaobao520/SynovaAgent}"
BRANCH="${SYNO_PROBE_BRANCH:-main}"
DAYS="${SYNO_PROBE_DAYS:-7}"
MAXRUNS="${SYNO_PROBE_MAX_RUNS:-20}"
CRED="${SYNO_CRED_FILE:-$HOME/.dsh/.credentials.yaml}"
FIX="${SYNO_PROBE_FIXTURE_DIR:-}"

TOKEN=""; REQ_F=""; JOBS_F=""
if [ -n "$FIX" ]; then
  # 离线夹具路径（测试注入缝）
  REQ_F="$FIX/required.json"; JOBS_F="$FIX/jobs.txt"
  if [ ! -f "$REQ_F" ]; then
    echo "degraded: 夹具缺 required.json（${REQ_F}）" >&2; echo "REQUIRED-CHECKS: DEGRADED"; exit 2
  fi
  if [ ! -f "$JOBS_F" ]; then
    echo "degraded: 夹具缺 jobs.txt（${JOBS_F}）" >&2; echo "REQUIRED-CHECKS: DEGRADED"; exit 2
  fi
else
  if [ ! -f "$CRED" ]; then
    echo "degraded: 凭据文件不存在（${CRED}）— 无法查询 branch protection" >&2
    echo "REQUIRED-CHECKS: DEGRADED"; exit 2
  fi
  # ^[[:space:]]*GITHUB_TOKEN: —— 凭据文件里该键为 2 空格缩进（同 pre-dispatch-check.sh:99 口径）
  TOKEN="$(grep -E '^[[:space:]]*GITHUB_TOKEN:' "$CRED" 2>/dev/null | head -1 | sed -E 's/^[[:space:]]*GITHUB_TOKEN:[[:space:]]*//; s/[[:space:]"'"'"']+$//' || true)"  # swallow-ok: 缺键在下一行显式 degraded（非静默）
  if [ -z "$TOKEN" ]; then
    echo "degraded: 凭据文件无 GITHUB_TOKEN 键（${CRED}）" >&2
    echo "REQUIRED-CHECKS: DEGRADED"; exit 2
  fi
fi

# token 传递方式（绝不打印、绝不进 argv）: 写入 0600 临时文件，子进程只拿到**文件路径**；
#   注意不能把 token 走 stdin —— `python3 -` 的脚本本身就来自 heredoc（同一 stdin），会互相吃掉。
TOKF=""; [ -n "$TOKEN" ] && { TOKF="$(mktemp)"; chmod 600 "$TOKF"; printf '%s' "$TOKEN" > "$TOKF"; }
trap '[ -n "$TOKF" ] && rm -f "$TOKF"' EXIT
set +e
OUT="$("$PYBIN" - "$REPO_SLUG" "$BRANCH" "$DAYS" "$MAXRUNS" "$REQ_F" "$JOBS_F" "$TOKF" <<'PYEOF'
import datetime, json, os, sys, urllib.request

slug, branch, days, maxruns, reqf, jobf, tokf = sys.argv[1:8]
tok = ""
if tokf:
    try:
        tok = open(tokf, encoding="utf-8").read().strip()
    except Exception:
        tok = ""
days = int(days); maxruns = int(maxruns)

def emit(missing, required, observed):
    print("必需 context 数: %d ｜ 近 %s 日实际报告过的 job 名数: %d" % (len(required), days, len(observed)))
    for c in required:
        print("  %s %s" % ("✅" if c not in missing else "❌", c))
    if missing:
        print("DRIFT: 必需 context 未被实际报告: " + ", ".join(missing))
        print("REQUIRED-CHECKS: DRIFT(%d)" % len(missing))
        sys.exit(1)
    print("REQUIRED-CHECKS: OK")
    sys.exit(0)

if reqf:
    try:
        bp = json.load(open(reqf, encoding="utf-8"))
    except Exception as e:
        print("degraded: required.json 解析失败: %s" % type(e).__name__, file=sys.stderr)
        print("REQUIRED-CHECKS: DEGRADED"); sys.exit(2)
    try:
        observed = {l.strip() for l in open(jobf, encoding="utf-8") if l.strip()}
    except Exception as e:
        print("degraded: jobs.txt 读取失败: %s" % type(e).__name__, file=sys.stderr)
        print("REQUIRED-CHECKS: DEGRADED"); sys.exit(2)
else:
    if not tok:
        print("degraded: 无 token（内部不变量被破坏）", file=sys.stderr)
        print("REQUIRED-CHECKS: DEGRADED"); sys.exit(2)
    def api(path):
        req = urllib.request.Request("https://api.github.com" + path, headers={
            "Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json",
            "User-Agent": "synova-required-checks-probe"})
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.load(r)
    try:
        bp = api("/repos/%s/branches/%s/protection" % (slug, branch))
    except Exception as e:
        print("degraded: branch protection 查询失败（网络/权限）: %s: %s"
              % (type(e).__name__, str(e)[:120]), file=sys.stderr)
        print("REQUIRED-CHECKS: DEGRADED"); sys.exit(2)
    observe = {c.get("context") for c in (bp.get("required_status_checks") or {}).get("checks") or [] if c.get("context")}
    observe |= set((bp.get("required_status_checks") or {}).get("contexts") or [])
    bp = {"required_status_checks": {"checks": [{"context": c} for c in sorted(observe)]}}
    since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        runs = api("/repos/%s/actions/runs?branch=%s&created=%%3E%%3D%s&per_page=%d" % (slug, branch, since, maxruns))
    except Exception as e:
        print("degraded: workflow runs 查询失败（网络）: %s: %s" % (type(e).__name__, str(e)[:120]), file=sys.stderr)
        print("REQUIRED-CHECKS: DEGRADED"); sys.exit(2)
    observed = set()
    for r0 in (runs.get("workflow_runs") or [])[:maxruns]:
        try:
            js = api("/repos/%s/actions/runs/%s/jobs" % (slug, r0.get("id")))
        except Exception:
            continue
        for j in js.get("jobs") or []:
            if j.get("name"):
                observed.add(j["name"])

required = sorted({c.get("context") for c in (bp.get("required_status_checks") or {}).get("checks") or [] if c.get("context")})
if not required:
    print("degraded: 必需 context 列表为空（无从对账）", file=sys.stderr)
    print("REQUIRED-CHECKS: DEGRADED"); sys.exit(2)
missing = [c for c in required if c not in observed]
emit(missing, required, observed)
PYEOF
)"; RC=$?
set -e 2>/dev/null || true
printf '%s\n' "$OUT"
exit $RC
