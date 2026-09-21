#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# staging-guard-release.test.sh — D839 认领制根治（完成即释放 / 批量扫描 / 释放持久化）
#
# 背景: 认领制的候选池只看 brief 里 Q2 的字面路径，不看该 brief 所属任务是否已完成
#   → 任何历史 brief 提及过的文件对后续所有任务永久锁死（D838 被已完成的 D806 brief 阻断）。
#   本测试锁死修复后的三条行为，含「反向不放松」与「持久化不复活」。
#
# 覆盖矩阵（铁律 48：正常 / 降级 / 边界）:
#   场景 A（放行 · 正常路径）: 任务 A 已完成（task-state=impl_done）声明文件 X，新任务 B 改 X
#       → 修复前: staging_guard status=block / exit 1（先红）
#       → 修复后: status=warn / exit 0 + 释放理由（后绿，可提交）
#   场景 B（反向 · 边界）: 任务 A 仍在进行（task-state=claimed）→ B 改 X **仍必须 block**
#       （释放机制不得放松真实并发保护）
#   场景 C（持久化 · 正常路径）: 显式释放 + task-state status 漂移回 claimed + brief 文本改回
#       ASCII + declare-write-set.sh 重跑 → 认领**不复活**（D806 一次性改文本法的脆弱点封死）
#   场景 D（降级 · fail-closed）: 任务 A 无 task-state 卡 → 拿不到"已完成"证据 → **不释放**，仍 block
#   场景 E（批量）: scan 列出全部失效认领 / release-stale 批量释放后 released 全为 true
#
# 隔离: mktemp -d 临时 git repo + 复制真实脚本（staging_guard / resolver / claim_release /
#   session_registry / brief_parser / declare-write-set）→ 零真实仓库写入、零网络。
# ═══════════════════════════════════════════════════════════════════════════════
#
# ── D849 Windows 兼容 FIX（CI 实证: Control Tower Gate Tests (windows-latest) 12 红）──
#   现象: windows-latest 场景 B/C/D/G FAIL、PASS=19 FAIL=12；ubuntu/macOS 同文件全绿。
#   根因族（见各改动处注释的 file:line）:
#     ① python→bash 子链依赖不自包含（staging_guard.py:153 裸 ["bash", ...]）→
#        resolver:31 `git rev-parse --show-toplevel || pwd` 落 MSYS 专有路径 →
#        resolver 内嵌 native python 的 open()/os.listdir 读不到沙箱 → 认领判定静默 fail-open；
#     ② 夹具底座（git init/add/commit、沙箱路径命名空间）全静默、无断言 → 链路瞎了会报成
#        "认领不拦"（假绿），且 CI 注解只带 tail -8，Windows 侧无从定位 → 加前置断言 + DIAG；
#     ③ Windows Git Bash 无 shasum → 场景 F 围栏 "空 == 空" 恒绿（假绿围栏）→ 换可移植哈希
#        并让围栏在无哈希工具时判红；
#     ④ 场景 G 调未定义函数 set_state（K3 D841 P2-2）→ 准备步骤静默失效 → 改 mk_state；
#     ⑤ 写死 /tmp/d839-res.err 的跨运行共享路径 → 改沙箱内私有文件。
#   未验证项: Windows 侧无法本地复跑，最终验收 = CI 双平台绿（见 task-state/D849.json）。
set -uo pipefail

# ── D849 ①(windows-compat 模式 1/D316): python→bash 子链的依赖必须自包含 ──
# staging_guard.py:153 用裸 `subprocess.run(["bash", ...])` 启 resolve-commit-brief.sh ——
# 子进程只继承本夹具的环境。MSYS↔native 的 PATH 往返在 Windows 上会让 Git 工具链条目在
# 子链里不可达 → resolver 的 `git rev-parse --show-toplevel`（resolve-commit-brief.sh:31）
# 落 `pwd` 回退 → ROOT 变成 MSYS 专有路径（/tmp/...）：bash 能 glob 它，而 resolver 内嵌的
# **native Windows python**（open('/tmp/x') → C:\tmp\x）读不到 → 沙箱 brief 全丢 →
# 认领判定静默 fail-open。显式把 git/python/bash 所在目录并入 PATH（POSIX 形，MSYS 自动转 native）。
for _d in "$(dirname "$(command -v git 2>/dev/null || echo /usr/bin/git)")" \
          "$(dirname "$(command -v python3 2>/dev/null || echo /usr/bin/python3)")" \
          "$(dirname "$(command -v bash 2>/dev/null || echo /usr/bin/bash)")"; do
  [ -d "$_d" ] || continue
  case ":$PATH:" in *":$_d:"*) ;; *) PATH="$_d:$PATH" ;; esac
