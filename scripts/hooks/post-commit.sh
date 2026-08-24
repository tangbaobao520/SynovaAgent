#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# hooks/post-commit.sh — V4.5.1 提交后处理
#
# 被 .git/hooks/post-commit 调用 (通过 core.hooksPath 或委托脚本)。
# 所有 session 共用同一份，修改即同步。
# ═══════════════════════════════════════════════════════════════════════════════
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MARKER="$ROOT/.claude/last-precommit-success"

# ═══ --no-verify 绕过检测 (D366 head 对账 + D421 CT-29 分场景三判) ═══
# marker 格式 (install-hooks.sh pre-commit 写): <pre-commit 时 HEAD>|<epoch 秒>
# 判定 (三判, 消除 CT-29 并发/amend 误报):
#   ① marker_head == HEAD^                        → 常规 commit (pass)
#   ② marker_head^  == HEAD^                      → amend/同父兄弟 (pass)
#   ③ merge-base --is-ancestor marker_head HEAD   → 并发覆盖, marker 仍是祖先 (pass)
#   都不满足                                      → detected-bypass
# 收紧补偿: 三判统一做新鲜度校验 (marker 时间戳 vs HEAD 提交时间差 >300s → possible-bypass),
#          防真 --no-verify 停在旧 marker 时被 ③ 祖先对账误判 pass。
# legacy 纯时间戳 (旧 install-hooks 过渡期) → 旧语义, 但不 rm
# root commit (无 HEAD^) → 显式降级, 不误报
FRESHNESS_SEC=300
if [ -f "$MARKER" ]; then
  RAW=$(cat "$MARKER" | tr -d '[:space:]')
  if echo "$RAW" | grep -q '|'; then
    MARKER_HEAD="${RAW%%|*}"
    MARKER_TS="${RAW##*|}"
    PARENT=$(git rev-parse HEAD^ 2>/dev/null || true)
    HEAD_CT=$(git show -s --format=%ct HEAD 2>/dev/null || echo 0)
    if [ -z "$PARENT" ]; then
      # root commit (无 parent) — 无法对账, 显式降级 (不误报)
      echo "  ⚠️  post-commit: root commit (无 HEAD^) — 跳过 bypass 判定" >&2
    elif [ -n "$MARKER_HEAD" ]; then
      PASS_WAY=0
      if [ "$MARKER_HEAD" = "$PARENT" ]; then
        PASS_WAY=1   # ① 常规
      elif [ "$(git rev-parse "${MARKER_HEAD}^" 2>/dev/null || true)" = "$PARENT" ]; then
        PASS_WAY=2   # ② amend/同父兄弟
      elif git merge-base --is-ancestor "$MARKER_HEAD" HEAD 2>/dev/null; then # swallow-ok: 非祖先=条件假(合法分支), 错误静默可接受
        PASS_WAY=3   # ③ 并发覆盖 (marker 仍是 HEAD 祖先)
      fi
      if [ "$PASS_WAY" -ne 0 ]; then
        # 新鲜度校验 (三判统一): marker 时间戳相对 HEAD 提交时间过旧 → possible-bypass
        case "$MARKER_TS" in
          ''|*[!0-9]*) : ;;   # 时间戳缺失/非数字 → 跳过新鲜度检查
          *) DIFF=$((HEAD_CT - MARKER_TS))
             if [ "$DIFF" -gt "$FRESHNESS_SEC" ]; then
               echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) possible-bypass diff=${DIFF}s" >> "$ROOT/.claude/bypass.log"
             fi ;;
        esac
        # pass — D366: 不 rm, marker 只由 pre-commit 覆盖 (并发 session 互不误删)

        # ═══ D521/不变量2: COMMITTED 登记（hook 层——commit 后立即成对登记，树永干净）═══
        # 病根: D508 登记只在 synova-commit 路径且在 commit 后追加 → bypass.log 永脏 →
        #   挡 merge → 逼裸 git → 对账失败 → D451 补记循环（D520 复盘病根 2）。
        # 解法: 任何 commit（裸 git / synova-commit）过检后，hook 立即把本提交 HASH 的
        #   COMMITTED 行追加 + 成对登记提交（marker message 防递归）——bypass.log 永不脏。
        # 只在 PASS_WAY≠0（pre-commit 真跑过）时登记；--no-verify 提交不登记（不洗白绕过）。
        LAST_MSG=$(git log -1 --format=%s 2>/dev/null || true)
        case "$LAST_MSG" in
          *"bypass COMMITTED 登记"*) : ;;  # 登记提交自身 → 跳过（防递归）
          *)
            HASH_NOW=$(git rev-parse HEAD 2>/dev/null || true)
            if [ -n "$HASH_NOW" ]; then
              echo "$(date -Iseconds) | COMMITTED | pre-commit PASS (hook 层登记) | HASH=$HASH_NOW" >> "$ROOT/.claude/bypass.log"
              if git add "$ROOT/.claude/bypass.log" 2>/dev/null &&                  git commit --no-verify -q -m "chore: bypass COMMITTED 登记 (auto hook, D521)" 2>/dev/null; then
                :  # 登记提交完成——bypass.log 保持干净
              else
                echo "  ⚠️  post-commit: bypass 登记提交失败（identity 未配置?）— 降级，对账时按 D451 补记" >&2
              fi
            fi
            ;;
        esac
      else
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) detected-bypass head-mismatch marker=$MARKER_HEAD parent=$PARENT" >> "$ROOT/.claude/bypass.log"
      fi
    fi
  else
    # legacy 纯时间戳格式 (旧 install-hooks 写 date +%s) — 旧语义, 但不 rm
    LAST="$RAW"
    NOW=$(date +%s)
    case "$LAST" in
      ''|*[!0-9]*) : ;;
      *) DIFF=$((NOW - LAST))
         if [ "$DIFF" -gt "$FRESHNESS_SEC" ]; then
           echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) possible-bypass diff=${DIFF}s" >> "$ROOT/.claude/bypass.log"
         fi ;;
    esac
  fi
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) detected-bypass no-precommit-marker" >> "$ROOT/.claude/bypass.log"
fi

# V4.5.1: STATE.md 已移除。证据链由 git log 提供。
# 不再写入 STATE.md。

# ═══ D210: 外部审计器 — 提交后自动扫描 ═══
AUDITOR="$ROOT/scripts/control-tower/external-auditor.sh"
if [ -f "$AUDITOR" ]; then
  # D421: grep -oP 在 macOS BSD grep 无 -P → TASK_ID 恒 unknown (D334 双机残留)
  # 改 portable: grep -oE 'D[0-9]+' 提取 "D411" → tr 剥 D → "411"
  TASK_ID=$(git log -1 --pretty=%B | head -1 | grep -oE 'D[0-9]+' | head -1 | tr -d 'D' || true)
  [ -n "$TASK_ID" ] || TASK_ID="unknown"
  bash "$AUDITOR" --task-id "D${TASK_ID}" --diff HEAD~1..HEAD 2>&1 | tail -3
fi

# ═══ D256: 审计器统一入口 — 提交后自动 --dispatch ═══
if [ -f "$AUDITOR" ]; then
  bash "$AUDITOR" --dispatch 2>&1 | tail -3
fi

# ═══ 决策流程 ═══
bash "$ROOT/scripts/workflow/decide-next.sh" 2>/dev/null &
exit 0
