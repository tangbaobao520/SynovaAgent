#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-version-guard.sh — 版本守卫（D511，控制塔 V4.10.0，pre-commit 组 14）
#
# 一句话: 门禁文件变更 ⟹ VERSION.md 必须同 commit bump，否则硬阻断（fail-closed）。
# 背景: V4.8.0 后 D467/D501/D503/D506/D507/D508 六批门禁行为变更未 bump（CT-42 第二次
# 违反，创始人指出）。版本管理规范 §四待办机器化——bump 靠记忆必漏，物理强制是唯一解。
#
# 契约 (铁律 47):
#   @input  — STAGED: 暂存文件清单（换行分隔）。注入缝 SYNO_STAGED_FILES 优先（测试沙箱，
#             ctrl-tower-change 模式 5）；缺省 git diff --cached --name-only --diff-filter=ACMR。
#             SYNO_CT_DIR: 控制塔目录覆盖（默认 $ROOT/.codex/control-tower）。
#   @output — exit 0 = 通过（无门禁文件变更 / VERSION.md 同 commit 变更 / 逃生舱）
#             exit 1 = 硬阻断（门禁文件变更且 VERSION.md 无同 commit 变更）
#             exit 2 = 守卫自身降级（git 或 VERSION.md 不可读/不可解析 → fail-closed 拦，
#             不与通过混同，D328 三态 / D331 "检查没跑 ≠ 检查通过"）
#   @degraded — SYNO_SKIP_VERSION_GUARD=1 逃生舱 → exit 0 + 追加 degraded-events.log
#             （铁律 11 静默降级禁止；D508 门禁减负：紧急修复可跳但必须留痕）
#   @error  — 无（纯 bash，全部路径显式退出；本脚本自身不 throw，不吞错）
#
# 检测面（版本管理规范 §一 4 一致，宁紧勿松——注释/文案类门禁改动也需 bump 或走逃生舱）:
#   scripts/control-tower/ | scripts/pre-commit-check.sh | scripts/workflow/
#   | scripts/install-hooks.sh | scripts/hooks/ | scripts/check-*.sh
# 非检测面（不误拦）: src/、docs/、scripts/backup/、scripts/golden-scenarios/、
#   scripts/product-lines/ 等业务/文档脚本——D508 减负精神，零打扰。
# 守卫自身（check-version-guard.sh）不豁免（§5.4-2 结论）: 新建守卫与接线/VERSION.md
#   天然同 commit，无需豁免即全过——避免"豁免自身"成为永久的旁路缺口。
# ╇ 设计: 独立可单测（铁律 35）+ 组 14 一处接线；级别判定不在此（MINOR/PATCH 由
#   VERSION.md 条目内容体现，规范 §二）。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8   # UTF-8 头块（D313 M5，check-silent-swallow --utf8 合规；中文输出防乱码）

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CT_DIR="${SYNO_CT_DIR:-$ROOT/.codex/control-tower}"
VERSION_MD="$CT_DIR/VERSION.md"
DEGRADED_LOG="$CT_DIR/logs/degraded-events.log"
GATE_FILES_RE='^(scripts/control-tower/|scripts/pre-commit-check\.sh|scripts/workflow/|scripts/install-hooks\.sh|scripts/hooks/|scripts/check-[^/]+\.sh)'
VERSION_MD_STAGED_RE='^\.codex/control-tower/VERSION\.md$'

# ── 逃生舱（显式降级，铁律 11：跳过必须留痕，绝不静默）──
if [ "${SYNO_SKIP_VERSION_GUARD:-}" = "1" ]; then
  echo "⚠ 版本守卫跳过（SYNO_SKIP_VERSION_GUARD=1）— 已记录 degraded-events.log"
  mkdir -p "$(dirname "$DEGRADED_LOG")" 2>/dev/null || true
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"component\": \"version-guard\", \"reason\": \"SYNO_SKIP_VERSION_GUARD=1 逃生舱跳过\"}" \
    >> "$DEGRADED_LOG" 2>/dev/null || true
  exit 0
fi

# ── 1. 暂存清单（注入缝优先；git 不可用 → fail-closed，D328）──
if [ -n "${SYNO_STAGED_FILES:-}" ]; then
  STAGED="$SYNO_STAGED_FILES"
else
  STAGED=$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR 2>/dev/null)  # swallow-ok: stderr 丢弃但退出码由下行 GIT_EXIT 捕获 → fail-closed exit 2，非静默
  GIT_EXIT=$?
  if [ $GIT_EXIT -ne 0 ]; then
    echo "❌ 版本守卫降级 (fail-closed, D328/D331): git diff 不可用 (exit=$GIT_EXIT) — 检查没跑 ≠ 检查通过"
    exit 2
  fi
fi

# ── 2. 门禁文件命中检测（零命中 = 零打扰，D508 减负）──
GATE_HITS=$(echo "$STAGED" | grep -E "$GATE_FILES_RE" || true)
if [ -z "$GATE_HITS" ]; then
  echo "无门禁文件变更 — 跳过"
  exit 0
fi

# ── 3. VERSION.md 可解析性（守卫自身健康度，fail-closed；仅在需要判定时）──
if [ ! -r "$VERSION_MD" ] || ! grep -qE '^## V[0-9]+\.[0-9]+\.[0-9]+ ' "$VERSION_MD" 2>/dev/null; then
  echo "❌ 版本守卫降级 (fail-closed, D328/D331): VERSION.md 缺失或不可解析 ($VERSION_MD 无 '## Vx.y.z' 标题)"
  echo "   修复: 确认 .codex/control-tower/VERSION.md 存在且顶部有 '## Vx.y.z (日期)' 条目"
  exit 2
fi

# ── 4. 同 commit bump 检查 ──
if echo "$STAGED" | grep -qE "$VERSION_MD_STAGED_RE"; then
  echo "门禁变更带 VERSION.md 同 commit bump — 通过"
  exit 0
fi

# ── 5. fail-closed: 门禁变更无 bump → 硬阻断 ──
echo "❌ 版本守卫: 门禁文件变更必须同 commit bump VERSION.md（版本管理规范 §一 铁律 2）"
echo "   变更文件: $(echo "$GATE_HITS" | tr '\n' ' ')"
echo "   bump 指引: ①VERSION.md 顶部插 '## Vx.y.z (日期) — 条目'（新增机制/门禁组 = MINOR，判定逻辑改 = PATCH，规范 §二）"
echo "   ②python3 scripts/control-tower/control_tower_log.py version --version x.y.z --changes \"<变更摘要>\" 追加 version.log"
echo "   ③与本次门禁改动同 commit 提交（注释/文案类改动也需 bump 或走 SYNO_SKIP_VERSION_GUARD=1 逃生舱——宁紧勿松，CT-42 教训）"
exit 1
