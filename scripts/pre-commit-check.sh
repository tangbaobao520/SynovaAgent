#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering v3.7 — pre-commit 8 组硬阻断 (全部 <8s)
#
# v3.6 → v3.7 核心变化 (2026-06-23):
#   + plan.json 支持: 分阶段任务可 deferred wiring/test_pairing 检查
#   + 双日志: pre-commit-failures.log (门禁正常拒绝) vs bypass.log (--no-verify 绕过)
#   + as any 跳过注释行 (不再把 "Iron law #38: as any = 0" 误报为违规)
#   + bash 退位: 只做物理验证 (符号存在? 文件存在? 语法合法?)
#   + agent 进位: 语义判断 (调用链正确? 降级诚实? 阶段合理?)
#
# 8 组 (不变):
#   1. 类型安全 + 硬编码数据    (as any 跳过注释行 + 硬编码业务字段)
#   2. 测试质量                  (catch 无 log + 测试配对[可 deferred] + 桩测试)
#   3. Secrets                   (全工作区 + .claude/ + 暂存区 + .env)
#   4. 接线完整性               (新 export 有调用方[可 deferred] + 接线深度)
#   5. 架构边界 + 桥接文件      (跨层引用 + 铁律 46/47)
#   6. Task Brief                (存在 + 5 核心字段)
#   7. 架构合规                  (DiagnosticModule + 专家配置 + 数据流)
#   8. 文件驱动架构完整性       (manifest/tags/回归/目录/feature-flag)
#
# 设计哲学:
#   bash 只回答"物理事实" — 符号被引用过吗？文件存在吗？
#   agent 自检回答"语义判断" — 引用在正确的调用链中吗？
#   plan.json 声明"架构步骤" — 这个文件接线在后续阶段
# ═══════════════════════════════════════════════════════════════════════════════
set +e

HARD_FAIL=0
WARN_COUNT=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

hard_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${RED}❌ ${name}: ${count} 处  [硬阻断]${RESET}"
    echo "$matches" | head -8 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
  fi
}

warn_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠️  ${name}: ${count} 处  [警告]${RESET}"
    echo "$matches" | head -5 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    WARN_COUNT=$((WARN_COUNT + 1))
  fi
}

# V3.7: plan.json 感知的"硬阻断或降级警告"检查
# 如果文件在 plan.json 中声明了 defer → 降级为警告，不阻断
plan_aware_check() {
  local name="$1" matches="$2" deferred_list="$3"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -eq 0 ]; then
    echo -e "  ${GREEN}✅ ${name}${RESET}"
    return
  fi
  # 检查是否所有匹配都在 deferred 列表中
  local non_deferred=""
  while IFS= read -r match_line; do
    [ -z "$match_line" ] && continue
    local match_file=$(echo "$match_line" | grep -oP '^[^:]+' | head -1)
    if [ -n "$deferred_list" ] && echo "$deferred_list" | grep -qF "$match_file" 2>/dev/null; then
      continue  # 在 defer 列表中 → 跳过
    fi
    non_deferred="${non_deferred}${match_line}\n"
  done <<< "$matches"
  if [ -z "$non_deferred" ]; then
    # 全部被 deferred → 警告不阻断
    echo -e "  ${YELLOW}⚠️  ${name}: ${count} 处 (plan.json deferred)  [警告]${RESET}"
    echo "$matches" | head -3 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    WARN_COUNT=$((WARN_COUNT + 1))
  else
    echo -e "  ${RED}❌ ${name}: $(echo -e "$non_deferred" | grep -c .) 处  [硬阻断]${RESET}"
    echo -e "$non_deferred" | head -5 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
  fi
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep '\.ts$' | grep -v node_modules || true)

