#!/bin/bash
# first-diagnosis-timing.sh — D527「从安装到可诊断 ≤30 分钟」物理计时脚本（验证点 1-6）
#
# 契约（铁律 47，SYNOVA-IMPL-DSH-D527 spec §5.1）:
#   @input  [--mode dev|prod]（默认 dev；prod 需 --installer <dmg/exe 路径>）
#           [--installer <安装包路径>]（prod 模式必填，缺失 exit 2）
#           [--server-url <url>]（默认 http://127.0.0.1:18790；dev 模式目标服务）
#           [--out <evidence JSON 路径>]（默认 scripts/golden-scenarios/evidence/first-diagnosis-timing-<date>.json）
#           [--dry-run]（只打印里程碑计划与配置，不做任何测量/安装/网络请求，exit 0）
#   @output exit 0 = 里程碑全部走完，计时 JSON 落盘（total_sec + 各里程碑 epoch ms + verdict）
#           exit 1 = 任一里程碑探测失败（JSON 落盘失败步，不静默——铁律 24）
#           exit 2 = 前置缺失（prod 缺 --installer / 缺 hdiutil 等，degraded 显式提示）
#   @degraded 每个失败步 echo "[timing] 失败里程碑: <name>: <原因>" + JSON failures[] 记录
#   @幂等   重复运行覆盖同名 evidence JSON；--dry-run 零副作用
#   @注     30 分钟是**目标值非硬断言**——超时如实记录 verdict=OVER_TARGET（P2-2 时间戳落盘，不伪造）
#           install_start 的物理起点: prod=安装命令发起时刻；dev=跳过安装段（只测启动→可诊断）
set -uo pipefail   # 不用 -e: 失败走显式里程碑路径收集 evidence，不许静默早退

SCRIPT_NAME="first-diagnosis-timing"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/scripts/golden-scenarios/evidence"
MODE="dev"
INSTALLER=""
SERVER_URL="http://127.0.0.1:18790"
DRY_RUN=0
TARGET_SEC=1800

log() { echo "[$SCRIPT_NAME] $1"; }
fail_step() { echo "[$SCRIPT_NAME] 失败里程碑: $1: ${2:-}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --installer) INSTALLER="${2:-}"; shift 2 ;;
    --server-url) SERVER_URL="${2:-}"; shift 2 ;;
    --out) OUT_PATH="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) grep '^#' "$0" | head -20; exit 0 ;;
    *) echo "[$SCRIPT_NAME] 未知参数: $1"; exit 2 ;;
  esac
done

OUT_PATH="${OUT_PATH:-$EVIDENCE_DIR/first-diagnosis-timing-$(date +%Y-%m-%d).json}"

if [ "$MODE" != "dev" ] && [ "$MODE" != "prod" ]; then
  echo "[$SCRIPT_NAME] --mode 必须 dev|prod（当前: $MODE）"; exit 2
fi

# dry-run 先行（零副作用、零前置依赖——只打印计划；exit 0 保证幂等自检可跑）
if [ "$DRY_RUN" -eq 1 ]; then
  log "dry-run: mode=$MODE installer=${INSTALLER:-<无>} server=$SERVER_URL target=${TARGET_SEC}s"
  log "里程碑序列: install_start → install_done → app_launch → healthz_200 → first_diagnosis_ready"
  log "evidence 输出: $OUT_PATH"
  log "dry-run 不做任何测量/安装/网络请求（零副作用）"
  exit 0
fi

# 前置检查（缺 → exit 2，degraded 不静默）
if [ "$MODE" = "prod" ]; then
  if [ -z "$INSTALLER" ]; then
    echo "[$SCRIPT_NAME] prod 模式必须 --installer <dmg/exe 路径>（缺安装包无法测安装段计时）"; exit 2
  fi
  if [ ! -f "$INSTALLER" ]; then
    echo "[$SCRIPT_NAME] 安装包不存在: $INSTALLER"; exit 2
  fi
  if [ "$DRY_RUN" -eq 0 ] && ! command -v hdiutil >/dev/null 2>&1 && [[ "$INSTALLER" == *.dmg ]]; then
    echo "[$SCRIPT_NAME] 缺 hdiutil（mac dmg 挂载依赖）"; exit 2
  fi
fi

mkdir -p "$EVIDENCE_DIR"

# macOS BSD date 不支持 %3N（输出字面 N 且 exit 0，GNU 语法）——python3 优先跨平台（D536 实测暴露，2026-08-27）
now_ms() { python3 -c 'import time;print(int(time.time()*1000))' 2>/dev/null || date +%s%3N 2>/dev/null; }

# ── 里程碑计时 ──
M_INSTALL_START="null"; M_INSTALL_DONE="null"; M_APP_LAUNCH="null"; M_HEALTHZ="null"; M_READY="null"
FAILURES=""

# ① install_start / install_done（prod: 挂载+cp 安装；dev: 跳过，记 null 并注明）
if [ "$MODE" = "prod" ]; then
  M_INSTALL_START="$(now_ms)"
  TMP_MOUNT="$(mktemp -d)/mount"
  mkdir -p "$TMP_MOUNT"
  APP_NAME="SynovaAgent"
  if hdiutil attach "$INSTALLER" -nobrowse -readonly -mountpoint "$TMP_MOUNT" >/dev/null 2>&1 \
     && [ -d "$TMP_MOUNT/$APP_NAME.app" ]; then
    rm -rf "/tmp/$SCRIPT_NAME-$APP_NAME.app"
    if cp -R "$TMP_MOUNT/$APP_NAME.app" "/tmp/$SCRIPT_NAME-$APP_NAME.app" >/dev/null 2>&1; then
      M_INSTALL_DONE="$(now_ms)"
      log "① install_done（安装到 /tmp/$SCRIPT_NAME-$APP_NAME.app，不污染 /Applications）"
    else
      FAILURES="install_done: cp 安装失败"; fail_step "install_done" "cp 失败"
    fi
    hdiutil detach "$TMP_MOUNT" >/dev/null 2>&1 || true
  else
    FAILURES="install_done: dmg 挂载失败或卷内无 $APP_NAME.app"; fail_step "install_done" "挂载失败"
    hdiutil detach "$TMP_MOUNT" >/dev/null 2>&1 || true
  fi
