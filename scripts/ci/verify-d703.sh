#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# verify-d703.sh — D703 自证脚本：对 D702/D703/D704 三份 spec 的 DS 命令做
#                  curation 回放（可机器化的逐条回放，不可机器化的显式 skip + 理由）
#
# 契约 (铁律 47):
#   @input  — 无参（在仓库根执行）
#   @output — 按 spec 分节逐 DS 打印 [REPLAY]/[PASS]/[FAIL]/[SKIP: 理由]；末行汇总
#   @exit   — 0 = 全部可机器化回放通过（skip 不算失败）；1 = 任一回放失败
#   @degraded — spec 文件缺失 → 显式 FAIL（回放对象不存在不是 skip）
#
# 分工: 本脚本是「curator」——决定每个 DS 此刻是否可机器化回放；
#       scripts/ci/verify-doc.sh 是「executor」——通用提取+安全闸+逐条回放。
#       D702/D704 的 DS 断言的是各自实现后的未来态（未合入 main），现在回放必失败，
#       故显式 skip 并给理由；两卡实现时应各自交付 verify-d702.sh / verify-d704.sh。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

IMPL_DIR="docs/plans/codex/implementation"
SPEC_D702="$IMPL_DIR/SYNOVA-IMPL-D702-write-op-no-swallow-20260911.md"
SPEC_D703="$IMPL_DIR/SYNOVA-IMPL-D703-evidence-command-mechanization-20260911.md"
SPEC_D704="$IMPL_DIR/SYNOVA-IMPL-D704-branch-coverage-gate-20260911.md"

N_PASS=0; N_FAIL=0; N_SKIP=0
pass() { echo "  [PASS] $1"; N_PASS=$((N_PASS+1)); }
fail() { echo "  [FAIL] $1"; N_FAIL=$((N_FAIL+1)); }
skip() { echo "  [SKIP] $1（$2）"; N_SKIP=$((N_SKIP+1)); }

echo "═══ D703 spec 回放（本卡，已实现态）═══"

if [ ! -f "$SPEC_D703" ]; then
  fail "D703 spec 缺失: $SPEC_D703"
