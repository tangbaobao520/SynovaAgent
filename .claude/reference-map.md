# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## queryByEmail
| `queryByEmail` | D | /novis-backup-20260526/Novis/synova-agent/src/growth/user-store.ts | `119:  queryByEmail(email: string): UserRecord \| null {` |
| `queryByEmail` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/auth.ts | `87:      if (email && registerUs.queryByEmail(email)) return res.status(409).json({ ok: false, code: 'DUPLICATE', message: '邮箱已注册' });` |
| `queryByEmail` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/auth.ts | `123:      if (email) foundUser = loginUs.queryByEmail(email) as UserRecord \| null;` |
| `queryByEmail` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `108:    if (email && store.queryByEmail(email)) return res.status(409).json({ ok: false, code: 'DUPLICATE', message: '邮箱已注册' });` |
| `queryByEmail` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `229:    const existing = store.queryByEmail(inv.email);` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/growth/user-store.test.ts | `4: * 覆盖: createUser / queryByEmail / getById / updateUser / listByOrg` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/growth/user-store.test.ts | `73:describe('D106 — UserStore queryByEmail', () => {` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/growth/user-store.test.ts | `82:    const user = store.queryByEmail('alice@co.com');` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/growth/user-store.test.ts | `90:    const user = store.queryByEmail('nonexistent@co.com');` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/growth/user-store.test.ts | `95:    expect(store.queryByEmail('')).toBeNull();` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/integration/wiring-integration.test.ts | `107:    const found = userStore.queryByEmail("wiretest@test.com");` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `224:    const adminUser = userStore.queryByEmail(ADMIN_EMAIL);` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `281:    const invitee = userStore.queryByEmail(INVITEE_EMAIL);` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `427:    const bound = userStore.queryByEmail(PERSONAL_EMAIL);` |
| `queryByEmail` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `495:    const created = userStore.queryByEmail(FRESH_EMAIL);` |

## updateUser
| `updateUser` | D | /novis-backup-20260526/Novis/synova-agent/src/growth/user-store.ts | `218:  updateUser(userId: string, props: Partial<Pick<UserRecord, 'role' \| 'status' \| 'displayName' \| 'department' \| 'orgId'>>): void {` |
| `updateUser` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `239:      store.updateUser(existing.userId, { orgId: inv.orgId, role: inv.role });` |
| `updateUser` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `297:    if (role) getUserStore().updateUser(userId, { role: role as 'admin' \| 'manager' \| 'staff' });` |
| `updateUser` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `347:    getUserStore().updateUser(userId, { status: 'active' });` |
| `updateUser` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `609:    getUserStore().updateUser(userId, { role: template.id as 'admin' \| 'manager' \| 'staff' });` |
| `updateUser` | D | /novis-backup-20260526/Novis/synova-agent/src/services/anomaly-detector.ts | `86:  updateUser(userId: string, props: Record<string, unknown>): void;` |
| `updateUser` | D | /novis-backup-20260526/Novis/synova-agent/src/services/anomaly-detector.ts | `100:      this.userStore.updateUser(userId, { status: 'disabled' });` |
| `updateUser` | D | /novis-backup-20260526/Novis/synova-agent/src/services/anomaly-detector.ts | `110:      this.userStore.updateUser(userId, { status: 'active' });` |
| `updateUser` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/growth/user-store.test.ts | `4: * 覆盖: createUser / queryByEmail / getById / updateUser / listByOrg` |
