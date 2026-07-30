/**
 * src/routes/enterprise.ts — 企业管理路由 (D103 + D106)
 *
 * D106: users Map → UserStore (GraphStore 持久化)。
 * 其余 4 个 Map (enterprises/invitations/imaBindings/gaAccessTokens) 保持内存。
 * UserStore 由外部通过 setUserStore() 注入（D224-WIRING）。
 *
 * 19 endpoints in 5 groups:
 *   Enterprise (2): register, status
 *   Invitations (5): invite, list, delete, get, accept
 *   Members (4): list, get, update, remove
 *   ima Binding (4): bind, status, sync-trigger, sync-status
 *   GA Access (4): generate, validate, data, delete
 *
 * 铁律 24+31: catch + log + degraded + res.status(500)
 * 铁律 38: 零 as any
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { extractAuthFromRequest } from '../middleware/auth';
import { UserStore } from '../growth/user-store';
import { listTemplates, getTemplate, saveTemplate, deleteTemplate } from '../services/role-template-store';
import type { RoleTemplate } from '../middleware/rbac';
import bcrypt from 'bcrypt';

const log = createLogger('enterprise-routes');
const router = Router();

// ═══ D106: UserStore 注入 (GraphStore 持久化) ═══

let _userStore: UserStore | null = null;
export function setUserStore(store: UserStore): void { _userStore = store; }
function getUserStore(): UserStore {
  if (!_userStore) throw new Error('UserStore not initialized — 调用 setUserStore 注入');
  return _userStore;
}

// ═══ D103: 其余 4 个存储保持内存 Map（enterprise/invitation/ima/ga-access） ═══

interface EnterpriseRecord {
  orgId: string; name: string; adminId: string; createdAt: string; status: 'active' | 'suspended';
}
interface InvitationRecord {
  token: string; email: string; orgId: string; role: string; invitedBy: string;
  status: 'pending' | 'accepted' | 'expired'; createdAt: string; expiresAt: string;
}
interface ImaBindingRecord {
  orgId: string; apiKeyHash: string; status: 'active' | 'error'; lastSyncAt?: string;
}
interface GaAccessRecord {
  token: string; orgId: string; createdBy: string; expiresAt: string; status: 'active' | 'expired' | 'revoked';
  contractExpiry?: string;
}

const enterprises = new Map<string, EnterpriseRecord>();
const invitations = new Map<string, InvitationRecord>();
const imaBindings = new Map<string, ImaBindingRecord>();
const gaAccessTokens = new Map<string, GaAccessRecord>();
let userIdCounter = 0;

/** 获取活跃 IMA 绑定列表（D110: cron 定时同步用） */
export function getActiveImaBindings(): Array<{ orgId: string; apiKeyHash: string }> {
  const result: Array<{ orgId: string; apiKeyHash: string }> = [];
  for (const [orgId, binding] of imaBindings) {
    if (binding.status === 'active') {
      result.push({ orgId, apiKeyHash: binding.apiKeyHash });
    }
  }
  return result;
}

function nextId(prefix: string): string {
  return `${prefix}-${++userIdCounter}-${Date.now().toString(36)}`;
}

// ═══ Helpers ═══

function requireAdmin(req: Request, res: Response): boolean {
  const auth = extractAuthFromRequest(req);
  if (!auth || (auth.role !== 'admin' && auth.role !== 'manager')) {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '需要 admin 或 manager 权限' });
    return false;
  }
  return true;
}

function getOrgId(req: Request): string {
  const auth = extractAuthFromRequest(req);
  return auth?.orgId || 'default';
}

// ════════════════════════════════════════════════════════════
// ENTERPRISE (2 endpoints)
// ════════════════════════════════════════════════════════════

