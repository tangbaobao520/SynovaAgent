#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# calc-progress-panel.test.sh — D850 面板契约密封测试（V-2 首版 + 第二轮 ⓓ-1..5 收紧）
#
# 被测对象: scripts/product-lines/calc-progress.py → product-progress.json / product-progress.html
# 覆盖矩阵:
#   ⓓ-5 git 闸     — 无 .git / shallow → **显式 SKIP + 打印原因 + exit 0**（不得报「派生件陈旧」：
#                     freshness gate 无 git 会让 live_unverified/stale 漂移，是环境差异不是陈旧）
#   ① 件级重算      — 跑件内 `regenerate_cmd`（源侧重算，--today 固定）→ /tmp/ro-pp.json
#   ② evidence_cmd  — **全部**（顶层 7 + 线级 196 = 203）逐条 bash -c：rc=0 且输出 == 提交件该档 count
#                     （形态 = 源侧重算并与提交件比对；**不读回提交件充当证据**）
#   ③ 自查命令      — artifact_selfcheck_cmd 逐条 rc=0 且值一致（毫秒级读回；**不承担可证伪职责**）
#   ④ 独立判据      — independent_check_cmd 三类语义分开验 equality / reconciliation / bound，
#                     且**线级必须存在**（线级恰是创始人第一眼看的粒度）
#   ⑤ 诚实口径      — null 带 reason / 其它态显式列出 / 恒等式闭合 / cmd_semantics 已披露
#   ⑥ 反漂移        — 件级重算件 == 已提交派生件（逐 key，generated_at 除外）
#   ⑦ 面板零渲染型百分比（HTML 结构 + buckets 无 *_pct 键 + 兼容字段标 deprecated）
#   ⑧ fail-closed   — 重算件缺失时 evidence_cmd **必须报错**，不得静默回退读提交件
#
# 权威: docs/authority/产品完成度定义与推进总纲-20260918.md §1.2（v1）「离散计数，不是百分比」
#       + 方案-项目度量-从声明驱动到事实驱动.md §四「每个数字必须带一条可复现的命令。不能复现的数字，
#         不上看板」＋该节结句「你能自己跑一遍验证——这就是可证伪，也就是信任的来源」
# 沙箱: mktemp + 只读仓库（跑完断言仓库 product-progress.* 未被写脏）
# CI 可移植性: 本测试依赖 git 历史做失效检测（TTL + 变更检测）。`ci.yml` 多个 job 默认
#       fetch-depth: 1 → 本测试会**显式 SKIP 并打印原因**（不假红）；要真跑需加深 checkout 历史。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUT="$REPO/scripts/product-lines/calc-progress.py"
PAGE_GEN="$REPO/scripts/product-lines/gen-progress-page.py"
COMMITTED_JSON="$REPO/docs/synova/product-lines/product-progress.json"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
RO_TMP="/tmp/ro-pp.json"   # 件内 regenerate_cmd 的固定落点（evidence_cmd 的比对基准）

# PLATFORM-CHECKLIST #1: PYBIN 三级探测（禁裸 python3）
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
[ -n "$PYBIN" ] || { echo "❌ 无可用 python"; exit 2; }

echo "=== D850: calc-progress 面板契约（buckets / evidence_cmd / 独立判据）==="

# ═══ ⓓ-5 git 闸：无 git / shallow → 显式 SKIP（不假红，不报「派生件陈旧」）═══
GIT_WHY=""
if ! command -v git >/dev/null 2>&1; then
  GIT_WHY="git 命令不可用"
elif ! git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
  GIT_WHY="无 .git 仓库（${REPO}）"
elif [ "$(git -C "$REPO" rev-parse --is-shallow-repository 2>/dev/null || echo unknown)" = "true" ]; then
  GIT_WHY="shallow clone（fetch-depth: 1 → 失效检测的 git log 历史不完整）"
elif ! git -C "$REPO" log -1 --format=%H >/dev/null 2>&1; then
  GIT_WHY="git 历史不可读（无提交）"
