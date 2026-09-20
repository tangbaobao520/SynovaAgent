#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# calc-progress-panel.test.sh — D850 V-2 修复：**面板契约**密封测试
#
# 背景（退回单 V-1/V-2）:
#   V-1 面板侧 evidence_cmd 大面积不可跑（144/203 rc≠0）：点分路径当单键 + 线级键用 `lines[]` 占位。
#   V-2 面板新契约（buckets / evidence_cmd）**零测试覆盖** → 117/0 全绿仍漏 V-1。
#   本文件补上「面板契约」的物理覆盖；由此**任何** future 的 evidence_cmd 形态错误都会红。
#
# 被测对象: scripts/product-lines/calc-progress.py → product-progress.json / product-progress.html
# 覆盖矩阵:
#   ① 重跑本器 → 临时面板 JSON（写入 mktemp，**不写仓库**）
#   ② 抽出**全部** evidence_cmd（顶层 + 每条线）逐条 `bash -c` → 断言 rc=0
#   ③ 每条输出值 == 该 JSON 里对应 `count`（含 null → "None"，不放过任何一条）
#   ④ 面板无渲染型百分比（HTML 结构判据 + buckets 内无 *_pct 键）
#   ⑤ 反漂移：**已提交的**派生件 == 现场重跑结果（同源一致性，防提交陈旧件）
#   ⑥ 源侧独立核对：independent_check_cmd 输出与档值一致（不读派生件的独立判据）
#   ⑦ 诚实口径：null 档必须带 reason；不得把「能跑未验证」并进 healthy；恒等式闭合
#
# 权威: docs/authority/产品完成度定义与推进总纲-20260918.md §1.2（v1）「离散计数，不是百分比」
#       + 方案-项目度量-从声明驱动到事实驱动.md §四「每个数字必须带一条可复现的命令。不能复现的数字，不上看板」
# 沙箱: mktemp + 只读仓库（跑完断言仓库 git status 不变）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUT="$REPO/scripts/product-lines/calc-progress.py"
PAGE_GEN="$REPO/scripts/product-lines/gen-progress-page.py"
COMMITTED_JSON="$REPO/docs/synova/product-lines/product-progress.json"
COMMITTED_HTML="$REPO/docs/synova/product-lines/product-progress.html"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

# PLATFORM-CHECKLIST #1: PYBIN 三级探测（禁裸 python3）
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
[ -n "$PYBIN" ] || { echo "❌ 无可用 python"; exit 2; }

echo "=== D850: calc-progress 面板契约（buckets / evidence_cmd）==="

# ═══ 组 ① 重跑本器 → 临时面板 JSON（不写仓库）═══
echo "① 重跑本器（--out 到 mktemp，不写仓库）"
FRESH="$TMPD/fresh.json"
"$PYBIN" "$SUT" --out "$FRESH" >/dev/null 2>&1; RC1=$?
[ "$RC1" = "0" ] && ok "calc-progress.py exit 0" || no "calc-progress.py exit $RC1"
[ -f "$FRESH" ] && ok "产出面板 JSON" || { no "未产出面板 JSON"; echo; echo "PASS=$PASS FAIL=$FAIL"; exit 1; }

# ═══ 组 ②③ 全部 evidence_cmd 逐条实跑 + 逐条对账 ═══
echo "②③ 全部 evidence_cmd 逐条 bash -c 实跑，断言 rc=0 且值 == JSON count"
WRK="$TMPD/wrk.json"; cp "$FRESH" "$WRK"
"$PYBIN" - "$WRK" "$REPO" <<'PY' > "$TMPD/ev.txt" 2>&1
import json, subprocess, sys
path, repo = sys.argv[1], sys.argv[2]
d = json.load(open(path, encoding='utf-8'))

def collect(bk, tag):
    out = []
    for k in ('healthy', 'written_not_wired', 'missing'):
        if isinstance(bk.get(k), dict):
            out.append(('%s.%s' % (tag, k), k, bk[k]))
    for k, v in (bk.get('other_states') or {}).items():
        out.append(('%s.other_states.%s' % (tag, k), k, v))
    return out

items = collect(d.get('buckets') or {}, 'TOP')
for l in d.get('lines') or []:
    items += collect(l.get('buckets') or {}, 'line%s' % l.get('id'))
