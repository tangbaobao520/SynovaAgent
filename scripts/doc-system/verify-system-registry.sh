#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# verify-system-registry.sh — I1/I2/I3 一致性校验器（D782 / K3 §10.2 规格样板）
#
# 解决的问题（K3 §7.2 收割 1）: 18 份权威文档从未被任何机器防线读取——
#   P0-01（E-08/E-10/E-11/E-12 一码多义）等 30 处不自洽无校验器可抓。
#   本校验器按 §10.2 的 I2/I6 规则对样板文档（AD01+AD12+AD03）做机械判定。
#
# ⚠️ 角色声明: 本校验器只报冲突、不裁定对错（K3 §8 待裁定项归创始人）。
#   检出红 = 发现真相（校验器职责），不是门禁失败——不接入 pre-commit 硬阻断，
#   待文档修复后转 ratchet 逐步收紧（同 BOM ratchet 模式）。
#
# 契约（铁律 47 契约优先）:
#   @input  — docs/authority/system-registry.json（gen-system-registry.sh 产出）;
#             样板文档集 = AD01 全目录 + AD12 + AD03（K3 被审对象抽样）;
#             DOC_TRUTH_ROOT 覆盖仓库根（测试用）; SYNO_VERIFY_DOCS 覆盖文档目录列表（空格分隔）
#   @output — stdout: I1/I2/I3 逐项 ✅/❌ + file:line 证据 + 汇总; exit 0/1/2
#   @exit   — 0 = 零 findings; 1 = 检出不一致（I2 一码多义/I1 引用不可解析/I3 计数不符——
#             这是校验器的正常业务输出，即「发现了 K3 已知问题」）;
#             2 = 执行降级（registry 缺失/手编嫌疑/文档目录缺失——D328 三态）
#   @degraded — registry 缺失或 generatedBy/generatedAtCommit 为空（K3 §10.1 禁手编）→ exit 2
#
# 三条不变量（K3 §10.2 样板）:
#   I2 一义一 ID: 文档中 `### E-NN NAME` 定义型标题，同一 ID 出现多个不同 NAME → 红
#                 （直接抓 P0-01: 第二章旧编号 vs 第四章新编号）
#   I1 一 ID 一义: 文档中 E-NN token 必须解析到 registry.edges 恰好一个定义;
#                 registry 外的 E-NN（如 E-99）→ 红
#   I3 计数自洽: 文档中 `N 个哨兵`/`N 位专家`/`N 个 Skill` 声明 vs counters 实测派生值
#                 → 不等红，打印 声明值 vs 派生值 vs 派生命令
# ═══════════════════════════════════════════════════════════════════════════════
set +e
ROOT="${DOC_TRUTH_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" # swallow-ok:
REG="$ROOT/docs/authority/system-registry.json"

PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done
if [ -z "$PYBIN" ]; then
  echo "degraded: python3 不可用（D328 exit 2）" >&2
  exit 2
fi
if [ ! -f "$REG" ]; then
  echo "degraded: registry 缺失 $REG——先跑 bash scripts/doc-system/gen-system-registry.sh（D328 exit 2）" >&2
  exit 2
fi

"$PYBIN" - "$ROOT" "$REG" ${SYNO_VERIFY_DOCS:-} <<'PYEOF'
import glob, json, os, re, sys

root, reg_path = sys.argv[1], sys.argv[2]
extra_docs = [a for a in sys.argv[3:] if a]

reg = json.load(open(reg_path, encoding='utf-8'))
if not reg.get("generatedBy") or not reg.get("generatedAtCommit"):
    print("degraded: registry 的 generatedBy/generatedAtCommit 为空——手编嫌疑（K3 §10.1 禁手编，D328 exit 2）", file=sys.stderr)
    sys.exit(2)

edges = {e["id"]: e for e in reg.get("edges", [])}
counters = reg.get("counters", {})