router.post('/api/enterprise/register', async (req: Request, res: Response) => {
  try {
    const { email, password, orgName, phone, wechatId } = req.body as
      { email?: string; password?: string; orgName?: string; phone?: string; wechatId?: string };
    if ((!email && !phone && !wechatId) || !password || !orgName) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'email/phone/wechatId, password, orgName 必填' });
    }
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: '手机号格式不正确' });
    }
    // Check duplicate (D106: UserStore)
    const store = getUserStore();
    if (email && store.queryByEmail(email)) return res.status(409).json({ ok: false, code: 'DUPLICATE', message: '邮箱已注册' });
    if (phone && store.queryByPhone(phone)) return res.status(409).json({ ok: false, code: 'DUPLICATE', message: '手机号已注册' });
    if (wechatId && store.queryByWechatId(wechatId)) return res.status(409).json({ ok: false, code: 'DUPLICATE', message: '微信号已注册' });

    const finalEmail = email || `${phone || wechatId}@phone.local`;
    const orgId = nextId('org');
    const now = new Date().toISOString();

    const result = await getUserStore().createUser(finalEmail, password, 'admin', orgId, { phone, wechatId });
    enterprises.set(orgId, { orgId, name: orgName, adminId: result.userId, createdAt: now, status: 'active' });

    log.info({ orgId, userId: result.userId, email: finalEmail }, '企业注册成功');
    return res.json({ ok: true, data: { orgId, userId: result.userId, email: finalEmail, role: 'admin' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '企业注册失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.get('/api/enterprise/status', (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const org = enterprises.get(orgId);
    if (!org) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '企业不存在' });
    return res.json({ ok: true, data: org });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询企业状态失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════
// INVITATIONS (5 endpoints)
// ════════════════════════════════════════════════════════════

router.post('/api/enterprise/invite', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email || !role) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'email, role 必填' });

    const token = nextId('inv');
    const orgId = getOrgId(req);
    const auth = extractAuthFromRequest(req);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    invitations.set(token, {
      token, email, orgId, role, invitedBy: auth?.userId || 'system',
      status: 'pending', createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(),
    });

    log.info({ token, email, orgId }, '邀请已创建');
    return res.json({ ok: true, data: { token, email, role, expiresAt: expiresAt.toISOString() } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '创建邀请失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.get('/api/enterprise/invitations', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const orgId = getOrgId(req);
    const list = Array.from(invitations.values()).filter(i => i.orgId === orgId);
    return res.json({ ok: true, data: list });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询邀请列表失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.delete('/api/enterprise/invitations/:id', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = req.params.id as string;
    const inv = invitations.get(id);
    if (!inv) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '邀请不存在' });
    invitations.delete(id);
    return res.json({ ok: true, message: '已删除' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '删除邀请失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.get('/api/enterprise/invitation/:token', (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const inv = invitations.get(token);
    if (!inv) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '邀请不存在' });
    if (inv.status !== 'pending') return res.status(400).json({ ok: false, code: 'INVITATION_USED', message: '邀请已使用' });
    if (new Date(inv.expiresAt) < new Date()) return res.status(400).json({ ok: false, code: 'INVITATION_EXPIRED', message: '邀请已过期' });
    return res.json({ ok: true, data: { email: inv.email, orgId: inv.orgId, role: inv.role } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询邀请失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.post('/api/enterprise/invitation/accept', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'token, password 必填' });

    const inv = invitations.get(token);
    if (!inv) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '邀请不存在' });
    if (inv.status !== 'pending') return res.status(400).json({ ok: false, code: 'INVITATION_USED', message: '邀请已使用' });
    if (new Date(inv.expiresAt) < new Date()) return res.status(400).json({ ok: false, code: 'INVITATION_EXPIRED', message: '邀请已过期' });

    // D106: UserStore.createUser — GraphStore 持久化
    const result = await getUserStore().createUser(
      inv.email, password, inv.role as 'admin' | 'manager' | 'liaison' | 'staff', inv.orgId,
    );
    inv.status = 'accepted';

    log.info({ userId: result.userId, email: inv.email, orgId: inv.orgId }, '邀请已接受');
    return res.json({ ok: true, data: { userId: result.userId, email: inv.email, role: inv.role, orgId: inv.orgId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '接受邀请失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════
// MEMBERS (4 endpoints)
// ════════════════════════════════════════════════════════════

router.get('/api/enterprise/members', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const orgId = getOrgId(req);
    const list = getUserStore().listByOrg(orgId);
    return res.json({ ok: true, data: list.map(u => ({ userId: u.userId, email: u.email, role: u.role, status: u.status, phone: u.phone, wechatId: u.wechatId, createdAt: u.createdAt })) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询成员失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.get('/api/enterprise/members/:id', (req: Request, res: Response) => {
  try {
    const user = getUserStore().getById(req.params.id as string);
    if (!user) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '成员不存在' });
    return res.json({ ok: true, data: { userId: user.userId, email: user.email, role: user.role, status: user.status, createdAt: user.createdAt } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询成员失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.put('/api/enterprise/members/:id', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = req.params.id as string;
    const user = getUserStore().getById(userId);
    if (!user) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '成员不存在' });
    const { role } = req.body as { role?: string };
    if (role) getUserStore().updateUser(userId, { role: role as 'admin' | 'manager' | 'staff' });
    const updated = getUserStore().getById(userId);
    if (!updated) return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: '更新后读取失败', degraded: true });
    return res.json({ ok: true, data: { userId: updated.userId, email: updated.email, role: updated.role, status: updated.status } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '更新成员失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.delete('/api/enterprise/members/:id', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = req.params.id as string;
    const user = getUserStore().getById(userId);
    if (!user) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '成员不存在' });
    getUserStore().deleteUser(userId); // soft-delete
    return res.json({ ok: true, message: '成员已停用' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '移除成员失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════
// FREEZE (D239: GA 冻结/解冻)
// ════════════════════════════════════════════════════════════

router.post('/api/enterprise/members/:userId/freeze', async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { userId } = req.params as { userId: string };
    getUserStore().deleteUser(userId);
    log.warn({ userId, frozenBy: extractAuthFromRequest(req)?.userId }, 'GA 账户已冻结');
    return res.json({ ok: true, message: 'GA 账户已冻结 — 所有权限立即收回' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '冻结 GA 失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.post('/api/enterprise/members/:userId/unfreeze', async (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { userId } = req.params as { userId: string };
    const user = getUserStore().getById(userId);
    if (!user) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '成员不存在' });
    getUserStore().updateUser(userId, { status: 'active' });
    log.info({ userId, unfrozenBy: extractAuthFromRequest(req)?.userId }, 'GA 账户已解冻');
    return res.json({ ok: true, message: 'GA 账户已解冻' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '解冻 GA 失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════
// IMA BINDING (4 endpoints)
// ════════════════════════════════════════════════════════════

router.post('/api/enterprise/ima/bind', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey || apiKey.length < 8) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: '有效API Key必填(≥8字符)' });

    const orgId = getOrgId(req);
    const apiKeyHash = `hashed:${Buffer.from(apiKey).toString('base64')}`; // simplified encryption
    imaBindings.set(orgId, { orgId, apiKeyHash, status: 'active', lastSyncAt: new Date().toISOString() });
    log.info({ orgId }, 'IMA已绑定');
    return res.json({ ok: true, message: 'IMA绑定成功' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'IMA绑定失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.get('/api/enterprise/ima/status', (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const binding = imaBindings.get(orgId);
    if (!binding) return res.json({ ok: true, data: { status: 'not_bound', orgId } });
    return res.json({ ok: true, data: { status: binding.status, lastSyncAt: binding.lastSyncAt, orgId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询IMA状态失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.post('/api/enterprise/ima/sync/trigger', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const orgId = getOrgId(req);
    const binding = imaBindings.get(orgId);
    if (!binding) return res.status(400).json({ ok: false, code: 'IMA_NOT_BOUND', message: 'IMA未绑定' });
    log.info({ orgId }, 'IMA同步已触发');
    return res.json({ ok: true, message: 'IMA同步已触发', data: { triggeredAt: new Date().toISOString() } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '触发IMA同步失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.get('/api/enterprise/ima/sync/status', (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const binding = imaBindings.get(orgId);
    return res.json({ ok: true, data: { orgId, lastSyncAt: binding?.lastSyncAt || null, status: binding?.status || 'not_bound' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询IMA同步状态失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════
// GA ACCESS (4 endpoints)
// ════════════════════════════════════════════════════════════

router.post('/api/enterprise/ga-access/generate', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const orgId = getOrgId(req);
    const auth = extractAuthFromRequest(req);
    const token = nextId('ga');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    gaAccessTokens.set(token, { token, orgId, createdBy: auth?.userId || 'unknown', expiresAt, status: 'active' });
    return res.json({ ok: true, data: { token, expiresAt } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '生成GA访问令牌失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.get('/api/enterprise/ga-access/validate', (req: Request, res: Response) => {
  try {
    const { token } = req.query as { token?: string };
    if (!token) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'token必填' });
    const ga = gaAccessTokens.get(token);
    if (!ga || ga.status !== 'active') return res.json({ ok: true, data: { valid: false, reason: '无效或已撤销' } });
    if (new Date(ga.expiresAt) < new Date()) return res.json({ ok: true, data: { valid: false, reason: '已过期' } });
    return res.json({ ok: true, data: { valid: true, orgId: ga.orgId } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '验证GA访问令牌失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.get('/api/enterprise/ga-access/data/:type', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const type = req.params.type as string;
    const orgId = getOrgId(req);
    // Simplified: return count-based mock data
    const data = {
      members: getUserStore().getTotalUserCount(), invitations: invitations.size,
      enterprises: enterprises.size, imaBindings: imaBindings.size,
    };
    return res.json({ ok: true, data: { type, orgId, stats: data } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询GA数据失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// PUT /api/enterprise/ga-access/:token/expiry — 设置 GA 合同到期日
router.put('/api/enterprise/ga-access/:token/expiry', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const token = req.params.token as string;
    const ga = gaAccessTokens.get(token);
    if (!ga) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'GA 令牌不存在' });
    if (ga.status !== 'active') return res.status(400).json({ ok: false, code: 'NOT_ACTIVE', message: 'GA 令牌已过期或已撤销' });
    const { contractExpiry } = req.body as { contractExpiry?: string };
    if (!contractExpiry) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'contractExpiry 必填' });
    const expiryDate = new Date(contractExpiry);
    if (isNaN(expiryDate.getTime())) return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: '日期格式无效' });
    if (expiryDate < new Date()) return res.status(400).json({ ok: false, code: 'PAST_DATE', message: '到期日必须是未来日期' });
    ga.contractExpiry = contractExpiry;
    log.info({ token, contractExpiry }, 'GA 合同到期日已设置');
    return res.json({ ok: true, data: { token, contractExpiry } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '设置 GA 到期日失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

router.delete('/api/enterprise/ga-access/:token', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const token = req.params.token as string;
    const ga = gaAccessTokens.get(token);
    if (!ga) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '令牌不存在' });
    ga.status = 'revoked';
    return res.json({ ok: true, message: '已撤销' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '撤销GA访问令牌失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// ════════════════════════════════════════════════════════════
// D242: 权限模板管理 + 双签
// ════════════════════════════════════════════════════════════

/**
 * 双签检查：批量权限变更需要 x-second-approver header。
 */
function requireDualSign(req: Request, res: Response): boolean {
  if (!requireAdmin(req, res)) return false;
  const secondApprover = req.headers['x-second-approver'] as string | undefined;
  if (!secondApprover) {
    res.status(400).json({ ok: false, code: 'DUAL_SIGN_REQUIRED', message: '批量权限变更需要 x-second-approver header', degraded: true });
    return false;
  }
  return true;
}

// GET /api/enterprise/role-templates — 模板列表
router.get('/api/enterprise/role-templates', (_req: Request, res: Response) => {
  try {
    const templates = listTemplates();
    return res.json({ ok: true, data: templates });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询模板列表失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// GET /api/enterprise/role-templates/:id — 获取单个模板
router.get('/api/enterprise/role-templates/:id', (req: Request, res: Response) => {
  try {
    const template = getTemplate(req.params.id as string);
    if (!template) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '模板不存在' });
    return res.json({ ok: true, data: template });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '查询模板失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// POST /api/enterprise/role-templates — 创建自定义模板
router.post('/api/enterprise/role-templates', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const body = req.body as Partial<import('../middleware/rbac').RoleTemplate>;
    if (!body.id || !body.name || !body.permissions) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'id, name, permissions 必填' });
    }
    const template: import('../middleware/rbac').RoleTemplate = {
      id: body.id, name: body.name, description: body.description || '',
      basedOn: body.basedOn, permissions: body.permissions, isBuiltin: false,
      createdAt: new Date().toISOString(),
    };
    if (saveTemplate(template)) {
      return res.json({ ok: true, data: template });
    }
    return res.status(500).json({ ok: false, code: 'SAVE_FAILED', message: '模板保存失败', degraded: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '创建模板失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// DELETE /api/enterprise/role-templates/:id — 删除模板（拒绝内置）
router.delete('/api/enterprise/role-templates/:id', (req: Request, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = deleteTemplate(req.params.id as string);
    if (!result.ok) {
      const status = result.reason === '内置模板不可删除' ? 403 : 404;
      return res.status(status).json({ ok: false, code: 'FORBIDDEN', message: result.reason });
    }
    return res.json({ ok: true, message: '模板已删除' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '删除模板失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

// POST /api/enterprise/members/:userId/role — 分配角色模板（双签）
router.post('/api/enterprise/members/:userId/role', (req: Request, res: Response) => {
  try {
    if (!requireDualSign(req, res)) return;
    const userId = req.params.userId as string;
    const { templateId } = req.body as { templateId?: string };
    if (!templateId) {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'templateId 必填' });
    }
    const template = getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '模板不存在' });
    }
    const user = getUserStore().getById(userId);
    if (!user) return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: '成员不存在' });
    getUserStore().updateUser(userId, { role: template.id as 'admin' | 'manager' | 'staff' });
    log.info({ userId, templateId, secondApprover: req.headers['x-second-approver'] }, '角色已分配(双签)');
    return res.json({ ok: true, message: '角色已分配', data: { userId, role: template.id } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, '分配角色失败');
    return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: msg, degraded: true });
  }
});

export default router;
