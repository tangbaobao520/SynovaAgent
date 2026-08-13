#!/usr/bin/env python3
"""
migrate-ontology-manifests.py — Fix sentinel manifests and edge JSON files

Phase 5 of ontology unification:
1. Add "id" field to all sentinel manifests (without id)
2. Fix consumed_by_sentinels in edge JSON files
3. Update manifest.json node count

Usage: python3 scripts/migrate-ontology-manifests.py --apply
       python3 scripts/migrate-ontology-manifests.py  (dry-run)
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def fix_sentinel_manifests(dry_run: bool = True) -> int:
    """Add id field to sentinel manifest.json files."""
    changed = 0
    manifest_dir = ROOT / "extensions" / "sentinels"

    for manifest_path in sorted(manifest_dir.rglob("manifest.json")):
        # Skip manifests that already have id
        content = manifest_path.read_text(encoding="utf-8")
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            print(f"  [SKIP] {manifest_path.relative_to(ROOT)} — JSON error: {e}")
            continue

        if "id" in data:
            continue

        # Generate id from name: sentinel-{name}
        name = data.get("name", "")
        if not name:
            print(f"  [SKIP] {manifest_path.relative_to(ROOT)} — no name field")
            continue

        sentinel_id = f"sentinel-{name}"
        data["id"] = sentinel_id

        # Write back preserving key order (id after name)
        new_content = json.dumps(data, indent=2, ensure_ascii=False)

        if content != new_content:
            if dry_run:
                print(f"  [DRY-RUN] Would add id: {sentinel_id} to {manifest_path.relative_to(ROOT)}")
            else:
                manifest_path.write_text(new_content + "\n", encoding="utf-8")
                print(f"  [MODIFIED] {manifest_path.relative_to(ROOT)} — added id: {sentinel_id}")
            changed += 1

    return changed


def check_edge_consumed_by(dry_run: bool = True) -> int:
    """Check edge JSON consumed_by_sentinels and fix if possible."""
    changed = 0
    edge_dir = ROOT / "extensions" / "ontology" / "edge-types"

    if not edge_dir.exists():
        print("  edge-types directory not found")
        return 0

    # Get all real sentinel IDs
    real_ids = set()
    manifest_dir = ROOT / "extensions" / "sentinels"
    for manifest_path in manifest_dir.rglob("manifest.json"):
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            if "id" in data:
                real_ids.add(data["id"])
            elif "name" in data:
                real_ids.add(f"sentinel-{data['name']}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass

    # Check each edge JSON
    for edge_file in sorted(edge_dir.glob("*.json")):
        try:
            content = edge_file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            try:
                content = edge_file.read_text(encoding="utf-8", errors="replace")
            except Exception:
                print(f"  [SKIP] {edge_file.relative_to(ROOT)} — encoding error")
                continue

        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            print(f"  [SKIP] {edge_file.relative_to(ROOT)} — JSON error: {e}")
            continue

        consumed = data.get("consumed_by_sentinels", [])
        if not consumed:
            continue

        # Check for ghost IDs (not matching sentinel-{name} pattern)
        ghost_ids = [c for c in consumed if c not in real_ids]
        if ghost_ids:
            print(f"  [GHOST] {edge_file.relative_to(ROOT)}: {ghost_ids}")

    return changed


def update_manifest_json(dry_run: bool = True) -> int:
    """Update extensions/ontology/manifest.json node count."""
    manifest_path = ROOT / "extensions" / "ontology" / "manifest.json"
    if not manifest_path.exists():
        print("  ontology manifest.json not found")
        return 0

    content = manifest_path.read_text(encoding="utf-8")
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"  [SKIP] manifest.json — JSON error: {e}")
        return 0

    # Count actual node types
    node_count = 0
    for subdir in ["activity", "outcome", "resource"]:
        d = manifest_path.parent / subdir
        if d.exists():
            node_count += len(list(d.glob("*.json")))

    # Count actual edge types
    edge_count = len(list((manifest_path.parent / "edge-types").glob("*.json")))

    old_nodes = data.get("nodeTypes", 0)
    old_edges = data.get("edgeTypes", 0)

    data["nodeTypes"] = node_count
    data["edgeTypes"] = edge_count

    new_content = json.dumps(data, indent=2, ensure_ascii=False)
    if content != new_content:
        if dry_run:
            print(f"  [DRY-RUN] Would update manifest.json: nodeTypes {old_nodes}→{node_count}, edgeTypes {old_edges}→{edge_count}")
        else:
            manifest_path.write_text(new_content + "\n", encoding="utf-8")
            print(f"  [MODIFIED] manifest.json: nodeTypes {old_nodes}→{node_count}, edgeTypes {old_edges}→{edge_count}")
        return 1
    return 0


def main():
    dry_run = "--apply" not in sys.argv

    if dry_run:
        print("=" * 60)
        print("DRY-RUN MODE — no files will be modified")
        print("Run with --apply to apply changes")
        print("=" * 60)
        print()

    print("--- Sentinel Manifests: adding id field ---")
    manifest_changed = fix_sentinel_manifests(dry_run)

    print()
    print("--- Edge JSON: checking consumed_by_sentinels ---")
    check_edge_consumed_by(dry_run)

    print()
    print("--- Ontology manifest.json: updating counts ---")
    manifest_updated = update_manifest_json(dry_run)

    print()
    total = manifest_changed + manifest_updated
    print(f"{total} files {'would be' if dry_run else 'were'} modified.")
    if dry_run and total > 0:
        print("To apply: python3 scripts/migrate-ontology-manifests.py --apply")


if __name__ == "__main__":
    main()
