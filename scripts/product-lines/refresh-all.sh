#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# refresh-all.sh — 产品进度一键刷新（设计 v1.4 A3+A4+A5 本地链）
#
# 契约:
#   @input  — 无参数；读仓库内 5 个待办源 + product-lines.yaml + 证据目录
#   @output — docs/synova/product-lines/{todos.yaml,product-progress.json,product-progress.html}
#   @exit   — 0 全部成功；非 0 = 对应环节失败（上游失败则中止，fail-closed 不掩盖）
#   @degraded — 各脚本内部显式 log + exit 2 降级（不静默）
#
# 用法: bash scripts/product-lines/refresh-all.sh
# 触发: 本地手动 / CI 周五 cron / push main 事件（见 .github/workflows/product-progress.yml）
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "degraded: 无法进入仓库根目录 $REPO_ROOT" >&2; exit 2; }

PYBIN=""
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1; then PYBIN="$cand"; break; fi
done
if [ -z "$PYBIN" ]; then
  echo "degraded: 找不到 python3（产品进度链无法运行）" >&2
  exit 2
fi

run() {
  local name="$1"; shift
  echo "── $name ─────────────────────────────"
  "$PYBIN" "$@" || { echo "✗ $name 失败（exit $?），链中止" >&2; exit 1; }
  echo "✓ $name 完成"
}

# A3 待办聚合 → A4 进度计算（含 A1 惰性失效）→ A5 页面生成（含 A8 待裁决区）
run "A3 待办聚合"   scripts/product-lines/aggregate-todos.py
# A2 机器验证入库（2026-08-17 创始人: 不调 K3 大模型，机器补完成度）
# vitest 全量绿 → 自动写 test 证据 → calc-progress 消费 → 完成度 🟡待复核
# （K3 U1-U8 管新任务门禁；本环节管旧任务证据回填——互补）
bash scripts/product-lines/run-machine-evidence.sh --skip-vitest || {
  echo "⚠ A2 机器证据降级（不阻断主链，见上方 degraded 说明）" >&2
}
# A3.5 任务交付兑换（2026-08-17 创始人: 完成一个任务就要体现在仪表盘）
# task-state 声明 acceptance_points + impl/audit 闭环 → 自动生成证据记录 → A4 消费翻绿
run "A3.5 任务兑换" scripts/product-lines/redeem-progress.py
run "A4 进度计算"   scripts/product-lines/calc-progress.py
run "A5 页面生成"   scripts/product-lines/gen-progress-page.py

# A6 审计报告 JSON 解析（降级路径: 双轨 D347/D349 未落地 → 显式 degraded 告警，不阻断主链）
echo "── A6 审计报告解析 ─────────────────────────────"
if "$PYBIN" scripts/product-lines/parse-k3-report.py; then
  echo "✓ A6 完成（审计 JSON 已解析 → 重算进度）"
  run "A4 进度重算" scripts/product-lines/calc-progress.py
  run "A5 页面生成" scripts/product-lines/gen-progress-page.py
else
  echo "⚠ A6 降级: 审计 JSON 双轨未落地，当前走人工登记路径（见 README 红线 3）"
fi

# A7 审计复核任务书（线 100% / 每 2 周；无候选 = 正常空跑）
run "A7 审计任务书" scripts/product-lines/gen-k3-task.py

echo "✓ 全部完成。打开 docs/synova/product-lines/product-progress.html"
