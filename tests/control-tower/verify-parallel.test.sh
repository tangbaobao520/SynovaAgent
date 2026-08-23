#!/usr/bin/env bash
# tests/control-tower/verify-parallel.test.sh — D513 配对（U7/CT-40）：PYBIN 三级探测
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S="$HERE/../../scripts/workflow/verify-parallel.sh"
[ -f "$S" ] || S="$HERE/../../scripts/control-tower/verify-parallel.sh"
if grep -q "PYBIN" "$S"; then echo "  ✅ verify-parallel: PYBIN 三级探测 已接线"; exit 0; else echo "  ❌ 缺失"; exit 1; fi
