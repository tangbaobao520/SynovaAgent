#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# grep-oP-regression.test.sh — grep -P 家族回归网（D661 建 / D664 扩容）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — scripts/ 全目录（.sh）内 grep -P 变体零命中
#   边界 — 注释行（描述该问题的注释不执行）+ 检测器自身（grep-P-scan-ok 标记）排除
#   反向 — 哨兵: 塞入一处 -oP 必须被网抓到（防"永远绿"的空转网）
#   D664 — 27 处转译的**语义等价**金值断言（PCRE → ERE 逐模式钉死，含 \K / \s / \S 三类不可直译）
#   接线 — 每个转译后的 ERE 模式必须真实存在于目标脚本（防测试与源码漂移）
#
# 防家族复发: D421(post-commit.sh)/D660(resolve-commit-brief.sh)/D661/D664 四次同型
# （BSD grep 无 -P → 检查静默失效）。本测试是物理回归网——任何新增 grep -P 立即红。
#
# D664 扩容说明（旧版是纸老虎）:
#   ① 旧版只扫 scripts/workflow/ + scripts/control-tower/ 两目录 → hooks/、checks/、
#      根级 check-*.sh 全在网外（本批修的 27 处里 24 处在网外）
#   ② 旧版**不在 ci.yml 密封清单** → 从未在 CI 跑过 = 机制建成未接线（M3 模式）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "=== D661/D664: grep -P 家族回归网 ==="

# ── 回归网主体: scripts/ 全目录 .sh ──
# 排除 ① 注释行（`file:line:#...`）——描述该问题的注释本身不执行
#      ② 检测器自身（本行标记）——脚本内需保留字面量才能检测别人的 -P
HITS=$(grep -rnE 'grep[[:space:]]+-[a-zA-Z]*P' "$REPO/scripts" --include='*.sh' 2>/dev/null \
        | grep -vE ':[0-9]+:[[:space:]]*#' | grep -v 'grep-P-scan-ok' || true)
if [ -z "$HITS" ]; then
  ok "scripts/ 全目录内 grep -P 零命中（排除注释与检测器自身）"
else
  no "残留 grep -P 用法（BSD grep 无 -P，检查会静默失效）："
  echo "$HITS" | sed 's/^/      /' >&2
fi

# 反向哨兵: 回归网必须真的能抓到 -P（防"永远绿"的空转网）
printf '#!/bin/bash\ngrep -oP "x" /dev/null\n' > "$TMP/canary.sh"
CANARY=$(grep -rnE 'grep[[:space:]]+-[a-zA-Z]*P' "$TMP" --include='*.sh' 2>/dev/null | grep -vE ':[0-9]+:[[:space:]]*#' || true)
[ -n "$CANARY" ] && ok "反向哨兵: 塞入 -oP 能被网抓到（网非空转）" || no "反向哨兵: 网抓不到 -oP"

echo ""
echo "=== D664: PCRE → ERE 语义等价金值断言 ==="

# eq <名称> <目标文件> <ERE 模式> <输入> <期望输出> [额外 grep 参数]
# 接线 needle 走环境变量 NEEDLE（缺省 = pat）；源码里含 shell 引号拼接（'"'"'）时模式文本
# 与展开后不同，需显式给 needle。
eq() {
  local name="$1" file="$2" pat="$3" input="$4" want="$5"; shift 5
  local ndl="${NEEDLE:-$pat}"
  if ! grep -qF -- "$ndl" "$REPO/$file" 2>/dev/null; then
    no "$name — 接线: 模式未出现在 ${file}（测试与源码漂移）"; return
  fi
  local got
  got=$(printf '%s\n' "$input" | grep -oE "$@" -- "$pat" 2>/dev/null || true)
  if [ "$got" = "$want" ]; then ok "$name"; else no "$name — 期望 '$want' 实得 '$got'"; fi
}
# eqs <名称> <目标文件> <ERE 模式> <输入> <期望输出> <sed 后缀>  （\K 替代路径）
eqs() {
  local name="$1" file="$2" pat="$3" input="$4" want="$5" sedx="$6"
  if ! grep -qF -- "$pat" "$REPO/$file" 2>/dev/null; then
    no "$name — 接线: 模式未出现在 ${file}"; return
  fi
  local got
  got=$(printf '%s\n' "$input" | grep -oE -- "$pat" 2>/dev/null | sed -E "$sedx" || true)
  if [ "$got" = "$want" ]; then ok "$name"; else no "$name — 期望 '$want' 实得 '$got'"; fi
}

# ── 类 1: \s / \S —— PCRE 无 ERE 等价物，必须转 POSIX 类 ──
eq '\S→[^[:space:]] (Q0 模块清单)' "scripts/check-brief-vs-code.sh" \
   'src/(expert|sentinel|knowledge|theory|skills)/[^[:space:]]+|extensions/[^[:space:]]+' \
   '扫描 src/expert/foo.ts 与 extensions/sentinels/bar.json 完毕' \
   'src/expert/foo.ts
extensions/sentinels/bar.json'

