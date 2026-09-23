#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# merge-pr-queue.test.sh — D920 合并队列推进器（根因1/根因2 回归防线）
#
# 覆盖矩阵（铁律 48 三路径 + 契约）:
#   根因1 工作树参数空 → resolve_worktree 必须**报错**（绝不回落主工作区）
#   根因1 命中已有工作树 / 未命中→约定新路径（两者区分）
#   根因2 DIRTY 二义 → merge-tree 有冲突=DIRTY_CONFLICT（点名文件）/ 无冲突=DIRTY_STALE（推 re-merge）
#   正常路径 — 全绿+mergeable → READY；merged → MERGED
#   降级 — 失败检查 → BAD；mergeable=null → UNKNOWN（不当作 READY）
#   契约 — 脚本头含 @input/@exit/@degraded（铁律 47）
# 沙箱: 全部夹具 JSON 在 mktemp -d；零网络（--fixture-* 注入缝）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
S="$REPO/scripts/control-tower/merge-pr-queue.py"
PY="$(command -v python3 || command -v python || true)"
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

if [ -z "$PY" ]; then echo "  ⚠️ python 不可用 — 跳过（fail-open，铁律 11 显式）"; exit 0; fi
[ -f "$S" ] || { echo "  ❌ 被测脚本缺失: $S"; exit 1; }

echo "=== D920 合并队列推进器 ==="

# ── 契约（铁律 47）──
echo "── 契约 ──"
grep -q "@input" "$S" && grep -q "@exit" "$S" && grep -q "@degraded" "$S" \
  && ok "契约: @input/@exit/@degraded 三要素齐备" || no "契约: 三要素缺失"

# ── 根因1: 工作树参数空 → 必须报错（绝不回落主工作区）──
echo "── 根因1: 工作树解析 ──"
PORC="$TMPD/porcelain.txt"
cat > "$PORC" <<'EOF'
worktree /Users/wane/SynovaAgent
HEAD 18e8652c
branch refs/heads/main

worktree /Users/wane/SynovaAgent/.synova-wt-d919
HEAD 1b911728
branch refs/heads/fix/d919-citation-gate
EOF
OUT=$("$PY" "$S" --fixture-worktree "$PORC" --fixture-branch "fix/d919-citation-gate" 2>&1)
echo "$OUT" | grep -q ".synova-wt-d919" && ok "命中已有工作树（按分支反查）" || no "未命中已有工作树: $OUT"

OUT2=$("$PY" "$S" --fixture-worktree "$PORC" --fixture-branch "fix/不存在" 2>&1)
echo "$OUT2" | grep -q "synova-wt-pr999" && ok "未命中 → 约定新建路径（显式，不回落主工作区）" || no "未命中未给新建路径: $OUT2"

OUT3=$("$PY" "$S" --fixture-worktree "$PORC" --fixture-branch "" 2>&1); RC3=$?
echo "$OUT3" | grep -q '"error": null' && no "根因1 回归: 空分支名未报错（会回落主工作区）" || ok "根因1 防线: 空分支名 → 显式 error（exit ${RC3}）"

# ── 根因2: DIRTY 二义 ──
echo "── 根因2: DIRTY 二义（真冲突 vs 缓存过期）──"
cat > "$TMPD/fx_conflict.json" <<'EOF'
{"pr": {"state": "open", "merged": false, "mergeable": false, "mergeable_state": "dirty"},
 "check_runs": [{"name": "CI", "status": "completed", "conclusion": "success"}],
 "mergetree": "deadbeef\nCONFLICT (content): Merge conflict in task-state/D821.json\n"}
EOF
OUT=$("$PY" "$S" --fixture-classify "$TMPD/fx_conflict.json" 2>&1)
echo "$OUT" | grep -q "DIRTY_CONFLICT" && echo "$OUT" | grep -q "task-state/D821.json" \
  && ok "真冲突 → DIRTY_CONFLICT + 点名冲突文件（不再「等 GitHub 重算」）" || no "真冲突未识别: $OUT"

cat > "$TMPD/fx_stale.json" <<'EOF'
{"pr": {"state": "open", "merged": false, "mergeable": false, "mergeable_state": "dirty"},
 "check_runs": [{"name": "CI", "status": "completed", "conclusion": "success"}],
 "mergetree": "deadbeef\n"}
EOF
OUT=$("$PY" "$S" --fixture-classify "$TMPD/fx_stale.json" 2>&1)
echo "$OUT" | grep -q "DIRTY_STALE" && ok "缓存过期 → DIRTY_STALE（处置=推 re-merge 强制重算）" || no "缓存过期未识别: $OUT"

# ── 正常路径 ──
echo "── 正常 ──"
cat > "$TMPD/fx_ready.json" <<'EOF'
{"pr": {"state": "open", "merged": false, "mergeable": true, "mergeable_state": "clean"},
 "check_runs": [{"name": "CI", "status": "completed", "conclusion": "success"},
                {"name": "X", "status": "completed", "conclusion": "skipped"}]}
EOF
OUT=$("$PY" "$S" --fixture-classify "$TMPD/fx_ready.json" 2>&1)
echo "$OUT" | grep -q '"state": "READY"' && ok "CI 全绿 + mergeable=true → READY" || no "READY 判定失败: $OUT"

cat > "$TMPD/fx_merged.json" <<'EOF'
{"pr": {"state": "closed", "merged": true, "mergeable": null}, "check_runs": []}
EOF
OUT=$("$PY" "$S" --fixture-classify "$TMPD/fx_merged.json" 2>&1)
echo "$OUT" | grep -q '"state": "MERGED"' && ok "已合并 → MERGED（幂等跳过）" || no "MERGED 判定失败: $OUT"

# ── 降级 ──
echo "── 降级（不静默）──"
cat > "$TMPD/fx_bad.json" <<'EOF'
{"pr": {"state": "open", "merged": false, "mergeable": true},
 "check_runs": [{"name": "Gate", "status": "completed", "conclusion": "failure"}]}
EOF
OUT=$("$PY" "$S" --fixture-classify "$TMPD/fx_bad.json" 2>&1)
echo "$OUT" | grep -q '"state": "BAD"' && echo "$OUT" | grep -q "Gate" \
  && ok "失败检查 → BAD + 点名（不是 READY）" || no "BAD 判定失败: $OUT"

cat > "$TMPD/fx_unknown.json" <<'EOF'
{"pr": {"state": "open", "merged": false, "mergeable": null}, "check_runs": []}
EOF
OUT=$("$PY" "$S" --fixture-classify "$TMPD/fx_unknown.json" 2>&1)
echo "$OUT" | grep -q '"state": "UNKNOWN"' && ok "mergeable=null → UNKNOWN（GitHub 计算中，绝不当作 READY）" || no "UNKNOWN 判定失败: $OUT"

"$PY" "$S" --fixture-classify "$TMPD/不存在.json" >/dev/null 2>&1; RC=$?
[ "$RC" -eq 2 ] && ok "降级: fixture 不可读 → exit 2（fail-closed）" || no "降级: 期望 exit 2 实得 $RC"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
