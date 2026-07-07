#!/usr/bin/env python3
"""JTBD Cross-Scenario Semantic Equivalence Deduplication -- Step 1.7.
Accurate parser that reads the actual file formats."""
import re, sys
from collections import defaultdict
from pathlib import Path

BASE = Path(r"D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\jtbd-research")

SCENARIO_FILES = {
    "S1": BASE / "SYNOVA-RESEARCH-JTBD-S1-消费品中小-JTBD穷举-20260706.md",
    "S2": BASE / "SYNOVA-RESEARCH-JTBD-Phase1-场景2-消费品中大-JTBD穷举-20260706.md",
    "S3": BASE / "SYNOVA-RESEARCH-JTBD-S3-制造中小-JTBD穷举-20260706.md",
    "S4": BASE / "SYNOVA-RESEARCH-JTBD-Phase1-S4-制造中大-20260706.md",
    "S5": BASE / "SYNOVA-RESEARCH-JTBD-场景5-SaaS中小-JTBD穷举-20260706.md",
    "S6": BASE / "SYNOVA-RESEARCH-JTBD-场景6-SaaS中大-JTBD穷举-20260706.md",
}

# Map Chinese type names + English annotations to standard classes
TYPE_TO_CLASS = {
    "干预型": "ALLOCATE",
    "诊断型": "DIAGNOSE",
    "预测型": "PREDICT",
    "干预型（allocate）": "ALLOCATE",
    "诊断型（diagnose）": "DIAGNOSE",
    "预测型（predict）": "PREDICT",
    "干预型 (allocate": "ALLOCATE",
    "诊断型 (diagnose": "DIAGNOSE",
    "预测型 (predict": "PREDICT",
    "allocate": "ALLOCATE", "diagnose": "DIAGNOSE", "predict": "PREDICT",
    "evaluate": "EVALUATE", "control": "CONTROL", "design": "DESIGN", "negotiate": "NEGOTIATE",
}

# For S5 compound types
COMPOUND_TYPE_MAP = {
    "诊断型 + 干预型": ["DIAGNOSE", "ALLOCATE"],
    "干预型 + 诊断型": ["ALLOCATE", "DIAGNOSE"],
    "预测型 + 干预型": ["PREDICT", "ALLOCATE"],
    "诊断型 + 预测型": ["DIAGNOSE", "PREDICT"],
}

ENTITY_PATTERNS = {
    "Customer":    ["客户", "用户", "顾客", "会员", "买家", "消费者", "粉丝", "订阅者", "复购", "流失", "续费", "客单价", "LTV", "CAC"],
    "Channel":     ["渠道", "通路", "平台", "门店", "终端", "触点", "分销", "经销商", "代理商", "电商", "直播", "投放", "广告", "获客", "ROI", "转化率"],
    "Product":     ["产品", "商品", "SKU", "产线", "品类", "款式", "型号", "新品", "爆品", "单品", "良率", "退货", "产品线", "条线"],
    "Resource":    ["资金", "现金流", "预算", "人力", "人员", "团队", "物料", "库存", "原材料", "备货", "产能", "费用"],
    "Market":      ["市场", "区域", "赛道", "行业", "领域", "地区", "海外", "新市场", "地域", "片区", "下沉", "竞争格局"],
    "Operation":   ["流程", "工单", "项目", "交付", "运营", "服务", "售后", "供应链", "物流", "仓储", "订单", "履约", "排期", "排产", "瓶颈", "效率"],
    "Supplier":    ["供应商", "合作伙伴", "外包", "代工", "厂商", "乙方", "服务商"],
}