eq '\s→[[:space:]] (Done verify 命令)' "scripts/check-brief-vs-code.sh" \
   'grep[[:space:]]+.*[^[:space:]]+|bash[[:space:]]+.*[^[:space:]]+|npx[[:space:]]+.*[^[:space:]]+' \
   '- verify: bash scripts/pre-commit-check.sh 预期全过' \
   'bash scripts/pre-commit-check.sh 预期全过'
eq '\s→[[:space:]] 多空格不误伤' "scripts/check-brief-vs-code.sh" \
   'grep[[:space:]]+.*[^[:space:]]+' '   grep   -rnE   foo   ' 'grep   -rnE   foo'

eq '\s→[[:space:]] (tags 字段体)' "scripts/check-file-driven.sh" \
   '"tags"[[:space:]]*:[[:space:]]*\[[^]]*\]' \
   '  "tags": ["finance", "cash"],' '"tags": ["finance", "cash"]'
eq '\s→[[:space:]] 零空格也命中' "scripts/check-file-driven.sh" \
   '"tags"[[:space:]]*:[[:space:]]*\[[^]]*\]' '"tags":["a"]' '"tags":["a"]'

unset NEEDLE
eq '\S→[^[:space:]] (checker-review 测试路径)' "scripts/checker-review.sh" \
   'tests/[^[:space:]]+\.test\.ts' ' FAIL tests/l3/foo.test.ts  ' 'tests/l3/foo.test.ts'

eq '\s→[[:space:]] (pre-doc-audit 枚举值)' "scripts/pre-doc-audit.sh" \
   "[[:space:]]+([A-Za-z_][A-Za-z0-9_]*):[[:space:]]*'" \
   "  DEPENDS_ON: 'dependsOn'," "  DEPENDS_ON: '"
NEEDLE='docs/synova/research/[^][:space:]' \
eq '\S→[^[:space:]] (pre-doc-audit docs 引用)' "scripts/pre-doc-audit.sh" \
   'docs/synova/research/[^][:space:])'"'"'；,;]+' \
   '见 docs/synova/research/a-b.md 与 docs/synova/research/c.md；' \
   'docs/synova/research/a-b.md
docs/synova/research/c.md'

# ── 类 2: \K —— 无 ERE 等价物，取全匹配后 sed 剥前缀 ──
eqs '\K→grep -oE + sed (export 名提取)' "scripts/pre-commit-check.sh" \
   'export (function|class|const) [A-Za-z_][A-Za-z0-9_]*' \
   'export function computeCashFlow(a) {' 'computeCashFlow' \
   's/^export (function|class|const) //'
eqs '\K→… 同模式 const 分支' "scripts/pre-commit-check.sh" \
   'export (function|class|const) [A-Za-z_][A-Za-z0-9_]*' \
   'export const X_1 = 2' 'X_1' 's/^export (function|class|const) //'
eqs '\K→grep -oE + sed (#CRITERIA)' "scripts/pre-commit-check.sh" \
   '#CRITERIA[[:space:]]*[:=][[:space:]]*[A-D]' '#CRITERIA: B' 'B' \
   's/.*[=:][[:space:]]*//'
eqs '\K→… 无空格形式' "scripts/pre-commit-check.sh" \
   '#CRITERIA[[:space:]]*[:=][[:space:]]*[A-D]' '#CRITERIA=C' 'C' \
   's/.*[=:][[:space:]]*//'
# 边界（行为等价保持）: 全角冒号原 PCRE 的 [:=\s] 本就不匹配 → 转译后同样不匹配，非本次回归
eqs '\K 边界: 全角冒号不匹配（与原 PCRE 同）' "scripts/pre-commit-check.sh" \
   '#CRITERIA[[:space:]]*[:=][[:space:]]*[A-D]' '#CRITERIA：C' '' \
   's/.*[=:][[:space:]]*//'
eqs '\K→grep -oE + sed (brief id)' "scripts/pre-commit-check.sh" \
   '\.claude/task-briefs/[^.]+' '.claude/task-briefs/2026-09-12-D664-x.md' \
   '2026-09-12-D664-x' 's|^\.claude/task-briefs/||'

# ── 类 3: \d —— ERE 用 [0-9] / {n} 直译 ──
eq '\d→[0-9] (check-tech-debt 日期)' "scripts/check-tech-debt.sh" \
   '[0-9]{4}-[0-9]{2}-[0-9]{2}' 'TODO 2026-09-11 待办' '2026-09-11'
eq '\d→[0-9] (brief 日期)' "scripts/pre-commit-check.sh" \
   '[0-9]{4}-[0-9]{2}-[0-9]{2}' '2026-09-12-D664-x.md' '2026-09-12'
eq '\d 不误吞短串' "scripts/check-tech-debt.sh" \
   '[0-9]{4}-[0-9]{2}-[0-9]{2}' '版本 26-9-11' ''