fi
if [ -n "$GIT_WHY" ]; then
  echo "⏭  SKIP: 本测试需要可用的 git 历史（产品进度含「证据时效 + 代码变更」失效检测）。"
  echo "    原因: $GIT_WHY"
  echo "    后果: 无 git 时 freshness gate 无法判定 → live_unverified/stale 等档会漂移，"
  echo "          与提交件比对必然不等 —— 那是**环境差异，不是派生件陈旧**，故本测试跳过而非假红。"
  echo "    要真跑: 用完整克隆（非 shallow）或 checkout 加深历史（actions/checkout fetch-depth: 0）。"
  echo
  echo "PASS=0 FAIL=0 (SKIPPED)"
  exit 0
fi
ok "git 闸: 历史可用（$(git -C "$REPO" rev-parse --short HEAD)），继续"
# 只读基线：测试**自身**不得改变仓库状态（判据 = 前后快照相等，不是「仓库必须干净」——
# 开发中派生件本就可以处于待生成后的待提交状态）
PP_BEFORE="$(git -C "$REPO" status --porcelain 2>/dev/null | grep 'product-progress' || true)"

# ═══ 组 ① 件级源侧重算（regenerate_cmd，--today 固定 → 与提交件可比对）═══
echo "① 件级重算（跑件内 regenerate_cmd → ${RO_TMP}）"
if [ ! -f "$COMMITTED_JSON" ]; then
  no "缺已提交派生件 $COMMITTED_JSON"; echo; echo "PASS=$PASS FAIL=$FAIL"; exit 1
fi
REGEN_CMD="$("$PYBIN" -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['buckets'].get('regenerate_cmd',''))" "$COMMITTED_JSON")"
[ -n "$REGEN_CMD" ] && ok "件内有 regenerate_cmd" || no "件内缺 regenerate_cmd（无法摊薄重算成本）"
rm -f "$RO_TMP"
if [ -n "$REGEN_CMD" ]; then
  bash -c "$REGEN_CMD" >/dev/null 2>&1; RC1=$?
  [ "$RC1" = "0" ] && ok "regenerate_cmd exit 0" || no "regenerate_cmd exit $RC1"
  [ -f "$RO_TMP" ] && ok "产出重算件 $RO_TMP" || no "未产出 $RO_TMP"
fi

# ═══ 组 ②③ 全部 evidence_cmd（源侧重算比对）+ artifact_selfcheck_cmd 逐条实跑 ═══
echo "②③ 全部 evidence_cmd 逐条 bash -c（rc=0 + 值 == 提交件 count）；自查命令同验"
"$PYBIN" - "$COMMITTED_JSON" "$REPO" <<'PY' > "$TMPD/ev.txt" 2>&1
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
    print('NO 未抽到任何 buckets 档（面板契约缺失）'); raise SystemExit(0)

def run(cmd):
    return subprocess.run(['bash', '-c', cmd], capture_output=True, text=True, cwd=repo, timeout=180)

bad_rc, bad_val, empty, no_kind, self_bad = [], [], [], [], []
for name, field, e in items:
    cmd = e.get('evidence_cmd')
    if not isinstance(cmd, str) or not cmd.strip():
        empty.append(name); continue
    if e.get('cmd_kind') != 'source_recompute':
        no_kind.append('%s kind=%r' % (name, e.get('cmd_kind')))
    p = run(cmd)
    got = (p.stdout or '').strip().replace('\n', ' ')
    if p.returncode != 0:
        err = ((p.stderr or p.stdout) or '').strip().splitlines()
        bad_rc.append('%s rc=%d %s' % (name, p.returncode, (err[-1] if err else '')[:90])); continue
    if got != '%s=%s' % (field, e.get('count')):
        bad_val.append('%s 期望[%s=%s] 实得[%s]' % (name, field, e.get('count'), got))
    sc = e.get('artifact_selfcheck_cmd')
    if isinstance(sc, str) and sc.strip():
        q = run(sc)
        if q.returncode != 0 or (q.stdout or '').strip() != '%s=%s' % (field, e.get('count')):
            self_bad.append('%s selfcheck rc=%d 实得[%s]' % (name, q.returncode, (q.stdout or '').strip()))

