#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 铁律自动化门禁 — pre-commit 硬阻断 + 存量警告
# 用法: bash scripts/pre-commit-check.sh
# hard-block: as any / Mock-TODO / CJS require / .only / .env leak / branch
#   + TUI铁律: ink patch缺失 / 过度Pipeline / flex-end / React.memo缺失
# warning: empty catch (存量问题, 不阻断但可见)
#   + TUI铁律: for-ch-of无sleep / finishStreaming顺序 / 注释*/
# ═══════════════════════════════════════════════════════════════════════════════
# set -euo pipefail — 关闭, Windows bash 下子进程 spawn 开销导致某些 grep 管线超时
# 每个检查独立容错, 失败不中断整体流程
set +e

HARD_PASS=0; HARD_FAIL=0
WARN_COUNT=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

count_lines() {
  local input="$1"
  [ -z "$input" ] && echo 0 || echo "$input" | wc -l | tr -d ' '
}

hard_check() {
  local name="$1" matches="$2"
  local count; count=$(count_lines "$matches")
  if [ "$count" -gt 0 ]; then
    echo -e "  ${RED}❌ ${name}: ${count} 处  [硬阻断]${RESET}"
    echo "$matches" | while read -r line; do echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
    HARD_PASS=$((HARD_PASS + 1))
  fi
}

