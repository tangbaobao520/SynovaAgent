#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 铁律 39: 五层架构边界检查
# 检测跨层 import 违规 + 多租户安全
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
FAIL=0

echo ""
echo "═══ 架构边界检查 (铁律 39) ═══"
echo ""

# ═══ 1. L2→L4 跨层引用 ═══
# L2 (agent/, orchestrator/) 不得直接 import L4 (l4/)
# 例外: ConversationEngine + engine-context 是设计的 L2↔L4 桥接层
#       diagnosis-launcher 通过 engine-context 访问 L4 (DI 注入, 非直接依赖)
L2_L4=$(grep -rn "from.*l4/" src/agent/ src/orchestrator/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "conversation-engine.ts\|engine-context.ts\|diagnosis-launcher.ts\|knowledge-bridge-service.ts\|review-service.ts\|sentinel-health-service.ts" \
  || true)
L2_L4_COUNT=$(echo "$L2_L4" | grep -c . 2>/dev/null) || L2_L4_COUNT=0

if [ "$L2_L4_COUNT" -gt 0 ]; then
  echo -e "  ${RED}❌ L2→L4 跨层引用: ${L2_L4_COUNT} 处${RESET}"
  echo "$L2_L4" | while read -r line; do echo "     ${line}"; done
  echo "     铁律 39: L2 只能通过 L3 访问 L4。当前例外需标注原因。"
  FAIL=$((FAIL + 1))
else
  echo -e "  ${GREEN}✅ L2→L4 边界: 无直接引用${RESET}"
fi

# ═══ 1b. L1→L3 跨层引用 ═══
# L1 (routes/ / server.ts) 不得直接 import L3 (l3/ / sentinel/ / evidence/ / expert/)
L1_L3=$(grep -rn "from.*\.\.\/l3\/\|from.*\/sentinel\/\|from.*\/evidence\/\|from.*\/expert\/" src/routes/ src/server.ts --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "agent-observer\|//.*L1.*L3\|铁律.*39" \
  || true)
L1_L3_COUNT=$(echo "$L1_L3" | grep -c . 2>/dev/null) || L1_L3_COUNT=0
if [ "${L1_L3_COUNT:-0}" -gt 0 ]; then
  echo -e "  ${RED}❌ L1→L3 跨层引用: ${L1_L3_COUNT} 处${RESET}"
  echo "$L1_L3" | while read -r line; do echo "     ${line}"; done
  echo "     铁律 39: L1 只能依赖 L2。sentinel/l3/evidence/expert 是 L3 层。"
  echo "     正确做法: L1 → L2 (synova-agent.ts / conversation-engine.ts) → L3"
  FAIL=$((FAIL + 1))
else
  echo -e "  ${GREEN}✅ L1→L3 边界: 无直接引用${RESET}"
fi

# ═══ 1c. L1→L4 跨层引用 ═══
# L1 不得直接 import L4 (GraphStore / KnowledgeStore / l4/)
L1_L4=$(grep -rn "from.*\.\.\/l4\/\|from.*GraphStore\|from.*KnowledgeStore" src/routes/ src/server.ts --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "//.*L1.*L4\|铁律.*39" \
  || true)
L1_L4_COUNT=$(echo "$L1_L4" | grep -c . 2>/dev/null) || L1_L4_COUNT=0
if [ "${L1_L4_COUNT:-0}" -gt 0 ]; then
  echo -e "  ${RED}❌ L1→L4 跨层引用: ${L1_L4_COUNT} 处${RESET}"
  echo "$L1_L4" | while read -r line; do echo "     ${line}"; done
  echo "     铁律 39: L1 不得直接访问 L4。必须通过 L2 编排层。"
  FAIL=$((FAIL + 1))
else
  echo -e "  ${GREEN}✅ L1→L4 边界: 无直接引用${RESET}"
fi

# ═══ 1d. L1→L5 跨层引用 ═══
# L1 不得直接操作数据库 (better-sqlite3 / db.prepare)
L1_L5=$(grep -rn "better-sqlite3\|\.prepare(\|db\.run\|db\.exec" src/routes/ src/server.ts --include="*.ts" 2>/dev/null \
  | grep -v "import type" | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "//.*DI\|//.*注入\|铁律.*39" \
  || true)
L1_L5_COUNT=$(echo "$L1_L5" | grep -c . 2>/dev/null) || L1_L5_COUNT=0
if [ "${L1_L5_COUNT:-0}" -gt 0 ]; then
  echo -e "  ${RED}❌ L1→L5 跨层引用: ${L1_L5_COUNT} 处${RESET}"
  echo "$L1_L5" | while read -r line; do echo "     ${line}"; done
  echo "     铁律 39: L1 不得直接操作数据库。必须通过 L4 接口。"
  FAIL=$((FAIL + 1))
