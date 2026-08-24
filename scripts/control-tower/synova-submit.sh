#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# synova-submit.sh — D521/目标1: 统一提交入口（编排而非新门禁）
#
# 把现在分散的 "--check + pre-commit + pre-push 对账 + tag 校验 + 模拟" 收敛成一条命令。
# 每个阶段调用现有 check 脚本，只是顺序和时机正确了（D520 复盘「如果重来一遍」的操作化）。
#
# 用法:
#   bash scripts/control-tower/synova-submit.sh --task-id D# --agent X --message "..." [--files ...]
#   --dry-run   只跑 ①-④（tag/bypass 检查 + dry-run + CI 模拟），不 commit 不 push
#   --no-push   commit 后不 push（留本地）
#
# 内部依次:
#   ① tag 时机检查（孤儿 tag 黄色警告——非 origin/main 祖先的本地 tag 提前点名）
#   ② bypass 竞态确认（hook 层登记可用性——D521-2 已根治，此步验证+提示）
#   ③ 全部门禁 dry-run（synova-commit --check 语义，一次报全）
#   ④ CI 等价模拟（simulate-ci.sh——本地能抓的错不送 CI）
#   ⑤ git commit（经 synova-commit SYNO_SUBMIT_MODE=1——不 auto-tag 不 auto-push，§6）
#   ⑥ push + 失败诊断（CI 失败用 ::error 注解通道读——CI-诊断通道.md）
#
# 契约 (铁律 47):
#   @input  — --task-id/--agent/--message 必填；--files 可选
#   @output — 六步报告；任一步失败 → 显式停止 + 修复指引
#   @exit   — 0=提交并推送完成（或 --dry-run 全过）/ 1=业务失败 / 2=执行降级（D328）
#   @degraded — origin/main 不可解析 → ①段降级提示（不静默）
# 测试注入: SYNO_SUBMIT_CHECK_CMD / SYNO_SUBMIT_SIM_CMD 覆盖 ③④ 命令（沙箱用）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TASK_ID=""; AGENT=""; MESSAGE=""; FILES=(); DRY_RUN=0; NO_PUSH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    --files) shift; while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do FILES+=("$1"); shift; done ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-push) NO_PUSH=1; shift ;;
    *) echo -e "${RED}❌ 未知参数: $1${NC}"; exit 2 ;;
  esac
done
[[ -z "$TASK_ID" || -z "$AGENT" || -z "$MESSAGE" ]] && {
  echo "用法: synova-submit.sh --task-id <D#> --agent <名称> --message <消息> [--files ...] [--dry-run] [--no-push]"; exit 2; }

CHECK_CMD="${SYNO_SUBMIT_CHECK_CMD:-$ROOT/scripts/control-tower/synova-commit}"
SIM_CMD="${SYNO_SUBMIT_SIM_CMD:-$ROOT/scripts/control-tower/simulate-ci.sh}"
BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"

echo "═══════════════════════════════════════════════════════════"
echo "  synova submit — 统一提交入口 (D521)"
echo "  任务: $TASK_ID | Agent: $AGENT | 分支: $BRANCH"
echo "═══════════════════════════════════════════════════════════"

# ── ① tag 时机检查: 孤儿 tag 提前黄色警告（不再 push 时撞 D331 盲猜）──
echo ""
echo -e "${CYAN}── ① tag 时机检查 ──${RESET}"
if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠ origin/main 不可解析 — tag 检查降级跳过（离线语义，铁律 11 显式）${RESET}"
else
  ORPHANS=""
  for t in $(git tag -l 'V[0-9]*.[0-9]*.[0-9]*' 2>/dev/null); do
    git merge-base --is-ancestor "$t" origin/main 2>/dev/null || ORPHANS="${ORPHANS} $t"
  done
  if [ -n "$ORPHANS" ]; then
    echo -e "${YELLOW}⚠ 本地孤儿 tag（不在 origin/main 上）:${ORPHANS}${RESET}"
    echo -e "${YELLOW}  此 tag 未在 main 上——push 会被拦，建议 git tag -d 或等合并后重打（§6）${RESET}"
  else
    echo -e "${GREEN}✅ 无孤儿 tag（本地 V 系列 tag 均 main 可达）${RESET}"
  fi
