# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## isWhitelisted
| `isWhitelisted` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/auth.ts | `85:function isWhitelisted(path: string): boolean {` |
| `isWhitelisted` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/auth.ts | `252:    if (isWhitelisted(req.path)) {` |
| `isWhitelisted` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/sanitize-check.ts | `43:function isWhitelisted(path: string): boolean {` |
| `isWhitelisted` | D | /novis-backup-20260526/Novis/synova-agent/src/middleware/sanitize-check.ts | `106:  if (isWhitelisted(req.path)) {` |
| `isWhitelisted` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/auth.integration.test.ts | `11: * isWhitelisted，与 login 并列)——helper 匿名直连注册（无 Authorization 头），与真实用户` |
| `isWhitelisted` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/middleware/auth.integration.test.ts | `85: * 白名单（src/middleware/auth.ts isWhitelisted，与 login 并列），与真实用户入口一致，` |

## api/enterprise/register
| `api/enterprise/register` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `96:router.post('/api/enterprise/register', async (req: Request, res: Response) => {` |
| `api/enterprise/register` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/e2e/customer-flow.e2e.test.ts | `49:      const reg = await api('/api/enterprise/register', {` |
| `api/enterprise/register` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `206:    const res = await fetch(`${baseUrl}/api/enterprise/register`, {` |

## api/enterprise/invitation
| `api/enterprise/invitation` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `171:router.get('/api/enterprise/invitations', (req: Request, res: Response) => {` |
| `api/enterprise/invitation` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `184:router.delete('/api/enterprise/invitations/:id', (req: Request, res: Response) => {` |
| `api/enterprise/invitation` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `199:router.get('/api/enterprise/invitation/:token', (req: Request, res: Response) => {` |
| `api/enterprise/invitation` | D | /novis-backup-20260526/Novis/synova-agent/src/routes/enterprise.ts | `214:router.post('/api/enterprise/invitation/accept', async (req: Request, res: Response) => {` |
| `api/enterprise/invitation` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `255:    const res = await fetch(`${baseUrl}/api/enterprise/invitation/${inviteToken}`);` |
| `api/enterprise/invitation` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `265:    const res = await fetch(`${baseUrl}/api/enterprise/invitation/accept`, {` |
| `api/enterprise/invitation` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `290:    const reAccept = await fetch(`${baseUrl}/api/enterprise/invitation/accept`, {` |
| `api/enterprise/invitation` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `300:    const reQuery = await fetch(`${baseUrl}/api/enterprise/invitation/${inviteToken}`);` |
| `api/enterprise/invitation` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `318:      const expiredQuery = await fetch(`${baseUrl}/api/enterprise/invitation/${expiredToken}`);` |
| `api/enterprise/invitation` | **D** 📋 | /novis-backup-20260526/Novis/synova-agent/tests/routes/enterprise.test.ts | `323:      const expiredAccept = await fetch(`${baseUrl}/api/enterprise/invitation/accept`, {` |
