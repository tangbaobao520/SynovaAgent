#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# brief-parser-markup.test.sh — D722 brief 写集「markdown 包裹符」认领洞的密封测试
#
# 背景: brief 的 Q2 写集习惯写成 `src/x.ts` / **src/x.ts**。parse_q2 只剥动词前缀与
# 括号描述，反引号残留 → match_path 以 (^|/)pat$ 锚定匹配 → **恒不命中** → 该 brief
# 的认领集合静默为空。后果（实测）:
#   ① D328 暂存区归属校验被削弱（认领为空 → 归属判定退化）
#   ② resolver 回退到「认领我暂存文件最多的 brief」，被 ±1 天窗口内一份陈旧 brief
#      抢到认领 → 误判「并行劫持」阻断提交（D721 亲历）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   ① 正常路径 — 反引号/加粗/引号/方括号包裹的路径 **可命中**
#   ② 回归保护 — 无包裹路径、父目录后缀路径行为不变
#   ③ 边界     — 剥壳后为空 → False（绝不退化为匹配一切）；`x.ts` 不匹配 `x.tsx`
#   ④ 端到端   — 带反引号的真实 brief 文本 → parse_q2 + match_path 真命中
#   ⑤ 降级     — path/pattern 为 None/空 → False，不抛异常
#   接线       — staging_guard / resolve-commit-brief 真的用 brief_parser.match_path
# 沙箱: 纯函数级测试 + 真实 parser 文件，零网络零 git 依赖
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PARSER="$REPO/scripts/control-tower/brief_parser.py"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

OUT=$(PYTHONPATH="$REPO/scripts/control-tower" python3 - "$PARSER" <<'PYEOF' 2>&1
import sys
sys.path.insert(0, sys.argv[1].rsplit('/', 1)[0])
from brief_parser import match_path, parse_q2

fails = []
def chk(name, cond):
    print(("OK  " if cond else "BAD ") + name)
    if not cond:
        fails.append(name)

# ① 正常路径
chk("① 反引号包裹 `src/x.ts`", match_path("src/x.ts", "`src/x.ts`"))
chk("① 加粗 **src/x.ts**", match_path("src/x.ts", "**src/x.ts**"))
chk("① 双引号 \"src/x.ts\"", match_path("src/x.ts", '"src/x.ts"'))
chk("① 方括号 [src/x.ts]", match_path("src/x.ts", "[src/x.ts]"))
# ② 回归保护
chk("② 无包裹 src/x.ts", match_path("src/x.ts", "src/x.ts"))
chk("② 父目录后缀 a/b/c.md ← b/c.md", match_path("a/b/c.md", "b/c.md"))
# ③ 边界
chk("③ 剥壳后为空 → False", not match_path("src/x.ts", "``"))
chk("③ 纯空白 → False", not match_path("src/x.ts", "   "))
chk("③ x.ts 不匹配 x.tsx", not match_path("src/x.tsx", "src/x.ts"))
chk("③ 后缀锚定 dir 不匹配 dir/", not match_path("src/dirsrc/x.ts", "src/x.ts"))
# ⑤ 降级
chk("⑤ pattern=None → False", not match_path("src/x.ts", None))
chk("⑤ path=None → False", not match_path(None, "src/x.ts"))

# ④ 端到端：真实形态 brief 文本（带反引号写集）
brief = """# Task Brief: demo

## Q2: 范围 — 正确的最简方案
做什么：
- `package.json` — 补依赖声明
- **src/sentinel/loader.ts** — 接线
不做什么：
- 不改 `scripts/audit/audit-rules.sh`

## 架构层: L3
"""
inc = parse_q2(brief)["include"]
hits = [p for p in inc if match_path("package.json", p)]
chk("④ 端到端: 反引号 brief 认领 package.json", len(hits) == 1)
hits2 = [p for p in inc if match_path("src/sentinel/loader.ts", p)]
chk("④ 端到端: 加粗 brief 认领 src/sentinel/loader.ts", len(hits2) == 1)

print("FAILS=" + ",".join(fails))
PYEOF
) || true

echo "$OUT" | grep -q '^OK' || true
echo "$OUT" | sed -n 's/^OK  /  ✅ /p; s/^BAD /  ❌ /p'
PASS=$(echo "$OUT" | grep -c '^OK' || true)
FAIL=$(echo "$OUT" | grep -c '^BAD' || true)

# 接线：staging_guard / resolver 真的调用 brief_parser.match_path
grep -q 'from brief_parser import.*match_path' "$REPO/scripts/control-tower/staging_guard.py" \
  && ok "接线: staging_guard 导入 brief_parser.match_path" \
  || no "接线: staging_guard 未导入 match_path"
grep -q 'from brief_parser import parse_q2, match_path' "$REPO/scripts/workflow/resolve-commit-brief.sh" \
  && ok "接线: resolve-commit-brief.sh 导入 brief_parser.match_path" \
  || no "接线: resolve-commit-brief.sh 未导入 match_path"

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