else
  echo -e "  ${GREEN}✅ L1→L5 边界: 无直接数据库操作${RESET}"
fi

# ═══ 2. L3→L5 跨层引用 ═══
# L3 (l3/) 不得直接操作数据库 (.prepare / db.run / db.exec / better-sqlite3)
# 例外: import { getDatabase } 是 DI 注入, 用于构造 L4 实例 (new KnowledgeStore(getDatabase()))
L3_DB=$(grep -rn "better-sqlite3\|\.prepare(\|db\.run\|\.exec(" src/l3/ --include="*.ts" 2>/dev/null \
  | grep -v "import type" \
  | grep -v "import { KnowledgeStore }" \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "executeQuery\|//.*bridge\|//.*query" \
  || true)
L3_DB_COUNT=$(echo "$L3_DB" | grep -c . 2>/dev/null) || L3_DB_COUNT=0

if [ "$L3_DB_COUNT" -gt 0 ]; then
  echo -e "  ${RED}❌ L3→L5 跨层引用: ${L3_DB_COUNT} 处${RESET}"
  echo "$L3_DB" | while read -r line; do echo "     ${line}"; done
  echo "     铁律 39: L3 不得直接操作数据库，必须通过 L4 接口。"
  FAIL=$((FAIL + 1))
else
  echo -e "  ${GREEN}✅ L3→L5 边界: 无直接数据库操作${RESET}"
fi

# ═══ 3. GraphStore 接口声明唯一性 ═══
# 只允许 graph-bridge.ts 声明 GraphStore。禁止在其他文件新增声明。
GS_DECLARATIONS=$(grep -rn "export interface GraphStore " src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." || true)
GS_COUNT=$(echo "$GS_DECLARATIONS" | grep -c . 2>/dev/null) || GS_COUNT=0
if [ "$GS_COUNT" -gt 1 ]; then
  echo -e "  ${RED}❌ GraphStore 接口多处声明: ${GS_COUNT} 处${RESET}"
  echo "$GS_DECLARATIONS" | while read -r line; do echo "     ${line}"; done
  echo "     铁律 39: GraphStore 只允许在一处声明 (graph-bridge.ts 或 engine-core)"
  FAIL=$((FAIL + 1))
elif [ "$GS_COUNT" -eq 1 ]; then
  echo -e "  ${YELLOW}⚠  GraphStore 在 graph-bridge.ts 声明 (1处, 与 engine-core 镜像)${RESET}"
  echo "     运行: npx vitest run tests/architecture/graphstore-compatibility.test.ts"
else
  echo -e "  ${GREEN}✅ GraphStore 接口: 未声明 (应从 engine-core 导入)${RESET}"
fi

# ═══ 4. Anthropic 标准: engine-core vendor 目录的 Critical 问题不得延期 ═══
# SOG-001: deleteNode 物理删除 — 违反双时序原则
SOG_DELETE=$(grep -n "DELETE FROM graph_nodes" packages/engine-core/src/pipeline/diagnosis/graph-store.ts 2>/dev/null || true)
if [ -n "$SOG_DELETE" ]; then
  echo -e "  ${RED}🔴 SOG-001: engine-core deleteNode 仍为物理删除 (graph-store.ts)$RESET"
  echo "     DELETE FROM graph_nodes 违反双时序'永不删除'原则"
  echo "     Anthropic 标准: vendor 代码的 Critical bug 同样是产品 bug, 不得延期"
  FAIL=$((FAIL + 1))
fi

# ═══ 5. 多租户安全: graph 参数传递 ═══
# 检测 L4 查询方法调用是否存在省略 graph 参数的模式
# 这是一个 heuristic 检查，精确验证靠 code review
MISSING_GRAPH=$(grep -rn "queryNodes\|queryEdges" src/l4/ --include="*.ts" 2>/dev/null \
  | grep -v "graph" \
  | grep -v "node_modules" | grep -v "\.test\." \
  || true)
MISSING_GRAPH_COUNT=$(echo "$MISSING_GRAPH" | grep -c . 2>/dev/null) || MISSING_GRAPH_COUNT=0

if [ "$MISSING_GRAPH_COUNT" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠  多租户安全: ${MISSING_GRAPH_COUNT} 处 queryNodes/queryEdges 调用待审查 graph 参数${RESET}"
else
  echo -e "  ${GREEN}✅ 多租户安全: query 调用均传递 graph${RESET}"
fi

echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}架构检查: ${FAIL} 项违规 — 修复后重试 commit${RESET}"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}架构检查: 全部通过 ✅${RESET}"
  echo ""
  exit 0
fi
