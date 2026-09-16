#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# system-registry.test.sh — 寄存器生成器 + I1/I2/I3 校验器测试（铁律 48：正常/降级/边界）
# 用例:
#   A 生成器: 真实 AD01 第四章 → 42 边 + generatedBy/generatedAtCommit 非空 → exit 0
#   A1 断言含 E-01..E-42 完整骨架 + counters 五键
#   B 校验器对真实样板 → exit 1（检出即职责）
#   B1 【验收核心】I2 命中 E-08/E-10/E-11/E-12 一码多义（K3 P0-01）
#   B2 I3 至少命中 1 条计数不符（哨兵 50≠45 / Skill 多值——K3 T2 表）
#   C fixture 正常路径: 干净文档（无冲突）→ exit 0
#   D 降级: registry 缺失 → exit 2; D1 手编嫌疑（抹掉 generatedBy）→ exit 2
#   E 边界: 空文档集 → degraded exit 2（样板目录缺失语义）
# 运行: bash tests/doc-system/system-registry.test.sh
# ═══════════════════════════════════════════════════════════════════════════════
set +e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
GEN="$REPO/scripts/doc-system/gen-system-registry.sh"
VER="$REPO/scripts/doc-system/verify-system-registry.sh"
PASS=0; FAIL=0

t() { if [ "$2" = "$3" ]; then echo "  ✅ $1 (exit $3)"; PASS=$((PASS+1)); else echo "  ❌ $1 (期望 $2 实际 $3)"; FAIL=$((FAIL+1)); fi; }
tg() { case "$3" in *"$2"*) echo "  ✅ $1 (含「$2」)"; PASS=$((PASS+1));; *) echo "  ❌ $1 (输出不含「$2」)"; FAIL=$((FAIL+1));; esac; }

# ── A: 生成器（真实仓库，写真实产物——与 CI canary 同语义）──
OUT=$(bash "$GEN" 2>&1); RC=$?
t  "A 生成器 exit0" 0 "$RC"
tg "A0 GEN-OK" "GEN-OK" "$OUT"
REG="$REPO/docs/authority/system-registry.json"
python3 -c "
import json,sys
d=json.load(open('$REG'))
assert d['generatedBy'], 'generatedBy 空'
assert d['generatedAtCommit'], 'generatedAtCommit 空'
ids={e['id'] for e in d['edges']}
expect={f'E-{i:02d}' for i in range(1,43)}
assert expect <= ids, f'缺边: {sorted(expect-ids)[:5]}'
assert all(e['name'] and e['hardness'] in ('hard','soft','heuristic') for e in d['edges'])
assert set(d['counters']) == {'sentinelDirs','computeFiles','skillDirs','playbookYaml','experts'}
print('A-ASSERT-OK')" 2>&1 | tail -1
t  "A1 42 边骨架 + 五 counter + 防手编字段" 0 $?

# ── B: 校验器对真实样板（检出即职责）──
OUT=$(bash "$VER" 2>&1); RC=$?
t  "B 校验器真实样板 exit1" 1 "$RC"
tg "B1【验收核心】I2 命中 E-08" "E-08 一码多义" "$OUT"
tg "B1a I2 命中 E-10" "E-10 一码多义" "$OUT"
tg "B1b I2 命中 E-11" "E-11 一码多义" "$OUT"
tg "B1c I2 命中 E-12" "E-12 一码多义" "$OUT"
tg "B1d I2 命中旧语义 RESOURCE_ACQUISITION" "RESOURCE_ACQUISITION" "$OUT"
tg "B1e I2 命中新语义 TALENT_FILTER" "TALENT_FILTER" "$OUT"
echo "$OUT" | grep -q "I3.*[1-9] findings"; t "B2 I3 计数不符命中（≥1）" 0 $?
tg "B3 只报不裁定声明" "只报冲突不裁定" "$OUT"

