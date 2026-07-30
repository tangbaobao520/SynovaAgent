#!/usr/bin/env python3
"""audit-check.py — 10-point audit enforcement (Codex + Claude Code)

Usage: python scripts/audit/audit-check.py --target "file1.ts file2.py"

10 checks:
  1. File existence        6. Chain integrity
  2. Type safety: as any=0 7. Architecture L1-L5
  3. Error handling        8. Blueprint fitness
  4. Wiring                9. Scope vs dev doc
  5. Shell detection      10. Unbounded structures

Exit 0 = all pass, 1 = violations found
"""
import argparse, json, os, re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
PASS = 0; WARN = 0; FAIL = 0

def fail(msg): global FAIL; FAIL += 1; return msg
def warn(msg): global WARN; WARN += 1; return msg

def check_files(targets):
    lines = []
    for f in targets:
        ok = (PROJECT_ROOT / f).exists()
        lines.append("  {} {}".format(f, "EXISTS" if ok else "MISSING"))
        if not ok: fail("")
    lines.append("  {} files checked".format(len(targets)))
    return lines

def check_as_any(targets):
    lines = []; count = 0
    for f in targets:
        if not f.endswith(".ts"): continue
        path = PROJECT_ROOT / f
        if not path.exists(): continue
        for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").split("\n"), 1):
            if "as any" in line and not line.strip().startswith("//") and not line.strip().startswith("*"):
                lines.append("  {}:{}: as any".format(f, i))
                count += 1
    if count:
        for l in lines: fail(l)
    lines.append("  {} as any occurrences".format(count))
    return lines

def check_empty_catch(targets):
    lines = []; count = 0
    OK = ["log.", "logger.", "console.", "degraded", "throw", "/* ignore", "// cleanup", "unlinkSync"]
    for f in targets:
        if not f.endswith(".ts"): continue
        path = PROJECT_ROOT / f
        if not path.exists(): continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for i, line in enumerate(text.split("\n")):
            if re.search(r"catch\s*[\{(]", line):
                ctx = "\n".join(text.split("\n")[i:i+3])
                if not any(kw in ctx for kw in OK):
                    lines.append("  {}:{}: empty catch".format(f, i+1))
                    count += 1
    if count:
        for l in lines: fail(l)
    lines.append("  {} empty catches".format(count))
    return lines

def check_wiring(targets):
    lines = []; unwired = 0; total = 0
    for f in targets:
        if not f.endswith(".ts"): continue
        path = PROJECT_ROOT / f
        if not path.exists(): continue
        text = path.read_text(encoding="utf-8", errors="replace")
        exports = re.findall(r"export (?:async )?(?:function|class|const) (\w+)", text)
        for name in exports:
            total += 1
            if name.startswith("_"): continue
            try:
                r = subprocess.run(
                    ["rg", "-l", r"\b" + name + r"\b", str(PROJECT_ROOT / "src"), "-g", "*.ts"],
                    capture_output=True, text=True, timeout=5
                )
                callers = [p.strip() for p in r.stdout.strip().split("\n") if p.strip()]
                ext_callers = [c for c in callers if f not in c and ".test." not in c]
                if not ext_callers:
                    lines.append("  {}: export {} -- WARNING: no callers".format(f, name))
                    unwired += 1
            except Exception:
                pass
    if unwired:
        for l in lines: warn(l)
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
        path = PROJECT_ROOT / f
        if not path.exists(): continue
        text = path.read_text(encoding="utf-8", errors="replace")
        patterns = SHELL_PATTERNS_PY if f.endswith(".py") else SHELL_PATTERNS_TS
        for pat, desc in patterns:
            for m in re.finditer(pat, text, re.MULTILINE):
                lineno = text[:m.start()].count("\n") + 1
                lines.append("  {}:{}: {}: {}".format(f, lineno, desc, m.group()[:60]))
                count += 1
    if count:
        for l in lines: fail(l)
    lines.append("  {} shell/smell patterns".format(count))
    return lines

def check_chain(targets):
    lines = []; broken = 0; total = 0
    for f in targets:
        path = PROJECT_ROOT / f
        if not path.exists(): continue
        text = path.read_text(encoding="utf-8", errors="replace")
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
    lines.append("  {} local imports, {} unresolved".format(total, broken))
    return lines

