#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# claim_release.test.sh — claim_release.py 配对测试（U7/CT-40；D839 建 + D846 加严）
#
# 覆盖矩阵（铁律 48：正常 / 降级 / 边界）:
#   ①  **伪造面（D846 / K3 D841 P1-1）**: 工作树改他人卡 status=impl_done（不提交）→ **仍不释放**
#      ①a 工作树未提交（不 add）  ①b `git add` 暂存但不 commit  ①c 端到端 staging_guard → 仍 block
#      ①d 符号链接指向伪造内容（平台支持时）  ①e 对照: 删卡 → 仍不释放（fail-closed 未被改坏）
#   ②  已提交的 status=impl_done → 正确放行（basis=task-state:impl_done）+ 端到端 guard → warn/exit 0
#   ③  台账证据（D846 凭证）: ③a 无凭证记录 → 不作证据（fail-closed）③b release 子命令凭证真落盘
#      ③c 台账提交后 → 释放且 degraded=false（凭证在 git 历史中可核）
#      ③d 非 owner 无显式理由 → 拒（exit 2）且台账字节不变  ③e owner 本人 → 允许（正向对照）
#   ④  判定链优先级/边界: 台账 > task-state > archived；claimed 不释放；无卡不释放；无 status 不释放
#   ⑤  repo 传 str 与 Path 结果一致（回归 D839 自测期缺陷）
#   ⑥  scan: 只列已释放任务仍在认领的 brief；--path 限定；无命中空列表
#   ⑦  release / release-stale: 原子写无 .tmp 残留；dry-run 不落盘；--apply 落盘
#   ⑧  契约边界: 仓库根不可识别 → exit 2（不与通过混同）
#   ⑨  围栏: 全程零写入真实仓库（台账指纹 + 越界卡）
#
# 隔离: mktemp -d 沙箱 + 复制真实脚本，全程 `--repo .`（**相对路径**：Windows Git Bash 下
#   内插 POSIX 绝对路径进 `python3 -c` 代码串会失效——D846 真修，非推测）。
# 先红/后绿: `SYNO_CLAIM_SRC=<修复前实现> bash claim_release.test.sh` → ①/③a 组红（先红留证）；
#   默认跑真实实现 → 全绿。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="${SYNO_CLAIM_SRC:-$REPO_DIR/scripts/control-tower/claim_release.py}"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
skip() { echo "  ⚠ 跳过: $1"; }
assert_eq() { if [ "$1" = "$2" ]; then pass "$3 (=$1)"; else fail "$3 — 实际 $1 期望 $2"; fi; }
assert_contains() { if echo "$1" | grep -qF -- "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_not_contains() { if echo "$1" | grep -qF -- "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi; }
assert_file_contains() { if grep -qF -- "$2" "$1" 2>/dev/null; then pass "$3"; else fail "$3 — $1 未含: $2"; fi; }

if [ ! -f "$SRC" ]; then echo "❌ 缺 scripts/control-tower/claim_release.py（未实现）" >&2; exit 2; fi

# 跨平台 SHA-256（D846）：Windows Git Bash 无 `shasum`（coreutils 未装）→ 用 python3；
# 路径**作为 argv 传入**（MSYS 会转换 argv 里的路径；插进代码串则不会）→ 禁内插。
# 取不到指纹 → exit 2（fail-closed：围栏断言不允许"两个空值相等"式假绿）。
sha256_of() {
  python3 -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"
}

# 围栏基准: 真实仓库释放台账指纹（测试期间不得改动它）
REAL_LEDGER="$REPO_DIR/task-state/claim-releases.json"
if [ -f "$REAL_LEDGER" ]; then
  SIG_BEFORE=$(sha256_of "$REAL_LEDGER") || { echo "❌ 无法计算真实台账指纹（缺 python3）" >&2; exit 2; }
else
  SIG_BEFORE="ABSENT"
fi

