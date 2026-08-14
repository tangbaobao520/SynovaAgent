# SynovaAgent -- D106 GraphStore User Node + D107 Ontology Adapter Implementation v1.0

> 2026-07-22 | Auth Doc #16: Enterprise Multi-User + ima Integration -- Ch5 S5.5 + S5.6
> **D102/D103 use in-memory Map for users. D106 persists to GraphStore. D107 maps to ontology.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent multi-tenant infrastructure. D106 adds USER node type to GraphStore (persistent user storage replacing in-memory Map). D107 adds RESOURCE_USER entity mapping to the ontology adapter for enterprise multi-user queries.

### Q1: Research
- Industry: PostgreSQL user tables, Auth0 user metadata, Firebase Auth user profiles
- Memory lessons: Iron Law 9 -- grep propagation. Adding a node type means checking ALL GraphStore consumers. Iron Law 38 -- zero as any. The SOGNodeType enum uses specific values; USER must be added properly.

### Q2: Scope
- D106: Add USER to SOGNodeType, GraphStore.createUserNode/queryNodeByEmail methods
- D107: Add RESOURCE_USER to ontology entity registry, map User node properties to entity attributes
- NOT doing: full user profile CRUD (already in D103 enterprise routes), password reset flow

### Q3: Acceptance
- Entry: D102 register/login calls GraphStore.createUserNode instead of Map.set()
- Interaction: D103 enterprise routes call GraphStore.queryNodeByEmail for member lookup
- Result: User data persists across server restarts (SQLite storage)

### Q4: Contract and Test
- D106: GraphStore.createUserNode/node type, queryNodeByEmail
- D107: ontology-adapter maps USER nodes to entity format
- Tests: create user node, query by email, ontology entity mapping, SOGNodeType enum updated

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates ===
G1: as any = 0
G2: empty catch has log.warn
G4: new/modified src/ files -> paired tests
G5: new exports -> callers

=== Post-Code Agent Self-Check ===
1. [WIRING] Who calls createUserNode? Who calls queryNodeByEmail?
2. [EXCEPTION] catch + log.warn + degraded?
3. [TYPES] as any = 0? SOGNodeType.USER needs enum entry
4. [TESTS] expect()? Normal/degrade/boundary?
5. [DEAD CODE] Old in-memory Map replaced? Auth/enterprise routes updated?
```

---

## Current State (2026-07-22, verified by grep)

- D102: Auth login/register uses in-memory Map<string, UserRecord> -- needs migration
- D103: Enterprise routes use in-memory Map for users/enterprises/invitations -- needs migration
- GraphStore: has SOGNodeType with existing types (ORGANIZATION, FINANCIAL, TALENT, etc.) -- NO USER
- GraphStore: createNode/queryNodes methods exist
- GraphStore: NO queryNodeByEmail method
- Ontology adapter: entity-registry.ts has resolvePersonByEmail -- USER entity needs mapping
- Auth Doc #16 S5.5: precise GraphStore modification spec
- Auth Doc #16 S5.6: ontology adapter entity mapping spec

---

## What We Build -- D106

### 1. Add USER to SOGNodeType (Modify packages/engine-core/src/pipeline/diagnosis/types.ts or sog-core)

```
// In SOGNodeType enum or NodeType union
USER = 'USER'
```

### 2. Add GraphStore methods (Modify graph-store.ts)

```
interface GraphStore {
  // ... existing methods ...
  createUserNode(props: UserProps): string
  queryNodeByEmail(email: string): GraphNode | null
  updateUserNode(userId: string, props: Partial<UserProps>): void
}

interface UserProps {
  email: string
  passwordHash: string
  role: 'admin' | 'manager' | 'liaison' | 'staff' | 'ga'
  orgId: string
  status: 'active' | 'disabled'
  displayName?: string
  department?: string
}
```

### 3. Migrate D102/D103 in-memory Maps to GraphStore

In auth.ts and enterprise.ts:
- Replace `users.set(userId, userRecord)` with `graphStore.createUserNode(props)`
- Replace `users.get(userId)` with graphStore calls
- Inject GraphStore dependency (via server context or import singleton)

## What We Build -- D107

### 1. Add RESOURCE_USER entity mapping (Modify ontology-adapter.ts)

```
function mapUserToEntity(userNode: GraphNode): OntologyEntity {
  return {
    type: 'RESOURCE_USER',
    id: userNode.props.email,
    attributes: {
      role: userNode.props.role,
      orgId: userNode.props.orgId,
      status: userNode.props.status,
    }
  };
}
```

### 2. Register in entity registry

Add RESOURCE_USER to the entity type resolution table.

---

## What We Don't Do

- Don't modify existing node types (ORGANIZATION, FINANCIAL, etc.)
- Don't implement user password reset flow
- Don't migrate ALL in-memory Maps to GraphStore (invitations/ima bindings can stay in memory for MVP)

---

## Architecture Layer

L4 (graph-store.ts + ontology-adapter.ts) + L1 (auth.ts + enterprise.ts updated to use GraphStore)

---

## Completion Standard

```
[ ] SOGNodeType.USER added to enum
[ ] GraphStore.createUserNode(email, passwordHash, role, orgId)
[ ] GraphStore.queryNodeByEmail(email) -> GraphNode | null
[ ] GraphStore.updateUserNode(userId, partialProps)
[ ] D102 auth.ts: login/register use GraphStore instead of in-memory Map
[ ] D103 enterprise.ts: member operations use GraphStore
[ ] D107: RESOURCE_USER entity mapping in ontology-adapter
[ ] D107: entity registry updated
[ ] Backward compatible: existing node types unchanged
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=8 tests: createUser (2) + queryByEmail (2) + updateUser (1) + ontology mapping (2) + auth migration (1)
```

---

## Auth Doc References

- Auth Doc #16: Enterprise Multi-User -- Ch5 S5.5 (GraphStore User node) + S5.6 (ontology adapter)
- D102: Auth upgrade (consumer of GraphStore User)
- D103: Enterprise routes (consumer of GraphStore User)