print('OK 抽出档数 %d（顶层 %d + 线级 %d）'
      % (len(items), len([i for i in items if i[0].startswith('TOP')]),
         len([i for i in items if i[0].startswith('line')])))
print(('NO evidence_cmd 为空 %d 条' % len(empty)) if empty else 'OK 全部 evidence_cmd 非空')
print(('NO cmd_kind 非 source_recompute %d 条: %s' % (len(no_kind), no_kind[:3])) if no_kind
      else 'OK 全部 evidence_cmd 标 cmd_kind=source_recompute')
print(('NO evidence_cmd 不可跑 %d/%d 条: %s' % (len(bad_rc), len(items), ' | '.join(bad_rc[:4]))) if bad_rc
      else 'OK 全部 evidence_cmd rc=0（%d 条，源侧重算 + 与提交件比对）' % len(items))
print(('NO evidence_cmd 值不匹配 %d/%d：%s' % (len(bad_val), len(items), ' | '.join(bad_val[:4]))) if bad_val
      else 'OK 全部 evidence_cmd 输出值 == 提交件 count（%d 条逐条对账）' % len(items))
print(('NO artifact_selfcheck_cmd 失败 %d 条: %s' % (len(self_bad), self_bad[:3])) if self_bad
      else 'OK 全部 artifact_selfcheck_cmd rc=0 且值一致（读回自查，不承担可证伪职责）')
PY
while IFS= read -r line; do
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    NO\ *) no "${line#NO }" ;;
    *)     echo "    $line" ;;
  esac
done < "$TMPD/ev.txt"

# ═══ 组 ④ 独立判据（三类语义分开验；线级必须存在）═══
echo "④ 独立判据 independent_check_cmd（equality / reconciliation / bound；线级必须有）"
"$PYBIN" - "$COMMITTED_JSON" "$REPO" <<'PY' > "$TMPD/ind.txt" 2>&1
import json, subprocess, sys
path, repo = sys.argv[1], sys.argv[2]
d = json.load(open(path, encoding='utf-8'))
b = d.get('buckets') or {}
kinds, line_kinds, bad = {}, {}, []

def run(cmd):
    return subprocess.run(['bash', '-c', cmd], capture_output=True, text=True, cwd=repo, timeout=180)

def visit(tag, e, field, scope):
    c = e.get('independent_check_cmd')
    if not isinstance(c, str) or not c.strip():
        return
    kind = e.get('independent_check_kind')
    kinds[kind] = kinds.get(kind, 0) + 1
    if scope == 'line':
        line_kinds[kind] = line_kinds.get(kind, 0) + 1
    p = run(c)
    out = ((p.stdout or '') + (p.stderr or '')).strip()
    if kind == 'equality':
        if p.returncode != 0 or (p.stdout or '').strip() != '%s=%s' % (field, e.get('count')):
            bad.append('%s equality rc=%d 实得[%s]' % (tag, p.returncode, (p.stdout or '').strip()))
    elif kind == 'reconciliation':
        if p.returncode == 0 and 'RECONCILE=agree' not in out:
            bad.append('%s reconciliation 一致时未打印 agree' % tag)
        if p.returncode != 0 and '两源不一致' not in out:
            bad.append('%s reconciliation 报警文案缺「两源不一致」: %s' % (tag, out[:70]))
    elif kind == 'bound':
        if p.returncode == 0 and 'BOUND=ok' not in out:
            bad.append('%s bound 未打印 BOUND=ok' % tag)
        if p.returncode != 0 and 'BOUND VIOLATION' not in out:
            bad.append('%s bound 违约文案缺 BOUND VIOLATION: %s' % (tag, out[:70]))
    else:
        bad.append('%s 非法 independent_check_kind=%r' % (tag, kind))

for k in ('healthy', 'written_not_wired', 'missing'):
    if isinstance(b.get(k), dict):
        visit('TOP.' + k, b[k], k, 'top')