SB=$(mktemp -d); trap 'rm -rf "$SB"' EXIT
git -C "$SB" init -q; git -C "$SB" config user.email t@t.local; git -C "$SB" config user.name t
mkdir -p "$SB/.claude/task-briefs" "$SB/task-state" "$SB/scripts/control-tower" "$SB/scripts/workflow" "$SB/docs"
cp "$SRC" "$SB/scripts/control-tower/claim_release.py"
for f in brief_parser.py staging_guard.py session_registry.py write_lock.py; do
  cp "$REPO_DIR/scripts/control-tower/$f" "$SB/scripts/control-tower/$f"
done
cp "$REPO_DIR/scripts/workflow/resolve-commit-brief.sh" "$SB/scripts/workflow/resolve-commit-brief.sh"
printf 'x\n' > "$SB/docs/x.md"
git -C "$SB" add -A >/dev/null 2>&1; git -C "$SB" commit -qm init >/dev/null 2>&1

CLAIM="$SB/scripts/control-tower/claim_release.py"
GUARD="$SB/scripts/control-tower/staging_guard.py"
LEDGER="$SB/task-state/claim-releases.json"
# 一律 cwd=$SB + `--repo .`（相对路径 → Windows/macOS 同构，零 MSYS 转换依赖）
run() { (cd "$SB" && python3 "$CLAIM" --repo . "$@" 2>&1); }
run_guard() { (cd "$SB" && python3 "$GUARD" --session-id "$1" --staged "${@:2}" 2>&1); }
mk_card() { # <D#> <status> [owner-json 片段]
  if [ -n "${3:-}" ]; then
    printf '{"task_id":"%s","title":"t","status":"%s",%s}\n' "$1" "$2" "$3" > "$SB/task-state/$1.json"
  else
    printf '{"task_id":"%s","title":"t","status":"%s"}\n' "$1" "$2" > "$SB/task-state/$1.json"
  fi
}
set_state_wt() { mk_card "$1" "$2" "${3:-}"; }        # 仅工作树（未提交）—— 伪造面
commit_state() {                                      # 已提交（合法路径）
  mk_card "$1" "$2" "${3:-}"
  git -C "$SB" add "task-state/$1.json" >/dev/null 2>&1 || true
  git -C "$SB" commit -qm "state $1=$2" >/dev/null 2>&1 || true
}
commit_all() {
  git -C "$SB" add -A >/dev/null 2>&1 || true
  git -C "$SB" commit -qm "${1:-update}" >/dev/null 2>&1 || true
}
mk_brief() { # <D#> <slug> <path>
  cat > "$SB/.claude/task-briefs/2026-09-20-${1}-${2}.md" <<EOF
#CRITERIA: A
## Q2: 范围
做什么：
- ${3}
不做什么：
- 不改 docs/x.md.bak
## 架构层: 基础设施
## Done 标准
- [ ] t
EOF
}
ledger_bytes() { [ -f "$LEDGER" ] && wc -c < "$LEDGER" | tr -d ' ' || echo ABSENT; }
status_of() { run status --task "$1"; }

