#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# resolve-commit-brief.sh — 认领制 brief 解析 (D296, 跨 session 污染根治)
#
# 背景: current-brief 是全局单文件, 多 session 并发时最后启动者覆盖前者。
# 旧解析 (current-brief → find 最新) 让 A session 的提交被 B session 的 brief
# 校验 → 误伤 (D291 事故: D296 的 brief 干扰了 D291 的提交)。
#
# 认领制规则 (每个文件由认领它的 brief 判定):
#   1. current-brief (当日有效) 认领 ≥1 个暂存文件 → 输出它
#   2. 否则 → 今日 brief 中认领暂存文件数最多的 (其他 session 的文件由自己的 brief 认领)
#   3. 无任何认领 → current-brief (当日); 无 → 今日最新
#
# D839 完成即释放: 步骤 1/2 的候选池**剔除已释放的 brief**（所属任务 task-state status ∈
#   {impl_done, audited} / 显式释放台账 / session 已归档）。被剔除者向 stderr 发一行
#   `SYNO-RELEASED-CLAIM\t<brief>\t<D#>\t<basis>\t<detail>`，供门禁降 warn 并打印释放理由。
#   判定源 = scripts/control-tower/claim_release.py（单一事实源）；判定不可用 → 不剔除（fail-closed）。
#   无暂存文件时（CI 干净检出）行为与修复前完全一致。
#
# 用法: bash resolve-commit-brief.sh "<暂存文件列表 (换行分隔)>"
#       bash resolve-commit-brief.sh --session <sid> "<暂存文件列表>"  (D329: session 专属 current-brief 优先)
# 输出: brief 绝对路径; 无可用 brief → exit 1
#
# 性能: 认领计数用单次 python3 完成 (Windows 下逐路径 grep 子进程太慢)
# ═══════════════════════════════════════════════════════════════════════════════
set +e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# D853-①（仓库事实不可被调用者环境换掉）: hook 上下文会导出 GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE
#   （ct-test-gate.sh:48-54 已记该坑）；实测 `GIT_WORK_TREE=<外部仓>` 会让上面这行把 ROOT 变成
#   外部仓 → 候选池空 → staging_guard.py:172-173「claimed 为空则跳过认领判定」→ **静默 fail-open**。
# D853-②（工具可用性 = 存在 **且** 可运行）: `command -v git` 只探存在性 —— PATH 上放一个假/坏 git
#   即可让"事实"由攻击者提供。故候选逐个**试运行**校验（`--version` 形如 `git version N.`）。
_git_clean() { env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY \
                   -u GIT_COMMON_DIR -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE "$@"; }
GITBIN=""
for _g in "$(command -v git 2>/dev/null || true)" /usr/bin/git /usr/local/bin/git \
          "/c/Program Files/Git/cmd/git.exe"; do
  [ -n "$_g" ] && [ -x "$_g" ] || continue
  if _git_clean "$_g" --version 2>/dev/null | grep -qE '^git version [0-9]'; then GITBIN="$_g"; break; fi