for k, v in (b.get('other_states') or {}).items():
    visit('TOP.other_states.' + k, v, k, 'top')
for l in d.get('lines') or []:
    lb = l.get('buckets') or {}
    for k in ('healthy', 'written_not_wired', 'missing'):
        if isinstance(lb.get(k), dict):
            visit('line%s.%s' % (l.get('id'), k), lb[k], k, 'line')

print(('NO 独立判据失败: %s' % ' | '.join(bad[:4])) if bad else
      'OK 独立判据全部 rc=0 且语义正确（%s）' % ', '.join('%s×%d' % (k, v) for k, v in sorted(kinds.items())))
print(('OK 线级独立判据存在（reconciliation×%d + bound×%d）—— 线级不再零独立判据'
       % (line_kinds.get('reconciliation', 0), line_kinds.get('bound', 0)))
      if line_kinds.get('reconciliation') and line_kinds.get('bound')
      else ('NO 线级独立判据缺失（线级恰是创始人第一眼看的粒度）: %s' % line_kinds))
PY
while IFS= read -r line; do
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    NO\ *) no "${line#NO }" ;;
    *)     echo "    $line" ;;
  esac
done < "$TMPD/ind.txt"

# ═══ 组 ⑤ 诚实口径 ═══
echo "⑤ 诚实口径（null 带 reason / 能跑未验证不并健康 / 恒等式 / cmd_semantics 披露）"
"$PYBIN" - "$COMMITTED_JSON" <<'PY' > "$TMPD/hon.txt" 2>&1
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
for l in d.get('lines') or []:
    lb = l.get('buckets') or {}
    if (lb.get('identity') or {}).get('holds') is not True:
        bad.append('线 %s 恒等式未闭合' % l.get('id')); break
if 'count' not in ((b.get('other_states') or {}).get('live_unverified') or {}):
    bad.append('other_states.live_unverified 缺 count（能跑未验证必须单独成态）')
sem = b.get('cmd_semantics') or {}
if 'evidence_cmd' not in sem or 'artifact_selfcheck_cmd' not in sem:
    bad.append('cmd_semantics 未披露 evidence_cmd / artifact_selfcheck_cmd 语义（沉默偏离）')
print(('NO 诚实口径失败: %s' % ' | '.join(bad)) if bad else
      'OK 诚实口径: null 带 reason / 其它态显式列出 / 恒等式闭合 / cmd_semantics 已披露（declared=%s）'
      % b.get('denominator'))
PY
while IFS= read -r line; do
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    NO\ *) no "${line#NO }" ;;
    *)     echo "    $line" ;;
  esac
done < "$TMPD/hon.txt"

# ═══ 组 ⑥ 反漂移（重算件 == 已提交派生件，逐 key）═══
echo "⑥ 反漂移（$RO_TMP == 已提交派生件，逐 key，generated_at 除外）"
if [ -f "$RO_TMP" ]; then
  DRIFT="$("$PYBIN" - "$COMMITTED_JSON" "$RO_TMP" <<'PY'
import json, sys
a = json.load(open(sys.argv[1], encoding='utf-8'))
b = json.load(open(sys.argv[2], encoding='utf-8'))
a.pop('generated_at', None); b.pop('generated_at', None)
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
print('\n'.join(walk(a, b)[:6]))
PY
)"
  if [ -z "$DRIFT" ]; then
    ok "已提交派生件 == 件级重算件（逐 key 相等）"
  else
    no "派生件与重算件不一致（源侧已变，需重生成后提交）: $DRIFT"
  fi
else
  no "缺重算件 ${RO_TMP}（regenerate_cmd 未成功）"
fi

# ═══ 组 ⑦ 面板零渲染型百分比 ═══
echo "⑦ 面板零渲染型百分比（HTML 结构 + buckets 无 *_pct 键）"
"$PYBIN" - "$COMMITTED_JSON" <<'PY' > "$TMPD/pct.txt" 2>&1
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
if 'lines[].progress_pct' not in (d.get('deprecated_fields') or {}):
    bad.append('线级 progress_pct 未在 deprecated_fields 显式登记')