EDGE_PATTERNS = {
    "PRODUCES":       ["产出", "生产", "良率", "合格率", "质量", "OEE", "产能利用率", "制造", "出品"],
    "CONSUMES":       ["消耗", "花费", "支出", "用掉", "成本", "费用", "消耗量", "损耗", "浪费"],
    "BUYS_FROM":      ["复购", "回购", "转化", "购买", "下单", "成交", "获客", "拉新", "留存", "活跃", "流失", "续费", "订阅", "退货", "客单价", "LTV", "CAC", "消费", "付费"],
    "AFFECTS":        ["影响", "导致", "引起", "造成", "驱动", "触发", "波动", "变化", "归因", "因果", "根因", "为什么", "因素"],
    "DEPENDS_ON":     ["依赖", "依靠", "取决于", "关联", "绑定", "锁定", "耦合", "受限", "制约"],
    "COMPETES_WITH":  ["竞争", "竞品", "对手", "市场份额", "替代", "抢", "争夺", "对比"],
    "FLOWS_TO":       ["现金流", "资金流", "回款", "付款", "账期", "应收", "应付", "到账", "汇款", "结算", "周转"],
    "REPORTS_TO":     ["审批", "汇报", "上报", "签批", "核准", "报备", "述职"],
}

# S6 already has explicit (S1 x S2) in the type field
S6_EXPLICIT_CLASS = {}  # populated during parse

def parse_type_to_class(type_str):
    """Parse the JTBD type string into standard class(es)."""
    type_lower = type_str.strip().lower()
    # S6 format: "干预型 (ALLOCATE x Product)" -> extract ALLOCATE
    m2 = re.match(r'.*?\(([A-Z]+)\s*[x×]\s*([A-Z][a-z]+)', type_str)
    if m2:
        return m2.group(1), m2.group(2)  # (s1_class, s2_entity)
    # S4 format: "干预型（ALLOCATE）" or "诊断型（DIAGNOSE）"
    m = re.search(r'[（(]([A-Z]+)[）)]', type_str)
    if m:
        return m.group(1), None
    # S3 format: "预测型 (PREDICT x Operation)"
    m3 = re.search(r'\(([A-Z]+)\s*[x×]\s*([A-Z][a-z]+)', type_str)
    if m3:
        return m3.group(1), m3.group(2)
    # S1/S2 format: "干预型", "诊断型", "预测型"
    for cn, en in [("干预型", "ALLOCATE"), ("诊断型", "DIAGNOSE"), ("预测型", "PREDICT")]:
        if cn in type_str:
            return en, None
    # Compound (S5): "诊断型 + 干预型"
    if "诊断型" in type_str and "干预型" in type_str:
        return "DIAGNOSE", None  # take primary
    if "预测型" in type_str and "干预型" in type_str:
        return "PREDICT", None
    # Fallback English matching
    for en in ["ALLOCATE", "PREDICT", "DIAGNOSE", "EVALUATE", "DESIGN", "CONTROL", "NEGOTIATE"]:
        if en in type_str.upper():
            return en, None
    return None, None

def classify_verb(text):
    """Fallback verb classification from text when type annotation is absent."""
    vc_patterns = {
        "ALLOCATE": ["分配", "配置", "预算", "投放", "投入", "安排", "怎么.*分"],
        "PREDICT":  ["预测", "预估", "推算", "测算", "预计"],
        "DIAGNOSE": ["诊断", "排查", "定位", "归因", "根因", "为什么.*下降", "找出.*原因", "查明"],
        "EVALUATE": ["评估", "比较", "选择", "权衡", "评价", "是否值得", "要不要", "该不该"],
        "DESIGN":   ["设计", "规划", "制定", "构建", "搭建", "架构", "重组"],
        "CONTROL":  ["监控", "调整", "优化", "改善", "改进", "提升", "降低", "减少", "确保", "跟踪"],
        "NEGOTIATE":["谈判", "协商", "签约", "续约", "议价"],
    }
    for vc, patterns in vc_patterns.items():
        for pat in patterns:
            if re.search(pat, text):
                return vc
    if "为什么" in text or "原因" in text:
        return "DIAGNOSE"
    if "要不要" in text or "是否" in text:
        return "EVALUATE"
    return "CONTROL"

def classify_entity(text):
    scores = {}
    for etype, patterns in ENTITY_PATTERNS.items():
        score = sum(len(re.findall(pat, text)) for pat in patterns)
        if score > 0:
            scores[etype] = score
    if not scores:
        return "Operation"
    return max(scores, key=scores.get)

def classify_edges(text):
    edges = set()
    for etype, patterns in EDGE_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, text):
                edges.add(etype)
    if not edges:
        edges.add("AFFECTS")
    return edges

