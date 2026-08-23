#!/usr/bin/env bash
# tests/control-tower/hook-block-write.test.sh — D513 配对（U7/CT-40）：ls -t 取最新
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S="$HERE/../../scripts/workflow/hook-block-write.sh"
[ -f "$S" ] || S="$HERE/../../scripts/control-tower/hook-block-write.sh"
if grep -q "ls -t" "$S"; then echo "  ✅ hook-block-write: ls -t 取最新 已接线"; exit 0; else echo "  ❌ 缺失"; exit 1; fi