if not items:
    print('NO 未抽到任何 buckets 档（面板契约缺失）')
    raise SystemExit(0)

bad_rc, bad_val, empty, no_buckets = [], [], [], []
for name, field, e in items:
    cmd = e.get('evidence_cmd')
    if not isinstance(cmd, str) or not cmd.strip():
        empty.append(name); continue
    p = subprocess.run(['bash', '-c', cmd], capture_output=True, text=True, cwd=repo, timeout=120)
    got = (p.stdout or '').strip().replace('\n', ' ')
    if p.returncode != 0:
        err = ((p.stderr or p.stdout) or '').strip().splitlines()
        bad_rc.append('%s rc=%d %s' % (name, p.returncode, (err[-1] if err else '')[:90]))
        continue
    want = '%s=%s' % (field, e.get('count'))
    if got != want:
        bad_val.append('%s 期望[%s] 实得[%s]' % (name, want, got))

print('OK 抽出 evidence_cmd 共 %d 条（顶层 %d + 线级 %d）'
      % (len(items), len([i for i in items if i[0].startswith('TOP')]),
         len([i for i in items if i[0].startswith('line')])))
if empty:
    print('NO evidence_cmd 为空 %d 条: %s' % (len(empty), empty[:5]))
else:
    print('OK 全部 evidence_cmd 非空')
if bad_rc:
    print('NO evidence_cmd 不可跑 %d/%d 条: %s' % (len(bad_rc), len(items), ' | '.join(bad_rc[:5])))
else:
    print('OK 全部 evidence_cmd rc=0（%d 条）' % len(items))
if bad_val:
    print('NO evidence_cmd 值不匹配 %d/%d 条: %s' % (len(bad_val), len(items), ' | '.join(bad_val[:5])))
else:
    print('OK 全部 evidence_cmd 输出值 == JSON count（%d 条逐条对账）' % len(items))
PY
while IFS= read -r line; do
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    NO\ *) no "${line#NO }" ;;
    *)     echo "    $line" ;;
  esac
done < "$TMPD/ev.txt"

# ═══ 组 ⑥ 源侧独立判据（两类语义不可混用）═══
#   independent_check_cmd — 不读派生件、**独立复现同一个数字**（输出 `<field>=<count>`）
#   source_probe_cmd      — 证明该档「无机器可读判定源」（输出 `<field>=SOURCE_ABSENT`），
#                           它**不**复现数字：显式 null 的依据
echo "⑥ 源侧独立判据（independent_check_cmd / source_probe_cmd 两类语义分开验）"
"$PYBIN" - "$WRK" "$REPO" <<'PY' > "$TMPD/ind.txt" 2>&1
import json, subprocess, sys
path, repo = sys.argv[1], sys.argv[2]
d = json.load(open(path, encoding='utf-8'))
b = d.get('buckets') or {}
ind_found, probe_found, bad = 0, 0, []

def run(cmd):
    return subprocess.run(['bash', '-c', cmd], capture_output=True, text=True, cwd=repo, timeout=120)

def visit(tag, e, field):
    global ind_found, probe_found
    c = e.get('independent_check_cmd')
    if isinstance(c, str) and c.strip():
        ind_found += 1
        p = run(c)
        got = (p.stdout or '').strip()
        if p.returncode != 0:
            bad.append('%s independent rc=%d' % (tag, p.returncode))
        elif got != '%s=%s' % (field, e.get('count')):
            bad.append('%s independent 期望[%s=%s] 实得[%s]' % (tag, field, e.get('count'), got))
    pr = e.get('source_probe_cmd')
    if isinstance(pr, str) and pr.strip():
        probe_found += 1
        p = run(pr)
        got = (p.stdout or '').strip()
        if p.returncode != 0:
            bad.append('%s probe rc=%d' % (tag, p.returncode))
        elif not got.endswith('=SOURCE_ABSENT'):
            bad.append('%s probe 期望 SOURCE_ABSENT 实得[%s]' % (tag, got))

for k in ('healthy', 'written_not_wired', 'missing'):
    if isinstance(b.get(k), dict):
        visit('TOP.' + k, b[k], k)
