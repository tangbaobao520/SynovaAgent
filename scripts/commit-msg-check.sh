#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Anthropic 标准: Conventional Commits + issue 引用
# 格式: type(scope): subject
# 要求: commit body 含 issue/task 引用 (#C1, P1-2, SOG-001 等)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

COMMIT_MSG=$(cat "$1" 2>/dev/null || echo "")
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

if echo "$COMMIT_MSG" | grep -qE '^Merge |^Revert '; then exit 0; fi

PATTERN='^(feat|fix|chore|docs|test|refactor|perf|style|ci|build)(\([a-zA-Z0-9_.-]+\))?: .{1,140}$'

if ! echo "$COMMIT_MSG" | head -1 | LC_ALL=C grep -qE "$PATTERN"; then
  echo ""
  echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${RED}║  ❌ Commit 格式不符合 Conventional Commits                  ║${RESET}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo "  正确格式: type(scope): subject"
  echo "  type: feat | fix | chore | docs | test | refactor | perf | ci"
  echo "  示例: feat(p1-3): 接线 EvidenceManager 到诊断流程"
  echo "        fix(#C1): 修复 Phase 0 状态机流转 bug"
  echo ""
  exit 1
fi

# Anthropic 标准: 检查 issue/task 引用 (warning, not block)
if echo "$COMMIT_MSG" | grep -qE '#[A-Z]+[0-9]+|P[0-9]+-[0-9]+|[A-Z]+-[0-9]{3}|#[0-9]+'; then
  echo -e "${GREEN}✅ Commit 格式正确 + 含 issue 引用${RESET}"
else
  echo -e "${GREEN}✅ Commit 格式正确${RESET}"
  echo -e "${YELLOW}   ⚠ 建议在 commit body 中包含 issue/task 引用 (如 #C1, P1-2, SOG-001)${RESET}"
fi