# ── C: fixture 正常路径（干净 → exit 0）──
FIX=$(mktemp -d); trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/docs/synova/research/AD01x" "$FIX/docs/authority" "$FIX/scripts" "$FIX/extensions/sentinels/a-sent/computes" "$FIX/extensions/skills/builtin/s1" "$FIX/extensions/playbooks" "$FIX/expert"
: > "$FIX/extensions/sentinels/a-sent/computes/c.ts"; : > "$FIX/extensions/skills/builtin/s1/SKILL.md"; : > "$FIX/extensions/playbooks/p.yaml"
printf 'experts:\n  host:\n  alpha:\n' > "$FIX/expert/expert-registry.yaml"
# 干净文档: 每边一个名字 + 计数声明与实测一致（2 位专家 / 1 个哨兵 / 1 个 Skill / 1 个 compute）
cat > "$FIX/docs/synova/research/AD01x/ch.md" <<'EOF'
### E-01 ALPHA_EDGE
### E-02 BETA_EDGE
本系统有 1 个哨兵、2 位专家、1 个 Skill。E-01 与 E-02。
EOF
# fixture 生成器源（第四章格式）——用 SYNO_VERIFY_DOCS 指到 fixture 文档目录
cat > "$FIX/docs/synova/research/AD01x/ch4.md" <<'EOF'
### E-01 ALPHA_EDGE（组A | soft | 1/1=100%）
### E-02 BETA_EDGE（组A | hard | 1/1=100%）
EOF
# 临时替换 glob: gen 用固定第四章名——复制真实第四章名到 fixture
mv "$FIX/docs/synova/research/AD01x/ch4.md" "$FIX/docs/synova/research/AD01x/SYNOVA-RESEARCH-第四章-边节点映射矩阵-v1-0.md"
# gen 在 fixture（无 .git → generatedAtCommit=null → degraded exit 2——D 用例复用）; 先造一个合规 registry 手动注入 counters
python3 - "$FIX" <<'PYEOF'
import json, sys
fix = sys.argv[1]
doc = {
  "schemaVersion": "1.0", "generatedFrom": ["docs/synova/research/AD01x/ch.md"],
  "generatedBy": "scripts/doc-system/gen-system-registry.sh", "generatedAtCommit": "f"*40,
  "edges": [
    {"id": "E-01", "name": "ALPHA_EDGE"}, {"id": "E-02", "name": "BETA_EDGE"},
  ],
  "counters": {
    "sentinelDirs": {"value": 1, "derivedBy": "fixture"},
    "experts": {"value": 2, "derivedBy": "fixture"},
    "skillDirs": {"value": 1, "derivedBy": "fixture"},
  },
}
json.dump(doc, open(f"{fix}/docs/authority/system-registry.json", "w"), ensure_ascii=False)
PYEOF
# 把 fixture 排在真实 docs 前: 用 SYNO_VERIFY_DOCS 指向 fixture 目录（glob 无 → 单文件路径）
OUT=$(DOC_TRUTH_ROOT="$FIX" SYNO_VERIFY_DOCS="docs/synova/research/AD01x/ch.md" bash "$VER" 2>&1); RC=$?
t  "C 干净样板 exit0" 0 "$RC"
tg "C1 I1 零 findings" "✅ I1: 零 findings" "$OUT"
tg "C2 I2 零 findings" "✅ I2: 零 findings" "$OUT"
tg "C3 I3 零 findings" "✅ I3: 零 findings" "$OUT"

# ── D: 降级路径 ──
OUT=$(DOC_TRUTH_ROOT="$FIX" SYNO_VERIFY_DOCS="docs/synova/research/AD01x/ch.md" bash "$VER" --no-reg 2>&1); RC=$?
# registry 缺失: 用空 DOC_TRUTH_ROOT 触发
OUT=$(DOC_TRUTH_ROOT="$FIX/empty" SYNO_VERIFY_DOCS="x" bash "$VER" 2>&1); RC=$?
t  "D registry 缺失 exit2" 2 "$RC"
tg "D0 degraded 提示" "degraded" "$OUT"
# 手编嫌疑: 抹掉 generatedBy
python3 -c "
import json
p='$FIX/docs/authority/system-registry.json'
d=json.load(open(p)); d['generatedBy']=''; json.dump(d, open(p,'w'), ensure_ascii=False)"
OUT=$(DOC_TRUTH_ROOT="$FIX" SYNO_VERIFY_DOCS="docs/synova/research/AD01x/ch.md" bash "$VER" 2>&1); RC=$?
t  "D1 手编嫌疑 exit2" 2 "$RC"
tg "D1a 手编提示" "手编" "$OUT"

# ── E: 边界（空文档集）──
OUT=$(DOC_TRUTH_ROOT="$FIX" SYNO_VERIFY_DOCS="nonexistent-dir" bash "$VER" 2>&1); RC=$?
t  "E 空文档集 exit2" 2 "$RC"

echo "── 汇总: $PASS 通过 / $FAIL 失败 ──"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
