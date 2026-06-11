# GraphStore P0 Fixes — Spec

## Fix 1: deleteNode MUST also delete the node row

**Bug**: `deleteNode(id, graph)` soft-deletes edges but the node row stays forever.
         `queryNodes` still returns "deleted" nodes.
**Fix**: Soft-delete the node row (SET valid_to on graph_nodes) OR hard-delete.
         Choice: hard-delete node + soft-delete edges (consistent with graph_triples pattern).
         Actually: graph_nodes has no valid_to column → hard-delete via `DELETE FROM graph_nodes WHERE id=? AND graph=?`.
**Contract**: After `deleteNode(id, graph)`, `getNode(id, graph)` returns null.

## Fix 2: createEdge MUST require explicit graph (no default='default')

**Bug**: `createEdge(..., graph = 'default')` — missing orgId silently writes to shared pool.
**Fix**: Remove default value. `graph` becomes required parameter (like createNode).
**Contract**: `createEdge(type, from, to, weight?, props?, graph)` → graph is required.
         Omitting graph → throw 'graph (orgId) is required'.

## Fix 3: JSON.parse in getNode/queryNodes/queryEdges MUST have try-catch

**Bug**: Corrupted `props_json` in DB → JSON.parse throws → crash entire query.
**Fix**: Wrap JSON.parse in safeParse() → returns {} on failure + logs warning.
**Contract**: Corrupted props_json → return empty props {}, log.warn, do NOT crash.