warn_check() {
  local name="$1" matches="$2"
  local count; count=$(count_lines "$matches")
  if [ "$count" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠  ${name}: ${count} 处  [存量警告, 非阻断]${RESET}"
    WARN_COUNT=$((WARN_COUNT + count))
    return 0  # never block
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
    return 0
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  铁律自动化门禁 (Iron Law Automated Checks)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════
# 门禁 ⓪: 任务开始决策树 (硬阻断)
# Anthropic 铁律 0-2: 做任务前必须先跑决策树，生成 task brief。
# 没有今日 task brief = 你不知道自己在做什么 = 不准提交。
# ═══════════════════════════════════════════════════════════
ROOT="$(git rev-parse --show-toplevel)"
TODAY=$(date +%Y-%m-%d)
TODAY_BRIEF=$(find "$ROOT/.claude/task-briefs/" -name "${TODAY}*" 2>/dev/null | head -1)
if [ -z "$TODAY_BRIEF" ]; then
  hard_check "铁律 0-2: 今日无 task brief — 节点① 未执行" \
    "运行: bash scripts/workflow/task-start.sh \"你的任务描述\""
else
  # 质量检查: "用户旅程" 和 "Done 标准" 必须填写，不能是模板占位符
  BRIEF_QUALITY=""
  # 用户旅程: 排除 HTML 注释占位符后检查是否有实际内容
  JOURNEY_CONTENT=$(grep -A3 "用户旅程" "$TODAY_BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | tr -d ' \n\r\t' || true)
  if [ -z "$JOURNEY_CONTENT" ] || [ ${#JOURNEY_CONTENT} -lt 10 ]; then
    BRIEF_QUALITY="${BRIEF_QUALITY}  用户旅程 字段为空或未填写\n"
  fi
  # Done 标准: 检查是否有勾选框或实际内容
  DONE_CONTENT=$(grep -A5 "Done 标准" "$TODAY_BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | tr -d ' \n\r\t' || true)
  if [ -z "$DONE_CONTENT" ] || [ ${#DONE_CONTENT} -lt 10 ]; then
    BRIEF_QUALITY="${BRIEF_QUALITY}  Done 标准 字段为空或未填写\n"
  fi
  if [ -n "$BRIEF_QUALITY" ]; then
    hard_check "铁律 0-2: Task Brief 质量 — 必填字段未填写 (${TODAY_BRIEF})" "${BRIEF_QUALITY}"
  else
    echo -e "  ${GREEN}✅ 铁律 0-2: Task Brief 存在且已填写 (${TODAY_BRIEF})${RESET}"
  fi
fi

# ═══════════════════════════════════════════════════════════
# 门禁 ①: SPEC 先行 (硬阻断)
# Anthropic 铁律 0-2 Step 1: 没有 spec 的代码不准进仓库。
# 所有分支强制 (main 除外——main 只接受 merge)。
# ═══════════════════════════════════════════════════════════
bash "$(dirname "$0")/workflow/check-spec.sh" || { HARD_FAIL=$((HARD_FAIL + 1)); }
echo ""

# ═══════════════════════════════════════════════════════════
# 门禁 ②: 测试先行 (硬阻断)
# Anthropic 铁律 0-2 Step 2: 每个 public 函数 ≥ 1 个测试用例。
# 新增 ts 文件必须有对应测试引用——否则拒绝提交。
# ═══════════════════════════════════════════════════════════
bash "$(dirname "$0")/workflow/check-test-first.sh" || { HARD_FAIL=$((HARD_FAIL + 1)); }
echo ""

# ═══════════════════════════════════════════════════════════
# 门禁 ②b: 设计文档强制 (硬阻断, feat/ 分支)
# Anthropic 铁律 2: 设计文档中每个能力必须带"触发定义"和"结果呈现"。
# feat/ 分支必须有设计文档，且含触发定义 + 结果呈现两个必填字段。
# ═══════════════════════════════════════════════════════════
if echo "$BRANCH" | grep -qE '^feat/'; then
  DESIGN_FILE=""
  for candidate in \
    "$ROOT/docs/specs/${BRANCH//\//-}.md" \
    "$ROOT/docs/research/${BRANCH//\//-}.md" \
    "$ROOT/docs/research/${BRANCH//\//-}.html"; do
    if [ -f "$candidate" ]; then DESIGN_FILE="$candidate"; break; fi
  done
  if [ -z "$DESIGN_FILE" ]; then
    # 检查 git diff 中是否有新建设计文档
    DESIGN_IN_DIFF=$(git diff --cached --name-only 2>/dev/null | grep "^docs/" || true)
    if [ -z "$DESIGN_IN_DIFF" ]; then
      hard_check "铁律 2: feat/ 分支缺少设计文档" \
        "在 docs/specs/ 或 docs/research/ 下创建设计文档（含触发定义+结果呈现）"
    fi
  else
    # 检查设计文档是否包含"触发定义"和"结果呈现"
    MISSING_FIELDS=""
    if ! grep -qi "触发定义\|触发方式\|谁来触发\|trigger" "$DESIGN_FILE" 2>/dev/null; then
      MISSING_FIELDS="${MISSING_FIELDS}  缺少 '触发定义' (谁来触发？何时触发？触发入口？)\n"
    fi
    if ! grep -qi "结果呈现\|用户.*看到\|result.*present\|display\|呈现" "$DESIGN_FILE" 2>/dev/null; then
      MISSING_FIELDS="${MISSING_FIELDS}  缺少 '结果呈现' (用户在哪看到？什么形式？)\n"
    fi
    if [ -n "$MISSING_FIELDS" ]; then
      hard_check "铁律 2: 设计文档缺少必填字段 (${DESIGN_FILE})" "${MISSING_FIELDS}"
    else
      echo -e "  ${GREEN}✅ 铁律 2: 设计文档存在且完整 (${DESIGN_FILE})${RESET}"
    fi
  fi
fi
echo ""

# ═══════════════════════════════════════════════════════════
# 硬阻断 (Hard Block) — 违反直接拒绝 commit
# ═══════════════════════════════════════════════════════════
echo "── 硬阻断 ──────────────────────────────────────────────"

# 铁律 38: as any 零容忍 — \b 单词边界覆盖所有语法位置 (行尾/空格/标点)
M=$(grep -rn -E 'as any\b' src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "\.d\.ts" | grep -v '//\|/\*\*' || true)
hard_check "铁律 38: as any 零容忍" "$M"

# 铁律 8: Mock/TODO 残留
M=$(grep -rn "MOCK_\|TODO.*后期\|TODO.*替换\|TODO.*hardcode" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "MOCK_残留" || true)
hard_check "铁律 8: Mock/TODO 残留" "$M"

# 铁律 9: CJS require() — 统一用 ESM import
M=$(grep -rn "require(" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "\.d\.ts" | grep -v "import(" || true)
hard_check "铁律 9: CJS require() 残留" "$M"

# vitest .only()/.skip() — 不得进入 CI
M=$(grep -rn "\.only(\|\.skip(" tests/ --include="*.ts" 2>/dev/null | grep -v "node_modules" || true)
hard_check "vitest .only()/.skip() 残留" "$M"

# .env 安全检查 — 只在 .env 被暂存时才阻断
M=""
if git diff --cached --name-only 2>/dev/null | grep -q "^\.env$"; then
  if [ -f .env ] && grep -q "sk-\|ApiKey.*[a-f0-9]\{20\}" .env 2>/dev/null; then
    M=".env 已暂存且包含疑似真实 API Key — 撤销 git add .env"
  fi
fi
hard_check "P0-01: .env 不含真实 API Key (仅当暂存时)" "$M"

# Secrets 扫描: 源码中不得硬编码 API Key/Token/Password — 硬阻断
bash "$(dirname "$0")/check-secrets.sh"
SECRETS_EXIT=$?
if [ $SECRETS_EXIT -ne 0 ]; then
  HARD_FAIL=$((HARD_FAIL + 1))
fi
# 安全检查: eval() / new Function() / HTTP 明文 — 硬阻断
bash "$(dirname "$0")/check-security.sh"
SEC_EXIT=$?
if [ $SEC_EXIT -ne 0 ]; then
  HARD_FAIL=$((HARD_FAIL + 1))
fi

# 铁律 37: 文件大小 — 单文件 >1000 行硬阻断, >500 行警告
# 优化: xargs 批量传递, 避免 -exec wc -l {} \; 逐文件 spawn (43s → <1s)
FILE_SIZES=$(find src/ -name "*.ts" -type f -print0 2>/dev/null | xargs -0 wc -l 2>/dev/null || true)
OVERSIZE=$(echo "$FILE_SIZES" | awk '$1 > 1000 && $2 != "total" {print $2": "$1" lines"}' || true)
hard_check "铁律 37: 单文件 >1000 行" "$OVERSIZE"

LARGE=$(echo "$FILE_SIZES" | awk '$1 > 500 && $1 <= 1000 && $2 != "total" {print $2": "$1" lines"}' || true)
warn_check "铁律 37: 单文件 >500 行 (建议拆分)" "$LARGE"

# 铁律 33: 新测试文件命名 — 新增 test 文件必须含 .test. 或 .spec.
NEW_TESTS=$(git diff --cached --name-only --diff-filter=A 2>/dev/null \
  | grep "^tests/" | grep "\.ts$" | grep -v "\.test\.\|\.spec\.\|\.integration\.\|\.e2e\." || true)
hard_check "铁律 33: 新测试文件命名不符合规范" "$NEW_TESTS"

# Anthropic 标准: 禁止 "pre-existing" / "known failure" 标记 (反模式)
PRE_EXISTING=$(grep -rn "pre.existing\|known.failure\|FIXME.*test\|skip.*broken\|TODO.*fix.*test" tests/ src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" || true)
hard_check "Anthropic: 禁止 pre-existing/known-failure 标记" "$PRE_EXISTING"

# ═══ 铁律 0-2: 单模块提交 ═══
# 一次 commit 最多 1 个新 impl 文件（非 test / .d.ts / 辅助文件）
NEW_IMPL=$(git diff --cached --name-only --diff-filter=A 2>/dev/null \
  | grep "^src/" | grep "\.ts$" | grep -v "\.test\." | grep -v "\.d\.ts" \
  | grep -v "types\.ts$\|index\.ts$\|helpers\.ts$\|builtins\.ts$" || true)
NEW_IMPL_COUNT=$(echo "$NEW_IMPL" | grep -c . 2>/dev/null) || NEW_IMPL_COUNT=0
if [ "${NEW_IMPL_COUNT:-0}" -gt 1 ]; then
  hard_check "铁律 0-2: 单模块提交 — 1 次最多 1 个新 impl 文件 (当前 ${NEW_IMPL_COUNT})" "$NEW_IMPL"
fi

# ═══ 铁律 0-2: 新文件配对 — impl 必须同 commit 有 test ═══
IMPL_PAIRS=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r impl; do
    [ -z "$impl" ] && continue
    test_path=$(echo "$impl" | sed 's|^src/|tests/|; s|\.ts$|.test.ts|')
    if ! git diff --cached --name-only 2>/dev/null | grep -q "^${test_path}$"; then
      # 检查测试文件是否已存在（存量测试覆盖）
      if [ ! -f "$test_path" ]; then
        IMPL_PAIRS="${IMPL_PAIRS}${impl} → 缺少 ${test_path}\n"
      fi
    fi
  done <<< "$NEW_IMPL"
fi
if [ -n "$IMPL_PAIRS" ]; then
  hard_check "铁律 0-2: 新文件配对 — impl 必须同 commit 有 test" "$IMPL_PAIRS"
fi

# ═══ 铁律 0-2 Step 5: 接线审计 — 新文件 export 必须接入生产入口 ═══
# 每个新生产文件中的 export function/class/const 必须出现在入口文件引用中
UNWIRED_EXPORTS=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      # 跳过 mock/fake/internal/deprecated/type
      if echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated\|^[A-Z].*Props$\|^[A-Z].*Config$\|^[A-Z].*State$'; then continue; fi
      # 检查是否在入口文件中有引用 (排除 export 行自身和 import 行)
      WIRED=$(grep -rn "\b${name}\b" src/server.ts src/index.ts src/cli.ts src/agent/ src/routes/ src/sentinel/builtins.ts --include="*.ts" 2>/dev/null \
        | grep -v "export.*${name}" | grep -v "import.*${name}" | grep -v "$file" | head -1 || true)
      if [ -z "$WIRED" ]; then
        UNWIRED_EXPORTS="${UNWIRED_EXPORTS}${file}: export ${name} — 未在生产入口中接线\n"
      fi
    done
  done <<< "$NEW_IMPL"
fi
if [ -n "$UNWIRED_EXPORTS" ]; then
  hard_check "铁律 0-2 Step 5: 接线审计 — 新 export 未接线" "${UNWIRED_EXPORTS}"
fi

# ═══ 铁律 24+31: 空 catch 无 log — 硬阻断 ═══
RAW_CATCH=$(grep -rn "catch\s*{" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." || true)
EMPTY_CATCH_BLOCK=""
if [ -n "$RAW_CATCH" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    LINE_NUM=$(echo "$line" | cut -d: -f2)
    CTX=$(sed -n "${LINE_NUM},$((LINE_NUM + 2))p" "$FILE" 2>/dev/null || echo "")
    # 本行+后续2行无 log./logger./console. → 空吞
    if ! echo "$CTX" | grep -q "log\.\|logger\.\|console\."; then
      if ! echo "$CTX" | grep -q "JSON.parse\|ENOENT\|\.destroy\|\.end\|\.detach\|setRawMode\|best-effort\|already closed\|keep original\|return '0\|items\s*=\|initEngineContext\|getDatabase\|return "; then
        EMPTY_CATCH_BLOCK="${EMPTY_CATCH_BLOCK}${FILE}:${LINE_NUM}: 空 catch (无 log)\n"
      fi
    fi
  done <<< "$RAW_CATCH"
fi
hard_check "铁律 24+31: 空 catch 无 log (静默吞异常)" "${EMPTY_CATCH_BLOCK:-}"

# ═══ 铁律 0-2 Step 4: src/ tsc 零错误 ═══
TSC_OUT=$(npx tsc --noEmit 2>&1 | grep "^src/" || true)
TSC_COUNT=$(echo "$TSC_OUT" | grep -c . 2>/dev/null) || TSC_COUNT=0
hard_check "铁律 0-2: src/ tsc 零错误 (当前 ${TSC_COUNT})" "${TSC_OUT:-}"

# ═══ 禁止 --no-verify 绕过 ═══
NV_LOG=".git/no-verify.log"
NV_TODAY=$(grep -c "$(date +%Y-%m-%d)" "$NV_LOG" 2>/dev/null) || NV_TODAY=0
if [ "${NV_TODAY:-0}" -ge 2 ]; then
  hard_check "铁律 34: 禁止 --no-verify 连续使用 (今日已 ${NV_TODAY} 次)" "24h 内禁止提交 — 修复所有硬阻断后再试"
fi

# ═══ 自动化诚实门禁 ═══
# P1-2: DiagnosticModule 已 @deprecated — 禁止新增注册 (铁律 35: 编译器级阻断)
# 基线: 6 处 registerModule() (通用/FDE — 营销/SOG v1 空壳已清理 P1-3)
DM_COUNT=$(grep -c "registerModule(" packages/engine-core/src/pipeline/diagnosis/module-registry.ts 2>/dev/null) || DM_COUNT=0
if [ "${DM_COUNT:-0}" -gt 6 ]; then
  hard_check "P1-2: 新增 DiagnosticModule 注册 (已 @deprecated → 迁移到 Sentinel 接口)" "发现 ${DM_COUNT} 处 (基线 6)"
fi
if [ "${DM_COUNT:-0}" -eq 6 ]; then
  echo -e "  ${GREEN}✅ P1-2: DiagnosticModule 注册数保持基线 (6)${RESET}"
fi

# 每处违规 = 硬阻断。不靠 CLAUDE.md 提醒，靠编译器级强制执行。
bash "$(dirname "$0")/check-reality.sh" || { echo -e "  ${RED}❌ 诚实门禁: 存在违规项${RESET}"; HARD_FAIL=$((HARD_FAIL + 1)); }
echo ""
	# ═══ Loop Engineering v2.5: 空壳模块检测 ═══
	bash "$(dirname "$0")/checks/check-empty-modules.sh"
	if [ $? -ne 0 ]; then HARD_FAIL=$((HARD_FAIL + 1)); fi
	echo ""

	# ═══ Loop Engineering v2.5: 测试质量检测 ═══
	bash "$(dirname "$0")/checks/check-test-quality.sh"
	if [ $? -ne 0 ]; then HARD_FAIL=$((HARD_FAIL + 1)); fi
	echo ""

# Anthropic 标准: engine-core vendor Critical bug 不得延期
SOG_DELETE=$(grep -n "DELETE FROM graph_nodes" packages/engine-core/src/pipeline/diagnosis/graph-store.ts 2>/dev/null || true)
hard_check "Anthropic: SOG-001 deleteNode 物理删除 (不得延期)" "$SOG_DELETE"

# 铁律 34: 分支命名 — feat/ fix/ chore/ docs/ test/ refactor/
BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
if echo "$BRANCH" | grep -qE '^(feat|fix|chore|docs|test|refactor|perf|ci)/'; then
  M=""
elif [ "$BRANCH" = "main" ]; then
  M="main 分支 — 铁律 34 要求 feature branch (警告, 非阻断)"
else
  M="分支名 '$BRANCH' 不符合规范 — 应为 feat/ fix/ chore/ 前缀"
fi
if [ "$BRANCH" = "main" ]; then
  warn_check "铁律 34: 分支命名" "$M"
else
  hard_check "铁律 34: 分支命名" "$M"
fi

echo ""

# ═══════════════════════════════════════════════════════════
# 铁律 40-45: TUI V2 铁律 (2026-06-07)
# ═══════════════════════════════════════════════════════════
echo "── TUI V2 铁律 ─────────────────────────────────────────"

# 铁律 40: 闪烁修复不可回退 — ink patch 必须存在
PATCH_FILE=$(find patches/ -name "ink+*.patch" 2>/dev/null | head -1)
if [ -z "$PATCH_FILE" ]; then
  M="patches/ 目录缺少 ink patch 文件"
  hard_check "铁律 40-1: ink patch 缺失" "$M"
else
  hard_check "铁律 40-1: ink patch 存在" ""
fi
M=$(grep -rn '"postinstall".*patch-package' package.json 2>/dev/null || true)
if [ -z "$M" ]; then
  hard_check "铁律 40-2: postinstall: patch-package" "MISSING"
else
  hard_check "铁律 40-2: postinstall: patch-package" ""
fi

# 铁律 40-3: React.memo 在 Message/StreamingText 上
M=$(grep -rn "export function Message\|export function StreamingText" src/tui-v2/ --include="*.tsx" 2>/dev/null | grep -v "React.memo" || true)
hard_check "铁律 40-3: Message/StreamingText 缺少 React.memo" "$M"

# 铁律 41: 流式 Pipeline 简单直接 — 禁止在 hook 中使用过度工程化的类
# streaming.ts 中定义这些类是允许的,但 use-streaming.ts 中不能导入使用
M=$(grep -rn "LineBuffer\|FrameRateLimiter\|StreamChunker" src/tui-v2/hooks/use-streaming.ts 2>/dev/null || true)
hard_check "铁律 41: use-streaming.ts 中禁止 LineBuffer/FrameRateLimiter/StreamChunker" "$M"

# 铁律 42: 逐字流必须有延迟 (简化检查: for-ch-of 行无 sleep 则警告)
M=$(grep -n "for.*const ch of" src/agent/tool-loop-executor.ts 2>/dev/null || true)
M_SLEEP=""
if [ -n "$M" ]; then
  while IFS= read -r line 2>/dev/null || true; do
    [ -z "$line" ] && continue
    linenum=$(echo "$line" | cut -d: -f1)
    [ -z "$linenum" ] && continue
    # 检查下 5 行内是否有 sleep
    if ! sed -n "$((linenum+1)),$((linenum+5))p" src/agent/tool-loop-executor.ts 2>/dev/null | grep -q "sleep"; then
      M_SLEEP="${M_SLEEP}tool-loop-executor.ts:${linenum}: for-ch-of 后缺少 sleep(5)\n"
    fi
  done <<< "$M"
fi
warn_check "铁律 42: for-ch-of 无 sleep(5) 延迟" "${M_SLEEP:-}"

# 铁律 43: finishStreaming 顺序 — 简化为检查 use-streaming.ts 中顺序
M=$(grep -n "isStreaming.*false\|finishStreaming\|flushBuffer\|addAgentMessage" src/tui-v2/hooks/use-streaming.ts 2>/dev/null || true)
M_ORDER=""
if [ -n "$M" ]; then
  flush_line=$(echo "$M" | grep "flushBuffer" | head -1 | cut -d: -f1)
  msg_line=$(echo "$M" | grep "addAgentMessage" | head -1 | cut -d: -f1)
  state_line=$(echo "$M" | grep "isStreaming.*false" | head -1 | cut -d: -f1)
  if [ -n "$flush_line" ] && [ -n "$state_line" ] && [ "$flush_line" -gt "$state_line" ]; then
    M_ORDER="use-streaming.ts: flushBuffer(${flush_line}) 应在 isStreaming=false(${state_line}) 之前"
  fi
fi
warn_check "铁律 43: finishStreaming 顺序 (flushBuffer→addAgent→isStreaming=false)" "${M_ORDER:-}"

# 铁律 44: 禁止 justifyContent="flex-end"
M=$(grep -rn 'justifyContent.*flex-end\|justifyContent.*"flex-end"' src/tui-v2/ --include="*.tsx" 2>/dev/null || true)
hard_check "铁律 44: 禁止 justifyContent=flex-end" "$M"

# 铁律 45: 注释中 */ 必须加空格
M=$(grep -rn '\*/\|\*/' src/tui-v2/ --include="*.tsx" 2>/dev/null \
  | grep -v '^[^:]*:[^:]*:.*//' \
  | grep -v 'export \* from\|import.*\*' \
  | grep -v 'endsWith.*\*/\|\.\*\/' \
  | grep -v '\* /\|/ \*' || true)
warn_check "铁律 45: 注释中 */ 未加空格 (esbuild 兼容)" "$M"

echo ""

# ═══════════════════════════════════════════════════════════
# 存量警告 (Warning) — 不阻断，但每次 commit 可见
# ═══════════════════════════════════════════════════════════
echo "── 警告 ────────────────────────────────────────────────"

# 铁律 11: 服务端代码禁止 console.log — 必须用 logger
M=$(grep -rn "console\.log\|console\.error" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "src/cli\.ts\|src/setup\.ts\|src/tui/" \
  || true)
hard_check "铁律 11: console.log 残留 (非CLI/TUI)" "$M"

# 铁律 11+24+31: 空 catch (无 log 且无注释)
M=$(grep -rn "catch\s*{" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "log\." \
  | grep -v "JSON\.parse\|ENOENT" \
  | grep -v "/\*\|//" \
  | grep -v "_reading\|setRawMode\|\.destroy()\|\.end()\|\.detach" \
  | grep -v "return '0" \
  || true)
# 二次过滤: 下一行有 log → 不算
M=$(echo "$M" | while read -r line; do
  file=$(echo "$line" | cut -d: -f1)
  linenum=$(echo "$line" | cut -d: -f2)
  next=$((linenum + 1))
  # Skip if next line has log OR comment OR return/assignment (JSON.parse fallback)
  if sed -n "${next}p" "$file" 2>/dev/null | grep -qE "log\.|//|/\*|items\s*=|return "; then continue; fi
  echo "$line"
done || true)
warn_check "铁律 11+24+31: 空 catch (静默吞)" "$M"

# 技术债务追踪 (TECH_DEBT.md) — 警告不阻断
bash "$(dirname "$0")/check-tech-debt.sh" 2>/dev/null || echo "  ⚠ 技术债务检查跳过"

# ═══════════════════════════════════════════════════════════
# 数据流对账 — 警告 (检查代码改动是否含 task brief 数据流关键词)
# ═══════════════════════════════════════════════════════════
bash "$(dirname "$0")/workflow/check-dataflow-alignment.sh" 2>/dev/null || true

# ═══════════════════════════════════════════════════════════
# Anthropic 决策树 — 每次 commit 强制执行 (铁律 0-2)
# 完整版: vitest + tsc + 架构 + 接线审计 + 铁律全集
# 不设 timeout — 让门禁跑完。15 秒的等待是质量的最低成本。
# ═══════════════════════════════════════════════════════════
echo ""
echo "── Anthropic 决策树 ────────────────────────────────────"
bash "$(dirname "$0")/anthropic-decide.sh"
DECIDE_EXIT=$?
if [ $DECIDE_EXIT -ne 0 ]; then
  echo -e "  ${RED}❌ Anthropic 决策树: 未通过 — 提交已拒绝${RESET}"
  HARD_FAIL=$((HARD_FAIL + 1))
else
  echo -e "  ${GREEN}✅ Anthropic 决策树: 通过${RESET}"
fi

# 铁律 39: 架构边界检查 — 硬阻断，不超时跳过
bash "$(dirname "$0")/check-architecture.sh"
ARCH_EXIT=$?
if [ $ARCH_EXIT -ne 0 ]; then
  HARD_FAIL=$((HARD_FAIL + 1))
fi
	# ═══ Loop Engineering v2.5: 手册漂移检测 ═══
	bash "$(dirname "$0")/checks/check-manual-drift.sh"
	if [ $? -ne 0 ]; then HARD_FAIL=$((HARD_FAIL + 1)); fi
	echo ""

	# ═══ Loop Engineering v2.5: 全量接线审计 ═══
	bash "$(dirname "$0")/checks/check-wire-full.sh"
	WIRE_EXIT=$?
	if [ $WIRE_EXIT -ne 0 ]; then HARD_FAIL=$((HARD_FAIL + 1)); fi

	# ═══ Loop Engineering v2.5: 垂直切片完整性 ═══
	bash "$(dirname "$0")/checks/check-vertical-slice.sh"
	if [ $? -ne 0 ]; then HARD_FAIL=$((HARD_FAIL + 1)); fi
echo ""
echo "───────────────────────────────────────────────────────────"

# ═══ 结果 ═══
if [ "$HARD_FAIL" -gt 0 ]; then
  echo -e "  ${RED}硬阻断: ${HARD_FAIL} 项未通过 — 提交已拒绝${RESET}"
  if [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}警告: ${WARN_COUNT} 处存量问题 (不阻断)${RESET}"
  fi
  echo ""
  echo "  修复硬阻断项后重试。替代方案见 CLAUDE.md。"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}硬阻断: 全部通过 ✅${RESET}"
  if [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}警告: ${WARN_COUNT} 处存量问题 (不阻断, 建议修复)${RESET}"
  fi
  echo ""
  exit 0
fi