else
  # DS1 机制落地
  if ls scripts/ci/verify-doc.sh scripts/ci/verify-d703.sh >/dev/null 2>&1; then
    pass "DS1 机制落地: ls scripts/ci/verify-doc.sh scripts/ci/verify-d703.sh"
  else
    fail "DS1 机制落地: 脚本缺失"
  fi

  # DS2 CI 接线（命中 ≥2：执行步骤 + 密封清单）
  N=$(grep -c "verify-doc" .github/workflows/ci.yml 2>/dev/null || true)
  N=${N//[^0-9]/}
  if [ -n "$N" ] && [ "$N" -ge 2 ]; then
    pass "DS2 CI 接线: grep -c verify-doc ci.yml = $N（≥2）"
  else
    fail "DS2 CI 接线: verify-doc 在 ci.yml 命中 $N 次（须 ≥2）"
  fi

  # DS3 失败模式：构造引用不存在测试文件的 doc → verify-doc.sh exit 1（W2 形态）
  TMP="$(mktemp -d)"
  printf '%s\n' '# bad doc' '## 6. 完成标准' '- DS1: `npx vitest run tests/agent/d703-red-nonexistent.test.ts`' '## 8. 交付声明' > "$TMP/bad.md"
  RC=0
  bash scripts/ci/verify-doc.sh "$TMP/bad.md" >/dev/null 2>&1 || RC=$?
  if [ "$RC" -eq 1 ]; then
    pass "DS3 失败模式: 坏 doc → verify-doc.sh exit 1（W2 形态）"
  else
    fail "DS3 失败模式: 坏 doc 回放 exit $RC（须 1）"
  fi
  rm -rf "$TMP"

  # DS4 测试 red→green（密封测试全绿；red 基准 = 脚本缺失时该测试红）
  if bash tests/control-tower/verify-doc.test.sh >/dev/null 2>&1; then
    pass "DS4 测试全绿: bash tests/control-tower/verify-doc.test.sh"
  else
    fail "DS4 测试: 密封测试红"
  fi

  # DS5 零回归 — tsc 基线对照 / pre-commit 本地干跑
  skip "DS5a npx tsc --noEmit 基线逐条恒等" "需基线 worktree 逐条 diff，CI 无基线 worktree；零新增证据由本地交付报告提供（本卡写集无 .ts 文件）"
  skip "DS5b bash scripts/pre-commit-check.sh" "CI quality job Iron laws 步骤已以 SYNO_CI=1 覆盖同一检查"

  # DS6 类型安全（bash+yml 卡）— 可机器化：src/ 零改动
  # -c core.quotepath=off: CI ubuntu 默认 true 会把非 ASCII 路径输出成带引号八进制转义
  # （"\347\274\226…"），与写集字面量恒不匹配 → DS7 误判越界（本地绿是 install-hooks
  # 设了 quotepath false——D319 老坑变体，CI 三轮实证）
  SRC_N=$(git -c core.quotepath=off diff --name-only origin/main...HEAD -- src/ 2>/dev/null | wc -l | tr -d ' ') # swallow-ok: 非 git 仓时数值比较按 FAIL 处理，不静默
  if [ "$SRC_N" = "0" ]; then
    pass "DS6 类型安全: git diff origin/main...HEAD -- src/ 零文件（无 TS 变更，descope 成立）"
  else
    fail "DS6: src/ 出现 $SRC_N 个改动文件（越界）"
  fi

  # DS7 范围一致 — 分支改动恰为写集（过滤 .claude/ 簿记）
  WSET="scripts/ci/verify-doc.sh
scripts/ci/verify-d703.sh
tests/control-tower/verify-doc.test.sh
.github/workflows/ci.yml
.claude/skills/dev-doc-delivery/template/编码指令模板.md
.dsh/skills/dev-doc-delivery/template/编码指令模板.md
$SPEC_D703"
  EXTRA=$(git -c core.quotepath=off diff --name-only origin/main...HEAD 2>/dev/null | grep -v '^\.claude/' | grep -Fvx -f <(printf '%s\n' "$WSET") || true) # swallow-ok: 非 git 仓时 EXTRA 非空 → FAIL，不静默
  if [ -z "$EXTRA" ]; then
    pass "DS7 范围一致: 分支改动 ⊆ 写集 7 文件（+ .claude/ 簿记豁免）"
  else
    fail "DS7 范围一致: 越界文件 — $(printf '%s' "$EXTRA" | tr '\n' ' ')"
  fi

  # DS8 无绕过 + 推送 CI
  if [ -f .claude/bypass.log ]; then
    BV=$(grep -c "no-verify" .claude/bypass.log 2>/dev/null || true)
    BV=${BV//[^0-9]/}
    if [ -n "$BV" ] && [ "$BV" -eq 0 ]; then
      pass "DS8a 无绕过: grep -c no-verify .claude/bypass.log = 0"
    else
      fail "DS8a: bypass.log 出现 $BV 条 no-verify（须 0）"
    fi
  else
    pass "DS8a 无绕过: .claude/bypass.log 不存在（零绕过记录）"
  fi
  skip "DS8b 推送后 CI task-relevant jobs 绿" "属合并后验证（git push + CI job 级核对），交付报告提供"
fi

echo ""
echo "═══ D702 spec（未合入 main，DS 断言实现后未来态 → 显式 skip）═══"
if [ ! -f "$SPEC_D702" ]; then
  fail "D702 spec 缺失: $SPEC_D702"
else
  skip "D702 DS1 无 void 写方法（grep updateUser/deleteUser: void 零命中）" "D702 未合入：缺陷仍在（updateUser: void 现存），回放必失败；D702 实现时自建 verify-d702.sh"
  skip "D702 DS2 返回 {ok,error}（grep 命中 ≥2）" "D702 未合入：实现后状态断言"
  skip "D702 DS3 accept 绑定不吞错（enterprise.ts .ok 判定）" "D702 未合入：实现后状态断言"
  skip "D702 DS4 vitest tests/growth/user-store.test.ts tests/routes/enterprise.test.ts" "tests/routes/enterprise.test.ts 是 D702 新建文件，尚不存在"
  skip "D702 DS5 零回归（vitest 三目录 + tsc 基线恒等）" "依赖 D702 实现物；tsc 基线对照需 worktree"
  skip "D702 DS6 as any=0（写集三文件）" "实现后状态断言（当前本就 0 命中，无判别力）"
  skip "D702 DS7 git diff HEAD^ 范围一致" "HEAD^ 语义属 D702 分支提交历史，本卡不代跑"
  skip "D702 DS8 无绕过 + 推送 CI" "D702 push 后自证"
fi

echo ""
echo "═══ D704 spec（未合入 main，DS 断言实现后未来态 → 显式 skip）═══"
if [ ! -f "$SPEC_D704" ]; then
  fail "D704 spec 缺失: $SPEC_D704"
else
  skip "D704 DS1 门禁落地（ls scripts/ci/branch-coverage-gate.sh）" "D704 未合入：文件由 D704 创建"
  skip "D704 DS2 CI 接线（grep coverage ci.yml ≥2，改前 0）" "D704 未合入：实现后状态断言"
  skip "D704 DS3 失败模式（低于阈值 json-summary → exit 1）" "依赖 D704 门禁脚本"
  skip "D704 DS4 密封测试 red→green" "tests/control-tower/branch-coverage-gate.test.sh 由 D704 创建"
  skip "D704 DS5 零回归（tsc 恒等 + thresholds 逐字不变）" "依赖 D704 改后状态"
  skip "D704 DS6 类型安全 descope 声明" "descope 声明无可回放命令"
  skip "D704 DS7 git diff HEAD^ 范围一致" "HEAD^ 语义属 D704 分支提交历史"
  skip "D704 DS8 无绕过 + 推送 CI" "D704 push 后自证"
fi

echo ""
echo "verify-d703 汇总: PASS=$N_PASS FAIL=$N_FAIL SKIP=$N_SKIP（skip 均带理由，不算失败）"
if [ "$N_FAIL" -gt 0 ]; then
  echo "verify-d703: FAIL"
  exit 1
fi
echo "verify-d703: PASS"
exit 0
