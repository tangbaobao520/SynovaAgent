import sys, re, json
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
BASE = Path(r"D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\jtbd-research")

unified_f = None
scene_fs = {}
for f in BASE.glob("*.md"):
    n = f.name
    if "\u53bb\u91cd\u540e" in n: unified_f = f
    elif "S1-" in n: scene_fs["S1"] = f
    elif "\u573a\u666f2" in n: scene_fs["S2"] = f
    elif "S3-" in n: scene_fs["S3"] = f
    elif "S4-" in n: scene_fs["S4"] = f
    elif "\u573a\u666f5" in n: scene_fs["S5"] = f
    elif "\u573a\u666f6" in n: scene_fs["S6"] = f

unified_text = unified_f.read_text(encoding="utf-8")

ujtbd_to_scenes = {}
ujtbd_to_grid = {}
ujtbd_texts = {}

parts = re.split(r"(\*\*U-JTBD-\d{4}\*\*)", unified_text)
current_uid = None
for p in parts:
    m = re.match(r"\*\*U-JTBD-(\d{4})\*\*", p)
    if m:
        current_uid = "U-JTBD-" + m.group(1)
        ujtbd_texts[current_uid] = ""
    elif current_uid:
        ujtbd_texts[current_uid] += p

for uid, block in ujtbd_texts.items():
    gm = re.search(r"\|\s*([^]+)\s*\|\s*([^]+)\s*\|", block)
    if gm:
        ujtbd_to_grid[uid] = (gm.group(1), gm.group(2))
    scenes = set()
    sm = re.search(r"\[场景:\s*([^\]]+)\]", block)
    if sm:
        for s in re.findall(r"S\d+", sm.group(1)):
            scenes.add(s)
    src = re.search(r"来源场景:\s*(\S+)", block)
    if src:
        scenes.add(src.group(1))
    ujtbd_to_scenes[uid] = scenes

orig_to_ujtbd = {}
for uid, block in ujtbd_texts.items():
    for m2 in re.finditer(r"(S\d+-JTBD-\d+)", block):
        oid = m2.group(1)
        if oid not in orig_to_ujtbd:
            orig_to_ujtbd[oid] = uid

print("Parsed", len(ujtbd_to_scenes), "U-JTBDs,", len(orig_to_ujtbd), "mappings")
single = sum(1 for v in ujtbd_to_scenes.values() if len(v) == 1)
cross2 = sum(1 for v in ujtbd_to_scenes.values() if len(v) == 2)
cross3plus = sum(1 for v in ujtbd_to_scenes.values() if len(v) >= 3)
print("Coverage: Single=", single, "Cross2=", cross2, "Cross3+=", cross3plus)

scene_counts = {}
for scene in ["S1","S2","S3","S4","S5","S6"]:
    text = scene_fs[scene].read_text(encoding="utf-8")
    jids = re.findall(r"###\s+(S\d+-JTBD-\d+)", text) or re.findall(r"\*\*(S\d+-JTBD-\d+)\*\*", text)
    mapped = sum(1 for j in jids if j in orig_to_ujtbd)
    scene_counts[scene] = {"total": len(jids), "mapped": mapped, "unmapped": len(jids)-mapped}
    print(scene, ":", mapped, "/", len(jids))

def build_rn():
    rn = {}
    for k in ["EM","电商运营经理","电商运营","BM","品牌/市场经理","品牌经理","市场经理","销售VP","销售VP/电商总经理","销售VP/销售总监","销售总监","销售负责人","电商总经理","品牌总监","渠道总监","渠道经理","CM","增长VP","增长VP / CMO","增长VP/CMO","CMO","客户成功VP","客户成功总监","CS","客服主管","私域运营总监","市场总监","跟单员","R2","R2 跟单员"]:
        rn[k] = "销售负责人"
    for k in ["FD","财务负责人","财务总监","CFO","CFO / 财务VP","财务VP","R5","R5 财务"]:
        rn[k] = "财务负责人"
    for k in ["PM","产品经理","产品总监","产品总监/研发总监","研发总监","研发经理","产品VP","工程VP","工程VP / 平台架构师","CTO","CTO/工程VP","工程经理","工程经理/Tech Lead","Tech Lead","平台架构师","工程技术经理","CPO/产品总监","CPO"]:
        rn[k] = "产品负责人"
    for k in ["PD","生产负责人","厂长","厂长 / 生产经理","生产经理","生产总监","供应链总监","供应链","运营总监","质量总监","质检主管","采购","采购经理","R1","R1 厂长","R3","R3 采购","R4","R4 质检主管","安全与合规负责人"]:
        rn[k] = "运营/生产负责人"
    for k in ["HR","人事行政负责人","HRD","HR VP","HR VP / CPO","人力资源总监","HR经理"]:
        rn[k] = "人力负责人"
    for k in ["BU GM","BU GM / 事业部总经理","事业部总经理","数据VP","数据VP / 数据中台负责人","数据中台负责人","数据/BI负责人","全部中层角色"]:
        rn[k] = "通用管理层"
    return rn