# ── 类 4: 简单直译（-oP → -oE，语义本就 ERE 兼容）──
eq '版本号提取' "scripts/check-brief-vs-code.sh" 'V[0-9]+\.[0-9]+\.[0-9]+' 'V5.2.7 已定稿' 'V5.2.7'
eq '架构层前缀' "scripts/check-brief-vs-code.sh" 'L[1-5]' 'L2 编排层' 'L2'
eq 'memory 引用' "scripts/check-brief-vs-code.sh" 'memory/[a-zA-Z0-9_-]+\.md' \
   '参考 memory/lessons.md 与 x.txt' 'memory/lessons.md'
eq 'HTTP 方法' "scripts/check-brief-vs-code.sh" 'GET|POST|PUT|DELETE' 'GET /api/x' 'GET'
eq 'src ts/html 路径' "scripts/check-brief-vs-code.sh" 'src/[a-zA-Z0-9_/.]+\.(ts|html)' \
   '改 src/routes/a.ts 和 src/web/b.html' 'src/routes/a.ts
src/web/b.html'
eq 'Q2 排除项（-oi 大小写不敏感）' "scripts/check-brief-vs-code.sh" \
   '(不做|排除|不涉及|不修改)[^。]*' '不修改 src/audit/x。其余照旧' '不修改 src/audit/x' -i
eq 'Q2 排除项里的 src 路径' "scripts/check-brief-vs-code.sh" 'src/[a-zA-Z0-9_/.]+' \
   '不修改 src/audit/x.sh' 'src/audit/x.sh'
eq 'tags 词表' "scripts/check-file-driven.sh" '"[a-z_]+"' '"finance", "cash_flow"' '"finance"
"cash_flow"'
eq 'extensions 顶层目录' "scripts/check-file-driven.sh" '^extensions/[^/]+' \
   'extensions/sentinels/a.json' 'extensions/sentinels'
eq '节点 label' "scripts/check-integrity-startup.sh" '"[A-Z][a-zA-Z]+"' '"Financial"' '"Financial"'
eq 'label 不吞小写开头' "scripts/check-integrity-startup.sh" '"[A-Z][a-zA-Z]+"' '"cash"' ''
eq '记忆双链' "scripts/hooks/hook-check-memory.sh" '\[\[[^]]+\]\]' \
   'see [[D665-gitlink]] and [[X]]' '[[D665-gitlink]]
[[X]]'
eq 'match_file 前缀' "scripts/pre-commit-check.sh" '^[^:]+' 'src/a.ts:12:内容' 'src/a.ts'
eq 'exports 提取（check-test-quality 同模式）' "scripts/checks/check-test-quality.sh" \
   'export (function|class|const) [A-Za-z_][A-Za-z0-9_]*' \
   'export class QualityGate {}' 'export class QualityGate'

echo ""
echo "=== D664: 转译形态静态守卫（防 sed 参数错位类）==="

# 转译的典型手误: 原命令 grep -oP 'PAT' "$FILE" 改成 "grep -oE 'PAT' | sed -E 'S'" 时
# 把 "$FILE" 留在 sed 之后 → grep 改读 stdin（空）→ 提取恒空、且 sed 把文件当输入。
# 该 bug 不会被"金值断言"抓到（金值只测模式），也不会被"-P 零命中"抓到 →
# 必须有一条针对**命令形态**的静态守卫。实测本次转换中真的踩到（5 处）。
BADSED=$(grep -rnE "\| sed -E '[^']*' \"\$" "$REPO/scripts" --include='*.sh' 2>/dev/null || true)
if [ -z "$BADSED" ]; then
  ok "无「sed 吃掉文件参数」形态（\$FILE 必须在管道左侧）"
else
  no "发现 sed 参数错位（grep 会改读 stdin → 提取恒空）："
  echo "$BADSED" | sed 's/^/      /' >&2
fi

# 可执行断言: 真实生产形态跑一遍（文件参数在 grep 侧才拿得到内容）
printf 'export function foo(a) {\n}\nexport const BAR = 1;\n' > "$TMP/mod.ts"
GOT_EXPORTS=$(grep -oE 'export (function|class|const) [A-Za-z_][A-Za-z0-9_]*' "$TMP/mod.ts" 2>/dev/null | sed -E 's/^export (function|class|const) //' | tr '\n' ',')
[ "$GOT_EXPORTS" = "foo,BAR," ] \
  && ok "可执行: export 提取（真实形态 foo,BAR）" \
  || no "可执行: export 提取异常 → '$GOT_EXPORTS'"

printf '#CRITERIA: A\n' > "$TMP/b.md"
GOT_CRIT=$(grep -oE '#CRITERIA[[:space:]]*[:=][[:space:]]*[A-D]' "$TMP/b.md" 2>/dev/null | sed -E 's/.*[=:][[:space:]]*//')
[ "$GOT_CRIT" = "A" ] && ok "可执行: #CRITERIA 提取（真实形态 A）" || no "可执行: #CRITERIA 提取异常 → '$GOT_CRIT'"

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ grep -P 回归网未通过"
  exit 1
fi
echo "  Status: ✅ grep -P 回归网全部通过"
exit 0