# ═══ V3.7: plan.json — 分阶段任务支持 ═══
# Anthropic 原则: 架构步骤不是偷懒。当 plan.json 声明某文件处于 create 阶段
# 且 wiring 标记为 deferred，接线检查对该文件降级为警告。
PLAN_FILE="$ROOT/.claude/plan.json"
DEFERRED_WIRING_FILES=""
DEFERRED_FF_FILES=""
DEFERRED_TEST_FILES=""
PLAN_ACTIVE=0
if [ -f "$PLAN_FILE" ]; then
  # 用 python 解析 JSON 比 bash 可靠
  PLAN_PARSE=$(python3 -c "
import json, sys
try:
  p = json.load(open('$PLAN_FILE'))
  phase = p.get('current_phase', -1)
  if phase < 0: sys.exit(0)
  # 收集当前 phase 之前所有标记为 deferred 的文件
  for ph in p.get('phases', []):
    if ph.get('step', 999) > phase: continue
    checks = ph.get('checks', {})
    files = ph.get('files', [])
    if checks.get('wiring') == 'deferred':
      for f in files: print(f'WIRING:{f}')
    if checks.get('feature_flag') == 'deferred':
      for f in files: print(f'FF:{f}')
    if checks.get('test_pairing') == 'deferred':
      for f in files: print(f'TEST:{f}')
except: pass
" 2>/dev/null)
  if [ -n "$PLAN_PARSE" ]; then
    PLAN_ACTIVE=1
    DEFERRED_WIRING_FILES=$(echo "$PLAN_PARSE" | grep "^WIRING:" | sed 's/^WIRING://')
    DEFERRED_FF_FILES=$(echo "$PLAN_PARSE" | grep "^FF:" | sed 's/^FF://')
    DEFERRED_TEST_FILES=$(echo "$PLAN_PARSE" | grep "^TEST:" | sed 's/^TEST://')
  fi
fi
STAGED_ALL=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -v node_modules || true)
STAGED_SRC=$(echo "$STAGED_ALL" | grep -E '^src/|^tests/|^packages/|^scripts/' | grep -v 'scripts/pre-commit-check.sh\|scripts/check-secrets.sh\|scripts/check-file-driven.sh\|scripts/workflow/' || true)
NEW_IMPL=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep "^src/" | grep "\.ts$" | grep -v "\.test\." | grep -v "\.d\.ts" | grep -v "types\.ts$\|index\.ts$\|helpers\.ts$" || true)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Loop Engineering v3.6 — pre-commit (8 组)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════
# 组 1: 类型安全 + 硬编码数据 (原 1, 10, 13 合并)
#
# Anthropic 决策: 原则 6 "找到根因" — `as any` 不是语法错误，是类型系统的信任崩溃。
#   一次 `as any` 意味着"我不确定这个类型，跳过检查"——而这恰好是所有类型相关 bug
#   的入口。47 次历史事故证明: 零容忍是唯一正确的策略。
#   硬编码业务数据 (部门名/可扩展实体列表) 的根因相同——把应该是数据的东西写成了代码。
#   历史: 47 次 as any 导致运行时崩溃。2026-05 engine-core 拆分中，20 个桥接文件
#         大量使用 as any 绕过类型检查，17 处 CJS require() 在 ESM 下崩溃。
# ═══════════════════════════════════════════════════════════════════
echo -e "${CYAN}── 组 1/8: 类型安全 + 硬编码数据 ──${RESET}"

# 1a. as any 零容忍 (V3.7: 跳过注释行 — 行首是 // 或 * 或 /* 的行不检查)
# Anthropic 原则: bash 只做模式匹配，不判断语义。注释行不属于"代码中的 as any"。
M=$(grep -rn 'as any\b' src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "\.d\.ts" \
  | grep -vE '^\s*[^:]+:\d+:\s*(//|/\*|\*| \*)' || true)
hard_check "as any 零容忍 (铁律 38)" "$M"

# 1b. 硬编码业务数据 (合并原 10 + 13: 硬编码联合类型/数组/Set/DEFAULT_* + 部门名等)
STAGED_HTML=$(echo "$STAGED_ALL" | grep -E '\.(html|ts)$' | grep -v node_modules | grep -v '\.test\.' || true)
HARDCODE_DATA=""
if [ -n "$STAGED_HTML" ]; then
  for hf in $STAGED_HTML; do
    [ -z "$hf" ] && continue; [ ! -f "$hf" ] && continue
    DEPS=$(grep -n "'marketing'\|'sales'\|'finance'\|'研发部'\|'市场部'\|'销售部'" "$hf" 2>/dev/null | grep -v "import\|export\|//\|/\*\|token.split\|dept.*=" | head -3 || true)
    [ -n "$DEPS" ] && HARDCODE_DATA="${HARDCODE_DATA}  ${hf}: 可能硬编码业务数据(如部门名)\n"
  done