done
export PATH

# ── D853 ④: 夹具**自己的** bash 调用也必须自包含（不能只修被测实现）──
#   native Windows python（本夹具的 PROBE/准备步骤就是 native python 起子进程）解析裸 "bash"
#   走的是 **Windows PATH**（System32 优先）→ 命中 **WSL 桩** `C:\Windows\System32\bash.exe`
#   （实测输出 "no installed distributions"）→ PROBE_RC=1 零输出。上面的 MSYS 形 PATH 前置
#   对 native 子进程无效（Windows PATH 条目是 C:\... 形）→ 必须**显式绝对路径 + 试运行校验**。
_pick_bash() {
  local c
  for c in "${SYNO_BASH:-}" "$(command -v bash 2>/dev/null || true)" /bin/bash /usr/bin/bash \
           "/c/Program Files/Git/bin/bash.exe" "/c/Program Files/Git/usr/bin/bash.exe"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    if "$c" -c 'echo SYNO_BASH_OK' 2>/dev/null | grep -q SYNO_BASH_OK; then printf '%s' "$c"; return 0; fi
  done
  return 1
}
BASH_BIN="$(_pick_bash || true)"
[ -n "$BASH_BIN" ] || { echo "❌ 夹具前置失败: 未找到可用 bash（试运行均失败）" >&2; exit 2; }

# ── D849 ②: 跨平台 sha256（Windows Git Bash **无 shasum**——CI 注解实测
#    `shasum: command not found`；旧写法两边都取空串 → 围栏断言 "空 == 空" 恒绿 = 假绿围栏）──
# 顺序: sha256sum（coreutils，双平台都有）→ shasum（macOS）→ python hashlib。
# 三者皆无 → 输出空，由场景 F 判红（绝不静默放行）。
_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1 | tr -d '\r\n'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1 | tr -d '\r\n'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$1" 2>/dev/null | tr -d '\r\n'
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
# ⚠ 沙箱铁律: 一律跑**沙箱内副本**（下面 GUARD/CLAIM 指向 ${SB}），绝不跑真实仓库路径。
#   真实路径会让 REPO_ROOT=真实仓库 → 测试直接写真实仓库的 task-state。
#   D839 自测期实测踩过：曾把 167 条批量释放写进工作树 task-state/claim-releases.json。
#   末尾「不越界写入」断言把这条钉死。
TODAY=$(date +%Y-%m-%d)
# 沙箱围栏基准: 记录真实仓库释放台账的指纹（存在也要比对内容——测试期间不得改动它）
REAL_LEDGER="$REPO_DIR/task-state/claim-releases.json"
if [ -f "$REAL_LEDGER" ]; then REAL_LEDGER_SIG=$(_sha256 "$REAL_LEDGER"); else REAL_LEDGER_SIG="ABSENT"; fi

