# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## RbacContext
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/rbac.ts | `16:export interface RbacContext {` |
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/rbac.ts | `23:export function extractRbacContext(req: { headers?: Record<string, unknown>; query?: Record<string, unknown>; auth?: { sub: string; role: string; orgId: string } }): RbacContext {` |
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/rbac.ts | `48:export function canAccessWorkspace(ctx: RbacContext, ws: {` |
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/rbac.ts | `65:export function canModifyWorkspace(ctx: RbacContext, ws: {` |
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/rbac.ts | `82:  (req as Request & { rbac: RbacContext }).rbac = extractRbacContext(req);` |
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/workspaces-api.ts | `130:  const { extractRbacContext, canAccessWorkspace } = require('../middleware/rbac') as typeof import('../middleware/rbac');` |
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/workspaces-api.ts | `131:  const ctx = extractRbacContext(req);` |
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/server.ts | `27:import { rbacMiddleware, extractRbacContext, canAccessWorkspace, canModifyWorkspace } from './middleware/rbac';` |
| `RbacContext` | D | /novis-backup-20260526/Novis/synova-agent/src/server.ts | `178:  const rbacCtx = extractRbacContext({ headers: { 'x-synova-token': 'admin::dev' } }); // Slice 7 RBAC` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `2:import { extractRbacContext, canAccessWorkspace, canModifyWorkspace, type RbacContext } from '../../src/middleware/rbac';` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `8:describe('extractRbacContext', () => {` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `10:    const ctx = extractRbacContext(mockReq('admin::dev') as any);` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `16:    const ctx = extractRbacContext(mockReq('manager:marketing:alice') as any);` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `23:    const ctx = extractRbacContext(mockReq('liaison::coordinator') as any);` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `28:    const ctx = extractRbacContext(mockReq('') as any);` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `33:    const ctx = extractRbacContext(mockReq('some-random-token') as any);` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `39:  const r = (role: string, dept?: string): RbacContext => ({ role: role as RbacContext['role'], userId: 'u', department: dept });` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `75:  const r = (role: string, dept?: string): RbacContext => ({ role: role as RbacContext['role'], userId: 'u', department: dept });` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `100:    const ctx = extractRbacContext({ auth: { sub: 'ga_001', role: 'ga', orgId: 'org-1' } } as any);` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `116:  it('extractRbacContext: JWT auth takes priority over x-synova-token', () => {` |
| `RbacContext` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/rbac.test.ts | `117:    const ctx = extractRbacContext({` |