RN = build_rn()

def normalize_role(raw):
    raw = raw.strip()
    raw = re.sub(r"\u2190\u2192", ",", raw)
    raw = re.sub(r"[（(][^)）]*[)）]", "", raw)
    parts = re.split(r"[、,/]", raw)
    result = set()
    for p in parts:
        p = p.strip()
        if not p: continue
        if p in RN:
            result.add(RN[p])
        else:
            for k, v in RN.items():
                if k in p and len(k) > 0:
                    result.add(v)
                    break
    return result

all_scene_roles = {}
for scene in ["S1","S2","S3","S4","S5","S6"]:
    text = scene_fs[scene].read_text(encoding="utf-8")
    jids = re.findall(r"###\s+(S\d+-JTBD-\d+)", text) or re.findall(r"\*\*(S\d+-JTBD-\d+)\*\*", text)
    jtbd_roles = {}
    for jid in jids:
        pos = text.find("### " + jid)
        if pos == -1: pos = text.find("**" + jid + "**")
        if pos == -1: continue
        ahead = text[pos:pos+3000]
        rm = re.search(r"\|\s*执行角色\s*\|\s*([^|]+)\s*\|", ahead)
        if rm:
            roles = normalize_role(rm.group(1).strip())
            if roles:
                jtbd_roles[jid] = roles
    all_scene_roles[scene] = jtbd_roles

role_scene_ujtbd = defaultdict(lambda: defaultdict(set))
for scene, jtbd_roles in all_scene_roles.items():
    for jid, roles in jtbd_roles.items():
        uid = orig_to_ujtbd.get(jid, "RAW_" + jid)
        for role in roles:
            role_scene_ujtbd[role][scene].add(uid)

core_roles = ["销售负责人","财务负责人","产品负责人","运营/生产负责人","人力负责人","通用管理层"]
scenes_all = ["S1","S2","S3","S4","S5","S6"]

def jaccard(a, b):
    if not a and not b: return 1.0
    if not a or not b: return 0.0
    return len(a & b) / len(a | b)

print()
print("=== 6-Scene Jaccard ===")
for role in core_roles:
    sets = {s: role_scene_ujtbd[role][s] for s in scenes_all}
    print()
    print("--- " + role + " ---")
    for s1 in scenes_all:
        parts_row = [s1]
        for s2 in scenes_all:
            parts_row.append(format(jaccard(sets[s1], sets[s2]), ".3f"))
        print("  ".join(parts_row))
    vals = [jaccard(sets[s1], sets[s2]) for s1 in scenes_all for s2 in scenes_all if s1 < s2]
    if vals:
        print("  Avg=" + format(sum(vals)/len(vals), ".3f") + " Max=" + format(max(vals), ".3f"))

print()
print("=== 4-Scene Jaccard (S1,S4,S5,S6) ===")
sc4 = ["S1","S4","S5","S6"]
for role in core_roles:
    sets = {s: role_scene_ujtbd[role][s] for s in sc4}
    print()
    print("--- " + role + " ---")
    for s1 in sc4:
        parts_row = [s1]
        for s2 in sc4:
            parts_row.append(format(jaccard(sets[s1], sets[s2]), ".3f"))
        print("  ".join(parts_row))
    vals = [jaccard(sets[s1], sets[s2]) for i1, s1 in enumerate(sc4) for s2 in sc4[i1+1:]]
    if vals:
        print("  Avg=" + format(sum(vals)/len(vals), ".3f") + " Max=" + format(max(vals), ".3f"))

print()
print("=== Cross-Scene U-JTBDs ===")
for uid, scenes in sorted(ujtbd_to_scenes.items()):
    if len(scenes) >= 2:
        grid = ujtbd_to_grid.get(uid, ("?","?"))
        tl = ""
        for line in ujtbd_texts[uid].split("\n"):
            ls = line.strip()
            if ls.startswith("> "):
                tl = ls[2:][:120]
                break
        print(uid, grid[0],"x",grid[1], sorted(scenes), ":", tl[:120])

out = {
    "coverage": {"single":single,"cross2":cross2,"cross3plus":cross3plus,"total":len(ujtbd_to_scenes)},
    "scene_mapping": {s: scene_counts[s] for s in scenes_all},
    "count_matrix": {r: {s: len(role_scene_ujtbd[r][s]) for s in scenes_all} for r in core_roles},
}
for role in core_roles:
    sets = {s: role_scene_ujtbd[role][s] for s in scenes_all}
    out.setdefault("jaccard6",{})[role] = {s1:{s2:round(jaccard(sets[s1],sets[s2]),4) for s2 in scenes_all} for s1 in scenes_all}
    out.setdefault("jaccard4",{})[role] = {s1:{s2:round(jaccard(sets[s1],sets[s2]),4) for s2 in sc4} for s1 in sc4}

op = BASE / "overlap_analysis_comprehensive.json"
op.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print("\nSaved:", op)