#!/usr/bin/env bash
# tests/control-tower/task-start.test.sh — D513 配对（U7/CT-40）：恢复写 current-brief
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S="$HERE/../../scripts/workflow/task-start.sh"
[ -f "$S" ] || S="$HERE/../../scripts/control-tower/task-start.sh"
if grep -q "current-brief" "$S"; then echo "  ✅ task-start: 恢复写 current-brief 已接线"; exit 0; else echo "  ❌ 缺失"; exit 1; fi
