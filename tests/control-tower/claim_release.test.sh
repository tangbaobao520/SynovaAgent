#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# claim_release.test.sh — D839 claim_release.py 单元配对测试（U7/CT-40 要求）
#
# 覆盖矩阵（铁律 48：正常 / 降级 / 边界）:
#   1. is_released: task-state status=impl_done / audited → released，basis 点名依据
#   2. is_released: status=claimed（进行中）→ **不释放**（并发保护不放松）
#   3. is_released: 显式释放台账 → released，basis=ledger（优先级高于 status）
#   4. is_released: session 已归档 → released，basis=session-archived
#   5. is_released: 无 task-state 卡 → **不释放**（fail-closed，拿不到证据不放行）
#   6. is_released: task-state 无 status 字段 → 不释放（只认显式声明）
#   7. is_released: 无号形态 task_id → 不释放 + degraded（不静默）
#   8. **repo 传 str 与 Path 结果一致**（D839 自测期真实缺陷：str repo 触发 TypeError
#      被调用方 except 吞掉 → 源头过滤整条静默失效）
#   9. scan: 只列已释放任务仍在认领的 brief；进行中的不进列表
#  10. scan --path 限定路径族生效
#  11. release: 原子写台账；重复 release 覆盖而非追加重复
#  12. release-stale: 缺省 dry-run 不落盘；--apply 才写
#  13. 边界: 仓库根不可识别（无 task-state/）→ exit 2（契约不满足）
#  14. 围栏: 全程零写入真实仓库 task-state/
#
# 隔离: mktemp -d 沙箱 + 复制真实 claim_release.py / brief_parser.py，全程 --repo 指向沙箱。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$REPO_DIR/scripts/control-tower/claim_release.py"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
# D853（F12 同款修法）: 失败断言名必须进 tail -8 —— 否则 CI 注解里只剩尾部 ✅，根本看不见是哪条红
FAILLOG=""
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; FAILLOG="${FAILLOG}$(printf '%s' "$1" | cut -c1-26); "; }
assert_eq() { if [ "$1" = "$2" ]; then pass "$3 (=$1)"; else fail "$3 — 实际 $1 期望 $2"; fi; }
assert_contains() { if echo "$1" | grep -qF -- "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_not_contains() { if echo "$1" | grep -qF -- "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi; }

if [ ! -f "$SRC" ]; then echo "❌ 缺 scripts/control-tower/claim_release.py（未实现）" >&2; exit 2; fi

# 跨平台 sha256（D849：Windows Git Bash 无 shasum → 原 5 断言红。只做可移植化，不改判定语义）
sha256_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else python3 -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"
  fi
}

# 围栏基准: 真实仓库释放台账指纹（测试期间不得改动它）
REAL_LEDGER="$REPO_DIR/task-state/claim-releases.json"
if [ -f "$REAL_LEDGER" ]; then SIG_BEFORE=$(sha256_of "$REAL_LEDGER"); else SIG_BEFORE="ABSENT"; fi

# D853 ⑩: 沙箱路径必须**双命名空间同实体**（D849 已在 staging_guard 夹具用同一口径）——
#   裸 mktemp 给 MSYS 形（/tmp/...）；Windows **native python** 把它读成 C:\tmp\...（不存在）
#   → 夹具自己的 `sys.path.insert('$SB/...')` / `open('$SB/task-state/...')` 与 CLI 的 `--repo $SB`
#   落到不同根 → ⑧/⑪ 双红（CI 实证：`FileNotFoundError` + 台账 MISSING）。
#   cygpath -m 给 mixed 形（C:/...）：bash 可 cd/glob、native python 可 open = 同一实体。
SB_RAW=$(mktemp -d); trap 'rm -rf "$SB_RAW"' EXIT
SB="$(cygpath -m "$SB_RAW" 2>/dev/null || echo "$SB_RAW")"  # POSIX 无 cygpath → 原样
git -C "$SB" init -q; git -C "$SB" config user.email t@t.local; git -C "$SB" config user.name t
mkdir -p "$SB/.claude/task-briefs" "$SB/task-state" "$SB/scripts/control-tower" "$SB/docs"
cp "$SRC" "$SB/scripts/control-tower/claim_release.py"
cp "$REPO_DIR/scripts/control-tower/brief_parser.py" "$SB/scripts/control-tower/brief_parser.py"
printf 'x\n' > "$SB/docs/x.md"
git -C "$SB" add -A >/dev/null 2>&1; git -C "$SB" commit -qm init >/dev/null 2>&1