done
# D853: 链断必须让**下游**（staging_guard）能 fail-closed —— 只写人读告警不够（下游不解析它）。
#   契约: SYNO-RESOLVER-DEGRADED\t<原因>（与 staging_guard.py 的 RESOLVER_DEGRADED_MARK 同字面量，
#   改一处必改两处；staging_guard.test.sh 有"链断 → block"夹具守着）。
[ -n "$GITBIN" ] || printf 'SYNO-RESOLVER-DEGRADED\tgit 不可用或未通过试运行校验\n' >&2
ROOT="$([ -n "$GITBIN" ] && _git_clean "$GITBIN" rev-parse --show-toplevel 2>/dev/null || pwd)"
# D853-③（喂目标运行时的路径必须是它的命名空间 —— 两层都堵）: Windows 上上面这行给 MSYS 形（/d/a/...）。
#   MSYS 只在 **argv 层**做转换，不转换：① 内嵌在 python -c 字符串里的路径（native python `os.listdir`
#   读不到 → 候选池空 → 末尾 exit 1 零输出）② **本脚本 stdout 输出的 brief 路径**（下游 staging_guard
#   是 native python，`Path(brief).read_text()` 读不到 → genuine=False → 跳过认领判定）。
#   两层都是静默 fail-open。故**统一成混合形**（cygpath -m → C:/...）：MSYS bash 可 cd/glob、
#   native python 可 open/readdir = 同一实体（D849 夹具同口径，仓内已验证）。POSIX 无 cygpath → 原值。
_ro_raw="$ROOT"
ROOT="$(cygpath -m "$_ro_raw" 2>/dev/null || echo "$_ro_raw")"
ROOT_W="$ROOT"   # 兼容既有 python 注入点（两者同义；保留双名以最小化 diff）
# D317: brief_parser 是 resolver 的兄弟组件（同仓库）——不能用 $ROOT 定位，
# 测试隔离（临时 repo）或 ROOT 与脚本异仓库时 $ROOT 下没有解析器。
RESOLVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="$RESOLVER_DIR/../control-tower/brief_parser.py"
# Windows python 不认 MSYS 路径（/d/...）→ cygpath -m 转 C:/...（sys.path 注入用；POSIX 原值）
PARSER_DIR_W="$(cygpath -m "$RESOLVER_DIR/../control-tower" 2>/dev/null || echo "$RESOLVER_DIR/../control-tower")"

TODAY=$(date +%Y-%m-%d)
STAGED="${1:-}"

# D329: --session <sid> — 优先读 session 专属 current-brief（.claude/current-brief.<sid>），
# 无则回退全局（单 session 语义）。session 专属文件由 attach.py SessionStart 写入。
SESSION_ID=""
if [ "${1:-}" = "--session" ]; then
  SESSION_ID="${2:-}"
  shift 2
  STAGED="${1:-}"
fi

# D317: PYBIN 跨平台 — Windows 部分机器无 python3.exe（仅 python / py -3）。
# D853: 探测必须**试运行**（仓内既有正确口径: verify-parallel.sh:70-77 / dev-doc-gatekeeper.sh:191-197）。
#   只探存在性 = 选中"存在但跑不动"的 WindowsApps 占位 shim → 下面 5 处 "$PYBIN" -c 全失败
#   → RESULT 空 → 末尾 exit 1 零输出 → staging_guard 按"无认领"放行 = **静默 fail-open**（本卡主根因，实测复现）。
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
[ -n "$PYBIN" ] || printf 'SYNO-RESOLVER-DEGRADED\tpython3/python/py 试运行均不可用\n' >&2

# ── current-brief (当日有效) ──
CUR=""
CUR_SRC="$ROOT/.claude/current-brief"
# D329: session 专属 current-brief 优先；无则回退全局
if [ -n "$SESSION_ID" ] && [ -f "$ROOT/.claude/current-brief.$SESSION_ID" ]; then
  CUR_SRC="$ROOT/.claude/current-brief.$SESSION_ID"
fi
if [ -f "$CUR_SRC" ]; then
  BN=$(cat "$CUR_SRC" 2>/dev/null | tr -d '[:space:]') # swallow-ok: current-brief 缺失/读失败 → BN 空 → 走认领回退（fail-open 不阻断）
  BD=$(echo "$BN" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 || true)
  if [ -n "$BD" ] && [ "$BD" != "$TODAY" ]; then
    :  # 陈旧的 current-brief，忽略
  elif [ -n "$BN" ] && [ -f "$ROOT/.claude/task-briefs/$BN" ]; then
    CUR="$ROOT/.claude/task-briefs/$BN"
  fi
fi

