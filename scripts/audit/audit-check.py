#!/usr/bin/env python3
"""audit-check.py — 11-point audit enforcement (Codex + Claude Code)

Usage: python scripts/audit/audit-check.py --target "file1.ts,file2.py"  (comma-separated)
       python scripts/audit/audit-check.py --full  (full src/ scan)

11 checks:
  1. File existence        6. Chain integrity
  2. Type safety: as any=0 7. Architecture L1-L5 (Python native)
  3. Error handling        8. Blueprint fitness
  4. Wiring (pure Python)  9. Scope vs dev doc
  5. Shell detection      10. Unbounded structures
                           11. Debug-only log detection

Exit 0 = all pass, 1 = violations found
"""
import argparse, json, os, re, sys
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
PASS = 0; WARN = 0; FAIL = 0; DEGRADED = []

def fail(msg): global FAIL; FAIL += 1; return msg
def warn(msg): global WARN; WARN += 1; return msg
def pass_(msg): global PASS; PASS += 1; return msg

def find_all_source_files(root):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules','.git','dist','__pycache__')]
        for fn in filenames:
            if fn.endswith(('.ts','.tsx')) and '.test.' not in fn:
                files.append(os.path.relpath(os.path.join(dirpath, fn), PROJECT_ROOT).replace('\\','/'))
    return files

@lru_cache(maxsize=None)
def read_file_text(f):
    """缓存文件读取 — wiring O(n²) 时每个文件只读一次（--full 5.5min → 秒级）"""
    path = PROJECT_ROOT / f
    if not path.exists(): return None
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

def grep_in_files(pattern, files):
    hits = []
    for f in files:
        text = read_file_text(f)
        if text is None: continue
        for i, line in enumerate(text.split('\n'), 1):
            if re.search(pattern, line):
                hits.append((f, i, line.strip()))
    return hits

def grep_files_containing(pattern, files):
    found = []
    for f in files:
        text = read_file_text(f)
        if text is None: continue
        if re.search(pattern, text):
            found.append(f)
    return found

def find_callers(name, src_files):
    return grep_files_containing(rf'\b{re.escape(name)}\b', src_files)

def check_files(targets):
    lines = []; missing = 0
    for f in targets:
        ok = (PROJECT_ROOT / f).exists()
        lines.append("  {} {}".format(f, "EXISTS" if ok else "MISSING"))
        if not ok: missing += 1
    if missing:
        fail("")
    else:
        pass_("")
    lines.append("  {} files checked".format(len(targets)))
    return lines

def check_as_any(targets):
    lines = []; count = 0
    for f in targets:
        if not f.endswith(".ts"): continue
        text = read_file_text(f)
        if text is None: continue
        for i, line in enumerate(text.split("\n"), 1):
            if "as any" in line and not line.strip().startswith("//") and not line.strip().startswith("*"):
                lines.append("  {}:{}: as any".format(f, i))
                count += 1
    if count:
        for l in lines: fail(l)
    else:
        pass_("")
    lines.append("  {} as any occurrences".format(count))
    return lines

def check_empty_catch(targets):
    lines = []; count = 0
    OK = ["log.", "logger.", "console.", "degraded", "throw", "/* ignore", "// cleanup", "unlinkSync"]
    for f in targets:
        if not f.endswith(".ts"): continue
        text = read_file_text(f)
        if text is None: continue
        for i, line in enumerate(text.split("\n")):
            if re.search(r"catch\s*[\{(]", line):
                ctx = "\n".join(text.split("\n")[i:i+3])
                if not any(kw in ctx for kw in OK):
                    lines.append("  {}:{}: empty catch".format(f, i+1))
                    count += 1
    if count:
        for l in lines: fail(l)
    else:
        pass_("")
    lines.append("  {} empty catches".format(count))
    return lines

def check_wiring(targets, src_files=None):
    lines = []; unwired = 0; total = 0
    if src_files is None:
        src_files = find_all_source_files(PROJECT_ROOT / 'src')
    for f in targets:
        if not f.endswith(".ts"): continue
        text = read_file_text(f)
        if text is None: continue
        exports = re.findall(r"export (?:async )?(?:function|class|const) (\w+)", text)
        exports += re.findall(r"export (?:interface|type) (\w+)", text)
        for name in set(exports):
            total += 1
            if name.startswith("_"): continue
            try:
                callers = find_callers(name, src_files)
                ext_callers = [c for c in callers if f not in c and '.test.' not in c]
                if not ext_callers:
                    lines.append("  {}: export {} -- WARNING: no callers in src/".format(f, name))
                    unwired += 1
            except Exception as e:
                DEGRADED.append("  WIRING-degraded on {}:{}: {}".format(f, name, e))
    if unwired:
        for l in lines: warn(l)
    else:
        pass_("")
    lines.append("  {} exports, {} unwired".format(total, unwired))
    return lines