else
  log "① dev 模式跳过安装段（install_start/install_done = null）"
fi

# ② app_launch（prod: open .app；dev: 记脚本自身时刻——dev 路径的启动由开发者自行起 npm run dev）
#    环境坑: DSH 宿主默认 ELECTRON_RUN_AS_NODE=1，open Electron 前显式 unset（K3 切片 A 环境注记）
if [ "$MODE" = "prod" ] && [ -n "$FAILURES" ] ; then
  FAILURES="$FAILURES; app_launch: 跳过（安装段失败）"; fail_step "app_launch" "安装段失败级联"
elif [ "$MODE" = "prod" ]; then
  if env -u ELECTRON_RUN_AS_NODE open "/tmp/$SCRIPT_NAME-$APP_NAME.app" >/dev/null 2>&1; then
    M_APP_LAUNCH="$(now_ms)"; log "② app_launch（open .app）"
  else
    FAILURES="app_launch: open 失败"; fail_step "app_launch" "open 失败"
  fi
else
  M_APP_LAUNCH="$(now_ms)"; log "② app_launch 记为计时起点（dev: 服务由外部启动，等待 healthz）"
fi

# ③ healthz_200: GET /api/healthz → 200（服务自启就绪，最长等 300s）
probe_healthz() {
  local code
  for _ in $(seq 1 150); do
    code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 2 "$SERVER_URL/api/healthz" 2>/dev/null)" || code=000
    [ "$code" = "200" ] && return 0
    sleep 2
  done
  return 1
}
if probe_healthz; then
  M_HEALTHZ="$(now_ms)"; log "③ healthz_200（$SERVER_URL/api/healthz → 200）"
else
  FAILURES="${FAILURES:+$FAILURES; }healthz_200: 300s 内未就绪"; fail_step "healthz_200" "GET /api/healthz 非 200"
fi

# ④ first_diagnosis_ready: consult 入口可提交（无 JWT 401 / 缺 teamId 400 均证明入口活着且校验在工作）
READY_CODE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 \
  -X POST "$SERVER_URL/api/diagnosis/consult" \
  -H 'Content-Type: application/json' -d '{"initiator":{"role":"ga"}}' 2>/dev/null)" || READY_CODE=000
if [ "$READY_CODE" = "400" ] || [ "$READY_CODE" = "401" ]; then
  M_READY="$(now_ms)"; log "④ first_diagnosis_ready（consult 入口 HTTP $READY_CODE = 可提交）"
else
  FAILURES="${FAILURES:+$FAILURES; }first_diagnosis_ready: consult 入口 HTTP $READY_CODE（预期 400/401）"
  fail_step "first_diagnosis_ready" "HTTP $READY_CODE"
fi

# ── 汇总 + evidence 落盘 ──
START_REF="$M_INSTALL_START"; [ "$START_REF" = "null" ] && START_REF="$M_APP_LAUNCH"
TOTAL="null"
if [ "$START_REF" != "null" ] && [ "$M_READY" != "null" ]; then
  TOTAL=$(( M_READY - START_REF ))
fi
if [ "$TOTAL" = "null" ]; then
  VERDICT="INCOMPLETE"
# D536 实测暴露（2026-08-27）: TOTAL 是毫秒、TARGET_SEC 是秒——单位不一致导致 1.9s 误判 OVER_TARGET
elif [ "$TOTAL" -le $((TARGET_SEC * 1000)) ]; then VERDICT="WITHIN_TARGET"; else VERDICT="OVER_TARGET"; fi
[ -n "$FAILURES" ] && VERDICT="FAILED"

python3 - "$OUT_PATH" "$MODE" "$M_INSTALL_START" "$M_INSTALL_DONE" "$M_APP_LAUNCH" "$M_HEALTHZ" "$M_READY" "$TOTAL" "$VERDICT" "$TARGET_SEC" "$FAILURES" <<'PYEOF'
import json, sys, datetime
(out, mode, i0, i1, al, hz, rd, total, verdict, target, failures) = sys.argv[1:12]
def n(v):
    return int(v) if v.isdigit() else None
doc = {
    "schema": 1,
    "record_type": "first-diagnosis-timing",
    "task": "D527",
    "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
    "mode": mode,
    "milestones_ms": {
        "install_start": n(i0), "install_done": n(i1), "app_launch": n(al),
        "healthz_200": n(hz), "first_diagnosis_ready": n(rd),
    },
    "total_sec": round(int(total) / 1000, 1) if total.isdigit() else None,
    "target_sec": int(target),
    "verdict": verdict,            # WITHIN_TARGET / OVER_TARGET / INCOMPLETE / FAILED
    "failures": [f.strip() for f in failures.split(";") if f.strip()],
    "note": "30 分钟为目标值非硬断言——超时如实记录（P2-2）；dev 模式 install 段为 null",
}
json.dump(doc, open(out, "w"), ensure_ascii=False, indent=2)
print(f"[first-diagnosis-timing] evidence → {out}")
PYEOF

if [ "$VERDICT" = "FAILED" ]; then exit 1; fi
exit 0