PASS=0; FAIL=0
DIAG=""; PROBE=""; RES_OUT=""
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
# D853: 失败断言名必须活到 CI 注解 —— 注解只带 tail -8，❌ 行会被其后的 ✅ 挤出可见区（F12 实证）
FAILLOG=""
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; FAILLOG="${FAILLOG}${1} ; "; }
assert_eq() { if [ "$1" = "$2" ]; then pass "$3 (=$1)"; else fail "$3 — 实际 $1 期望 $2"; fi; }
assert_contains() { if echo "$1" | grep -qF -- "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }
assert_not_contains() { if echo "$1" | grep -qF -- "$2"; then fail "$3 — 不应包含: $2"; else pass "$3"; fi; }
scen_start() { SCEN_BASE=$FAIL; }
scen_end() { if [ "$FAIL" -eq "$SCEN_BASE" ]; then eval "$1=PASS"; else eval "$1=FAIL"; fi; }
# D849: 精简链路证据（CI 注解只带 tail -8 → 失败时把它压成末尾行，Windows 侧唯一定位手段）
_status_of() { printf '%s' "$1" | grep -oE '"status": "[a-z]+"' | head -1 | sed 's/.*"\([a-z]*\)"$/\1/'; }
diag() { DIAG="${DIAG}$1=ec$2/${3:-?} "; }

# ── 沙箱: 真实脚本 + 最小仓库结构 ──
# D849: 沙箱路径必须**双命名空间同实体**。mktemp 给的是 MSYS 专有形（/tmp/...），
#   native Windows python 把它读成 C:\tmp\...（不存在）→ 链上任何把路径交给 native 进程的
#   代码（resolver 的 pwd 回退、内嵌 python 的 open()/os.listdir）都静默读不到沙箱。
#   cygpath -m 给 mixed 形（C:/...）：bash 可 cd/glob、native python 可 open = 同一实体。
SB_RAW=$(mktemp -d)
SB="$(cygpath -m "$SB_RAW" 2>/dev/null || echo "$SB_RAW")"  # POSIX 无 cygpath → 原样（/tmp 本就是 native）
trap 'rm -rf "$SB_RAW" "$SB"' EXIT
# D849: 底座必须**断言存在**（旧写法 git init/add/commit 全静默 → Windows 上底座没建成时
#   夹具照样往下跑，把"链路瞎了"报成"认领不拦"）。
git -C "$SB" init -q || { echo "❌ 夹具前置失败: git init 沙箱失败（$SB）" >&2; exit 2; }
git -C "$SB" config user.email t@t.local
git -C "$SB" config user.name t
mkdir -p "$SB/.claude/task-briefs" "$SB/task-state" "$SB/scripts/control-tower" "$SB/scripts/workflow" "$SB/docs"
for f in staging_guard.py session_registry.py brief_parser.py write_lock.py declare-write-set.sh; do
  if [ -f "$REPO_DIR/scripts/control-tower/$f" ]; then
    cp "$REPO_DIR/scripts/control-tower/$f" "$SB/scripts/control-tower/$f"
  else
    echo "❌ 缺源文件 scripts/control-tower/$f" >&2; exit 2
  fi
done
# claim_release.py 是本卡新增件：缺失时**不提前退出** —— 否则修复前跑不出场景 A/B/D 的真实红
# （门禁前置就 exit 2，失去"先红"证据）。缺失交由场景 C/E 各自报 FAIL。
if [ -f "$REPO_DIR/scripts/control-tower/claim_release.py" ]; then
  cp "$REPO_DIR/scripts/control-tower/claim_release.py" "$SB/scripts/control-tower/claim_release.py"
fi
cp "$REPO_DIR/scripts/workflow/resolve-commit-brief.sh" "$SB/scripts/workflow/resolve-commit-brief.sh"
# D839: 沙箱内副本 —— staging_guard 的 REPO_ROOT = 本文件 parents[2] = $SB
GUARD="$SB/scripts/control-tower/staging_guard.py"
CLAIM="$SB/scripts/control-tower/claim_release.py"
printf 'x\n' > "$SB/docs/x.md"
# D849: 底座断言（旧写法三行全 `>/dev/null 2>&1` 静默）
if ! git -C "$SB" add -A >/dev/null 2>&1 || ! git -C "$SB" commit -qm "init" >/dev/null 2>&1; then
  echo "❌ 夹具前置失败: 沙箱 git 底座不可用（git add/commit 失败）: $SB" >&2; exit 2
fi
if [ -z "$(git -C "$SB" rev-parse --show-toplevel 2>/dev/null)" ]; then
  echo "❌ 夹具前置失败: git rev-parse --show-toplevel 在沙箱不可用: $SB" >&2; exit 2
fi

mk_brief() { # <D#> <slug> <path-in-q2>
  cat > "$SB/.claude/task-briefs/${TODAY}-${1}-${2}.md" <<EOF
# Task Brief: ${1}
#CRITERIA: A

## Q0: 定位 — 夹具

## Q1: 调研 — 夹具

## Q2: 范围 — 夹具
做什么：
- ${3}

不做什么：
- 不改 docs/x.md.bak

## Q3: 验收 — 夹具

## 架构层: 基础设施
## Done 标准
- [ ] 夹具
EOF
}
mk_state() { # <D#> <status|NONE>
  if [ "$2" = "NONE" ]; then rm -f "$SB/task-state/$1.json"; return; fi
  printf '{"task_id":"%s","title":"夹具","status":"%s"}\n' "$1" "$2" > "$SB/task-state/$1.json"
  # D846/D849: 释放判定（claim_release.py 证据源 2）只认 **已提交**（git show HEAD:）的卡——
  # 只写工作树 = 未提交的卡不作为释放证据（这正是 D846 要消灭的"无痕伪造"面）。
  # 故夹具必须提交卡，否则场景 A 在新语义下红。NONE 分支（场景 D）只删工作树文件：
  # HEAD 里仍是上一次提交的 status，语义与"拿不到已完成证据 → 不释放"一致，不受影响。
  git -C "$SB" add "task-state/$1.json" >/dev/null 2>&1 || true
  git -C "$SB" commit -qm "state $1=$2" >/dev/null 2>&1 || true
}
run_guard() { # <session-id> → OUT / EC
  OUT=$(cd "$SB" && python3 "$GUARD" --session-id "$1" --staged docs/x.md 2>&1); EC=$?
}

# ── D849 ③ 前置断言: 认领链必须**看得见沙箱** ──
# 忠实复刻 staging_guard.py:153-156 的调用链：native python → 裸 ["bash", ...] →
# resolve-commit-brief.sh（不传 cwd，继承沙箱 CWD；脚本路径用 os.path.join = Windows 反斜杠形）。
# 这里红 = 路径命名空间/依赖链断裂；此时下面所有"应拦"的判定都会 fail-open 假绿，
# 所以必须显式红 + 带证据，绝不允许静默通过（这正是 Windows 12 红此前无法定位的原因）。
_probe_chain() {
  (cd "$SB" && python3 - "$SB" "$BASH_BIN" <<'PYEOF' 2>&1
import os, subprocess, sys
sb = sys.argv[1]
bash_bin = sys.argv[2]          # D853: 显式绝对路径（native python 解析裸 "bash" 会命中 WSL 桩）
script = os.path.join(sb, "scripts", "workflow", "resolve-commit-brief.sh")


def run(argv):
    try:
        return subprocess.run(argv, capture_output=True, text=True, encoding="utf-8",
                              errors="replace", timeout=30)
    except Exception as exc:  # noqa: BLE001 — 探测目的就是暴露异常
        sys.stderr.write("PROBE_EXC=%s: %s\n" % (type(exc).__name__, exc))
        return None


def form(s):
    """路径命名空间形态: posix(/…) / win(C:…) / 缺（FAIL/NONE）。"""
    if not s or s in ("FAIL", "NONE"):
        return s or "?"
    if s.startswith("/"):
        return "posix"
    return "win" if len(s) > 1 and s[1] == ":" else "rel"


p = run([bash_bin, script, "--session", "D902", "docs/x.md"])
# 子链事实（同一 spawn 路径: native python → bash）：路径命名空间 + git/python 可达性 +
#   **python 试运行 rc**（D853：`command -v` 命中 ≠ 能跑——WindowsApps 占位 shim 正是"存在但跑不动"）
e = run([bash_bin, "-c",
         'echo "pwd=$PWD"; echo "top=$(git rev-parse --show-toplevel 2>/dev/null || echo FAIL)";'
         ' echo "git=$(command -v git || echo NONE)"; PY=$(command -v python3 || echo NONE); echo "py=$PY";'
         ' if [ "$PY" != "NONE" ]; then "$PY" -c "import sys" >/dev/null 2>&1; echo "pyrun=$?";'
         ' else echo "pyrun=NONE"; fi'])
facts = {}
if e is not None:
    for line in e.stdout.splitlines():
        k, _, v = line.partition("=")
        facts[k.strip()] = v.strip()
print("PROBE_RC=%s PY=%s BASH=%s OUT=%s" % (
    "EXC" if p is None else p.returncode,
    "%s:%s" % (os.path.basename(facts.get("py", "NONE") or "NONE"), facts.get("pyrun", "NONE")),
    os.path.basename(bash_bin),
    "" if p is None else os.path.basename(p.stdout.strip())))
print("PROBE_ENV pwd=%s top=%s git=%s" % (
    form(facts.get("pwd", "")), form(facts.get("top", "")),
    os.path.basename(facts.get("git", "NONE") or "NONE")))
PYEOF
  )
}

scen_start
echo "── 场景 A: 已完成任务 A 声明 X + 新任务 B 改 X → 修复后应放行(warn) ──"
rm -f "$SB"/.claude/task-briefs/*.md
mk_brief D901 a "docs/x.md"
mk_brief D902 b "docs/x.md"
mk_state D901 impl_done
mk_state D902 claimed
PROBE=$(_probe_chain)
assert_contains "$PROBE" "PROBE_RC=0" "前置 认领链可达（native python→bash→resolver，exit 0）"
assert_contains "$PROBE" "D902-b.md" "前置 认领链解析出沙箱 brief（路径命名空间同实体；否则下面全是假绿）"
run_guard D902
diag A "$EC" "$(_status_of "$OUT")"
assert_eq "$EC" "0" "场景A exit 0（不再硬阻断）"
assert_contains "$OUT" '"status": "warn"' "场景A status=warn（降级为警告）"
assert_contains "$OUT" "D901" "场景A 释放理由点名被释放的任务 D901"
assert_contains "$OUT" "impl_done" "场景A 释放依据=task-state 状态 impl_done"
assert_not_contains "$OUT" '"status": "block"' "场景A 不得 block"
# 源头修复直测（resolver 有 6 个生产消费者：G12 范围 / commit-msg / verifiable-done /
# plan-integrity / brief-vs-code / staging_guard —— 任一拿到已完成任务的 brief 都按错任务校验）
# D849 ②: 证据文件落沙箱（旧写法写死 /tmp/d839-res.err = 跨运行/跨机器共享路径）
RES_ERR_FILE="$SB/.res-probe.err"
RES_OUT=$(cd "$SB" && "$BASH_BIN" "$SB/scripts/workflow/resolve-commit-brief.sh" --session D902 "docs/x.md" 2>"$RES_ERR_FILE")
RES_ERR=$(cat "$RES_ERR_FILE" 2>/dev/null || true)
assert_contains "$RES_OUT" "D902-b.md" "场景A resolver 源头已剔除已释放 brief → 返回本 session 的 brief"
assert_not_contains "$RES_OUT" "D901-a.md" "场景A resolver 不再返回已完成任务的 brief"
assert_contains "$RES_ERR" "SYNO-RELEASED-CLAIM" "场景A resolver 公告被剔除的已释放认领（供门禁降 warn）"
assert_contains "$RES_ERR" "D901" "场景A 公告点名 D901"

scen_end SCEN_A
scen_start
echo "── 场景 B（反向）: 任务 A 仍在进行(claimed) → 仍必须 block ──"
mk_state D901 claimed
run_guard D902
diag B "$EC" "$(_status_of "$OUT")"
assert_eq "$EC" "1" "场景B exit 1（硬阻断保持）"
assert_contains "$OUT" '"status": "block"' "场景B status=block（并发保护未放松）"
assert_contains "$OUT" "claim_release.py release" "场景B block 文案含可执行释放命令"

scen_end SCEN_B
scen_start
echo "── 场景 D（降级 fail-closed）: 任务 A 无 task-state 卡 → 不释放，仍 block ──"
mk_state D901 NONE
run_guard D902
diag D "$EC" "$(_status_of "$OUT")"
assert_eq "$EC" "1" "场景D exit 1（拿不到已完成证据 → 不放行）"
assert_contains "$OUT" '"status": "block"' "场景D status=block（fail-closed）"

scen_end SCEN_D
scen_start
echo "── 场景 C（持久化）: 显式释放 + status 漂移 + brief 回 ASCII + declare-write-set 重跑 → 不复活 ──"
if [ ! -f "$CLAIM" ]; then
  fail "场景C claim_release.py 不存在（未实现）"
else
  mk_state D901 impl_done
  RL=$(cd "$SB" && python3 "$CLAIM" --repo "$SB" release --task D901 --reason "夹具: 任务已完成" 2>&1); RLEC=$?
  assert_eq "$RLEC" "0" "场景C 显式释放 exit 0"
  assert_contains "$RL" "claim-releases.json" "场景C 释放落到台账（非 brief 文本）"
  mk_state D901 claimed                     # status 漂移（模拟后续误改）
  # 造出真实变更 + 必须 cd 沙箱（否则 git rev-parse --show-toplevel = 真实仓库 → 越界）
  printf 'y\n' >> "$SB/docs/x.md"
  git -C "$SB" add docs/x.md >/dev/null 2>&1
  (cd "$SB" && "$BASH_BIN" "$SB/scripts/control-tower/declare-write-set.sh" \
     --brief "$SB/.claude/task-briefs/${TODAY}-D901-a.md" --staged) >/dev/null 2>&1
  assert_contains "$(cat "$SB/.claude/task-briefs/${TODAY}-D901-a.md")" "| docs/x.md |" "场景C declare-write-set 重跑确实用 ASCII 重生成机器块"
  run_guard D902
  diag C "$EC" "$(_status_of "$OUT")"
  assert_eq "$EC" "0" "场景C 重跑后 exit 0（认领不复活）"
  assert_not_contains "$OUT" '"status": "block"' "场景C 释放持久化 → status 漂移也不复活"
fi

scen_end SCEN_C
scen_start
echo "── 场景 E（批量扫描 / 批量释放）──"
if [ ! -f "$CLAIM" ]; then
  fail "场景E claim_release.py 不存在（未实现）"
else
  mk_state D901 impl_done
  SC=$(cd "$SB" && python3 "$CLAIM" --repo "$SB" scan --json 2>&1)
  assert_contains "$SC" '"stale"' "场景E scan 输出含 stale 列表"
  assert_contains "$SC" "D901" "场景E scan 认出失效认领 D901"
  RS=$(cd "$SB" && python3 "$CLAIM" --repo "$SB" release-stale --apply 2>&1)
  assert_eq "$?" "0" "场景E release-stale --apply exit 0"
  assert_contains "$RS" "D901" "场景E 批量释放点名 D901"
  SC2=$(cd "$SB" && python3 "$CLAIM" --repo "$SB" scan --json 2>&1)
  if echo "$SC2" | grep -q '"released": false'; then fail "场景E 批量释放后仍有未释放项"; else pass "场景E 批量释放后 released 全 true"; fi
fi

scen_end SCEN_E
scen_start
echo "── 场景 G（降级 · 铁律 11）: 释放判定不可用 → 可见 + fail-closed（不误放行）──"
if [ -f "$CLAIM" ]; then
  mv "$CLAIM" "$CLAIM.off"
  # D849 ④: 旧写法 `set_state` 在本文件**未定义**（只存在于 claim_release.test.sh）——
  #   无 set -e + 无断言 → 这步静默无效（K3 D841 P2-2 点名 :185）。改用本文件已有的 mk_state。
  mk_state D901 impl_done
  run_guard D902
  diag G "$EC" "$(_status_of "$OUT")"
  assert_eq "$EC" "1" "场景G 释放维度不可用 → 仍 block（fail-closed，绝不误放行）"
  assert_contains "$OUT" '"degraded": true' "场景G 降级信号显式传播到结果（不静默）"
  assert_contains "$OUT" 'claim_release' "场景G 降级原因点名缺失模块"
  RES_ERR2=$(cd "$SB" && "$BASH_BIN" "$SB/scripts/workflow/resolve-commit-brief.sh" --session D902 "docs/x.md" 2>&1 >/dev/null || true)
  assert_contains "$RES_ERR2" "SYNO-CLAIM-RELEASE-DEGRADED" "场景G resolver 也发显式降级公告"
  mv "$CLAIM.off" "$CLAIM"
else
  fail "场景G claim_release.py 不存在（未实现）"
fi
scen_end SCEN_G
scen_start
echo "── 场景 H（D853 · 链断 fail-closed）: python 不可用 → resolver 链断 → 必须 block（禁静默 pass）──"
if [ -f "$CLAIM" ]; then
  mk_state D901 claimed          # 本应 block（他人进行中认领）
  SHIM=$(mktemp -d)
  printf '#!/bin/sh\nexit 1\n' > "$SHIM/python3"; chmod +x "$SHIM/python3"
  cp "$SHIM/python3" "$SHIM/python"; cp "$SHIM/python3" "$SHIM/py"
  REALPY=$(command -v python3)
  # ── 前提探针（D853-8 修正）：必须**复刻 guard 的调用环境**再判"本环境能否造出链断" ──
  #   旧探针用裸 bash 直调 → 与 guard 的真实调用不同（guard 走 _find_bash + _bash_env）。
  #   Windows 上 `_bash_env()` 会把 `Path(sys.executable).parent`（= hostedtoolcache，**内含可用 python3.exe**）
  #   前置进 PATH → PATH 上的坏 shim 被反超 → **guard 那次调用里链根本断不了**（该状态在 guard 调用路径上不可达）。
  #   故前提探针必须用 guard 自己的 _find_bash()/_bash_env() + parse_resolver_degraded() 复刻。
  #   ⚠ 探针必须继承场景 H 的 PATH（含坏 shim）——否则测的是"正常环境"，前提判定失真
  #   ⚠ 且必须用**绝对解释器**启动探针（PATH 首位是坏 shim，裸 python3 会跑不起来 → 探针静默空）
  H_PREM=$(cd "$SB" && PATH="$SHIM:$PATH" "$REALPY" - "$SB" <<'PYEOF' 2>&1
import os, subprocess, sys
sb = sys.argv[1]
sys.path.insert(0, os.path.join(sb, "scripts", "control-tower"))
import staging_guard as sg                      # noqa: E402
b, why = sg._find_bash()
if b is None:
    print("NOBASH:%s" % why); raise SystemExit(0)
p = subprocess.run([b, os.path.join(sb, "scripts", "workflow", "resolve-commit-brief.sh"),
                    "--session", "D902", "docs/x.md"],
                   capture_output=True, text=True, encoding="utf-8", errors="replace",
                   env=sg._bash_env(b), cwd=sb)
print("MARK" if sg.parse_resolver_degraded(p.stderr) else "NOMARK rc=%s" % p.returncode)
PYEOF
  )
  H_RES=$(cd "$SB" && PATH="$SHIM:$PATH" "$BASH_BIN" "$SB/scripts/workflow/resolve-commit-brief.sh" --session D902 docs/x.md 2>&1); H_RC=$?
  H_MARK=$(printf '%s' "$H_RES" | grep -oE 'SYNO-RESOLVER-DEGRADED' | head -1)
  DIAG_H=$(printf 'rc=%s mark=[%s] guard_prem=[%s]' "$H_RC" "${H_MARK:-none}" "${H_PREM:-none}")
  # 生产方契约（resolver 侧）：坏 python 的 PATH 下必须发标记 ✓ 全平台应成立
  assert_contains "$H_RES" "SYNO-RESOLVER-DEGRADED" "场景H resolver 侧发链断标记（生产方契约）"
  if [ "$H_PREM" = "MARK" ]; then
    # 消费方契约（端到端）：guard 自己的环境下链确实断 → 必须 fail-closed
    OUT=$(cd "$SB" && PATH="$SHIM:$PATH" "$REALPY" "$GUARD" --session-id D902 --staged docs/x.md 2>&1); EC=$?
    diag H "$EC" "$(_status_of "$OUT")"
    DIAG_H="$DIAG_H g=[$(printf '%s' "$OUT" | grep -oE '"status": "[a-z]+"' | head -1)]"
    assert_eq "$EC" "1" "场景H 链断 → exit 1（fail-closed，禁静默 pass）"
    assert_contains "$OUT" '"status": "block"' "场景H status=block（不是 pass）"
    assert_contains "$OUT" '"degraded": true' "场景H 降级显式传播（铁律 11/31）"
  else
    # 前提不可造 → **不计分但显式打印**（不静默通过）；消费方契约由 H2 全平台确定覆盖。
    #   依据：guard 的 _bash_env()（Windows-only）保证"自己的解释器目录"永远在 PATH 上 →
    #   只要 guard 在跑，它派生的 resolver 就一定找得到 python ⇒ "guard 调用路径上 python 不可用"不可达。
    echo "  ⚠ 场景H 前提不可造（guard 侧 PATH 仍含可用 python：$H_PREM）→ 该状态在 guard 调用路径上不可达；消费方契约由场景 H2 覆盖"
  fi
  # 标记字面量两端一致（resolver 发 / guard 解析）——防两处定义漂移（D839 踩过）
  RESM=$(grep -o "SYNO-RESOLVER-DEGRADED" "$SB/scripts/workflow/resolve-commit-brief.sh" | head -1)
  GRDM=$(cd "$SB" && python3 -c "import sys;sys.path.insert(0,'scripts/control-tower');import staging_guard;print(staging_guard.RESOLVER_DEGRADED_MARK)")
  assert_eq "$RESM" "$GRDM" "场景H 链断标记字面量两端一致（防漂移）"
  assert_contains "$RESM" "SYNO-RESOLVER-DEGRADED" "场景H resolver 侧确实发该标记（非空，防两端同为空假绿）"
  rm -rf "$SHIM"
else
  fail "场景H claim_release.py 不存在（未实现）"
fi
scen_end SCEN_H
scen_start
echo "── 场景 H2（D853 · 契约级）: resolver 发链断标记 → guard 必须 fail-closed（全平台确定）──"
if [ -f "$CLAIM" ]; then
  mk_state D901 claimed
  REAL_RES="$SB/scripts/workflow/resolve-commit-brief.sh"
  cp "$REAL_RES" "$REAL_RES.real"
  # 桩：只发标记 + exit 1（模拟"python/git 不可用"的 resolver），其余行为无关
  cat > "$REAL_RES" <<'STUBEOF'
#!/usr/bin/env bash
printf 'SYNO-RESOLVER-DEGRADED\t夹具桩：python 不可用\n' >&2
exit 1
STUBEOF
  chmod +x "$REAL_RES"
  OUT=$(cd "$SB" && python3 "$GUARD" --session-id D902 --staged docs/x.md 2>&1); EC=$?
  mv "$REAL_RES.real" "$REAL_RES"
  diag H2 "$EC" "$(_status_of "$OUT")"
  assert_eq "$EC" "1" "场景H2 标记 → exit 1（fail-closed）"
  assert_contains "$OUT" '"status": "block"' "场景H2 status=block（不是 pass/warn）"
  assert_contains "$OUT" '"degraded": true' "场景H2 降级显式传播（铁律 11/31）"
  assert_contains "$OUT" '认领判定不可用' "场景H2 原因点名（可诊断，非静默）"
else
  fail "场景H2 claim_release.py 不存在（未实现）"
fi


echo "── 场景 F（沙箱围栏）: 测试不得写真实仓库 ──"
scen_start
# D849 ②: 旧写法用 shasum（Windows Git Bash 无）→ 两边都取空串 → "空 == 空" 恒绿 = 假绿围栏。
#   现在: 可移植哈希 + 哈希不可得时**判红**（围栏失效必须是可见的红，绝不静默放行）。
if [ -f "$REAL_LEDGER" ]; then REAL_LEDGER_NOW=$(_sha256 "$REAL_LEDGER"); else REAL_LEDGER_NOW="ABSENT"; fi
if [ -z "$REAL_LEDGER_NOW" ]; then
  fail "场景F 无可用哈希工具（sha256sum/shasum/python3 全缺）→ 围栏无法判定（禁假绿）"
elif [ "$REAL_LEDGER_SIG" = "$REAL_LEDGER_NOW" ]; then
  pass "场景F 真实仓库释放台账指纹未变（${REAL_LEDGER_NOW}）"
else
  fail "场景F 测试越界改写了真实仓库释放台账（$REAL_LEDGER_SIG → ${REAL_LEDGER_NOW}）"
fi
for _p in task-state/D901.json task-state/D902.json; do
  [ -e "$REPO_DIR/$_p" ] && fail "场景F 测试越界写入真实仓库 $_p" || pass "场景F 真实仓库无 ${_p}（无越界）"
done
scen_end SCEN_F
echo "──────────────────────────────────────────────"
echo "  场景A(放行)      : $SCEN_A"
echo "  场景B(反向仍拦)   : $SCEN_B"
echo "  场景C(持久化)     : $SCEN_C"
echo "  场景D(降级不放行) : $SCEN_D"
echo "  场景E(批量)       : $SCEN_E"
echo "  场景F(沙箱围栏)   : $SCEN_F"
echo "  场景G(降级可见)   : $SCEN_G"
echo "  PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "FAIL=0" || echo "FAIL=$FAIL"
if [ "$FAIL" -ne 0 ]; then
  # D849: CI 只把 tail -8 注入 ::error 注解（.github/workflows/ci.yml:272）——Windows 侧无法本地
  #   复跑，故失败时把"链路证据"压进**末尾**行（放在 FAIL= 之后，避免被 cut -c1-450 截掉）：
  #   场景=各场景 exit/status，链=子链事实（path 命名空间 + git/python 可达性 + **python 试运行 rc**）。
  # D853: 两行各压到 ≤68 字符（含前缀 ≤74）——注解预算是 450 字符且含其他行，长行会被截断丢关键字段。
  echo "DIAG-FAIL $(printf '%s' "$FAILLOG" | tr '\n' ' ' | tr -s ' ' | cut -c1-140)"
  [ -n "${DIAG_H:-}" ] && echo "DIAG-H $(printf '%s' "$DIAG_H" | cut -c1-140)"
  echo "DIAG1 $(printf '%s' "$DIAG" | tr '\n' ' ' | tr -s ' ' | cut -c1-68)"
  echo "DIAG2 $(printf '%s' "$PROBE" | tr '\n' ' ' | tr -s ' ' | cut -c1-68)"
fi
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