SHELL_PATTERNS_TS = [
    (r"new \w+\(\[\]\)", "P1: empty constructor (new X([]))"),
    (r"import type \{[^}]*\}", "P2: type-only import (potential unused)"),
    (r"throw new Error\(['\"]Not implemented['\"]\)", "P0: stub function (Not implemented)"),
    (r"return \{\};?\s*$", "P2: stub function (empty return)"),
]
SHELL_PATTERNS_PY = [
    (r"raise NotImplementedError", "P0: stub function (NotImplementedError)"),
    (r"def \w+\([^)]*\):\s*pass\s*$", "P0: stub function (pass)"),
]

def check_shells(targets):
    lines = []; count = 0
    for f in targets:
        text = read_file_text(f)
        if text is None: continue
        patterns = SHELL_PATTERNS_PY if f.endswith(".py") else SHELL_PATTERNS_TS
        for pat, desc in patterns:
            for m in re.finditer(pat, text, re.MULTILINE):
                lineno = text[:m.start()].count("\n") + 1
                lines.append("  {}:{}: {}: {}".format(f, lineno, desc, m.group()[:60]))
                count += 1
    if count:
        for l in lines: fail(l)
    else:
        pass_("")
    lines.append("  {} shell/smell patterns".format(count))
    return lines

def check_chain(targets):
    lines = []; broken = 0; total = 0
    for f in targets:
        path = PROJECT_ROOT / f
        text = read_file_text(f)
        if text is None: continue
        imports = re.findall(r"""(?:from|import)\s+['\"]([^'\"]+)['\"]""", text)
        for imp in imports:
            if not imp.startswith("."): continue
            total += 1
            try:
                resolved = (path.parent / imp).resolve()
                if not resolved.exists():
                    for ext in [".ts", ".py", "/index.ts", "/index.py"]:
                        if resolved.with_suffix(ext).exists() or (resolved / "index.ts").exists():
                            break
                    else:
                        lines.append("  {}: import '{}' -- NOT FOUND".format(f, imp))
                        broken += 1
            except Exception:
                lines.append("  {}: import '{}' -- RESOLVE ERROR".format(f, imp))
                broken += 1
    if broken:
        for l in lines: fail(l)
    else:
        pass_("")
    lines.append("  {} local imports, {} unresolved".format(total, broken))
    return lines

LAYER_MAP = {
    'src/routes': 1, 'src/l1': 1, 'src/l1-interaction': 1, 'src/tui': 1, 'src/mcp': 1,
    'src/agent': 2, 'src/loops': 2, 'src/orchestrator': 2, 'src/l2': 2, 'src/l2-interfaces': 2,
    'src/l3': 3, 'src/sentinel': 3, 'src/expert-platform': 3, 'src/tools': 3, 'src/llm': 3,
    'src/l4': 4, 'src/evidence': 4, 'src/ingest': 4,
    'src/store': 5, 'src/cron': 5, 'src/l5': 5,
}
WHITELIST = {'src/adapters/', 'src/init/engine-context.ts', 'src/l4/graph-bridge.ts'}

def get_layer(filepath):
    for prefix, layer in LAYER_MAP.items():
        if filepath.startswith(prefix.replace('\\','/') + '/'):
            return layer
    return 0

LAYER_CHECKS = {
    1: {3: 'L1->L3', 4: 'L1->L4', 5: 'L1->L5'},
    2: {4: 'L2->L4', 5: 'L2->L5'},
    3: {5: 'L3->L5'},
}

# D290: import 目标 resolve 后不带扩展名（'../l4/graph-bridge' → 'src/l4/graph-bridge'），
# WHITELIST 条目带 .ts 导致永不匹配。匹配时去掉双方扩展名。
def is_whitelisted(imp):
    imp_norm = imp.rstrip('.ts')
    for w in WHITELIST:
        w_norm = w.rstrip('.ts')
        if w_norm in imp_norm: return True
    return False

# D290: 动态 import 支持 — import('../l4/...') 和 await import(...) 也被检查
IMPORT_RE = re.compile(r"""(?:from|import)\s*\(?\s*['\"](\.\.?/[^'\"]+)['\"]""")

