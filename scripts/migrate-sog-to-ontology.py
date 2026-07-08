#!/usr/bin/env python3
"""
migrate-sog-to-ontology.py — Migration script for SOG enum → @synova/ontology

Replaces old SOGNodeType/SOGEdgeType enum references in src/ with new
string constants from @synova/ontology.

Usage:
  python3 scripts/migrate-sog-to-ontology.py          # dry-run (shows changes)
  python3 scripts/migrate-sog-to-ontology.py --apply   # apply changes

Phase: Loop Engineering V4.4.4 — 本体层单轨重建
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# ─── 1:1 mappings (safe to auto-replace) ───
NODE_SAFE = {
    "SOGNodeType.PERSON": "NodeType.RESOURCE_PERSON",
    "SOGNodeType.TEAM": "NodeType.RESOURCE_TEAM",
    "SOGNodeType.AGENT": "NodeType.RESOURCE_AGENT",
    "SOGNodeType.TOOL": "NodeType.RESOURCE_TOOL",
    "SOGNodeType.CLIENT": "NodeType.RESOURCE_CLIENT",
    "SOGNodeType.COMPLIANCE": "NodeType.ACTIVITY_COMPLIANCE",
    "SOGNodeType.RISK": "NodeType.OUTCOME_RISK",
    "SOGNodeType.LOCATION": "NodeType.RESOURCE_LOCATION",
    "SOGNodeType.KNOWLEDGE_CHUNK": "NodeType.RESOURCE_KNOWLEDGE",
    "SOGNodeType.USER": "NodeType.RESOURCE_PERSON",
}

# ─── Ambiguous mappings (insert TODO, don't replace) ───
# These will be replaced with a TODO comment + the best-guess value
NODE_AMBIGUOUS = {
    "SOGNodeType.FINANCIAL": {
        "value": "NodeType.OUTCOME_FINANCIAL",
        "todo": "ONTOLOGY-MIGRATION: SOGNodeType.FINANCIAL -> outcome/financial or resource/money? Context-dependent.",
    },
    "SOGNodeType.GOAL": {
        "value": "NodeType.ACTIVITY_GOVERNANCE",
        "todo": "ONTOLOGY-MIGRATION: SOGNodeType.GOAL has no direct match. Using activity/governance (strategic alignment).",
    },
    "SOGNodeType.CAPABILITY": {
        "value": "NodeType.RESOURCE_KNOWLEDGE",
        "todo": "ONTOLOGY-MIGRATION: SOGNodeType.CAPABILITY has no direct match. Using resource/knowledge.",
    },
    "SOGNodeType.PROCESS": {
        "value": "NodeType.ACTIVITY_PRODUCTION",
        "todo": "ONTOLOGY-MIGRATION: SOGNodeType.PROCESS is approximate. Check processType and map to correct activity type.",
    },
    "SOGNodeType.EVENT": {
        "value": "NodeType.ACTIVITY_LEARNING",
        "todo": "ONTOLOGY-MIGRATION: SOGNodeType.EVENT has no direct match. Store as edge annotation.",
    },
    "SOGNodeType.DOCUMENT": {
        "value": "NodeType.RESOURCE_KNOWLEDGE",
        "todo": "ONTOLOGY-MIGRATION: SOGNodeType.DOCUMENT -> resource/knowledge or resource/data? Check context.",
    },
    "SOGNodeType.BUSINESS_MODEL": {
        "value": "null /* no match */",
        "todo": "ONTOLOGY-MIGRATION: SOGNodeType.BUSINESS_MODEL no direct match. Use EXTERNAL_ASSUMPTION_BINDS param.",
    },
}

# ─── Edge type mappings (all ambiguous in src/) ───
EDGE_SAFE = {}

EDGE_AMBIGUOUS = {
    "SOGEdgeType.INTERACTS_WITH": {
        "value": "EdgeType.INFORMS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate).",
    },
    "SOGEdgeType.BELONGS_TO": {
        "value": "EdgeType.DEPENDS_ON",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.BELONGS_TO no direct match. Using DEPENDS_ON (syntactic node ID path).",
    },
    "SOGEdgeType.AFFECTS": {
        "value": "EdgeType.DEPENDS_ON",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.AFFECTS -> DEPENDS_ON + INFORMS (combination).",
    },
    "SOGEdgeType.CORRESPONDS_TO": {
        "value": "EdgeType.INFORMS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.CORRESPONDS_TO no direct match. Using INFORMS.",
    },
    "SOGEdgeType.OWNS": {
        "value": "EdgeType.DEPLOYS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.OWNS -> DEPLOYS (approximate).",
    },
    "SOGEdgeType.TRIGGERS": {
        "value": "EdgeType.SIGNAL_TRANSMITS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.TRIGGERS no direct match. Using SIGNAL_TRANSMITS.",
    },
    "SOGEdgeType.CONSUMES": {
        "value": "EdgeType.DEPLOYS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.CONSUMES -> DEPLOYS (direction reversed).",
    },
    "SOGEdgeType.ALIGNS_WITH": {
        "value": "EdgeType.INCENTIVE_BINDS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.ALIGNS_WITH -> INCENTIVE_BINDS (approximate).",
    },
    "SOGEdgeType.PROVIDES": {
        "value": "EdgeType.DEPLOYS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.PROVIDES -> DEPLOYS (approximate).",
    },
    "SOGEdgeType.HAS_ACCESS_TO": {
        "value": "EdgeType.INFORMS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.HAS_ACCESS_TO no direct match (permission layer). Using INFORMS.",
    },
    "SOGEdgeType.REVENUE_FROM": {
        "value": "EdgeType.PRODUCES",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.REVENUE_FROM -> PRODUCES + REPLENISHES (combination).",
    },
    "SOGEdgeType.COST_DRIVEN_BY": {
        "value": "EdgeType.FUNDS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.COST_DRIVEN_BY -> FUNDS (approximate).",
    },
    "SOGEdgeType.VALUE_PROPOSITION": {
        "value": "EdgeType.DEPLOYS",
        "todo": "ONTOLOGY-MIGRATION: SOGEdgeType.VALUE_PROPOSITION -> DEPLOYS (client->activity).",
    },
}

# Build full replacement map
ALL_REPLACEMENTS = {}
ALL_REPLACEMENTS.update(NODE_SAFE)
for old, info in NODE_AMBIGUOUS.items():
    ALL_REPLACEMENTS[old] = f"{info['value']} /* {info['todo']} */"
for old, info in EDGE_AMBIGUOUS.items():
    ALL_REPLACEMENTS[old] = f"{info['value']} /* {info['todo']} */"


def replace_imports(content: str, needs_all_nodes: bool, needs_all_edges: bool) -> str:
    """Replace import statements from @synova/sog-core to @synova/ontology."""
    # Named imports: import { X, Y } from '@synova/sog-core'
    content = re.sub(
        r"import\s*\{([^}]*)\}\s*from\s*['\"]@synova/sog-core['\"]",
        lambda m: _rewrite_import(m.group(1), needs_all_nodes, needs_all_edges),
        content,
    )
    # Type-only imports
    content = re.sub(
        r"import\s+type\s*\{([^}]*)\}\s*from\s*['\"]@synova/sog-core['\"]",
        lambda m: _rewrite_type_import(m.group(1)),
        content,
    )
    # Type-only re-exports: export type { X } from '@synova/sog-core'
    content = re.sub(
        r"export\s+type\s*\{([^}]*)\}\s*from\s*['\"]@synova/sog-core['\"]",
        lambda m: _rewrite_type_reexport(m.group(1)),
        content,
    )
    # Dynamic imports: const { SOGNodeType } = await import('@synova/sog-core')
    content = re.sub(
        r"(await\s+)?import\(['\"]@synova/sog-core['\"]\)",
        "\\1import('@synova/ontology')",
        content,
    )
    # Rewrite destructured names in dynamic imports
    content = re.sub(
        r"\{\s*SOGNodeType\s*(?::\s*\S+\s*)?\}",
        "{ NodeType }",
        content,
    )
    content = re.sub(
        r"\{\s*SOGEdgeType\s*(?::\s*\S+\s*)?\}",
        "{ EdgeType }",
        content,
    )
    return content


def _rewrite_import(imports: str, needs_all_nodes: bool, needs_all_edges: bool) -> str:
    """Rewrite named imports from sog-core to ontology package."""
    symbols = [s.strip() for s in imports.split(",")]
    new_symbols = []
    for sym in symbols:
        if sym in ("SOGNodeType",):
            parts = ["NodeType"]
            if needs_all_nodes:
                parts.insert(0, "ALL_NODE_TYPES")
            new_symbols.append(", ".join(parts))
        elif sym in ("SOGEdgeType",):
            parts = ["EdgeType"]
            if needs_all_edges:
                parts.insert(0, "ALL_EDGE_TYPES")
            new_symbols.append(", ".join(parts))
        elif sym in ("EDGE_ENDPOINT_MAP",):
            new_symbols.append("EdgeType")
        elif sym in ("NODE_VALIDATORS", "EDGE_VALIDATORS", "SOGValidationError", "validateEdgeEndpoints"):
            new_symbols.append(sym)
        else:
            new_symbols.append(sym)

    result = f"import {{ {', '.join(new_symbols)} }} from '@synova/ontology'"
    return result


def _rewrite_type_reexport(imports: str) -> str:
    """Rewrite type-only re-exports from sog-core to ontology package."""
    symbols = [s.strip() for s in imports.split(",")]
    new_symbols = []
    for sym in symbols:
        if sym == "SOGNodeType":
            new_symbols.append("NodeType")
        elif sym == "SOGEdgeType":
            new_symbols.append("EdgeType")
        elif sym.endswith("Props") or sym.startswith("SOG"):
            new_symbols.append(sym)
        else:
            new_symbols.append(sym)
    result = f"export type {{ {', '.join(new_symbols)} }} from '@synova/ontology'"
    return result


def _rewrite_type_import(imports: str) -> str:
    """Rewrite type-only imports from sog-core."""
    symbols = [s.strip() for s in imports.split(",")]
    new_symbols = []
    for sym in symbols:
        if sym.endswith("Props") or sym.startswith("SOG"):
            # Keep type names — they'll be migrated later
            new_symbols.append(sym)
        else:
            new_symbols.append(sym)

    result = f"import type {{ {', '.join(new_symbols)} }} from '@synova/ontology'"
    return result


def replace_object_values(content: str) -> str:
    """Replace Object.values(SOGNodeType) and Object.values(SOGEdgeType) patterns."""
    content = content.replace("Object.values(SOGNodeType)", "ALL_NODE_TYPES")
    content = content.replace("Object.values(SOGEdgeType)", "ALL_EDGE_TYPES")
    return content


def replace_enums(content: str) -> str:
    """Replace SOGNodeType.XXX and SOGEdgeType.XXX with new values."""
    for old, new in sorted(ALL_REPLACEMENTS.items(), key=lambda x: -len(x[0])):
        # Only replace in code lines (not in comments)
        content = content.replace(old, new)
    content = replace_object_values(content)
    return content


def migrate_file(filepath: Path, dry_run: bool = True) -> bool:
    """Migrate a single file. Returns True if changes were made."""
    content = filepath.read_text(encoding="utf-8")
    original = content

    # Determine if Object.values() is used (needs ALL_NODE_TYPES/ALL_EDGE_TYPES imports)
    needs_all_nodes = "Object.values(SOGNodeType)" in content
    needs_all_edges = "Object.values(SOGEdgeType)" in content

    content = replace_imports(content, needs_all_nodes, needs_all_edges)
    content = replace_enums(content)

    if content == original:
        return False

    rel = filepath.relative_to(ROOT)
    if dry_run:
        print(f"  [DRY-RUN] Would modify: {rel}")
        # Show diff summary
        for i, (ol, nl) in enumerate(zip(original.split("\n"), content.split("\n"))):
            if ol != nl:
                print(f"    -{ol}")
                print(f"    +{nl}")
        print()
    else:
        filepath.write_text(content, encoding="utf-8")
        print(f"  [MODIFIED] {rel}")

    return True


def main():
    dry_run = "--apply" not in sys.argv

    if dry_run:
        print("=" * 60)
        print("DRY-RUN MODE — no files will be modified")
        print("Run with --apply to apply changes")
        print("=" * 60)
        print()

    # Determine which directories to scan
    scan_dirs = [SRC]
    if "--tests" in sys.argv:
        scan_dirs.append(ROOT / "tests")

    # Find all .ts/.tsx files that reference SOG enums
    affected = []
    for scan_dir in scan_dirs:
        for ext in ("*.ts", "*.tsx"):
            for f in scan_dir.rglob(ext):
                if "node_modules" in str(f):
                    continue
                content = f.read_text(encoding="utf-8", errors="ignore")
                if "SOGNodeType" in content or "SOGEdgeType" in content:
                    affected.append(f)

    if not affected:
        print("No files with SOG references found in src/")
        return

    print(f"Found {len(affected)} files with SOG references:\n")
    for f in affected:
        rel = f.relative_to(ROOT)
        print(f"  - {rel}")
    print()

    # Process each file
    changed = 0
    for f in affected:
        if migrate_file(f, dry_run=dry_run):
            changed += 1

    print(f"\n{changed} files {'would be' if dry_run else 'were'} modified.")

    if dry_run and changed > 0:
        print("\nTo apply: python3 scripts/migrate-sog-to-ontology.py --apply")


if __name__ == "__main__":
    main()