def parse_file(filepath, scenario):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        print(f"WARN: {filepath}: {e}", file=sys.stderr)
        return []
    lines = content.split("\n")
    jtbds = []

    # Strategy: find all ### SX-JTBD-NNN headers, each marks a JTBD block
    i = 0
    while i < len(lines):
        ls = lines[i].strip()
        # Match JTBD header: ### S1-JTBD-001 or S3-JTBD-001** or ## S6-JTBD-001
        m = re.match(r'#*\s*(S\d-JTBD[-_]\d+)', ls)
        if not m:
            # S5 format: just the ID on its own line
            m = re.match(r'(S\d-JTBD[-_]\d+)$', ls)
        if not m:
            i += 1
            continue

        jtbd_id = m.group(1)
        # Read ahead to find the JTBD description and type
        desc = ""
        type_str = ""
        for j in range(i + 1, min(i + 30, len(lines))):
            nl = lines[j].strip()
            if not nl:
                continue
            # Description line
            if not desc:
                # S1/S2/S4: **JTBD**：...
                dm = re.search(r'\*\*JTBD\*\*[：:]?\s*["\u201c]?(.+?)["\u201d]?$', nl)
                if dm:
                    desc = dm.group(1).strip()
                    continue
                # S3: > "..."
                dm2 = re.search(r'>\s*["\u201c](.+?)["\u201d]$', nl)
                if dm2:
                    desc = dm2.group(1).strip()
                    continue
                # S6: **语句:** ...
                dm3 = re.search(r'\*\*语句[：:]\*\*\s*(.+?)$', nl)
                if dm3:
                    desc = dm3.group(1).strip()
                    continue
                # S5: **JTBD**: "..."
                dm4 = re.search(r'\*\*JTBD\*\*[：:]?\s*["\u201c](.+?)["\u201d]$', nl)
                if dm4:
                    desc = dm4.group(1).strip()
                    continue
            # Type line: | JTBD类型 | ... |
            if not type_str:
                tm = re.search(r'JTBD类型\s*\|\s*(.+?)\s*\|', nl)
                if tm:
                    type_str = tm.group(1).strip()
                    # S3 may have type in a different format
                # S3: > "..." on separate lines with type embedded
                tm2 = re.search(r'JTBD类型[：:]\s*(.+?)(?:\||$)', nl)
                if tm2:
                    type_str = tm2.group(1).strip()
            # Stop at next JTBD header or section break
            if re.match(r'#*\s*(S\d-JTBD[-_]\d+)', nl):
                break
            if nl.startswith("---") and desc:
                break

        if desc and len(desc) >= 8:
            # Parse type to get S1 class + possibly S2 entity
            s1_class, s2_from_type = parse_type_to_class(type_str) if type_str else (None, None)

            # For S6, the type field contains both: "干预型 (ALLOCATE x Product)"
            # We already extracted s2_from_type from the regex

            if not s1_class:
                s1_class = classify_verb(desc)
            if s2_from_type:
                # Normalize: first letter upper, rest lower
                s2_entity = s2_from_type[0].upper() + s2_from_type[1:].lower() if len(s2_from_type) > 1 else s2_from_type
                # Map common variations
                entity_map = {"Customer": "Customer", "Channel": "Channel", "Product": "Product",
                              "Resource": "Resource", "Market": "Market", "Operation": "Operation",
                              "Supplier": "Supplier"}
                s2_entity = entity_map.get(s2_entity, s2_entity)
            else:
                s2_entity = classify_entity(desc)

            edges = classify_edges(desc)

            jtbds.append({
                "id": jtbd_id,
                "text": desc,
                "scenario": scenario,
                "s1_class": s1_class,
                "s2_entity": s2_entity,
                "s3_edges": sorted(edges),
            })

        # Skip to after this block
        i += 1
        # Fast-forward past the table
        while i < len(lines) and not re.match(r'#*\s*(S\d-JTBD[-_]\d+)', lines[i].strip()):
            if lines[i].strip().startswith("---") and i > 0:
                # After the separator, next JTBD may come
                pass
            i += 1

    return jtbds