def check_architecture(targets=None):
    lines = []; violations = 0
    # D290: 尊重 targets 参数 — 增量模式只检查目标文件的出边，--full 才全仓扫描
    if targets:
        files = [t for t in targets if t.startswith('src/')]
    else:
        files = find_all_source_files(PROJECT_ROOT / 'src')
    for f in files:
        text = read_file_text(f)
        if text is None: continue
        from_layer = get_layer(f)
        if from_layer == 0: continue
        allowed = LAYER_CHECKS.get(from_layer, {})
        for m in IMPORT_RE.finditer(text):
            imp = m.group(1)
            try:
                resolved = (PROJECT_ROOT / f).parent / imp
                resolved = resolved.resolve()
                rel = str(resolved.relative_to(PROJECT_ROOT)).replace('\\','/')
                if '/node_modules/' in rel: continue
            except Exception:
                continue
            to_layer = get_layer(rel)
            if to_layer == 0: continue
            if to_layer in allowed and not is_whitelisted(rel):
                lineno = text[:m.start()].count('\n') + 1
                lines.append("  {}:{}: {} VIOLATION (imports {})".format(f, lineno, allowed[to_layer], rel))
                violations += 1
    if violations:
        for l in lines: fail(l)
    else:
        pass_("")
    lines.append("  {} architecture violations".format(violations))
    return lines

def check_debug_only(targets=None):
    lines = []; count = 0
    if targets is None:
        targets = find_all_source_files(PROJECT_ROOT / 'src')
    for f in targets:
        if not f.endswith('.ts'): continue
        text = read_file_text(f)
        if text is None: continue
        for i, line in enumerate(text.split('\n'), 1):
            if re.search(r'log\.debug\(', line) and 'log.warn' not in line and 'log.error' not in line:
                ctx = '\n'.join(text.split('\n')[max(0,i-1):i+2])
                if 'log.warn' not in ctx and 'log.error' not in ctx:
                    lines.append("  {}:{}: log.debug without warn/error".format(f, i))
                    count += 1
    if count:
        for l in lines: warn(l)
    else:
        pass_("")
    lines.append("  {} debug-only log calls (no warn/error)".format(count))
    return lines

def check_blueprint(targets):
    lines = []; orphan = 0
    bp_path = PROJECT_ROOT / ".codex" / "audit" / "architecture-blueprint.json"
    if not bp_path.exists():
        lines.append("  SKIP: architecture-blueprint.json not found")
        return lines
    try:
        bp = json.loads(bp_path.read_text(encoding="utf-8"))
    except Exception as e:
        lines.append("  SKIP: blueprint parse error: {}".format(e))
        return lines
    domains = bp.get("domains", {})
    allow = bp.get("allow_anywhere", [])
    for f in targets:
        found = False
        for dom_name, dom in domains.items():
            for pattern in dom.get("files", []):
                if f.startswith(pattern) or pattern in f or f == pattern:
                    found = True; break
            if found: break
        if not found:
            for pattern in allow:
                if f.startswith(pattern): found = True; break
        if not found:
            lines.append("  {}: NO BLUEPRINT MATCH".format(f))
            orphan += 1
    if orphan:
        for l in lines: warn(l)
    else:
        pass_("")
    lines.append("  {} files, {} without blueprint entry".format(len(targets), orphan))
    return lines

SCOPE_REDUCTION_PATTERNS = [
    (r"只处理\s*\w+\s*类型", "P1: scope reduction -- only handles one subtype"),
    (r"只处理[^。\n]*", "P1: scope reduction -- only handles specific case"),
    (r"暂由未来版本实现", "P1: scope reduction -- deferred to future"),
    (r"其余类型暂不处理", "P1: scope reduction -- remaining types unhandled"),
    (r"其余\s*\w+\s*暂由", "P1: scope reduction -- remaining deferred"),
    (r"其余[^。\n]*暂由", "P1: scope reduction -- remaining deferred"),
    (r"//\s*TODO.*support\s+\w+\s+type", "P2: scope gap -- future support planned"),
]

def check_scope(targets):
    lines = []; count = 0
    for f in targets:
        text = read_file_text(f)
        if text is None: continue
        for pat, desc in SCOPE_REDUCTION_PATTERNS:
            for m in re.finditer(pat, text):
                lineno = text[:m.start()].count("\n") + 1
                lines.append("  {}:{}: {}: {}".format(f, lineno, desc, m.group()[:80]))
                count += 1
    if count:
        for l in lines: warn(l)
    else:
        pass_("")
    lines.append("  {} scope reduction patterns".format(count))
    return lines