# ── D328: 提交声明-内容一致性（防并行劫持）──
# 背景: D320 劫持 — chore(D318) 提交带走 D320 的 8 个文件, G12(范围)与格式校验全过。
# 本检查绑定"消息声明的 D#"与"暂存文件真实认领 brief 的 D#": 不一致 → 硬阻断。
# 语义 (dev doc §3.1/§4, 修正 §3.2 代码):
#   - 两者都存在且不一致 → exit 1（劫持特征）
#   - 消息无 D# 但认领 brief 有 D# → exit 1（提交未声明任务归属）
#   - Merge/Revert（上方已跳）/无暂存/无认领 brief/认领 brief 无 D#/无真实认领 → fail-open
# 消息文件缺失/异常 → MSG_DID 空 → 一致性检查 fail-open（铁律 24: 显式兜底）
MSG_DID=$(head -1 "$1" 2>/dev/null | grep -oE '\(D[0-9]+\)' | head -1 | tr -d '()') || true # swallow-ok: 消息文件异常时声明为空 → fail-open 不误伤
STAGED_LIST=$(git diff --cached --name-only 2>/dev/null || true)
if [ -n "$STAGED_LIST" ]; then
  # D317 自包含定位: 临时 repo 测试/异仓库时 git rev-parse ROOT 下无脚本目录
  MSG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # Windows/MSYS 边界: python 无法解析 MSYS 路径 (/d/...), 须 cygpath -w 转换
  # (对齐 resolve-commit-brief.sh 的 PARSER_DIR_W 模式 — D317 教训)
  MSG_DIR_W="$(cygpath -w "$MSG_DIR" 2>/dev/null || echo "$MSG_DIR")"
  # D329 (D328 P2 折入): PYBIN 跨平台回退 — 裸 python3 在精简 Git/CI runner
  # 上不存在（仅 python / py -3）。对齐 resolve-commit-brief.sh 的 PYBIN 循环。
  # 全无 python → 显式 degraded 提示（fail-open skip，不静默 — 铁律 24/31）。
  # 注意: 必须放在 resolver 调用之前 — resolver 无 python 时必退空（exit 1），
  # 若把提示放进 CLAIM_BRIEF 非空条件内，无 python 场景提示永不触发 = 静默 skip。
  # D330 (KIMI K3 P1-1): command -v 只验存在性 — Windows Store stub 等损坏 shim
  # 存在但执行即败 → 加可用性验证 ("$_c" -c "import sys"); 全部不可用/损坏 →
  # 显式 degraded 提示（铁律 24/31, 不再静默 skip）
  PYBIN=""
  for _c in python3 python py; do
    if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then
      PYBIN="$_c"
      break
    fi
  done
  if [ -z "$PYBIN" ]; then
    echo -e "${YELLOW}⚠ D328 一致性检查跳过: python 不可用或损坏（fail-open 显式提示，不静默）${RESET}"
  fi
  # D330 (KIMI K3 P1-1): resolver 内部 PYBIN 探测无可用性验证 — broken-shim 下
  # 它选中损坏 python3 → 解析失败 exit 1（D317 语义: python 不可用 → exit 1）。
  # 捕获 rc: 失败且无 brief → 显式 degraded 提示（dev doc §4: 提示+跳过可追溯,
  # 不再静默放行）
  CLAIM_RC=0
  CLAIM_BRIEF=$(bash "$MSG_DIR/workflow/resolve-commit-brief.sh" "$STAGED_LIST" 2>/dev/null | head -1) || CLAIM_RC=$? # swallow-ok: resolver 失败 → degraded 提示（dev doc §3.2）
  if [ -n "$CLAIM_BRIEF" ] && [ -f "$CLAIM_BRIEF" ] && [ -n "$PYBIN" ]; then
    # 防假阳性: 仅当 resolver 返回的 brief 真实认领了 ≥1 个暂存文件才比较 D#；
    # 走最终回退（无真实认领）时跳过——未认领场景由 G12 兜底阻断。
    # D330 (KIMI K3 P1-1): GENUINE 三态 — 输出 0=无真实认领(跳过,G12 兜底) /
    # 1=有真实认领(比较 D#) / 执行失败 rc≠0=degraded 显式提示（不再 || echo 0
    # 把"检查未执行"与"检查通过=无认领"压缩成同一个 0 静默吞掉）
    GENUINE_RC=0
    GENUINE=$(echo "$STAGED_LIST" | "$PYBIN" -c "
import re, sys
sys.path.insert(0, r'$MSG_DIR_W/control-tower')
from brief_parser import parse_q2, match_path
staged = [s for s in sys.stdin.read().split('\n') if s.strip()]
text = open(r'$CLAIM_BRIEF', encoding='utf-8', errors='replace').read()
inc = parse_q2(text).get('include', [])
print(1 if any(match_path(s, p) for s in staged for p in inc) else 0)
" 2>/dev/null) || GENUINE_RC=$? # swallow-ok: 执行失败 → 三态 degraded 显式提示（dev doc §3.2）
    if [ "$GENUINE_RC" != 0 ]; then
      echo -e "${YELLOW}⚠ D328 一致性检查 degraded: GENUINE 判定执行失败 (rc=$GENUINE_RC)，本次跳过${RESET}"
    elif [ "$GENUINE" = "1" ]; then
      CLAIM_DID=$(basename "$CLAIM_BRIEF" .md | grep -oE 'D[0-9]+' | head -1 || true)
      if [ -n "$CLAIM_DID" ] && { [ -z "$MSG_DID" ] || [ "$CLAIM_DID" != "$MSG_DID" ]; }; then
        echo -e "${RED}❌ D328: 提交声明(${MSG_DID:-无})与暂存文件归属($CLAIM_DID)不一致 — 疑似并行劫持${RESET}"
        echo "   认领 brief: $CLAIM_BRIEF"
        echo "   请确认提交的是本任务文件，或拆分暂存区后再提交"
        exit 1
      fi
    fi
  elif [ "$CLAIM_RC" != 0 ]; then
    echo -e "${YELLOW}⚠ D328 一致性检查 degraded: 认领 brief 解析失败（resolver rc=$CLAIM_RC），本次跳过${RESET}"
  fi
fi
exit 0