fi
# 也跑 check-hardcoded.sh 的联合类型/数组/Set/DEFAULT_* 检测 (不阻断，仅报告)
bash "$ROOT/scripts/check-hardcoded.sh" 2>/dev/null || true
hard_check "硬编码业务数据/类型 (禁止硬编码部门名/可扩展实体列表)" "${HARDCODE_DATA:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 2: 测试质量 (原 2, 4, 12, 17 合并)
#
# Anthropic 决策: 原则 2 "先设计验证标准" — 测试不是写完代码后的负担，是写代码前的规格。
#   空 catch 无 log → 静默降级 → 线上故障无迹可寻。铁律 24+31 禁止。
#   新文件无测试 → 4 次接线失败事故 (组件通过单元测试但从未被生产代码调用)。
#   桩测试 (<3 expect) → 假绿色 CI → 合并后才发现的回归。铁律 36: vitest 零失败。
#   跨模块无集成测试 → bridge/context 类跨层调用，单元测试 mock 一切，集成才是真实。
#   历史: 4 次接线失败 — 新 export 有单元测试但从未被 import。
#         铁律 11 — 静默降级事故 (catch 空吞异常，生产环境无日志)。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 2/8: 测试质量 ──${RESET}"

# 2a. empty catch 无 log
EMPTY=""
if [ -n "$STAGED" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue; [ ! -f "$file" ] && continue
    CATCHES=$(grep -n "catch\s*{" "$file" 2>/dev/null || true)
    if [ -n "$CATCHES" ]; then
      while IFS= read -r cline; do
        linenum=$(echo "$cline" | cut -d: -f1); [ -z "$linenum" ] && continue
        ctx=$(sed -n "${linenum},$((linenum + 2))p" "$file" 2>/dev/null || echo "")
        # V3.7: 空 catch 接收 log.|degraded|throw|/\*|// — 有任一项即非"静默吞异常"
        if ! echo "$ctx" | grep -qE "log\.|logger\.|console\.|degraded|throw\s|/\*|//"; then
          EMPTY="${EMPTY}${file}:${linenum}: 空 catch (无 log/degraded/throw)\n"
        fi
      done <<< "$CATCHES"
    fi
  done <<< "$STAGED"
fi
hard_check "empty catch 无 log (铁律 24+31)" "${EMPTY:-}"

# 2b. 新文件配对测试 (原 4)
MISSING_TEST=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r impl; do
    [ -z "$impl" ] && continue
    test_path=$(echo "$impl" | sed 's|^src/|tests/|; s|\.ts$|.test.ts|')
    if ! git diff --cached --name-only 2>/dev/null | grep -q "^${test_path}$"; then
      if [ ! -f "$test_path" ]; then
        MISSING_TEST="${MISSING_TEST}${impl} → 缺少 ${test_path}\n"
      fi
    fi
  done <<< "$NEW_IMPL"
fi
# V3.7: plan.json 感知 — deferred test 文件降级为警告
if [ "$PLAN_ACTIVE" -eq 1 ] && [ -n "$DEFERRED_TEST_FILES" ]; then
  plan_aware_check "新文件配对: impl 须同 commit 有 test" "${MISSING_TEST:-}" "$DEFERRED_TEST_FILES"
else
  hard_check "新文件配对: impl 须同 commit 有 test" "${MISSING_TEST:-}"
fi

# 2c. 桩测试 + 跨模块集成测试 (原 12 + 17 合并)
STUB_FAIL=""
INTG_FAIL=""
STAGED_TESTS=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep '^tests/.*\.test\.ts$' || true)
if [ -n "$STAGED_TESTS" ]; then
  for tf in $STAGED_TESTS; do
    [ -z "$tf" ] && continue; [ ! -f "$tf" ] && continue
    EXPECT_COUNT=$(grep -c 'expect(' "$tf" 2>/dev/null || echo 0)
    if [ "${EXPECT_COUNT:-0}" -lt 3 ]; then
      STUB_FAIL="${STUB_FAIL}  ${tf}: 仅 ${EXPECT_COUNT} 个 expect() — 可能为桩测试（需 ≥3 个）\n"
    fi
  done