for k, v in (b.get('other_states') or {}).items():
    visit('TOP.other_states.' + k, v, k)
if ind_found == 0:
    bad.append('无任何 independent_check_cmd（面板缺可独立复现的数字）')
if probe_found == 0:
    bad.append('无任何 source_probe_cmd（显式 null 缺可复现依据）')
print('NO 源侧判据失败: %s' % ' | '.join(bad[:4]) if bad else
      'OK 源侧判据 rc=0 且语义正确（independent %d 条复现数字 / probe %d 条证明无判定源）'
      % (ind_found, probe_found))
PY
while IFS= read -r line; do
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    NO\ *) no "${line#NO }" ;;
    *)     echo "    $line" ;;
  esac
done < "$TMPD/ind.txt"

# ═══ 组 ⑦ 诚实口径（null + reason / 不并健康 / 恒等式 / stale 单列）═══
echo "⑦ 诚实口径（null 带 reason / 能跑未验证不并健康 / 恒等式闭合）"
"$PYBIN" - "$WRK" <<'PY' > "$TMPD/hon.txt" 2>&1
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
b = d.get('buckets') or {}
bad = []
if not b:
    print('NO 面板顶层 buckets 缺失'); raise SystemExit(0)
for k in ('healthy', 'written_not_wired', 'missing'):
    e = b.get(k) or {}
    if e.get('count') is None and not (e.get('reason') or '').strip():
        bad.append('%s null 却无 reason' % k)
    if 'count' not in e:
        bad.append('%s 缺 count 键' % k)
if not b.get('other_states'):
    bad.append('缺 other_states（能跑未验证等必须显式列出）')
ident = b.get('identity') or {}
if ident.get('holds') is not True:
    bad.append('顶层恒等式未闭合: %s' % ident.get('holds'))
known = ident.get('known_terms_sum')
if known is not None and b.get('denominator') is not None and known != b['denominator']:
    bad.append('已知项之和 %s ≠ denominator %s' % (known, b['denominator']))
# 逐线恒等式
for l in d.get('lines') or []:
    lb = l.get('buckets') or {}
    if (lb.get('identity') or {}).get('holds') is not True:
        bad.append('线 %s 恒等式未闭合' % l.get('id')); break
# 「能跑未验证」必须与 healthy 分开计数（同一批点不得同时计入两档）
lv = (b.get('other_states') or {}).get('live_unverified') or {}
if 'count' not in lv:
    bad.append('other_states.live_unverified 缺 count（能跑未验证必须单独成态）')
print('NO 诚实口径失败: %s' % ' | '.join(bad) if bad else
      'OK 诚实口径: null 均带 reason / 其它态显式列出 / 顶层与逐线恒等式闭合（declared=%s）'
      % b.get('denominator'))
PY
while IFS= read -r line; do
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    NO\ *) no "${line#NO }" ;;
    *)     echo "    $line" ;;
  esac
done < "$TMPD/hon.txt"

# ═══ 组 ⑤ 反漂移：已提交派生件 == 现场重跑 ═══
echo "⑤ 反漂移（已提交的 product-progress.json 与现场重跑逐 key 相等）"
if [ -f "$COMMITTED_JSON" ]; then
  DRIFT="$("$PYBIN" - "$COMMITTED_JSON" "$FRESH" <<'PY'
import json, sys
a = json.load(open(sys.argv[1], encoding='utf-8'))
b = json.load(open(sys.argv[2], encoding='utf-8'))
for k in ('generated_at',):
    a.pop(k, None); b.pop(k, None)
def walk(x, y, p=''):
    out = []
    if type(x) is not type(y): return [p + ' type %s!=%s' % (type(x).__name__, type(y).__name__)]
    if isinstance(x, dict):
        for k in sorted(set(x) | set(y)):
            if k not in x: out.append(p + '/' + k + ' only-in-fresh')
            elif k not in y: out.append(p + '/' + k + ' only-in-committed')
            else: out += walk(x[k], y[k], p + '/' + k)
    elif isinstance(x, list):
        if len(x) != len(y): out.append(p + ' len %d!=%d' % (len(x), len(y)))
        else:
            for i, (u, v) in enumerate(zip(x, y)): out += walk(u, v, '%s[%d]' % (p, i))
    elif x != y: out.append('%s %r!=%r' % (p, x, y))
    return out
