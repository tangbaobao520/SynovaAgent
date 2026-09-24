#!/usr/bin/env python3
"""D943 — DSH 断面一致性门禁（唯一事实源：docs/synova/coordination/DSH-断面.json）

判据:
  ① 事实源可读 + JSON 合法          否则 exit 2（degraded，fail-closed）
  ② 真实 DSH 树 HEAD == 事实源 head  否则 exit 2（degraded：树已移动，全部引用降级待复核）
  ③ 被扫描文档不得出现 superseded 的 (version, head) 否则 exit 1（VIOLATION，点名 file:line）
  ④ 被扫描文档不得出现"未登记"的 DSH 版本串 否则 exit 1
输出: DSH-ANCHOR: OK | VIOLATION(n) | DEGRADED
"""
import argparse, json, os, re, subprocess, sys

OK, VIOL, DEG = 0, 1, 2

def sh(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--anchor", default="docs/synova/coordination/DSH-断面.json")
    ap.add_argument("--scan-dir", default="docs/synova/coordination")
    ap.add_argument("--tree", default=None)
    a = ap.parse_args()

    apath = os.path.join(a.repo, a.anchor)
    try:
        anchor = json.load(open(apath, encoding="utf-8"))
        cur = anchor["current"]; sup = anchor.get("superseded", [])
    except Exception as e:
        print("degraded: 事实源不可读/非法: %s (%s)" % (apath, e)); print("DSH-ANCHOR: DEGRADED"); return DEG

    tree = a.tree or cur.get("path")
    real = sh(["git", "-C", tree, "rev-parse", "--short", "HEAD"]) if tree and os.path.isdir(tree) else ""
    if not real:
        print("degraded: 无法解析 DSH 树 HEAD: %s" % tree); print("DSH-ANCHOR: DEGRADED"); return DEG
    if real != cur["head"]:
        print("degraded: 树已移动 — 事实源 %s，实测 %s（所有绑旧 HEAD 的结论自动降级『待复核』）" % (cur["head"], real))
        print("DSH-ANCHOR: DEGRADED"); return DEG

    sup_pairs = {(s["version"], s["head"]) for s in sup}
    sup_versions = {s["version"] for s in sup}
    known = set(anchor.get("known_versions") or []) | {cur["version"]} | sup_versions
    ver_re = re.compile(r"\b\d+\.\d+\.\d+-[A-Za-z0-9.]+\b")  # 任意 semver prerelease（原只匹配 0.1.7-* → 将来版本静默放过）
    head_re = re.compile(r"\b(00102833|46a7f68b|[0-9a-f]{8})\b")
    viol = []
    scanned = 0
    for root, _, files in os.walk(os.path.join(a.repo, a.scan_dir)):
        if "/." in root or "node_modules" in root: continue
        for fn in sorted(files):
            if not fn.endswith(".md"): continue
            p = os.path.join(root, fn); rel = os.path.relpath(p, a.repo); scanned += 1
            try: lines = open(p, encoding="utf-8").read().splitlines()
            except Exception: continue
            exempt = False
            for i, ln in enumerate(lines, 1):
                if ln.strip().startswith("## 引用豁免") or "已作废口径表" in ln or "superseded" in ln: exempt = True
                if ln.strip().startswith("## ") and "引用豁免" not in ln: exempt = False
                if exempt: continue
                for v in ver_re.findall(ln):
                    if v not in known:
                        viol.append("%s:%d 未登记的 DSH 版本串 %s" % (rel, i, v))
                    for sh_ in head_re.findall(ln):
                        if (v, sh_) in sup_pairs and sh_ not in ("46a7f68b",):
                            viol.append("%s:%d 引用了已 superseded 的断面 %s @ %s" % (rel, i, v, sh_))
    if viol:
        for x in viol[:20]: print("  ❌ " + x)
        print("DSH-ANCHOR: VIOLATION(%d)  [扫描 %d 份]" % (len(viol), scanned)); return VIOL
    print("DSH-ANCHOR: OK  [事实源 %s @ %s ｜ 扫描 %d 份]" % (cur["version"], cur["head"], scanned)); return OK

if __name__ == "__main__":
    sys.exit(main())