fi
if [ -n "$NEW_IMPL" ]; then
  for nf in $NEW_IMPL; do
    [ -z "$nf" ] && continue
    if echo "$nf" | grep -qiE 'bridge|context|inject|dispatch|connect'; then
      INTG_TEST=$(echo "$nf" | sed 's|^src/|tests/|; s|\.ts$|.integration.test.ts|')
      if [ ! -f "$INTG_TEST" ]; then
        INTG_FAIL="${INTG_FAIL}  ${nf}: 跨模块文件缺少集成测试 → ${INTG_TEST}\n"
      fi
    fi
  done
fi
hard_check "桩测试: 新测试需 ≥3 expect()" "${STUB_FAIL:-}"
hard_check "跨模块集成: bridge/context 类需 .integration.test.ts" "${INTG_FAIL:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 3: Secrets (原 3 — 独立脚本，逻辑复杂不适合合并)
#
# Anthropic 决策: 原则 4 "安全边际" — Secrets 暴露是不可逆事故。
#   一旦 API Key 进入 git 历史，即使后续 commit 删除，仍可通过 git log 恢复。
#   全工作区扫描 (不仅暂存区) 是因为 .env 和 .claude/settings.local.json 可能含真实 Key
#   但从未被 git add——旧门禁漏掉了它们。.claude/ 专项扫描是因为 settings.local.json
#   可能被备份/同步到其他设备。
#   历史: .env 真实 API Key 暴露仓库 + 飞书 App Secret 暴露 (2026-06)。
#         旧门禁只扫暂存区 → 磁盘上的真实 Key 从未被发现，直到被备份软件同步出去。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 3/8: Secrets ──${RESET}"
bash "$ROOT/scripts/check-secrets.sh"
[ $? -ne 0 ] && HARD_FAIL=$((HARD_FAIL + 1))

# ═══════════════════════════════════════════════════════════════════
# 组 4: 接线完整性 (原 5, 11 合并)
#
# Anthropic 决策: 原则 5 "逐步验证，不信任声称完成" — "写完了" != "接线了"。
#   铁律 5: 后端能力 ≠ 用户可用的功能。写了代码但没 import → 死代码。
#   接线深度 (原 11): import 了但从未调用 → 空 import 绕过"有调用方"检测。
#   这是 v3.5 新增的第二层防御——agent 会 import 一个函数但不调用它来满足门禁。
#   历史: 4 次接线失败 — 组件通过单元测试但从未被生产代码调用。
#         v3.5 追加拿线深度检查: 开发者 import 了函数但没调用，绕过了原第 5 项。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 4/8: 接线完整性 ──${RESET}"