def check_architecture(targets):
    lines = []
    try:
        r = subprocess.run(
            ["bash", str(PROJECT_ROOT / "scripts/check-architecture.sh")],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode == 0:
            lines.append("  check-architecture.sh exit 0 (OK)")
        else:
            lines.append("  check-architecture.sh exit {} (VIOLATIONS)".format(r.returncode))
            fail("")
    except Exception:
        lines.append("  SKIP -- bash unavailable (manual verification needed)")
        warn("")
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
        path = PROJECT_ROOT / f
        if not path.exists(): continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for pat, desc in SCOPE_REDUCTION_PATTERNS:
            for m in re.finditer(pat, text):
                lineno = text[:m.start()].count("\n") + 1
                lines.append("  {}:{}: {}: {}".format(f, lineno, desc, m.group()[:100]))
                count += 1
    if count:
        for l in lines: warn(l)
    lines.append("  {} scope-reduction comments found".format(count))
    return lines

UNBOUNDED_STRUCTURE_PATTERNS = [
    (r"new Map\(", "new Map"),
    (r"new Set\(", "new Set"),
    (r"private \w+\s*:\s*\w+\[\]\s*=\s*\[\]", "class array field"),
]

def check_memory(targets):
    """Detect unbounded data structures: Map/Set/Array that grow but never shrink."""
    lines = []; count = 0
    for f in targets:
        if not f.endswith(".ts"): continue
        path = PROJECT_ROOT / f
        if not path.exists(): continue
        text = path.read_text(encoding="utf-8", errors="replace")
        # Find all Map/Set instances and track their variable names
        for m in re.finditer(r"new Map\s*\(", text):
            ctx = text[m.start()-300:m.end()+300]
            var_match = re.search(r"(?:private|public|protected|const|let|var)\s+(\w+)", ctx)
            if not var_match:
                # Try assignment pattern: this.X = new Map()
                var_match = re.search(r"this\.(\w+)\s*=\s*new Map\s*\(", ctx)
            if not var_match:
                # Try bare: const X = new Map()
                var_match = re.search(r"(\w+)\s*=\s*new Map\s*\(", ctx)
            if var_match:
                var_name = var_match.group(1)
                grow_re = re.compile(var_name + r"\.(?:set|push|add)\(")
                clean_re = re.compile(var_name + r"\.(?:clear|delete|splice|shift|pop)\(")
                has_grow = bool(grow_re.search(text))
                has_cleanup = bool(clean_re.search(text))
                has_limit = False
                if has_grow and not has_cleanup and not has_limit:
                    lineno = text[:m.start()].count("\n") + 1
                    line = "  {}:{}: P2: unbounded Map '{}' -- .set but no .clear/.delete/size-limit"
                    lines.append(line.format(f, lineno, var_name))
                    count += 1
    if count:
        for l in lines: warn(l)
    lines.append("  {} unbounded structures found".format(count))
    return lines

def main():
    global PASS
    parser = argparse.ArgumentParser(description="10-point audit enforcement")
    parser.add_argument("--target", required=True, help="space-separated file list")
    args = parser.parse_args()
    targets = [t.strip() for t in args.target.split() if t.strip()]
    if not targets:
        print("Usage: audit-check.py --target 'file1.ts file2.py'")
        sys.exit(1)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report = [
        "=" * 60,
        "  AUDIT REPORT",
        "  Target: {}".format(args.target),
        "  Time:   {}".format(ts),
        "=" * 60, "",
    ]

    checks = [
        ("[1] FILES",       check_files(targets)),
        ("[2] TYPES",       check_as_any(targets)),
        ("[3] ERRORS",      check_empty_catch(targets)),
        ("[4] WIRING",      check_wiring(targets)),
        ("[5] SHELLS",      check_shells(targets)),
        ("[6] CHAIN",       check_chain(targets)),
        ("[7] ARCH",        check_architecture(targets)),
        ("[8] FIT",         check_blueprint(targets)),
        ("[9] SCOPE",       check_scope(targets)),
        ("[10] MEMORY",     check_memory(targets)),
    ]

    for title, result in checks:
        report.append(title)
        report.extend(result)
        report.append("")

    if FAIL > 0:
        verdict = "FAIL -- {} violations, {} warnings".format(FAIL, WARN)
    elif WARN > 0:
        verdict = "PASS with warnings -- {} warnings".format(WARN)
    else:
        verdict = "PASS -- all checks clean"

    report.append("VERDICT: {}".format(verdict))
    output = "\n".join(report)
    print(output)

    audit_dir = PROJECT_ROOT / ".codex" / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    try:
        (audit_dir / "audit-report.txt").write_text(output, encoding="utf-8")
    except Exception:
        pass

    sys.exit(0 if FAIL == 0 else 1)

if __name__ == "__main__":
    main()