# ── D718: 任务身份锚点（D#）——跨日任务认领的物理依据 ──
# 背景: 候选集原为「文件名日期 today±1」→ brief 生成 2026-09-10、提交 2026-09-12 时该 brief
#   永不入池 → 认领恒空 → 回退落到无关 brief → D328 认领校验判「他人文件」硬阻断
#   （D664 实测被拦 2 次，处置=把 brief 改名到执行日；跨日任务是常态，日期不是任务身份）。
# 语义: 候选集 = 日期窗口 ∪ {本提交所属任务 D# 的 brief}。身份证据按可靠性分两级：
#   强锚点（分支名 / 暂存 task-state/D#.json = 本提交自身）→ 可参与最终回退；
#   弱锚点（current-brief 文件名 = 本 session 声明）→ 只入候选池，仍由认领计数裁决。
# 不做窗口整体放宽: 那会把**他人**的陈旧 brief 拉回候选池（D291/D296 跨 session 误伤复发）。
# 降级: 提不到锚点 → 行为与修复前完全一致（纯日期窗口，零回归）。
ANCHOR_STRONG_RAW=""
ANCHOR_WEAK_RAW=""
BR_CUR="$([ -n "$GITBIN" ] && _git_clean "$GITBIN" -C "$ROOT" branch --show-current 2>/dev/null || true)"
[ -n "$BR_CUR" ] && ANCHOR_STRONG_RAW="$BR_CUR"
ANCHOR_STRONG_RAW="$ANCHOR_STRONG_RAW $(printf '%s\n' "$STAGED" | grep -oE 'task-state/D[0-9]+\.json' || true)"
if [ -f "$CUR_SRC" ]; then
  ANCHOR_WEAK_RAW="$(cat "$CUR_SRC" 2>/dev/null || true)"  # swallow-ok: current-brief 读失败→无弱锚点，非错误
fi
# 归一化为纯数字 D# 列表（大小写无关，去重）
_ids_of() {
  printf '%s\n' "$1" | grep -ioE 'D[0-9]+' | tr 'A-Z' 'a-z' | sed 's/^d//' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ' || true
}
ANCHOR_IDS_STRONG="$(_ids_of "$ANCHOR_STRONG_RAW")"
ANCHOR_IDS_WEAK="$(_ids_of "$ANCHOR_WEAK_RAW")"
# 按 D# 找 brief（文件名含 -D<id>-）
briefs_by_id() {
  local ids="$1" id f
  [ -z "$ids" ] && return 0
  for id in $ids; do
    for f in "$ROOT/.claude/task-briefs/"*"-D${id}-"*.md; do
      [ -e "$f" ] || continue
      echo "$f"
    done
  done
  return 0
}
ANCHORED_STRONG_FILES="$(briefs_by_id "$ANCHOR_IDS_STRONG" | sort -u || true)"
ANCHORED_WEAK_FILES="$(briefs_by_id "$ANCHOR_IDS_WEAK" | sort -u || true)"