fi

# ── ② bypass 竞态确认（hook 层登记可用——D521-2 已根治）──
echo ""
echo -e "${CYAN}── ② bypass 竞态确认 ──${RESET}"
if grep -q "bypass COMMITTED 登记" "$ROOT/scripts/hooks/post-commit.sh" 2>/dev/null; then
  echo -e "${GREEN}✅ hook 层登记已接线（提交后 bypass.log 自动登记，无脏文件竞态）${RESET}"
else
  echo -e "${YELLOW}⚠ post-commit.sh 无 hook 层登记段——bypass.log 提交后需手动 D451 补记${RESET}"
fi

# ── ③ 全部门禁 dry-run（一次报全）──
echo ""
echo -e "${CYAN}── ③ 门禁 dry-run（synova-commit --check）──${RESET}"
CHECK_ARGS=(--task-id "$TASK_ID" --agent "$AGENT" --message "$MESSAGE" --check)
[[ ${#FILES[@]} -gt 0 ]] && CHECK_ARGS+=(--files "${FILES[@]}")
if ! bash "$CHECK_CMD" "${CHECK_ARGS[@]}"; then
  echo -e "${RED}❌ ③ 门禁 dry-run 未过——上方完整清单，一次修完再跑 submit${RESET}"
  exit 1
fi

# ── ④ CI 等价模拟（本地能抓的错不送 CI）──
echo ""
echo -e "${CYAN}── ④ CI 等价模拟（simulate-ci）──${RESET}"
if ! bash "$SIM_CMD"; then
  echo -e "${RED}❌ ④ CI 模拟未过——本地能抓的错别送 CI（修复后重跑 submit）${RESET}"
  exit 1
fi

[[ "$DRY_RUN" == "1" ]] && {
  echo ""
  echo -e "${GREEN}✅ --dry-run ①-④ 全过——去掉 --dry-run 执行 ⑤ commit + ⑥ push${RESET}"
  exit 0; }

# ── ⑤ git commit（SYNO_SUBMIT_MODE=1：不 auto-tag 不 auto-push，§6）──
echo ""
echo -e "${CYAN}── ⑤ git commit ──${RESET}"
COMMIT_ARGS=(--task-id "$TASK_ID" --agent "$AGENT" --message "$MESSAGE")
[[ ${#FILES[@]} -gt 0 ]] && COMMIT_ARGS+=(--files "${FILES[@]}")
if ! SYNO_SUBMIT_MODE=1 bash "$CHECK_CMD" "${COMMIT_ARGS[@]}"; then
  echo -e "${RED}❌ ⑤ commit 失败${RESET}"
  exit 1
fi

[[ "$NO_PUSH" == "1" ]] && { echo -e "${GREEN}✅ commit 完成（--no-push，未推送）${RESET}"; exit 0; }

# ── ⑥ push + 失败诊断 ──
echo ""
echo -e "${CYAN}── ⑥ push ──${RESET}"
if git push origin "$BRANCH" 2>&1; then
  echo ""
  echo -e "${GREEN}✅ submit 完成——$BRANCH 已推送${RESET}"
  echo -e "${YELLOW}ℹ §6 纪律: tag 在 PR 合并 main 后打（git tag V<x.y.z> <merge-commit> && git push origin V<x.y.z>）${RESET}"
  exit 0
else
  echo -e "${RED}❌ push 失败${RESET}"
  echo "── CI 失败诊断（无 token 通道，见 docs/synova/coordination/CI-诊断通道.md）──"
  echo "  1) RID=\$(curl -s \"https://api.github.com/repos/tangbaobao520/SynovaAgent/actions/runs?branch=$BRANCH&per_page=1\" | python3 -c \"import json,sys;print(json.load(sys.stdin)['workflow_runs'][0]['id'])\")"
  echo "  2) curl -s \"https://api.github.com/repos/tangbaobao520/SynovaAgent/actions/runs/\$RID/jobs\" | python3 -c \"import json,sys;[print(j['id'],j['name']) for j in json.load(sys.stdin)['jobs'] if j['conclusion']=='failure']\""
  echo "  3) curl -s \"https://api.github.com/repos/tangbaobao520/SynovaAgent/check-runs/<JID>/annotations\""
  exit 1
fi