UNBOUNDED_PATTERNS = [
    (r"while\s*\(\s*true\s*\)", "P0: unbounded loop (while true)"),
    (r"while\s*\(\s*1\s*\)", "P0: unbounded loop (while 1)"),
    (r"setTimeout\(\s*f\s*,\s*0\s*\)", "P2: setTimeout(f, 0) spin"),
    (r"\.slice\(0,\s*999999\)", "P2: unbounded slice()"),
]

def check_unbounded(targets):
    lines = []; count = 0
    for f in targets:
        text = read_file_text(f)
        if text is None: continue
        for pat, desc in UNBOUNDED_PATTERNS:
            for m in re.finditer(pat, text):
                lineno = text[:m.start()].count("\n") + 1
                lines.append("  {}:{}: {}: {}".format(f, lineno, desc, m.group()[:60]))
                count += 1
    if count:
        for l in lines: fail(l)
    else:
        pass_("")
    lines.append("  {} unbounded structures".format(count))
    return lines

def run_all(targets, full=False):
    report = []
    report.append("=== Synova Audit ({}) ===\n".format("full" if full else "incremental"))
    targets = [t.replace('\\','/') for t in targets]
    targets = [t for t in targets if (PROJECT_ROOT / t).exists()]
    if not targets:
        return ["ERROR: No valid target files found"] + (["HINT: use --full for full repo scan"] if not full else [])

    report.append("[1/11] File existence")
    report += check_files(targets)
    report.append("[2/11] Type safety (as any)")
    report += check_as_any(targets)
    report.append("[3/11] Error handling (empty catch)")
    report += check_empty_catch(targets)
    report.append("[4/11] Wiring (caller detection)")
    src_files = find_all_source_files(PROJECT_ROOT / 'src')
    report += check_wiring(targets, src_files)
    report.append("[5/11] Shell/smell detection")
    report += check_shells(targets)
    report.append("[6/11] Chain integrity (local imports)")
    report += check_chain(targets)
    report.append("[7/11] Architecture L1-L5 (Python native)")
    report += check_architecture(targets)
    report.append("[8/11] Debug-only log detection")
    report += check_debug_only(src_files if full else targets)
    report.append("[9/11] Blueprint fitness")
    report += check_blueprint(targets)
    report.append("[10/11] Scope reduction vs dev doc")
    report += check_scope(targets)
    report.append("[11/11] Unbounded structures")
    report += check_unbounded(targets)

    summary = "\n--\nPASS:{} WARN:{} FAIL:{}".format(PASS, WARN, FAIL)
    if DEGRADED:
        summary += "\nDEGRADED: {} checks had issues -- see above".format(len(DEGRADED))
    report.append(summary)
    return report

def main():
    parser = argparse.ArgumentParser(description="audit-check.py -- 11-point audit enforcement")
    parser.add_argument("--target", default="", help="comma-separated file list")
    parser.add_argument("--targets", default="", help="comma-separated file list (alt flag)")
    parser.add_argument("audit_target", nargs="?", help="individual file path")
    parser.add_argument("--full", action="store_true", help="full repo scan (all src/**/*.ts)")
    parser.add_argument("--out", default="", help="output path")
    args = parser.parse_args()

    targets = []
    if args.full:
        targets = find_all_source_files(PROJECT_ROOT / 'src')
    else:
        targets = [f.strip() for f in args.target.split(",") if f.strip()]
        if args.targets:
            targets += [f.strip() for f in args.targets.split(",") if f.strip()]
        if args.audit_target:
            targets.append(args.audit_target)

    if not targets:
        print("audit-check.py: no targets. Use --target files or --full.", file=sys.stderr)
        sys.exit(1)

    report = run_all(targets, full=args.full)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out_path = args.out
    use_file = out_path and out_path != 'NUL'
    if use_file:
        os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
        f_out = open(out_path, 'w', encoding='utf-8')
    else:
        f_out = sys.stdout
    out_header = "=== Synova Audit Report ({} | {}) ===\n".format(ts, "full" if args.full else "incremental")
    f_out.write(out_header)
    for line in report:
        f_out.write(line + "\n")
    if use_file:
        f_out.close()
    print("Audit complete: {} PASS, {} WARN, {} FAIL".format(PASS, WARN, FAIL))
    if FAIL > 0 and not args.full:
        print("HINT: violations found. Run 'python scripts/audit/audit-check.py --full' to check all files.")
    sys.exit(1 if FAIL > 0 else 0)

if __name__ == "__main__":
    main()