# 4a. 新 export 被引用 (V3.7 简化: bash 只验证"被引用"这个物理事实)
# Anthropic 原则: bash 退回到物理事实——"这个符号在文件外部出现过吗？"
# 调用链正确性、分阶段接线 → agent 自检和 plan.json 负责。
UNWIRED=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue; [ ! -f "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated' && continue
      # V3.7: 搜索范围扩大——任何 src/ 下的文件引用了就算"已接线"
      WIRED=$(grep -rn "\b${name}\b" src/ --include="*.ts" 2>/dev/null \
        | grep -v "export.*${name}" | grep -v "$file" | grep -v "\.test\." | head -1 || true)
      [ -z "$WIRED" ] && UNWIRED="${UNWIRED}${file}: export ${name} — 未被任何 src/ 文件引用\n"
    done
  done <<< "$NEW_IMPL"
fi
# V3.7: plan.json 感知 — deferred wiring 文件降级为警告
if [ "$PLAN_ACTIVE" -eq 1 ] && [ -n "$DEFERRED_WIRING_FILES" ]; then
  plan_aware_check "接线审计: 新 export 必须被引用" "${UNWIRED:-}" "$DEFERRED_WIRING_FILES"
else
  hard_check "接线审计: 新 export 必须被引用 (物理事实)" "${UNWIRED:-}"
fi

# 4b. 接线深度: import 了但从未调用 (原 11)
DEEP_FAIL=""
if [ -n "$NEW_IMPL" ]; then
  for file in $NEW_IMPL; do
    [ -z "$file" ] && continue; [ ! -f "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated' && continue
      CALL_SITES=$(grep -rn "\b${name}\b" src/server.ts src/index.ts src/agent/synova-agent.ts --include="*.ts" 2>/dev/null | grep -v "import.*${name}\b" | grep -v "export.*${name}\b" | grep -v "^\s*//\|^\s*\*" | head -1 || true)
      IMPORT_ONLY=$(grep -rn "import.*\b${name}\b" src/server.ts src/index.ts src/agent/synova-agent.ts --include="*.ts" 2>/dev/null | head -1 || true)
      if [ -z "$CALL_SITES" ] && [ -n "$IMPORT_ONLY" ]; then
        DEEP_FAIL="${DEEP_FAIL}  ${file}: export ${name} — 已 import 但从未调用（空 import 绕过检测）\n"
      fi
    done
  done
fi
hard_check "接线深度: 新 export 必须被调用(非仅 import)" "${DEEP_FAIL:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 5: 架构边界 + 桥接文件 (原 8, 19, 20 合并)
#
# Anthropic 决策: 原则 1 "第一性原理" — 五层架构的边界不是约定，是物理规律。
#   L3 不能直接查 L5 SQLite —— 不是"不应该"，是"语义上不成立"（L3 不知道数据在哪）。
#   铁律 46: 桥接文件 ≠ 迁移。import 代理骗过 tsc，骗不过 grep。
#   铁律 47: "拆完了"必须由 grep 物理证明。声称完成但 grep 有结果 = 没拆完。
#   历史: 2026-05~06 engine-core 拆分欺诈 — 被声称完成 4 次，实际 538 文件原封不动，
#         20 个桥接文件伪装迁移。tsc 零错误（import 路径合法），但运行时 17 处 CJS
#         require() 在 ESM 下崩溃。一个月反复承诺零实质进展。这是 Synova 最严重事故。
#   为什么铁律 47 是警告而非阻断: task brief 可能包含历史遗留声明。但警告让问题
#         始终可见——不可能"没注意到"。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 5/8: 架构边界 + 桥接文件 ──${RESET}"

# 5a. 跨层引用检测 (原 8)
CROSS_LAYER=""
if [ -n "$STAGED_SRC" ]; then
  L1_TO_L4=$(echo "$STAGED_SRC" | grep -E '^src/(routes/|l1/|l1-interaction/)' | xargs grep -l "from '\.\./l4/\|from '\.\./\.\./l4/\|from '\.\./store/\|from '\.\./\.\./store/" 2>/dev/null | grep -v "knowledge-bridge-service\|\.test\." || true)
  [ -n "$L1_TO_L4" ] && CROSS_LAYER="${CROSS_LAYER}L1→L4/L5: ${L1_TO_L4}\n"
  L2_TO_L5=$(echo "$STAGED_SRC" | grep -E '^src/agent/' | xargs grep -l "from '\.\./store/\|from '\.\./init/" 2>/dev/null | grep -v "knowledge-bridge-service\|\.test\.\|import type" || true)
  [ -n "$L2_TO_L5" ] && CROSS_LAYER="${CROSS_LAYER}L2→L5: ${L2_TO_L5}\n"
  L3_TO_ENGINE=$(echo "$STAGED_SRC" | grep -E '^src/sentinel/' | xargs grep -l "from '\.\./\.\./\.\./packages/engine-core/" 2>/dev/null | grep -v "import type\|\.test\." || true)
  [ -n "$L3_TO_ENGINE" ] && CROSS_LAYER="${CROSS_LAYER}L3→engine-core: ${L3_TO_ENGINE}\n"
fi
hard_check "架构边界: 禁止跨层引用 (铁律 39)" "${CROSS_LAYER:-}"

# 5b. 桥接文件欺诈 (原 19: 铁律 46)
BRIDGE_ALLOWED="src/adapters/engine-core-adapter.ts|src/init/engine-context.ts|src/types/engine-core-types.ts|src/agent/orchestrator-adapter.ts|src/l4/graph-bridge.ts|src/l4/entity-resolver-l2.ts|src/l4/engine-graph-store.ts|src/l4/diagnosis-graph-query.ts"
BRIDGE_FAIL=""
STAGED_SRC_FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '^src/.*\.ts$' | grep -v '\.test\.' || true)
if [ -n "$STAGED_SRC_FILES" ]; then
  for file in $STAGED_SRC_FILES; do
    [ -z "$file" ] && continue
    echo "$file" | grep -qE "$BRIDGE_ALLOWED" && continue
    if grep -q "packages/engine-core" "$file" 2>/dev/null; then
      BRIDGE_FAIL="${BRIDGE_FAIL}  ${file}: 直接引用 packages/engine-core/ (铁律 46)\n"
    fi
  done
fi
hard_check "铁律 46: 桥接文件欺诈" "${BRIDGE_FAIL:-}"

# 5c. 铁律 47: 声称拆分完须 grep 零旧引用 (原 20 — 警告模式)
TODAY=$(date +%Y-%m-%d)
BRIEF=$(find "$ROOT/.claude/task-briefs/" -type f -name "${TODAY}*" 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
CLEANUP_CLAIM=""
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  if grep -qi "拆分\|迁移\|清理.*完成\|已拆\|已迁移\|已清理" "$BRIEF" 2>/dev/null; then
    CLEANUP_CLAIM="task brief 声称拆分/迁移/清理完成 — 请确认 grep -r 'packages/engine-core' src/ 零结果"
  fi
fi
warn_check "铁律 47: 声称完成须 grep 物理证明" "${CLEANUP_CLAIM:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 6: Task Brief (精简为 5 核心字段 — 原 7 简化 + 原 15/16 降级)
#
# Anthropic 决策: 原则 0 "协作对齐前置" — task brief 是 agent 和人类的接口契约。
#   没有 brief → agent 会假设共识 → 假设错误 → 做了一堆没人要的东西。
#   v3.6 从 11 字段精简到 5 核心字段: 保留"必须对齐"的部分 (Q1/Q2/Q3/架构层/Done)，
#   删除"可以后续补充"的部分 (PRD 章节引用、文件位置——已降级为警告)。
#   越少字段 → 越可能被完整填写 → 门禁越有效。
#   历史: 多个 task brief 因 11 字段太重在快速迭代时被跳过 (--no-verify 绕过)。
#         v3.5 的 --no-verify 日志显示 15 次 pre-commit 失败，其中多次是因为
#         task brief 字段不完整而非实质质量问题。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 6/8: Task Brief (5 核心字段) ──${RESET}"

TASK_BRIEF_MISSING=""
TASK_BRIEF_EMPTY=""
if [ -n "$STAGED_SRC" ]; then
  if [ -z "$BRIEF" ]; then
    TASK_BRIEF_MISSING="今日无 task brief。请先运行: bash scripts/workflow/task-start.sh \"任务描述\""
  else
    # v3.6: 精简为 5 核心字段 (从 11 字段砍半)
    for q in "Q1:" "Q2:" "Q3:" "本任务在哪一层" "Done 标准"; do
      SECTION=$(awk "/^## $q/{found=1; next} /^## /{if(found) exit} found" "$BRIEF" 2>/dev/null)
      FILLED=$(echo "$SECTION" | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)
      if [ -z "$FILLED" ] || [ ${#FILLED} -lt 3 ]; then
        TASK_BRIEF_EMPTY="${TASK_BRIEF_EMPTY}  $q 未填写\n"
      fi
    done
    # Done 标准专项: 至少一条完成标准
    DONE_SECTION=$(awk "/^## Done 标准/{found=1; next} /^## /{if(found) exit} found" "$BRIEF" 2>/dev/null)
    DONE_CHECKED=$(echo "$DONE_SECTION" | grep -cE '^\s*- \[x\]' || true)
    DONE_EMPTY=$(echo "$DONE_SECTION" | grep -v "^##\|^<!--\|^$" | wc -l)
    if [ "${DONE_CHECKED:-0}" -eq 0 ] && [ "${DONE_EMPTY:-0}" -le 1 ]; then
      TASK_BRIEF_EMPTY="${TASK_BRIEF_EMPTY}  Done 标准: 至少需定义一条完成标准\n"
    fi
  fi
fi
hard_check "Task Brief: 编码变更须有今日 task brief" "${TASK_BRIEF_MISSING:-}"
hard_check "Task Brief: 5 核心字段必须填写 (Q1/Q2/Q3/架构层/Done)" "${TASK_BRIEF_EMPTY:-}"

# v3.6 降级为警告 (原 15: PRD 章节引用, 原 16: 文件位置)
PRD_REF=""
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  DONE_SEC=$(awk "/^## Done 标准/,/^## /" "$BRIEF" 2>/dev/null)
  if ! echo "$DONE_SEC" | grep -qE '§[0-9]+\.[0-9]+|PRD.*§' 2>/dev/null; then
    PRD_REF="Done 标准未引用 PRD 章节 (重大 feature 建议标注 §X.Y)"
  fi
fi
warn_check "PRD 对照: Done 标准引用 PRD 章节(可选)" "${PRD_REF:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 7: 架构合规 (原 6, 9, 14, 18 合并)
#
# Anthropic 决策: 原则 3 "安全边际" — --no-verify 是逃生舱，但不能变成常态。
#   DiagnosticModule 禁止: Sentinel 已替代旧的模块注册系统。新模块必须走 Sentinel 接口。
#   专家配置校验: YAML 中的 tool/skill 引用必须真实存在——引用断裂 = 运行时崩溃。
#   --no-verify 审计: 24h 内使用 ≥3 次 → 硬阻断。逃生舱可以临时用，但不能连续用。
#         连续绕过门禁意味着门禁本身有问题（太慢/误杀太多）或开发者有问题（偷懒）。
#   v3.6 把 pre-commit 从 20 项减到 8 组 (<8s) 就是为了消除"门禁太慢"这个绕过理由。
#   数据流自检: 路由文件含硬编码业务数据但无真实 API 调用 → 可能是静态 mock 未被替换。
#   历史: DiagnosticModule 注册表已删除但引用未清理 (agent-tool-registry.ts:386
#         listModules() 运行时崩溃)。--no-verify 在 v2.5 被频繁使用 (38 项检查 90s)。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 7/8: 架构合规 ──${RESET}"

# 7a. DiagnosticModule 禁止 (原 6)
NEW_DIAG=$(git diff --cached -- "*.ts" "*.js" 2>/dev/null | grep "^+.*DiagnosticModule" | grep -Ev "scripts/pre-commit-check.sh|.md|.html|//|@deprecated|import type|^+++|hard_check|禁止新 DiagnosticModule|不要再使用 DiagnosticModule" || true)
hard_check "禁止 DiagnosticModule: 新模块须实现 Sentinel 接口" "${NEW_DIAG:-}"

# 7b. 专家配置校验 (原 9)
if bash "$ROOT/scripts/validate-expert-config.sh" 2>&1; then
  echo -e "  ${GREEN}✅ 专家配置校验${RESET}"
else
  echo -e "  ${RED}❌ 专家配置校验: yaml 引用断裂  [硬阻断]${RESET}"
  HARD_FAIL=$((HARD_FAIL + 1))
fi

# 7c. V3.7 双日志审计 — 门禁故障 vs 人为绕过分离
#   门禁故障日志 → 用于发现门禁本身的 bug（误报率 = 门禁需要修）
#   绕过日志     → 用于发现开发者绕过模式（频繁绕过 = 门禁太重/开发者偷懒）
FAILURE_LOG="$ROOT/.claude/pre-commit-failures.log"
BYPASS_LOG="$ROOT/.claude/bypass.log"

# ── 门禁故障审计 (警告不阻断) ──
FAILURE_COUNT=0
if [ -f "$FAILURE_LOG" ]; then
  YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
  FAILURE_COUNT=$(grep -c "$YESTERDAY\|$(date +%Y-%m-%d)" "$FAILURE_LOG" 2>/dev/null | tr -d '\r' || echo 0)
  FAILURE_COUNT=${FAILURE_COUNT//[^0-9]/}
  [ -z "$FAILURE_COUNT" ] && FAILURE_COUNT=0
fi
if [ "${FAILURE_COUNT:-0}" -gt 10 ]; then
  echo -e "  ${YELLOW}⚠️  门禁故障审计: 24h 内 pre-commit 失败 ${FAILURE_COUNT} 次 — 门禁可能太激进 [警告]${RESET}"
  echo "    高失败率意味着门禁本身有 bug 或太敏感。请检查误报来源。"
elif [ "${FAILURE_COUNT:-0}" -gt 0 ]; then
  echo -e "  ${GREEN}✅ 门禁故障审计 (24h: ${FAILURE_COUNT} failures)${RESET}"
else
  echo -e "  ${GREEN}✅ 门禁故障审计${RESET}"
fi

# ── 绕过审计 (硬阻断) ──
# 检测方法: post-commit hook 检测 --no-verify 并写入 bypass.log
BYPASS_COUNT=0
if [ -f "$BYPASS_LOG" ]; then
  BYPASS_COUNT=$(grep -c "$(date +%Y-%m-%d)" "$BYPASS_LOG" 2>/dev/null | tr -d '\r' || echo 0)
  BYPASS_COUNT=${BYPASS_COUNT//[^0-9]/}
  [ -z "$BYPASS_COUNT" ] && BYPASS_COUNT=0
fi
if [ "${BYPASS_COUNT:-0}" -ge 3 ]; then
  echo -e "  ${RED}❌ 绕过审计: 24h 内 --no-verify ${BYPASS_COUNT} 次 — 已超限  [硬阻断]${RESET}"
  echo "    连续使用 --no-verify 超过 2 次后，第 3 次起必须修复根因而非绕过"
  HARD_FAIL=$((HARD_FAIL + 1))
elif [ "${BYPASS_COUNT:-0}" -ge 2 ]; then
  echo -e "  ${YELLOW}⚠️  绕过审计: 24h 内 --no-verify ${BYPASS_COUNT} 次 — 警告${RESET}"
else
  echo -e "  ${GREEN}✅ 绕过审计${RESET}"
fi

# 7d. 数据流自检 (原 18)
STAGED_ROUTES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '^src/routes/.*\.ts$' | grep -v '.test.' || true)
DATA_FLOW_FAIL=""
if [ -n "$STAGED_ROUTES" ]; then
  for rf in $STAGED_ROUTES; do
    [ -z "$rf" ] && continue; [ ! -f "$rf" ] && continue
    HAS_API=$(grep -c "fetch(\|await.*import\|getDatabase()\|\.search(\|\.list(\|\.recall(" "$rf" 2>/dev/null || echo 0)
    HAS_HARD=$(grep -c "'marketing'\|'sales'\|'finance'\|'研发部'\|'市场部'\|'销售部'" "$rf" 2>/dev/null || echo 0)
    if [ "${HAS_API:-0}" -eq 0 ] && [ "${HAS_HARD:-0}" -gt 0 ]; then
      DATA_FLOW_FAIL="${DATA_FLOW_FAIL}  ${rf}: 含硬编码业务数据但无 API 调用 — 可能为静态模板\n"
    fi
  done
fi
hard_check "数据流: 路由文件须含 API 调用证据" "${DATA_FLOW_FAIL:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 8: 🆕 文件驱动架构完整性 (v3.6 新增 — 调用 check-file-driven.sh)
#
# Anthropic 决策: 原则 2 "先设计验证标准" — 这是整个 V3.6 最关键的架构新增。
#   "文件驱动"是 SynovaAgent 的核心架构承诺——新行业/新本体类型/新 LLM/新 IM 平台
#   全部零代码接入。如果这个承诺没有物理执法，它就和被声称完成 4 次的 engine-core
#   拆分一样——只存在于文档里。
#   这组检查的哲学: 不是"相信开发者会遵守文件驱动"，而是"让违反文件驱动在物理上不可能"。
#   详细检查清单见 check-file-driven.sh 头部注释。
#   历史: 这一组阻止的是"未来必然会发生的事故"——基于 engine-core 拆分欺诈的模式推演。
#         同样的模式: 声称文件驱动 → 有人为了方便在 src/ 加了个 enum → 没人发现 →
#         越来越多硬编码回归 → 一年后文件驱动只剩文档里的空壳。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 8/8: 文件驱动架构完整性 (v3.6 新增) ──${RESET}"
bash "$ROOT/scripts/check-file-driven.sh"
[ $? -ne 0 ] && HARD_FAIL=$((HARD_FAIL + 1))

# ═══════════════════════════════════════════════════════════════════
# 结果
# ═══════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$HARD_FAIL" -gt 0 ]; then
  echo -e "  ${RED}❌ ${HARD_FAIL} 组未通过 — 提交已拒绝${RESET}"
  [ "$WARN_COUNT" -gt 0 ] && echo -e "  ${YELLOW}⚠️  ${WARN_COUNT} 项警告${RESET}"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}✅ 全部 8 组通过${RESET}"
  [ "$WARN_COUNT" -gt 0 ] && echo -e "  ${YELLOW}⚠️  ${WARN_COUNT} 项警告 (不阻断)${RESET}"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  exit 0
fi