# 样板文档集: AD01 全目录 + AD12 + AD03（K3 被审对象抽样; SYNO_VERIFY_DOCS 可覆盖/追加）
docs = sorted(glob.glob(os.path.join(root, "docs/synova/research/权威文档01-*", "*.md")))
docs += sorted(glob.glob(os.path.join(root, "docs/synova/research/权威文档12-*", "*.md")))
docs += sorted(glob.glob(os.path.join(root, "docs/synova/research/权威文档03-*", "*.md")))
for d in extra_docs:
    docs += sorted(glob.glob(os.path.join(root, d, "*.md"))) if os.path.isdir(os.path.join(root, d)) else [os.path.join(root, d)]
if not docs:
    print("degraded: 样板文档目录缺失（AD01/AD12/AD03）", file=sys.stderr)
    sys.exit(2)

findings = {"I1": [], "I2": [], "I3": []}
checked = 0

# ── I2: 一义一 ID（同 ID 多 NAME → 红; 直接抓 P0-01）──
DEF_PATS = [
    re.compile(r'^### (E-\d{2}):?\s+([A-Z_]+)', re.M),          # 第二章 "### E-01: NAME" / 第四章 "### E-01 NAME（…）"
]
names_by_id = {}   # id -> set of (name, file, line)
for path in docs:
    rel = os.path.relpath(path, root)
    text = open(path, encoding='utf-8', errors='replace').read()
    for pat in DEF_PATS:
        for m in pat.finditer(text):
            eid, name = m.group(1), m.group(2)
            line = text[:m.start()].count('\n') + 1
            names_by_id.setdefault(eid, set()).add((name, rel, line))
for eid, occ in sorted(names_by_id.items()):
    names = {n for n, _, _ in occ}
    if len(names) > 1:
        ev = "; ".join(f"{n} @ {f}:L{l}" for n, f, l in sorted(occ))
        findings["I2"].append(f"{eid} 一码多义（{len(names)} 义）: {ev}")

# ── I1: 一 ID 一义（E-NN token 解析到 registry 恰好一个定义）──
TOKEN = re.compile(r'\bE-\d{2}\b')
registry_ids = set(edges)
for path in docs:
    rel = os.path.relpath(path, root)
    text = open(path, encoding='utf-8', errors='replace').read()
    checked += 1
    unknown = sorted({t for t in TOKEN.findall(text) if t not in registry_ids})
    if unknown:
        findings["I1"].append(f"{rel}: 引用了 registry 外的边 ID: {', '.join(unknown)}")

# ── I3: 计数自洽（文档声明 vs counters 实测）──
CLAIM_PATS = [
    (re.compile(r'(\d+)\s*(?:个|条)?\s*哨兵'), "sentinelDirs", "哨兵目录（实测口径）"),
    (re.compile(r'(\d+)\s*位专家'), "experts", "registry v3.0 专家键"),
    (re.compile(r'(\d+)\s*(?:个|条)?\s*Skill'), "skillDirs", "builtin skill 目录"),
]
for path in docs:
    rel = os.path.relpath(path, root)
    text = open(path, encoding='utf-8', errors='replace').read()
    for pat, key, label in CLAIM_PATS:
        counter = counters.get(key)
        if not counter:
            continue
        for m in pat.finditer(text):
            claimed = int(m.group(1))
            line = text[:m.start()].count('\n') + 1
            if claimed != counter["value"]:
                findings["I3"].append(
                    f"{rel}:L{line} 声明 {claimed} ≠ 实测 {counter['value']}（{label}; derivedBy: {counter['derivedBy']}）")

# ── 汇总 ──
total = sum(len(v) for v in findings.values())
print(f"═══ verify-system-registry — I1/I2/I3 一致性校验（{checked} 文件; registry {len(edges)} 边 / {len(counters)} counter）═══")
for inv in ("I1", "I2", "I3"):
    items = findings[inv]
    if not items:
        print(f"  ✅ {inv}: 零 findings")
    else:
        print(f"  ❌ {inv}: {len(items)} findings")
        for it in items[:12]:
            print(f"     {it}")
        if len(items) > 12:
            print(f"     …（其余 {len(items)-12} 条从略）")
print(f"── 汇总: {total} findings ──")
print("（角色声明: 只报冲突不裁定对错——K3 §8 待裁定项归创始人; 检出即校验器职责达成）")
sys.exit(1 if total else 0)
PYEOF
exit $?
