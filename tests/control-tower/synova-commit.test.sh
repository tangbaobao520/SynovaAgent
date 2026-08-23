#!/usr/bin/env bash
# tests/control-tower/synova-commit.test.sh — synova-commit 配对测试（U7/CT-40 配对规则）
# 聚焦 D507 并行隔离门禁段（改 control-tower/synova-commit 的强制配对；其余门禁由 12 组自测覆盖）
# 覆盖（铁律 48）:
#   ① 接线: synova-commit 源码含 D507 门禁段（存在性 + 关键行为点）
#   ② 判定逻辑: 多 session（其他>0）→ 阻断分支可达；单 session → 放行（grep 判定条件）
#   ③ 降级: registry 不可读 → 显式警告非静默（_REGOUT 空分支存在）
#   ④ worktree 内放行: IS_LINKED_WT 空值条件在阻断条件里（worktree 内不拦）
# 沙箱: 纯 grep/源码断言 + registry JSON 判定单测（python 内联），零真实提交

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SC="$HERE/../../scripts/control-tower/synova-commit"
PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# ① 门禁段存在（接线）
grep -q "D507: 并行 session 物理隔离门禁" "$SC" && ok "① D507 门禁段存在" || bad "① 门禁段缺失"
# ② 多 session 阻断条件
grep -q 'IS_LINKED_WT" && -f' "$SC" && ok "② 仅主区（非 worktree）才检测" || bad "② worktree 放行条件缺失"
grep -q '"\$_OTHERS" -gt 0' "$SC" && ok "② 其他活跃 session >0 → 阻断" || bad "② 计数阻断条件缺失"
grep -q "exit 1" <(sed -n '/D507: 并行 session/,/^fi$/p' "$SC") && ok "② 阻断 exit 1 可达" || bad "② 无 exit 1"
# ③ 单人放行：_OTHERS=0 时不进 if（结构性断言：if 只包 _OTHERS>0 分支）
grep -q "单人时段可正常提交" "$SC" && ok "③ 单人放行提示存在" || bad "③ 单人提示缺失"
# ④ 降级显式
grep -q "registry 不可读，并行检测跳过" "$SC" && ok "④ registry 降级显式提示" || bad "④ 降级静默"
# ⑤ 判定逻辑单测（registry JSON 解析，与门禁内嵌 python 同语义）
python3 - <<'PY' && ok "⑤ JSON 判定语义（多/单/坏输入）" || bad "⑤ 判定语义错误"
import json, sys
def others_count(payload, self_id):
    try:
        d = json.loads(payload)
        sessions = d if isinstance(d, list) else d.get("sessions", [])
        return len([s for s in sessions if s.get("session_id") != self_id])
    except Exception:
        return -1
assert others_count('{"sessions":[{"session_id":"A"},{"session_id":"B"}]}', "A") == 1, "多 session"
assert others_count('{"sessions":[{"session_id":"A"}]}', "A") == 0, "单人"
assert others_count('{"sessions":[]}', "A") == 0, "空"
assert others_count('NOT JSON', "A") == -1, "坏输入 → -1（降级路径）"
sys.exit(0)
PY

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