# 今日全部 brief (认领候选) — D366: 文件名日期前缀 (mtime 会被 git pull 刷, 不可靠)
# D366: 按文件名日期判断"今日" — 替代 find 按 mtime 的今日判定
# D559 (CT-46 连带): 窗口扩 ±1 天 — CI runner UTC vs brief 日期 UTC+8：北京时间 08-29 写的
#   brief 对 UTC runner 是"明天"，认领被排除 → resolver 回退到认领同文件的陈旧 brief
#   （PR #295 实证：D541 brief 架构层为空 → CI 6 字段红）。D506 时区容差同型。
# 用法: today_files_by_prefix <dir>   # brief: YYYY-MM-DD 文件名前缀 (扫描 *.md)
#       today_files_by_suffix <dir>   # dev doc: -YYYYMMDD.md 文件名后缀 (扫描 SYNOVA-IMPL-*.md)
# 性能: 纯 bash for+case 零子进程 — grep|head 每文件 3 spawn × 349 brief = Windows 分钟级 (实测回退)
# 注意: glob 硬编码在函数内 — 变量中的 * 不会被路径名展开 (实测), 字面 glob 才展开
TODAY_DASH=$(date +%Y-%m-%d)
TODAY_COMPACT=$(date +%Y%m%d)
DATES="$("$PYBIN" -c "from datetime import date, timedelta as td; t=date.today(); print(t-td(days=1), t, t+td(days=1))" 2>/dev/null || echo "$TODAY_DASH")"  # swallow-ok: 窗口计算失败→按仅今日处理（原语义）
DATES_C="$("$PYBIN" -c "from datetime import date, timedelta as td; t=date.today(); print((t-td(days=1)).strftime('%Y%m%d'), t.strftime('%Y%m%d'), (t+td(days=1)).strftime('%Y%m%d'))" 2>/dev/null || echo "$TODAY_COMPACT")"  # swallow-ok: 同上
today_files_by_prefix() {
  local dir="$1" f b d
  dir="${dir%/}"
  [ -d "$dir" ] || return 0
  for f in "$dir"/*.md; do
    [ -e "$f" ] || continue
    b=${f##*/}
    d=${b:0:10}
    case " $DATES " in
      *" $d "*) echo "$f" ;;
    esac
  done
  return 0
}
today_files_by_suffix() {
  local dir="$1" f b d
  dir="${dir%/}"
  [ -d "$dir" ] || return 0
  for f in "$dir"/SYNOVA-IMPL-*.md; do
    [ -e "$f" ] || continue
    b=${f##*/}
    d=${b%.md}; d=${d##*-}
    case " $DATES_C " in
      *" $d "*) echo "$f" ;;
    esac
  done
  return 0
}
ALL_TODAY=$(today_files_by_prefix "$ROOT/.claude/task-briefs/" | sort || true)
# D718: 并入身份锚点 brief（强+弱）——跨日任务即使文件名日期在窗口外也能被认领
if [ -n "$ANCHORED_STRONG_FILES$ANCHORED_WEAK_FILES" ]; then
  ALL_TODAY="$(printf '%s\n%s\n%s\n' "$ALL_TODAY" "$ANCHORED_STRONG_FILES" "$ANCHORED_WEAK_FILES" | grep -v '^$' | sort -u || true)"
fi
[ -z "$ALL_TODAY" ] && [ -n "$CUR" ] && ALL_TODAY="$CUR"

if [ -z "$ALL_TODAY" ] && [ -z "$CUR" ]; then
  exit 1
fi

# ── 认领判定 (单次 python) ──
if [ -z "$PYBIN" ]; then
  # D317: python 不可用 → 无法认领 → 直接走最终回退（回退同样无 python 时 exit 1 fail-open）
  RESULT=""
else
_PYERR="$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/.synova-resolver-err.$$")"
RESULT=$("$PYBIN" -c "
import os, re, sys
sys.path.insert(0, r'$ROOT_W/scripts/control-tower')
try:
    from brief_parser import parse_q2, match_path
except ImportError:
    # fail-open: 解析器缺失 → 降级到内联语义（不阻断认领流程）
    def parse_q2(text):
        paths = []
        in_q2 = in_inc = False
        for line in text.split('\n'):
            line = line.rstrip('\r')
            if re.match(r'^## Q2:', line):
                in_q2 = True
                in_inc = False
                continue
            if in_q2 and re.match(r'^## ', line):
                break
            if in_q2 and re.match(r'^不做什么', line):
                in_inc = False
                continue
            if in_q2 and re.match(r'^做什么', line):
                in_inc = True
                continue
            if in_q2 and in_inc and line.startswith('- '):
                # D521/不变量3: 与 brief_parser.parse_q2 同步剥壳（动词前缀 + 括号描述）
                raw = re.sub(r'^(修改|新增|新建|修复|扩展|实现|更新|重构|升级|创建|编写|增加|优化|调整|添加|改)\s*', '', line[2:])
                p = raw.split(':', 1)[0].split('：', 1)[0].split(' — ', 1)[0].strip()
                p = re.split(r'[（(]', p, 1)[0].strip()
                if p:
                    paths.append(p)
        # D329: 对齐 brief_parser.parse_q2 契约（返回 dict）——旧实现返回 list，
        # 调用方 parse_q2(text)['include'] 在解析器缺失路径上 TypeError → 认领恒空
        # 注意: 本段嵌入 bash 双引号串，python 字符串必须用单引号（勿在注释写双引号）
        return {'include': paths, 'exclude': []}
    def match_path(path, pat):
        return re.search(r'(^|/)' + re.escape(pat) + r'\$', path) is not None

staged = [s.strip() for s in '''$STAGED'''.split('\n') if s.strip()]
briefs = [b for b in '''$ALL_TODAY'''.split('\n') if b.strip()]
cur = '''$CUR'''
# D718: 身份锚点文件集（强=分支名/暂存 task-state；弱=current-brief）——仅用于**同数**时的
#   优先级，不改变认领计数语义。共享文件常被多个 brief 同时认领（都改过该文件），
#   旧实现稳定排序 = 字典序 → 日期靠前的陈旧 brief 恒胜 → staging_guard 判「认领 brief D#
#   与本 session 任务不一致」硬阻断（D718 修 pre-doc-audit.sh 时真实被拦一次）。
anchored_strong = set(x.strip() for x in '''$ANCHORED_STRONG_FILES'''.split('\n') if x.strip())
anchored_weak = set(x.strip() for x in '''$ANCHORED_WEAK_FILES'''.split('\n') if x.strip())

# ── D839: 完成即释放 —— 已释放的 brief 不参与候选 ──
# 根因: 候选池只看 brief 里 Q2 的字面路径，不看该 brief 所属任务是否已完成 → 历史 brief
#   提及过的文件对后续所有任务永久锁死（D838 被已完成并合入的 D806 brief 阻断）。
# 释放证据 = task-state status ∈ {impl_done, audited} / 显式释放台账 / session 已归档
#   （单一事实源 = scripts/control-tower/claim_release.py）。改在源头而非各下游补救——
#   本 resolver 有 6 个生产消费者（G12 范围 / commit-msg / verifiable-done / plan-integrity /
#   brief-vs-code / staging_guard），任一拿到「已完成任务的 brief」都会按错任务校验。
# 降级: 判定模块缺失或抛异常 → 一律视为未释放（fail-closed，行为与修复前一致，零回归）。
_REL_DEG = ''
try:
    from claim_release import (is_released as _is_released, RELEASED_MARK as _REL_MARK,
                               DEGRADED_MARK as _DEG_MARK)
except ImportError as _imp_exc:
    _is_released = None
    _REL_MARK = 'SYNO-RELEASED-CLAIM'
    _DEG_MARK = 'SYNO-CLAIM-RELEASE-DEGRADED'
    _REL_DEG = 'claim_release 模块不可用: ' + str(_imp_exc)[:80]
# 公告延到下面（仅在**确有暂存文件要裁决认领**时发一次）——无暂存文件时释放维度与
# 本次解析无关，发公告只会污染 stdout 合并型消费方（如 tests 的 2>&1 捕获）。

def _deg(brief, why):
    # 铁律 11: 释放维度不可用时显式公告，绝不静默（仍按未释放 -> fail-closed 不误放行）
    sys.stderr.write(_DEG_MARK + '\t' + os.path.basename(brief) + '\t' + why + '\n')


def _release_of(brief):
    # → (released, task_id, basis, detail)；不可用/异常 → (False, '', '', '')
    if _is_released is None:
        return (False, '', '', '')  # 模块不可用已在上方一次性公告（不逐 brief 刷屏）
    m = re.search(r'D\d+', os.path.basename(brief))
    if not m:
        return (False, '', '', '')
    try:
        v = _is_released(r'$ROOT_W', m.group(0))
    except Exception as exc:
        _deg(brief, type(exc).__name__ + ':' + str(exc)[:80])
        return (False, '', '', '')
    if not v.get('released'):
        return (False, '', '', '')
    return (True, m.group(0), v.get('basis', ''), v.get('detail', ''))

def _announce_if_released(brief):
    # 已释放 → 向 stderr 公告（供门禁降 warn + 打印释放理由），并返回 True 让调用方剔出候选
    r = _release_of(brief)
    if r[0]:
        sys.stderr.write(_REL_MARK + '\t' + os.path.basename(brief) + '\t' + r[1]
                         + '\t' + r[2] + '\t' + r[3] + '\n')
    return r[0]

if staged and _REL_DEG:
    # 每次运行只公告一次；按 brief 逐条发会把 stderr 淹没，且下游 2>&1 合并会污染 stdout
    sys.stderr.write(_DEG_MARK + '\t' + '<module>' + '\t' + _REL_DEG + '\n')

claims = []
for b in briefs:
    try:
        text = open(b, encoding='utf-8').read()
    except OSError:
        continue
    scope = parse_q2(text)['include']
    n = sum(1 for sf in staged for p in scope if match_path(sf, p))
    if n > 0 and _announce_if_released(b):
        n = 0  # D839: 已释放 → 不再参与认领裁决
    claims.append((n, b))

# 1. current-brief 认领 ≥1 → 用它
if cur and any(b == cur and n > 0 for n, b in claims):
    print(cur)
    sys.exit(0)

# 2. 认领数最多的 brief；同数时身份锚点优先（强 → 弱 → 其余按原字典序，无锚点零行为变化）
best = max(n for n, _b in claims) if claims else 0
if best > 0:
    top = [b for n, b in claims if n == best]
    top.sort(key=lambda b: (0 if b in anchored_strong else (1 if b in anchored_weak else 2), b))
    print(top[0])
    sys.exit(0)

# 3. 回退: current-brief
if cur:
    print(cur)
    sys.exit(0)
" 2>"$_PYERR" || true)
# D839: python 段 stderr 里只有两类东西 —— 错误（保持静默，沿用原语义）与
# 「已释放认领」公告。公告必须**转回 shell stderr** 才能到门禁手里（staging_guard 靠它降 warn）。
grep -E '^SYNO-RELEASED-CLAIM|^SYNO-CLAIM-RELEASE-DEGRADED' "$_PYERR" >&2 2>/dev/null || true
rm -f "$_PYERR" 2>/dev/null || true
fi

if [ -n "$RESULT" ] && [ -f "$RESULT" ]; then
  echo "$RESULT"
  exit 0
fi

# D718: 强锚点回退——认领计数为空时，本提交自身身份（分支名 / 暂存 task-state/D#.json）
# 指向的 brief 优先于「日期最新可解析」。跨日任务若落到下面的纯日期回退，会拿到无关 brief
# （= D328 判「他人文件」硬阻断，D664 实测）。只认可解析的强锚点 brief，缺失则原样下探。
if [ -n "$ANCHORED_STRONG_FILES" ] && [ -n "$PYBIN" ]; then
  RESULT=$("$PYBIN" -c "
import sys
sys.path.insert(0, r'$PARSER_DIR_W')
from brief_parser import parse_criteria

for b in '''$ANCHORED_STRONG_FILES'''.split('\n'):
    b = b.strip()
    if not b:
        continue
    try:
        text = open(b, encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    if parse_criteria(text):
        print(b)
        sys.exit(0)
sys.exit(1)
" 2>/dev/null || true)
  if [ -n "$RESULT" ] && [ -f "$RESULT" ]; then
    echo "$RESULT"
    exit 0
  fi
fi

# D317 最终回退: 最新日期 → 最早, 用 brief_parser 验证可解析性 (criteria A-D),
# 选第一个可解析的。全部不可解析或 python 不可用 → exit 1 (fail-open → G12b 跳过),
# 绝不静默返回坏 brief。
# 背景: CI 干净检出无 staged → 认领为空 → 旧逻辑按日期前缀选最新 = D286 (旧格式,
# criteria=null) → G12b 硬阻断 → Iron Laws 红 (D317 根因)。
# 注意: 不能按 mtime — CI 干净检出时所有文件 mtime 相同 (phase34-nodate.md 事故)。
# 性能: 单次 python 批量解析（281 文件 × 逐文件起 python 进程 = 分钟级超时）。
if [ -z "$PYBIN" ]; then
  exit 1
fi
RESULT=$("$PYBIN" -c "
import os, re, sys
sys.path.insert(0, r'$PARSER_DIR_W')
from brief_parser import parse_criteria

briefs = []
for f in os.listdir(r'$ROOT_W/.claude/task-briefs/'):
    if not f.endswith('.md'):
        continue
    m = re.match(r'(\d{4}-\d{2}-\d{2})', f)
    if m:
        briefs.append((m.group(1), f))
briefs.sort(key=lambda x: x[0], reverse=True)
for _d, _f in briefs:
    try:
        text = open(os.path.join(r'$ROOT_W/.claude/task-briefs/', _f), encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    if parse_criteria(text):
        print(os.path.join(r'$ROOT_W/.claude/task-briefs/', _f))
        sys.exit(0)
sys.exit(1)
" 2>/dev/null || true)
[ -n "$RESULT" ] && { echo "$RESULT"; exit 0; }
exit 1