print(('NO 面板百分比口径失败: %s' % ' | '.join(bad)) if bad else
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
if [ -f "$PAGE_GEN" ] && [ -f "$RO_TMP" ]; then
  "$PYBIN" "$PAGE_GEN" --progress "$RO_TMP" --out "$FRESH_HTML" >/dev/null 2>&1; RCP=$?
  [ "$RCP" = "0" ] && ok "gen-progress-page.py exit 0（渲染重算件）" || no "gen-progress-page.py exit $RCP"
  if [ -f "$FRESH_HTML" ]; then
    H_BAD=""
    grep -q 'class="pct"' "$FRESH_HTML" && H_BAD="$H_BAD 残留线级百分比 span(class=pct)"
    grep -q 'bar-fill' "$FRESH_HTML" && H_BAD="$H_BAD 残留进度条(bar-fill)"
    grep -qE '<span class="big">[0-9]+' "$FRESH_HTML" && H_BAD="$H_BAD 头部仍渲染大字数字"
    grep -q '29 条产品线' "$FRESH_HTML" || H_BAD="$H_BAD 缺「29 条产品线」"
    grep -q '写了没接' "$FRESH_HTML" || H_BAD="$H_BAD 三档未渲染(缺「写了没接」)"
    grep -q 'bkt-cmd' "$FRESH_HTML" || H_BAD="$H_BAD 未渲染每档 evidenceCmd"
    grep -q '不承担可证伪职责' "$FRESH_HTML" || H_BAD="$H_BAD 未披露自查命令不承担可证伪职责"
    [ -z "$H_BAD" ] && ok "面板 HTML: 零百分比 + 29 条 + 三档 + 每档 evidenceCmd + 语义披露" || no "面板 HTML:$H_BAD"
  else
    no "未产出临时面板 HTML"
  fi
else
  no "缺 $PAGE_GEN 或重算件"
fi

# ═══ 组 ⑧ fail-closed：缺重算件必须报错，不得静默回退读提交件 ═══
echo "⑧ fail-closed（缺 $RO_TMP → evidence_cmd 必须报错）"
if [ -f "$RO_TMP" ]; then
  HIDDEN="$TMPD/ro-pp.hidden"; mv "$RO_TMP" "$HIDDEN"
  FC="$("$PYBIN" - "$COMMITTED_JSON" <<'PY'
import json, subprocess, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
cmd = d['buckets']['other_states']['live_unverified']['evidence_cmd']
p = subprocess.run(['bash', '-c', cmd], capture_output=True, text=True, timeout=120)
err = ((p.stderr or '') + (p.stdout or ''))
print('%d|%s' % (p.returncode, err.strip().replace('\n', ' ')[:90]))
PY
)"
  mv "$HIDDEN" "$RO_TMP"
  FC_RC="${FC%%|*}"; FC_MSG="${FC#*|}"
  [ "$FC_RC" != "0" ] && ok "缺重算件 → 非零退出（rc=${FC_RC}），未静默回退读提交件" \
    || no "缺重算件仍 rc=0（静默回退读提交件 = 假证据）"
  case "$FC_MSG" in
    *FAIL-CLOSED*) ok "报错文案点名 FAIL-CLOSED 与缺失路径（不误导）" ;;
    *) no "报错文案未点名 FAIL-CLOSED/缺失路径: $FC_MSG" ;;
  esac
else
  no "无重算件可做 fail-closed 负例"
fi

# ═══ 只读证明（前后快照比对，见文件头「沙箱」）═══
PP_AFTER="$(git -C "$REPO" status --porcelain 2>/dev/null | grep 'product-progress' || true)"
if [ "$PP_BEFORE" = "$PP_AFTER" ]; then
  ok "本测试未改变仓库 product-progress.* 状态（前后快照相等）"
else
  no "本测试写脏了真实仓库 product-progress.*：前[$PP_BEFORE] 后[$PP_AFTER]"
fi

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
exit 0