CLAIM="$SB/scripts/control-tower/claim_release.py"
run() { (cd "$SB" && python3 "$CLAIM" --repo "$SB" "$@" 2>&1); }
set_state() { printf '{"task_id":"%s","title":"t","status":"%s"}\n' "$1" "$2" > "$SB/task-state/$1.json"; }
mk_brief() { # <D#> <path>
  cat > "$SB/.claude/task-briefs/2026-09-20-${1}-b.md" <<EOF
#CRITERIA: A
## Q2: 范围
做什么：
- ${2}
不做什么：
- 不改 docs/x.md.bak
## 架构层: 基础设施
## Done 标准
- [ ] t
EOF
}

echo "── 组 1-7: is_released 判定链（正常/降级/边界）──"
rm -f "$SB/task-state"/*.json "$SB/task-state/claim-releases.json"
mk_brief D901 docs/x.md
set_state D901 impl_done
O=$(run status --task D901); assert_contains "$O" '"released": true' "① status=impl_done → released"
assert_contains "$O" 'task-state:impl_done' "① basis 点名依据=task-state:impl_done"
set_state D901 audited
assert_contains "$(run status --task D901)" '"released": true' "① status=audited → released"
set_state D901 claimed
O=$(run status --task D901); assert_eq "$?" "1" "② status=claimed → exit 1（不释放）"
assert_contains "$O" '"released": false' "② 进行中任务不释放（并发保护不放松）"
set_state D901 impl_done
run release --task D901 --reason "单测: 显式释放" >/dev/null 2>&1
set_state D901 claimed
O=$(run status --task D901); assert_contains "$O" '"released": true' "③ 台账显式释放 → released（status 漂移不影响）"
assert_contains "$O" '"basis": "ledger"' "③ 台账优先级高于 status"
printf '{"version":1,"updated_at":"x","sessions":[],"archived":[{"session_id":"D903","task_id":"D903"}]}\n' > "$SB/.codex-registry-tmp.json"
mkdir -p "$SB/.codex/control-tower" && mv "$SB/.codex-registry-tmp.json" "$SB/.codex/control-tower/session-registry.json"
O=$(run status --task D903); assert_contains "$O" '"basis": "session-archived"' "④ session 已归档 → released"
rm -f "$SB/task-state/D904.json"
assert_contains "$(run status --task D904)" '"released": false' "⑤ 无 task-state 卡 → 不释放（fail-closed）"
printf '{"task_id":"D905","title":"t"}\n' > "$SB/task-state/D905.json"
assert_contains "$(run status --task D905)" '"released": false' "⑥ 无 status 字段 → 不释放（只认显式声明）"
O=$(run status --task NOPE); assert_contains "$O" '"degraded": true' "⑦ 无号形态 task_id → degraded（不静默）"

echo "── 组 8: repo 传 str 与 Path 结果一致（回归 D839 自测期缺陷）──"
BOTH=$(cd "$SB" && python3 -c "
import sys, pathlib
sys.path.insert(0, '$SB/scripts/control-tower')
from claim_release import is_released
a = is_released('$SB', 'D901'); b = is_released(pathlib.Path('$SB'), 'D901')
print('SAME' if (a['released'], a['basis']) == (b['released'], b['basis']) else 'DIFF %r %r' % (a, b))
print(a['released'])
" 2>&1)
assert_contains "$BOTH" "SAME" "⑧ str repo 与 Path repo 判定一致"
assert_contains "$BOTH" "True" "⑧ str repo 仍能识别已释放（源头过滤不被吞）"
# D853: ⑧ 的原始差异（CI 上"SAME 未找到"信息量不够）。若是 Traceback → 只留**末尾 4 行**
# （File/行号/异常行 = 炸点），不整段塞进注解预算。
DIAG8=""
if ! printf '%s' "$BOTH" | grep -qF "SAME"; then
  if printf '%s' "$BOTH" | grep -qF "Traceback"; then
    DIAG8="TB[$(printf '%s' "$BOTH" | grep -vE '^[[:space:]]*$' | tail -4 | tr '\n' '|' | cut -c1-128)]"
  else
    DIAG8="BOTH=[$(printf '%s' "$BOTH" | tr '\n' '/' | tr -s ' ' | cut -c1-128)]"
  fi
fi

echo "── 组 9-10: scan ──"
rm -f "$SB/task-state/claim-releases.json" "$SB/.codex/control-tower/session-registry.json"
set_state D901 impl_done; mk_brief D901 docs/x.md
set_state D906 claimed;  mk_brief D906 docs/x.md
O=$(run scan --json)
assert_contains "$O" '"task_id": "D901"' "⑨ scan 列出已释放任务仍在认领的 brief"
assert_not_contains "$O" '"task_id": "D906"' "⑨ 进行中任务不进失效认领列表"
assert_contains "$(run scan --path docs/x.md --json)" '"stale"' "⑩ scan --path 限定路径族可用"
assert_contains "$(run scan --path docs/nonexistent/ --json)" '"stale": []' "⑩ 路径族无命中 → 空列表（非报错）"

echo "── 组 11-12: release / release-stale ──"
rm -f "$SB/task-state/claim-releases.json"
D11_OUT=$(run release --task D901 --reason "单测" 2>&1); D11_RC=$?
N1=$(python3 -c "import json;print(len(json.load(open('$SB/task-state/claim-releases.json',encoding='utf-8'))['releases']))" 2>&1); N1RC=$?
# D853: ⑪ 失败证据（release 的 rc/输出 + 台账文件是否存在 + 读取报什么）——只在失败时进 DIAG-⑪
DIAG11=""
{ [ "$N1" != "1" ] || [ "$N1RC" != "0" ]; } && DIAG11=$(printf 'rc=%s ledger=%s out=[%s] rd=[%s]' "$D11_RC" \
  "$([ -f "$SB/task-state/claim-releases.json" ] && echo ok || echo MISSING)" \
  "$(printf '%s' "$D11_OUT" | tr '\n' '/' | cut -c1-60)" "$(printf '%s' "$N1" | tr '\n' '/' | cut -c1-50)")
assert_eq "$N1" "1" "⑪ release 写台账 1 条"
run release --task D901 --reason "单测2" >/dev/null 2>&1
N2=$(python3 -c "import json;print(len(json.load(open('$SB/task-state/claim-releases.json',encoding='utf-8'))['releases']))")
assert_eq "$N2" "1" "⑪ 重复 release 覆盖而非追加（幂等）"
TMPLEFT=$(find "$SB/task-state" -maxdepth 1 -name "*.tmp" | wc -l | tr -d ' ')  # swallow-ok: find 无匹配 → exit 1 是正常默认，计数 0
assert_eq "$TMPLEFT" "0" "⑪ 原子写无残留 .tmp"
rm -f "$SB/task-state/claim-releases.json"
set_state D901 impl_done
run release-stale >/dev/null 2>&1
[ -f "$SB/task-state/claim-releases.json" ] && fail "⑫ dry-run 不应落盘" || pass "⑫ dry-run 不落盘"
run release-stale --apply >/dev/null 2>&1
[ -f "$SB/task-state/claim-releases.json" ] && pass "⑫ --apply 落盘" || fail "⑫ --apply 未落盘"

echo "── 组 13: 契约边界 ──"
mkdir -p "$SB/empty-repo"
O=$(python3 "$CLAIM" --repo "$SB/empty-repo" scan 2>&1); EC=$?
assert_eq "$EC" "2" "⑬ 仓库根不可识别 → exit 2（契约不满足，不与通过混同）"
assert_contains "$O" "契约不满足" "⑬ 显式报契约不满足（不静默）"

echo "── 组 15: stderr 编码（D853）: cp1252 管道下中文仍完整（只改编码，不改语义）──"
O=$(cd "$SB" && PYTHONIOENCODING=cp1252 python3 "$CLAIM" --repo "$SB/empty-repo" scan 2>&1); EC=$?
assert_eq "$EC" "2" "⑮ 契约不满足仍 exit 2（语义不变）"
assert_contains "$O" "契约不满足" "⑮ cp1252 下 stderr 中文完整（基线为 \\uXXXX 转义 → 断言恒红）"

echo "── 组 16: PATH 上的假 git（D853）: 事实源不可由调用者环境提供 ──"
FAKE_TMP=$(mktemp -d); FAKE_REPO="$SB/fakebin"; mkdir -p "$FAKE_REPO"
# (a) 临时目录里的假 git（`--version` 也不合法）→ 不得被选中
printf '#!/bin/sh\ncase "$*" in *--version*) echo "not-a-real-git";; *ls-files*) echo "docs/fake-claim.md";; esac\nexit 0\n' > "$FAKE_TMP/git"
chmod +x "$FAKE_TMP/git"
R=$(cd "$SB" && PATH="$FAKE_TMP:$PATH" python3 -c "
import sys; sys.path.insert(0, 'scripts/control-tower')
import claim_release as cr
b = cr.git_bin()
print('picked_fake=%s' % ('YES' if (b or '').startswith('$FAKE_TMP') else 'NO'))" 2>&1)
assert_contains "$R" "picked_fake=NO" "⑯a 未选中临时目录里的假 git（试运行校验 + 非临时目录约束）"
# (b) 仓库内的假 git（版本串合法 → 过试运行；但位于被判定的仓库里）→ _git 必须拒绝
printf '#!/bin/sh\ncase "$*" in *--version*) echo "git version 9.9.9";; *ls-files*) echo "docs/fake-claim.md";; esac\nexit 0\n' > "$FAKE_REPO/git"
chmod +x "$FAKE_REPO/git"
R=$(cd "$SB" && python3 -c "
import sys; sys.path.insert(0, 'scripts/control-tower')
import claim_release as cr
cr._GIT_BIN_CACHE[:] = ['$FAKE_REPO/git']       # 直接注入：模拟'校验通过的 git 落在被判定的仓库内'
out, err = cr._git('$SB', 'ls-files')
print('out=%r' % (out,))
print('err=%s' % err)" 2>&1)
assert_contains "$R" "out=None" "⑯b 仓库内 git → _git 拒绝返回内容（不当事实）"
assert_contains "$R" "位于被判定的仓库内" "⑯b 拒绝原因点名（不静默）"
O=$(cd "$SB" && PATH="$FAKE_REPO:$PATH" python3 "$CLAIM" --repo "$SB" scan --json 2>&1); EC=$?
assert_not_contains "$O" "fake-claim.md" "⑯c 端到端: 假 git 回吐的认领事实未被采信"
rm -rf "$FAKE_TMP" "$FAKE_REPO"

echo "── 组 14: 围栏（不得写真实仓库）──"
if [ -f "$REAL_LEDGER" ]; then SIG_AFTER=$(sha256_of "$REAL_LEDGER"); else SIG_AFTER="ABSENT"; fi
assert_eq "$SIG_AFTER" "$SIG_BEFORE" "⑭ 真实仓库释放台账指纹未变"
for p in task-state/D901.json task-state/D906.json; do
  [ -e "$REPO_DIR/$p" ] && fail "⑭ 越界写入真实仓库 $p" || pass "⑭ 真实仓库无 $p"
done

echo "──────────────────────────────────────────────"
echo "  PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "FAIL=0" || echo "FAIL=$FAIL"
if [ "$FAIL" -ne 0 ]; then
  # D853: CI 注解只带 tail -8 → 失败断言名 + 关键环境事实压进末尾（否则被尾部 ✅ 挤出可见区）
  # D853: 顺序 = 信息密度（CI 注解 `tail -8 | tr | cut -c1-450` 取**前段**）→ 最要紧的先进预算
  [ -n "${DIAG11:-}" ] && echo "DIAG-⑪ $(printf '%s' "$DIAG11" | cut -c1-110)"
  [ -n "${DIAG8:-}" ] && echo "DIAG-⑧ $(printf '%s' "$DIAG8" | cut -c1-110)"
  echo "DIAG-FAIL $(printf '%s' "$FAILLOG" | tr '\n' ' ' | tr -s ' ' | cut -c1-110)"
  echo "DIAG-ENV sb=[$(printf '%s' "$SB" | cut -c1-40)] py=$(command -v python3 2>/dev/null || echo NONE)"
fi
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
