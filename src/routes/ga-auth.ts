/**
 * ga-auth.ts — GA 路由共享认证（D551）
 *
 * requireGa 从 ga-annotations.ts L44-60 模式原样提取（一次提取止住第四份复制，防膨胀）。
 * 存量三路由（ga-annotations / ga-corrections / ga-admin）已 audited（D338/D476 链），
 * 不回改——共享提取仅向前使用（spec SYNOVA-IMPL-DSH-D551 §5/§11）。
 *
 * 认证三态（D338 中国墙 + D476 权威形态，fail-closed）:
 *   401 UNAUTHORIZED — 无认证上下文
 *   400 ORG_REQUIRED — 缺组织上下文（绝不回落 'default' 共享命名空间）
 *   403 FORBIDDEN    — 角色 ∉ {ga, admin}
 *
 * @module routes/ga-auth
 */

import type { Request, Response } from 'express';
import { extractAuthFromRequest } from '../middleware/auth';

/** GA/admin 角色验证 — 通过返回 true；失败已写入响应（401/400/403），调用方直接 return */
export function requireGa(req: Request, res: Response): boolean {
  const auth = extractAuthFromRequest(req);
  if (!auth) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: '需要认证' });
    return false;
  }
  // D338 fail-closed 中国墙: 缺组织上下文 → 拒绝，绝不回落 'default' 共享命名空间
  if (!auth.orgId) {
    res.status(400).json({ ok: false, code: 'ORG_REQUIRED', message: '缺少组织上下文' });
    return false;
  }
  if (auth.role !== 'ga' && auth.role !== 'admin') {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '仅GA/admin可执行GA协同操作' });
    return false;
  }
  return true;
}