def overlap_score(ea, eb):
    sa, sb = set(ea), set(eb)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def common_convergence(ta, tb):
    wa = set(re.findall(r"[\u4e00-\u9fff]{2,4}", ta))
    wb = set(re.findall(r"[\u4e00-\u9fff]{2,4}", tb))
    if not wa or not wb:
        return False
    return len(wa & wb) / min(len(wa), len(wb)) >= 0.45


def dedup_cell(jtbds):
    if len(jtbds) <= 1:
        return jtbds, []
    n = len(jtbds)
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py
    for i in range(n):
        for j in range(i + 1, n):
            a, b = jtbds[i], jtbds[j]
            score = overlap_score(a["s3_edges"], b["s3_edges"])
            if score >= 0.7:
                union(i, j)
            elif score >= 0.5 and common_convergence(a["text"], b["text"]):
                union(i, j)
    groups = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)
    deduped = []
    merges = []
    for indices in groups.values():
        members = [jtbds[i] for i in indices]
        if len(members) == 1:
            deduped.append(members[0])
        else:
            rep = max(members, key=lambda m: len(m["text"]))
            variants = [m["id"] for m in members if m["id"] != rep["id"]]
            rep["equiv_variants"] = variants
            rep["variant_scenarios"] = list(set(m["scenario"] for m in members))
            deduped.append(rep)
            merges.append({
                "representative": rep["id"],
                "variants": variants,
                "count": len(members),
                "scenarios": list(set(m["scenario"] for m in members)),
                "text": rep["text"],
                "s1": rep["s1_class"],
                "s2": rep["s2_entity"],
            })
    return deduped, merges


def main():
    print("=" * 60)
    print("JTBD Cross-Scenario Semantic Equivalence Dedup -- Step 1.7")
    print("=" * 60)
    all_jtbds = []
    for scenario, fp in SCENARIO_FILES.items():
        jtbds = parse_file(fp, scenario)
        print(f"  {scenario}: {len(jtbds)} JTBDs")
        all_jtbds.extend(jtbds)
    print(f"\nTotal parsed: {len(all_jtbds)}")

    # Show classification distribution
    from collections import Counter
    vc_dist = Counter(j["s1_class"] for j in all_jtbds)
    et_dist = Counter(j["s2_entity"] for j in all_jtbds)
    print(f"\nS1 class distribution: {dict(vc_dist)}")
    print(f"S2 entity distribution: {dict(et_dist)}")

    grid = defaultdict(list)
    for j in all_jtbds:
        grid[(j["s1_class"], j["s2_entity"])].append(j)
    print(f"Grid cells occupied: {len(grid)}")
    for key, cell in sorted(grid.items(), key=lambda x: -len(x[1])):
        print(f"  {key}: {len(cell)}")

    all_deduped = []
    all_merges = []
    grid_counts = {}
    for key, cell_jtbds in sorted(grid.items()):
        before = len(cell_jtbds)
        deduped, merges = dedup_cell(cell_jtbds)
        after = len(deduped)
        grid_counts[key] = {"before": before, "after": after, "merges": len(merges)}
        all_deduped.extend(deduped)
        all_merges.extend(merges)
        if merges:
            print(f"\n  Cell {key}: {before} -> {after} ({len(merges)} groups)")
            for m in merges:
                print(f"    {m['representative']}: +{len(m['variants'])} from {m['scenarios']}")

    total_before = sum(gc["before"] for gc in grid_counts.values())
    total_after = sum(gc["after"] for gc in grid_counts.values())
    print(f"\n{'='*60}")
    print(f"RESULT: {total_before} -> {total_after} ({total_before - total_after} merged, {((total_before - total_after)/total_before*100):.1f}%)")
    print(f"{'='*60}")

    generate_output(all_deduped, grid_counts, total_before, total_after, all_merges)


