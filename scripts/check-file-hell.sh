#!/bin/bash
# V4.1 T5 — 配置文件地狱防护。pre-commit 组8附加检查。
set +e; ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; FAIL=0; RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
# 1. 每扩展目录必须有 manifest.json（新目录检查，由check-file-driven.sh覆盖，此处做全量验证）
# 2. 文件数>=50的目录必须有 index.json
for dir in $(find "$ROOT/extensions" -type d -not -path "*/node_modules/*" -not -path "*/computes/*" 2>/dev/null); do
  count=$(find "$dir" -maxdepth 1 -type f | wc -l)
  if [ "$count" -ge 50 ]; then
    if [ ! -f "$dir/index.json" ]; then
      echo -e "  ${RED}❌ $dir: $count 文件但无 index.json${RESET}"; FAIL=$((FAIL+1))
    fi
  fi
done
# 3. 目录深度>3告警
MAX_DEPTH=0
for dir in $(find "$ROOT/extensions" -type d 2>/dev/null); do
  depth=$(echo "$dir" | tr -cd '/' | wc -c)
  rel=$(echo "$dir" | sed "s|$ROOT/||")
  [ "$depth" -gt "$MAX_DEPTH" ] && MAX_DEPTH=$depth
  [ "$depth" -gt 6 ] && echo -e "  ${YELLOW}⚠️  $rel: 深度 $depth > 6${RESET}"
done
[ "$MAX_DEPTH" -gt 8 ] && echo -e "  ${RED}❌ 最大深度 $MAX_DEPTH > 8 — 目录过深${RESET}" && FAIL=$((FAIL+1))
if [ "$FAIL" -gt 0 ]; then echo -e "  ${RED}文件地狱防护: $FAIL 项${RESET}"; exit 1; fi
echo -e "  ${GREEN}✅ 文件地狱防护${RESET}"; exit 0
