 #!/bin/bash
 # Loop Engineering V4.5.0 — Post-Merge Cleanup
 #
 # 在 git merge 到 main 后运行。扫描并报告:
 #   1. 残留 TODO/FIXME (无对应 Issue 编号的)
 #   2. 废弃的函数/export (grep 零引用)
 #   3. 旧文件残留 (已知迁移后的旧路径)
 #   4. 过期 task brief (超过 30 天未归档)
 #   5. memory/ 中过时文件
 #
 # L1 模式 (默认): 仅报告, 不自动修改。
 # 用法: bash scripts/workflow/post-merge-cleanup.sh [--report]
 
 set -euo pipefail
 
 RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
 SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
 ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
 
 REPORT_ONLY=true
 [ "${1:-}" = "--fix" ] && REPORT_ONLY=false
 
 ISSUES=0
 
 echo ""
 echo -e "${CYAN}Loop Engineering V4.5.0 — Post-Merge Cleanup${RESET}"
 echo -e "${CYAN}模式: $( $REPORT_ONLY && echo 'L1 仅报告' || echo 'L2 自动清理' )${RESET}"
 echo ""
 
 # 1. 残留 TODO/FIXME (无 Issue 编号)
 echo -e "${CYAN}--- 1. 残留 TODO/FIXME ---${RESET}"
 ORPHAN_TODOS=$(grep -rn "TODO\|FIXME" src/ tests/ --include="*.ts" 2>/dev/null \
   | grep -v "TODO(#\|FIXME(#\|TODO\[#\|FIXME\[#" \
   | grep -v "// TODO: remove\|// FIXME: cleanup" \
   | head -20 || true)
 if [ -n "$ORPHAN_TODOS" ]; then
   echo -e "${YELLOW}发现无 Issue 编号的 TODO/FIXME:${RESET}"
   echo "$ORPHAN_TODOS" | while read -r line; do echo "  $line"; done
   ISSUES=$((ISSUES + 1))
 else
   echo -e "  ${GREEN}无残留 TODO/FIXME${RESET}"
 fi
 echo ""
 
 # 2. 过期 task brief (超过 30 天)
 echo -e "${CYAN}--- 2. 过期 Task Brief ---${RESET}"
 BRIEF_DIR="$ROOT/.claude/task-briefs"
 if [ -d "$BRIEF_DIR" ]; then
   OLD_BRIEFS=$(find "$BRIEF_DIR" -name "*.md" -mtime +30 -type f 2>/dev/null | head -20 || true)
   if [ -n "$OLD_BRIEFS" ]; then
     COUNT=$(echo "$OLD_BRIEFS" | grep -c . 2>/dev/null || echo 0)
     echo -e "${YELLOW}发现 ${COUNT} 个超过 30 天的 task brief:${RESET}"
     echo "$OLD_BRIEFS" | while read -r f; do echo "  $(basename "$f")"; done
     if [ "$REPORT_ONLY" = false ]; then
       echo -e "  ${CYAN}归档到 .claude/task-briefs/archive/${RESET}"
       mkdir -p "$BRIEF_DIR/archive"
       echo "$OLD_BRIEFS" | while read -r f; do mv "$f" "$BRIEF_DIR/archive/" 2>/dev/null; done
       echo -e "  ${GREEN}已归档${RESET}"
     else
       echo -e "  ${YELLOW}运行 --fix 自动归档${RESET}"
     fi
     ISSUES=$((ISSUES + 1))
   else
     echo -e "  ${GREEN}无过期 task brief${RESET}"
   fi
 fi
 echo ""
 
 # 3. 废弃函数引用的旧路径 (来自已知迁移)
 echo -e "${CYAN}--- 3. 已知迁移路径残留 ---${RESET}"
 KNOWN_MIGRATIONS=(
   "src/l4/engine-graph-store.ts:packages/graph-store"
   "packages/diagnosis-engine/src/graph-store.ts:packages/graph-store"
 )
 MIGRATION_ISSUES=""
 for mapping in "${KNOWN_MIGRATIONS[@]}"; do
   OLD_PATH="${mapping%%:*}"
   if [ -f "$ROOT/$OLD_PATH" ]; then
     MIGRATION_ISSUES="${MIGRATION_ISSUES}  旧文件仍存在: ${OLD_PATH}\n"
   fi
 done
 if [ -n "$MIGRATION_ISSUES" ]; then
   echo -e "${YELLOW}发现已知迁移的旧文件残留:${RESET}"
   echo -e "$MIGRATION_ISSUES"
   ISSUES=$((ISSUES + 1))
 else
   echo -e "  ${GREEN}已知迁移路径已清理${RESET}"
 fi
 echo ""
 
 # 4. 大型未引用文件 (>200行 且在 server.ts/routes/ 中无引用)
 echo -e "${CYAN}--- 4. 潜在死代码 (大文件零引用) ---${RESET}"
 UNREFERENCED=""
 while IFS= read -r file; do
   [ -z "$file" ] && continue
   LINES=$(wc -l < "$file" 2>/dev/null | tr -d ' ')
   if [ "${LINES:-0}" -gt 200 ]; then
     BASENAME=$(basename "$file" .ts)
     REFS=$(grep -rn "\b${BASENAME}\b" src/server.ts src/routes/ src/index.ts src/cli.ts --include="*.ts" 2>/dev/null | grep -v "import.*${BASENAME}" | grep -v "//.*${BASENAME}" | head -1 || true)
     if [ -z "$REFS" ]; then
       UNREFERENCED="${UNREFERENCED}  ${file} (${LINES} 行)\n"
     fi
   fi
 done < <(find "$ROOT/src" -name "*.ts" -not -name "*.test.ts" -not -name "*.d.ts" -type f 2>/dev/null)
 
 if [ -n "$UNREFERENCED" ]; then
   echo -e "${YELLOW}大文件在生产入口中零引用:${RESET}"
   echo -e "$UNREFERENCED"
   ISSUES=$((ISSUES + 1))
 else
   echo -e "  ${GREEN}无大型死代码文件${RESET}"
 fi
 
 # 结果
 echo ""
 echo "=========================================="
 if [ "$ISSUES" -eq 0 ]; then
   echo -e "${GREEN}Post-Merge Cleanup: 未发现问题${RESET}"
 else
   echo -e "${YELLOW}Post-Merge Cleanup: 发现 ${ISSUES} 类问题${RESET}"
   if [ "$REPORT_ONLY" = true ]; then
     echo "运行 'bash scripts/workflow/post-merge-cleanup.sh --fix' 自动清理 (仅安全项)"
   fi
 fi
 echo "=========================================="
 exit 0
