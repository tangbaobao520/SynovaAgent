#!/bin/bash
# engine-core 铁律门禁 (EC-11: 对齐 synova-agent 6 硬阻断)
# 用法: bash scripts/pre-commit-check.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

FAIL=0
hard_check() { local label="$1" count="$2"
  if [ "${count:-0}" -gt 0 ]; then echo -e "  ${RED}❌ ${label}: ${count} 处${RESET}"; FAIL=1
  else echo -e "  ${GREEN}✅ ${label}${RESET}"; fi
}

echo "── engine-core 硬阻断 ──────────────────────────────"

# 铁律 38: as any
M=$(grep -rn -E 'as any\b' src/ --include="*.ts" | grep -v "\.test\." | grep -v "\.d\.ts" | grep -v '//\|/\*\*' | wc -l)
hard_check "as any" "$M"

# 铁律 8: Mock/TODO
M=$(grep -rn "MOCK_\|TODO.*后期\|TODO.*替换" src/ --include="*.ts" | grep -v "\.test\." | wc -l)
hard_check "Mock/TODO" "$M"

# 铁律 9: CJS require()
M=$(grep -rn "require(" src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules" | wc -l)
hard_check "CJS require()" "$M"

# 铁律 11+24: 空 catch
M=$(grep -rn "} catch {" src/ --include="*.ts" | grep -v "\.test\." | grep -v "log\." | grep -v "fallthrough\|benign\|nosec" | wc -l)
hard_check "空 catch (静默吞)" "$M"

# .env 泄漏
M=$(grep -rn "sk-\|ghp_\|Bearer" src/ --include="*.ts" | grep -v "example\|placeholder\|your-key" | wc -l)
hard_check "Secrets 泄漏" "$M"

echo "────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then echo -e "  ${GREEN}全部通过 ✅${RESET}"; exit 0
else echo -e "  ${RED}${FAIL} 项未通过 — 修复后重试${RESET}"; exit 1; fi