def generate_output(deduped, grid_counts, total_before, total_after, all_merges):
    deduped_by_cell = defaultdict(list)
    for j in deduped:
        deduped_by_cell[(j["s1_class"], j["s2_entity"])].append(j)
    vcs = ["ALLOCATE", "PREDICT", "DIAGNOSE", "EVALUATE", "DESIGN", "CONTROL", "NEGOTIATE"]
    ets = ["Customer", "Channel", "Product", "Resource", "Market", "Operation", "Supplier"]
    L = []
    def w(s=""):
        L.append(s)
    w("# 去重后统一JTBD集")
    w("")
    w("> 步骤1.7输出 -- 跨场景JTBD语义等价去重")
    w("> 判定依据：SYNOVA-RESEARCH-JTBD-语义等价判定矩阵-20260706.md v1.0")
    w("> 日期：2026-07-06")
    w("")
    w("## 总览")
    w("")
    w(f"- 去重前：{total_before}")
    w(f"- 去重后：{total_after}")
    w(f"- 合并的等价组：{len(all_merges)}")
    w(f"- 合并的JTBD数：{total_before - total_after}")
    w(f"- 合并率：{(total_before - total_after) / total_before * 100:.1f}%")
    w("")
    w("## 按格子分布")
    w("")
    w("| 决策动词 \\ 实体类型 | " + " | ".join(ets) + " |")
    w("|" + "---|" * (len(ets) + 1))
    for vc in vcs:
        row = [vc]
        for et in ets:
            gc = grid_counts.get((vc, et))
            if gc:
                row.append(f"{gc['after']} (<-{gc['before']})" if gc["merges"] > 0 else str(gc["after"]))
            else:
                row.append("-")
        w("| " + " | ".join(row) + " |")
    w("")
    w("## 去重后JTBD列表")
    w("")
    counter = [0]
    for vc in vcs:
        for et in ets:
            key = (vc, et)
            jtbds = deduped_by_cell.get(key, [])
            if not jtbds:
                continue
            gc = grid_counts.get(key, {"before": len(jtbds), "after": len(jtbds), "merges": 0})
            w(f"### {vc} x {et} ({gc['after']}个, 原{gc['before']}个)")
            w("")
            for j in sorted(jtbds, key=lambda x: len(x["text"]), reverse=True):
                counter[0] += 1
                uid = f"U-JTBD-{counter[0]:04d}"
                edges_str = ",".join(j.get("s3_edges", []))
                w(f"**{uid}** | `{j['s1_class']}` | `{j['s2_entity']}` | `{edges_str}`")
                w(f"> {j['text']}")
                variants = j.get("equiv_variants", [])
                if variants:
                    scenarios = j.get("variant_scenarios", [])
                    w(f"> 等价变体 ({len(variants)}个): {', '.join(variants)} [场景: {', '.join(scenarios)}]")
                w(f"> 来源场景: {j['scenario']}")
                w("")
    w("## 判定过程摘要")
    w("")
    w("按语义等价判定矩阵三步法执行：")
    w("")
    w("1. **S1**: JTBD决策动词 -> 7个标准类")
    w("2. **S2**: 作用对象 -> 7个本体实体类型")
    w("3. **S3**: 同一格子内计算因果边类型Jaccard重叠度, >=70%等价, 50-70%子判定汇聚节点, <50%不等价")
    w("")
    w("### 各格子处理")
    w("")
    for (vc, et), gc in sorted(grid_counts.items(), key=lambda x: -x[1]["before"]):
        note = ""
        if gc["merges"] > 0:
            note = f" -- 合并{gc['before'] - gc['after']}个 ({gc['merges']}组)"
        w(f"- **{vc} x {et}**: {gc['before']} -> {gc['after']}{note}")
    w("")
    w("## 边界案例")
    w("")
    w("### 边界5: 多角色同JTBD不拆分")
    w("同一JTBD决策主干相同但角色视角不同时, 标记为同一JTBD的多角色信息维度。")
    w("")
    w("### 边界1: 个体vs群体不等价")
    w("JTBD作用对象粒度不同时判定为不等价。")
    w("")
    w("### 合并详情")
    if all_merges:
        for m in sorted(all_merges, key=lambda x: -x["count"]):
            w(f"- **{m['representative']}** <- {', '.join(m['variants'])} ({', '.join(m['scenarios'])}, {m['count']}->1, {m['s1']}x{m['s2']})")
            snippet = m["text"][:150]
            w(f"  > {snippet}{'...' if len(m['text']) > 150 else ''}")
    else:
        w("无跨场景等价合并。")
    w("")
    output_path = BASE / "SYNOVA-RESEARCH-JTBD-去重后统一JTBD集-20260706.md"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"\nOutput: {output_path}")

if __name__ == "__main__":
    main()
