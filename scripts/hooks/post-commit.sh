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

# ═══ D735 Stage 2（D970）: bypass 账本单一落点 = per-session（旧路径已出库）═══
# 契约(铁律 47):
#   @input  — stdin 一行证据文本
#   @output — 追加到 $ROOT/.sessions/<sid>/bypass.log（.gitignore 已忽略 → 零 git status 变更）
#   @degraded — 写入失败 → stderr 显式点名 + .claude/degraded-events.log 留痕；
#               **不回退旧路径**（Stage 2 已停写 .claude/bypass.log）——fail-closed 不静默，
#               该提交将在 push 时被 D331（check-bypass-log.sh）以 exit 1 拦下。
_bypass_append() {
  local line out rc
  line="$(cat)"
  out="$(bash "$ROOT/scripts/control-tower/bypass-ledger.sh" append "$line" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "  ❌ post-commit: bypass 账本写入失败 (exit=$rc): $out" >&2
    echo "      Stage 2 单落点 ⇒ 无旧路径可回退，本次证据未登记（D331 将在 push 时 fail-closed）" >&2
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) post-commit degraded: bypass 账本写入失败 (exit=$rc) line=$(printf '%s' "$line" | cut -c1-80)" >> "$ROOT/.claude/degraded-events.log" 2>/dev/null || true
  fi
}

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
# ═══ CT-45: merge 提交跳过 bypass 判定 ═══
# merge 提交（HEAD 有第二 parent：本地 git merge 冲突解决后 commit / GitHub PR merge 同步拉取）不经
# 本地 pre-commit hook 或 marker 语义不同（冲突解决 + 门禁拦截时常以 --no-verify 完成 merge commit）——
# 写 detected-bypass 会污染今日计数 → Gatekeeper 熔断同日其他 session 的合法提交（D524 实证：98c5ceff 熔断 D524）。
# 判定: git rev-parse HEAD^2 存在 = 第二 parent 存在 = merge commit。
MERGE_COMMIT=0
if git rev-parse HEAD^2 >/dev/null 2>&1; then
  MERGE_COMMIT=1
fi
if [ "$MERGE_COMMIT" = "1" ]; then
  # merge 提交——合法豁免 bypass 判定（CT-45，语义同 D328 commit-msg MERGE_HEAD 豁免）
  :
else
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
               echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) possible-bypass diff=${DIFF}s" | _bypass_append
             fi ;;
        esac
        # pass — D366: 不 rm, marker 只由 pre-commit 覆盖 (并发 session 互不误删)

        # ═══ D521/不变量2: COMMITTED 登记（hook 层）═══
        # Stage 2（D970）变更: 登记只落 per-session 账本（_bypass_append）；**影子登记提交已删除**
        #   —— 影子提交的唯一目的是让被跟踪的 .claude/bypass.log「永不脏」，旧路径出库后该目的消失，
        #   保留只会产生「登记提交失败」噪音（git add 对已忽略文件必然失败）。
        # 只在 PASS_WAY≠0（pre-commit 真跑过）时登记；--no-verify 提交不登记（不洗白绕过）。
        HASH_NOW=$(git rev-parse HEAD 2>/dev/null || true)
        if [ -n "$HASH_NOW" ]; then
          # 幂等: 同一 HEAD 只登记一次。旧代码靠「影子提交 message 递归守卫」顺带防重；
          #   Stage 2 删除影子提交后守卫一并消失 ⇒ 迟到/重复 post-commit（同一 HEAD 二次触发，
          #   见 post-commit-marker.test.sh S6）会重复登记，故这里显式做幂等判定。
          if bash "$ROOT/scripts/control-tower/bypass-ledger.sh" read 2>/dev/null | grep -qF "HASH=$HASH_NOW"; then
            :  # 已登记 → 跳过（幂等）
          else
            echo "$(date -Iseconds) | COMMITTED | pre-commit PASS (hook 层登记) | HASH=$HASH_NOW" | _bypass_append
          fi
        fi
      else
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) detected-bypass head-mismatch marker=$MARKER_HEAD parent=$PARENT" | _bypass_append
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
           echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) possible-bypass diff=${DIFF}s" | _bypass_append
         fi ;;
    esac
  fi
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) detected-bypass no-precommit-marker" | _bypass_append
fi
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