echo "── 组 ①: 伪造面（D846 / K3 P1-1）: 工作树/索引改 status 不得解锁 ──"
rm -f "$SB/task-state"/*.json "$LEDGER"
mk_brief D901 a docs/x.md
mk_brief D902 b docs/x.md
commit_state D901 claimed          # 已提交事实: 进行中
O=$(status_of D901); EC=$?
assert_eq "$EC" "1" "①a 工作树未提交伪造前: 已提交 claimed → exit 1"
set_state_wt D901 impl_done        # ← 攻击: 只改工作树，不 add 不 commit
O=$(status_of D901); EC=$?
assert_eq "$EC" "1" "①a 工作树伪造 status=impl_done（不提交）→ 仍 exit 1（不解锁）"
assert_contains "$O" '"released": false' "①a 工作树伪造 → released=false（fail-closed）"
assert_contains "$O" '"degraded": true' "①a 降级信号显式可见（不静默按未释放处理）"
assert_contains "$O" '不作为释放依据' "①a detail 点名「工作树改动不作为释放依据」"
git -C "$SB" add task-state/D901.json >/dev/null 2>&1 || true   # ← 攻击 2: 暂存但不 commit
O=$(status_of D901); EC=$?
assert_eq "$EC" "1" "①b 暂存（git add）但不 commit → 仍 exit 1（索引不是事实）"
assert_not_contains "$O" '"released": true' "①b 索引内容不构成释放证据"
# 端到端: 真跑 staging_guard（K3 攻击路径原文）—— 先探测本平台 claim 路径可用性
git -C "$SB" checkout -- task-state/D901.json >/dev/null 2>&1 || true
set_state_wt D901 claimed                 # 工作树与 HEAD 一致 = 干净的"进行中"
PROBE=$(run_guard D902 docs/x.md); PROBE_EC=$?
if [ "$PROBE_EC" = "1" ] && echo "$PROBE" | grep -qF '"status": "block"'; then
  set_state_wt D901 impl_done             # ← 攻击: 伪造后重跑 guard
  O=$(run_guard D902 docs/x.md); EC=$?
  assert_eq "$EC" "1" "①c 端到端 guard: 工作树伪造 → 仍 exit 1（他人认领未被解锁）"
  assert_contains "$O" '"status": "block"' "①c 端到端 guard: status=block（修复前为 warn）"
  assert_not_contains "$O" 'task-state:impl_done' "①c guard 未把伪造状态当作释放依据"
else
  skip "①c 端到端 guard（本平台 claim 路径不可用: exit=$PROBE_EC；根因在 staging_guard.py 的
       resolver 调用，属 D849 写集，不在本卡范围 —— 见回报遗留清单）"
fi
# ①d 符号链接指向伪造内容（平台支持时）
rm -f "$SB/task-state/D912.json"
if ln -s "$SB/docs/x.md" "$SB/task-state/D912.json" 2>/dev/null; then  # swallow-ok: 平台探测，失败走 else 的显式 skip（Windows 无符号链接权限）
  O=$(status_of D912); EC=$?
  assert_eq "$EC" "1" "①d 符号链接指向伪造内容 → 仍 exit 1"
  assert_contains "$O" '"released": false' "①d 符号链接不构成释放证据"
  rm -f "$SB/task-state/D912.json"
else
  skip "①d 符号链接（本平台不支持 ln -s）"
fi
# ①e 对照: 删卡（无内容变更）→ 仍不释放
rm -f "$SB/task-state/D901.json"; git -C "$SB" add -A >/dev/null 2>&1 || true
O=$(status_of D901); EC=$?
assert_eq "$EC" "1" "①e 对照: 卡被删（无内容变更）→ 仍 exit 1（fail-closed 未被改坏）"

echo "── 组 ②: 已提交 impl_done → 正确放行（不得把合法路径一起掐死）──"
commit_state D901 impl_done
O=$(status_of D901); EC=$?
assert_eq "$EC" "0" "② 已提交 impl_done → exit 0（放行）"
assert_contains "$O" '"released": true' "② released=true"
assert_contains "$O" 'task-state:impl_done' "② basis 点名依据=task-state:impl_done"
assert_not_contains "$O" '"degraded": true' "② 合法路径无降级噪音"
if [ "$PROBE_EC" = "1" ]; then
  O=$(run_guard D902 docs/x.md); EC=$?
  assert_eq "$EC" "0" "② 端到端 guard: 已提交 impl_done → exit 0（放行）"
  assert_contains "$O" '"status": "warn"' "② 端到端 guard: status=warn（不再硬阻断）"
  assert_contains "$O" 'D901 已释放' "② 端到端 guard: 打印释放理由"
fi
commit_state D901 audited
assert_contains "$(status_of D901)" '"released": true' "② status=audited 同样放行"

echo "── 组 ③: 台账证据（D846 凭证）──"
rm -f "$LEDGER"; commit_state D910 claimed
printf '{"version":1,"releases":{"D910":{"released":true}}}\n' > "$LEDGER"   # ← 攻击 3: 无凭证直写台账
O=$(status_of D910); EC=$?
assert_eq "$EC" "1" "③a 台账记录无凭证（裸 released:true）→ 仍 exit 1（不构成证据）"
assert_contains "$O" '缺凭证' "③a detail 点名缺凭证（不静默忽略）"
rm -f "$LEDGER"
O=$(run release --task D910 --by coding-a --reason "单测: 显式释放"); EC=$?
assert_eq "$EC" "0" "③b release 子命令 exit 0"
assert_file_contains "$LEDGER" '"by": "coding-a"' "③b 凭证 by 真落盘（真写文件，非只 echo）"
assert_file_contains "$LEDGER" '"reason": "单测: 显式释放"' "③b 凭证 reason 真落盘"
assert_file_contains "$LEDGER" '"at": "20' "③b 凭证 at（时间）真落盘"
assert_file_contains "$LEDGER" '"owner_at_release"' "③b 释放时 owner 快照落盘"
assert_contains "$O" '凭证: by=coding-a' "③b 输出回显凭证摘要"
O=$(status_of D910)
assert_contains "$O" '"released": true' "③b 台账（带凭证）→ released=true"
assert_contains "$O" '"basis": "ledger"' "③b basis=ledger"
assert_contains "$O" '未提交' "③b 台账未提交 → 显式降级标注（凭证在 git 历史中不可核）"
commit_all "chore: ledger"
O=$(status_of D910)
assert_contains "$O" '"released": true' "③c 台账提交后仍 released=true"
assert_contains "$O" '台账显式释放' "③c basis=ledger（可核）"
assert_not_contains "$O" '台账记录未提交' "③c 提交后无"未提交"降级（凭证可核）"
# ③d 非 owner 无显式理由 → 拒 + 台账字节不变
commit_state D911 claimed '"owner":"coding-a"'
B_BEFORE=$(ledger_bytes)
O=$(run release --task D911 --by attacker); EC=$?
assert_eq "$EC" "2" "③d 非 owner 无显式理由 → exit 2（契约不满足）"
assert_contains "$O" '非 owner 释放需显式理由' "③d 报错点名非 owner 需理由"
assert_eq "$(ledger_bytes)" "$B_BEFORE" "③d 被拒时台账字节不变（未落盘）"
assert_contains "$(status_of D911)" '"released": false' "③d 被拒后 D911 仍未释放"
# ③e 正向对照: owner 本人释放（无需理由）
O=$(run release --task D911 --by coding-a); EC=$?
assert_eq "$EC" "0" "③e owner 本人释放 → exit 0（证明不是一律拒）"
assert_contains "$(status_of D911)" '"released": true' "③e owner 释放生效"

echo "── 组 ④: 判定链优先级 / 边界 ──"
rm -f "$LEDGER"; commit_state D901 claimed
assert_contains "$(status_of D901)" '"released": false' "④ claimed（进行中）→ 不释放（并发保护不放松）"
commit_state D901 impl_done
run release --task D901 --by coding-a --reason "单测: 台账优先" >/dev/null 2>&1
commit_state D901 claimed
O=$(status_of D901); assert_contains "$O" '"basis": "ledger"' "④ 台账优先级高于 task-state status"
printf '{"version":1,"sessions":[],"archived":[{"session_id":"D903","task_id":"D903"}]}\n' > "$SB/.codex-reg-tmp.json"
mkdir -p "$SB/.codex/control-tower" && mv "$SB/.codex-reg-tmp.json" "$SB/.codex/control-tower/session-registry.json"
assert_contains "$(status_of D903)" '"basis": "session-archived"' "④ session 已归档 → 释放（本地最弱证据源）"
rm -f "$SB/task-state/D904.json"
assert_contains "$(status_of D904)" '"released": false' "④ 无卡（+HEAD 无）→ 不释放（fail-closed）"
printf '{"task_id":"D905","title":"t"}\n' > "$SB/task-state/D905.json"
git -C "$SB" add task-state/D905.json >/dev/null 2>&1 || true; git -C "$SB" commit -qm "D905 no status" >/dev/null 2>&1 || true
assert_contains "$(status_of D905)" '"released": false' "④ 已提交卡无 status 字段 → 不释放（只认显式声明）"
O=$(status_of NOPE); assert_contains "$O" '"degraded": true' "④ 无 D# 形态 task_id → degraded（不静默）"

echo "── 组 ⑤: repo 传 str 与 Path 结果一致（回归 D839 自测期缺陷）──"
BOTH=$(cd "$SB" && python3 -c "
import sys, pathlib
sys.path.insert(0, 'scripts/control-tower')
from claim_release import is_released
a = is_released('.', 'D901'); b = is_released(pathlib.Path('.'), 'D901')
print('SAME' if (a['released'], a['basis']) == (b['released'], b['basis']) else 'DIFF %r %r' % (a, b))
print('released=%s' % a['released'])
" 2>&1)
assert_contains "$BOTH" "SAME" "⑤ str repo 与 Path repo 判定一致"
assert_contains "$BOTH" "released=True" "⑤ str repo 仍能识别已释放（源头过滤不被吞）"

echo "── 组 ⑥: scan ──"
rm -f "$LEDGER" "$SB/.codex/control-tower/session-registry.json"
commit_state D901 impl_done; mk_brief D901 a docs/x.md
commit_state D906 claimed;   mk_brief D906 b docs/x.md
O=$(run scan --json)
assert_contains "$O" '"task_id": "D901"' "⑥ scan 列出已释放任务仍在认领的 brief"
assert_not_contains "$O" '"task_id": "D906"' "⑥ 进行中任务不进失效认领列表"
assert_contains "$(run scan --path docs/x.md --json)" '"stale"' "⑥ scan --path 限定路径族可用"
assert_contains "$(run scan --path docs/nonexistent/ --json)" '"stale": []' "⑥ 路径族无命中 → 空列表（非报错）"

echo "── 组 ⑦: release / release-stale ──"
rm -f "$LEDGER"
run release --task D901 --by coding-a --reason "单测" >/dev/null 2>&1
N1=$(cd "$SB" && python3 -c "import json;print(len(json.load(open('task-state/claim-releases.json',encoding='utf-8'))['releases']))")
assert_eq "$N1" "1" "⑦ release 写台账 1 条"
run release --task D901 --by coding-a --reason "单测2" >/dev/null 2>&1
N2=$(cd "$SB" && python3 -c "import json;print(len(json.load(open('task-state/claim-releases.json',encoding='utf-8'))['releases']))")
assert_eq "$N2" "1" "⑦ 重复 release 覆盖而非追加（幂等）"
TMPLEFT=$(find "$SB/task-state" -maxdepth 1 -name "*.tmp" | wc -l | tr -d ' ')  # swallow-ok: find 无匹配 → exit 1 是正常默认，计数 0
assert_eq "$TMPLEFT" "0" "⑦ 原子写无残留 .tmp"
rm -f "$LEDGER"; commit_state D901 impl_done
run release-stale >/dev/null 2>&1
[ -f "$LEDGER" ] && fail "⑦ dry-run 不应落盘" || pass "⑦ dry-run 不落盘"
run release-stale --apply >/dev/null 2>&1
[ -f "$LEDGER" ] && pass "⑦ --apply 落盘" || fail "⑦ --apply 未落盘"
assert_file_contains "$LEDGER" '"D901"' "⑦ --apply 记录点名 D901"

echo "── 组 ⑧: 契约边界 ──"
mkdir -p "$SB/empty-repo"
O=$(cd "$SB/empty-repo" && python3 "$CLAIM" --repo . scan 2>&1); EC=$?
assert_eq "$EC" "2" "⑧ 仓库根不可识别 → exit 2（契约不满足，不与通过混同）"
assert_contains "$O" "契约不满足" "⑧ 显式报契约不满足（不静默）"

echo "── 组 ⑨: 围栏（不得写真实仓库）──"
if [ -f "$REAL_LEDGER" ]; then SIG_AFTER=$(sha256_of "$REAL_LEDGER"); else SIG_AFTER="ABSENT"; fi
assert_eq "$SIG_AFTER" "$SIG_BEFORE" "⑨ 真实仓库释放台账指纹未变"
for p in task-state/D901.json task-state/D906.json task-state/D910.json; do
  [ -e "$REPO_DIR/$p" ] && fail "⑨ 越界写入真实仓库 $p" || pass "⑨ 真实仓库无 $p"
done

echo "──────────────────────────────────────────────"
echo "  PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "FAIL=0" || echo "FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