d = walk(a, b)
print('\n'.join(d[:6]))
PY
)"
  if [ -z "$DRIFT" ]; then
    ok "已提交派生件与现场重跑逐 key 相等（generated_at 除外）——除件未陈旧"
  else
    no "派生件陈旧（需由脚本重生成后提交）: $DRIFT"
  fi
else
  no "缺已提交派生件 $COMMITTED_JSON"
fi

# ═══ 组 ④ 面板无渲染型百分比 ═══
echo "④ 面板零渲染型百分比（HTML 结构 + buckets 无 *_pct 键）"
"$PYBIN" - "$WRK" <<'PY' > "$TMPD/pct.txt" 2>&1
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))

def keys(x):
    if isinstance(x, dict):
        for k, v in x.items():
            yield k
            for kk in keys(v): yield kk
    elif isinstance(x, list):
        for v in x:
            for kk in keys(v): yield kk

pct = sorted(set(k for k in keys(d.get('buckets') or {}) if k.endswith('_pct')))
bad = []
if pct: bad.append('buckets 内出现百分比键 %s' % pct)
for k in ('product_progress_pct', 'delivery_pct', 'verify_pct'):
    if k in d: bad.append('顶层仍有 %s' % k)
if d.get('total_lines') != 29:
    bad.append('total_lines=%s（期望 29 = v1 + v2 追平）' % d.get('total_lines'))
# 兼容字段必须**显式标 deprecated**，且面板不渲染它
dep = d.get('deprecated_fields') or {}
if 'lines[].progress_pct' not in dep:
    bad.append('线级 progress_pct 未在 deprecated_fields 显式登记')
print('NO 面板百分比口径失败: %s' % ' | '.join(bad) if bad else
      'OK 面板 JSON: total_lines=29 / buckets 无 *_pct 键 / 兼容字段已标 deprecated')
PY
while IFS= read -r line; do
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    NO\ *) no "${line#NO }" ;;
    *)     echo "    $line" ;;
  esac
done < "$TMPD/pct.txt"

FRESH_HTML="$TMPD/fresh.html"
if [ -f "$PAGE_GEN" ]; then
  "$PYBIN" "$PAGE_GEN" --progress "$FRESH" --out "$FRESH_HTML" >/dev/null 2>&1; RCP=$?
  [ "$RCP" = "0" ] && ok "gen-progress-page.py exit 0（渲染临时面板）" || no "gen-progress-page.py exit $RCP"
  if [ -f "$FRESH_HTML" ]; then
    H_BAD=""
    grep -q 'class="pct"' "$FRESH_HTML" && H_BAD="$H_BAD 残留线级百分比 span(class=pct)"
    grep -q 'bar-fill' "$FRESH_HTML" && H_BAD="$H_BAD 残留进度条(bar-fill)"
    grep -qE '<span class="big">[0-9]+' "$FRESH_HTML" && H_BAD="$H_BAD 头部仍渲染大字数字(可能是百分比)"
    grep -q '29 条产品线' "$FRESH_HTML" || H_BAD="$H_BAD 缺「29 条产品线」"
    grep -q '写了没接' "$FRESH_HTML" || H_BAD="$H_BAD 三档未渲染(缺「写了没接」)"
    grep -q 'bkt-cmd' "$FRESH_HTML" || H_BAD="$H_BAD 未渲染每档 evidenceCmd"
    [ -z "$H_BAD" ] && ok "面板 HTML: 无百分比渲染 + 29 条产品线 + 三档 + 每档 evidenceCmd" || no "面板 HTML:$H_BAD"
  else
    no "未产出临时面板 HTML"
  fi
else
  no "缺 $PAGE_GEN"
fi

# ═══ 只读证明：不得写脏真实仓库 ═══
if [ -d "$REPO/.git" ]; then
  DIRTY="$(git -C "$REPO" status --porcelain 2>/dev/null | grep -c 'product-progress' || true)"
  [ "${DIRTY:-0}" = "0" ] && ok "未写脏真实仓库的 product-progress.*" || no "真实仓库 product-progress.* 被本次测试写脏"
fi

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
exit 0
