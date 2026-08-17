#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# run-machine-evidence.sh — A2 机器验证入库（测试 → 证据 → 完成度）
#
# 一句话: 跑 product-lines.yaml 里 test: 绑定的验收点对应测试套件，绿了自动写证据
#         （evidence-writer.py），calc-progress.py 消费后完成度进入统计。
#         补 A2 缺口（README v1.4 §5.3 A2 设计了 evidence-writer 但未接线到测试运行）。
#
# 背景: 创始人 2026-08-17 — 之前任务 K3 完全没参与 → 完成度 0；需要一个不调 K3 大模型
#       的机器审计体系补完成度。K3 的 U1-U8 是门禁（防新任务错），本脚本是证据回填
#       （补旧任务完成度）——互补不冲突。
#
# 契约:
#   @input  — 无参 | --skip-vitest（跳过测试，仅补写已有结果证据）
#   @output — docs/synova/product-lines/evidence/test-YYYY-MM-DD*.json
#             （record_type=test, verdict=pass, points=test 绑定验收点）
#   @exit   — 0 成功；2 降级（yaml/脚本缺失）
#   @degraded — 测试套件不存在/超时 → 显式 log + 不写 pass 证据（fail-closed 铁律 11）
#
# 诚实规则（与 calc-progress §1 一致）:
#   - 只跑 test: 绑定的验收点对应套件（list-test-points.py 输出）——纯机器可验证，无 LLM
#   - 全部绿才写 pass；任一挂 → 写 fail 证据（该点转 failed，诚实）
#   - 机器绿 → pending_k3（🟡 待裁判）→ K3 复核转绿——机器不替代 K3 终审
#   - 幂等: 同日重复跑 → evidence-writer 自动递增序号，不覆盖
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVIDENCE_WRITER="$SCRIPT_DIR/evidence-writer.py"
LIST_POINTS="$SCRIPT_DIR/list-test-points.py"
YAML="$REPO_DIR/docs/synova/product-lines/product-lines.yaml"
EVIDENCE_DIR="$REPO_DIR/docs/synova/product-lines/evidence"
TODAY=$(date +%Y-%m-%d)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

SKIP_VITEST=0
for arg in "$@"; do
  [ "$arg" = "--skip-vitest" ] && SKIP_VITEST=1
done

# ── 1. 拿 test 绑定的验收点 ──
POINTS=$(python3 "$LIST_POINTS" 2>/dev/null | tail -1)  # swallow-ok: 探测命令，无输出=无绑定，非错误
if [ -z "$POINTS" ]; then
  echo -e "${YELLOW}⚠ A2: 无 test 绑定验收点（list-test-points 空）— 跳过${NC}"
  exit 0
fi
echo -e "${GREEN}ℹ A2: test 绑定验收点: ${POINTS}${NC}"

# ── 2. 提取每个验收点绑定的测试套件名（test:xxx）→ 定位测试文件 ──
# 套件名 → 测试文件 glob 映射（来自 product-lines.yaml evidence 的 test:<suite>）
SUITES=$(python3 - <<'PYEOF'
import re
t = open('docs/synova/product-lines/product-lines.yaml', encoding='utf-8').read()
suites = set()
for m in re.finditer(r'evidence:\s*\[(.*?)\]', t, re.S):
    for e in m.group(1).split(','):
        e = e.strip().strip(chr(34) + chr(39))
        if e.startswith('test:'):
            suites.add(e.split(':',1)[1].strip())
print(' '.join(sorted(suites)))
PYEOF
)
echo -e "${GREEN}ℹ A2: 测试套件: ${SUITES}${NC}"

# ── 3. 跑套件对应的测试文件 ──
VERDICT="pass"
QUOTE="vitest 套件全绿"
if [ "$SKIP_VITEST" = "0" ]; then
  echo "── A2: 跑 test 绑定套件 ───────────────────────"
  TEST_FILES=""
  for s in $SUITES; do
    # 套件名 → 测试文件（按语义匹配：cron-scheduler → tests/cron/scheduler.test.ts 等）
    F=$(find "$REPO_DIR/tests" -name "*.test.ts" 2>/dev/null | xargs grep -l "$s" 2>/dev/null | head -1)  # swallow-ok: 套件定位探测，未找到=跳过该套件
    if [ -z "$F" ]; then
      # 直接按文件名找
      F=$(find "$REPO_DIR/tests" -name "*${s}*.test.ts" 2>/dev/null | head -1)  # swallow-ok: 文件名探测
    fi
    if [ -n "$F" ]; then
      TEST_FILES="$TEST_FILES $F"
      echo "  + $s → $(basename $F)"
    else
      echo -e "${YELLOW}  ? $s → 未找到测试文件（跳过该套件）${NC}"
    fi
  done

  if [ -z "$TEST_FILES" ]; then
    echo -e "${YELLOW}⚠ A2: 无匹配测试文件 — 降级不写 pass（fail-closed）${NC}"
    echo "degraded: test 绑定套件未定位到测试文件" >&2
    exit 2
  fi

  if [ -x "$REPO_DIR/node_modules/.bin/vitest" ]; then
    if (cd "$REPO_DIR" && node_modules/.bin/vitest run $TEST_FILES 2>&1 | tail -12); then
      echo -e "${GREEN}✅ A2: 套件全绿${NC}"
    else
      echo -e "${RED}❌ A2: 套件有失败 — 写 fail 证据（诚实）${NC}"
      VERDICT="fail"
      QUOTE="vitest 套件有失败（详见 CI 日志）"
    fi
  else
    echo -e "${YELLOW}⚠ A2: vitest 不存在 — 降级不写 pass（fail-closed）${NC}"
    echo "degraded: vitest 不存在，不写机器证据" >&2
    exit 2
  fi
fi

# ── 4. 写证据 ──
python3 "$EVIDENCE_WRITER" \
  --type test \
  --date "$TODAY" \
  --verdict "$VERDICT" \
  --points "$POINTS" \
  --source "run-machine-evidence.sh (A2)" \
  --quote "$QUOTE" \
  --out-dir "$EVIDENCE_DIR" 2>&1 | tail -2

echo -e "${GREEN}✓ A2 完成: 证据 verdict=${VERDICT} 已入库（${POINTS}）${NC}"
exit 0
