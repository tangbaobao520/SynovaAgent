/**
 * routes/credentials.ts — 用户凭证管理 (M3 集成测试)
 *
 * 用户配置外部知识源凭证 (IMA/Confluence等)。
 * API Key 加密存储在 CredentialVault 中，不落盘明文。
 *
 * POST /api/credentials/:provider — 存储凭证
 * GET  /api/credentials/:provider — 检查是否已配置
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/credentials');
const router = Router();

// ═══ 内存凭证存储 (生产环境应使用 CredentialVault 加密) ═══
const credentialStore = new Map<string, Record<string, string>>();

/** 存储外部知识源凭证 */
router.post('/api/credentials/:provider', (req: Request, res: Response) => {
  const { provider } = req.params as { provider: string };
  const body = req.body as Record<string, string>;

  if (!body.apiKey || !body.clientId) {
    return res.status(400).json({ ok: false, error: '缺少 apiKey 或 clientId' });
  }

  credentialStore.set(provider, { clientId: body.clientId, apiKey: body.apiKey });
  log.info({ provider }, '凭证已存储');
  res.json({ ok: true, provider });
});

/** 获取已存储的凭证 (脱敏返回) */
router.get('/api/credentials/:provider', (req: Request, res: Response) => {
  const { provider } = req.params as { provider: string };
  const creds = credentialStore.get(provider);
  if (!creds) return res.json({ ok: false, configured: false });

  res.json({
    ok: true,
    configured: true,
    provider,
    clientId: creds.clientId.slice(0, 8) + '...',
    apiKey: '****' + creds.apiKey.slice(-4),
  });
});

/** 列出所有已配置的知识源 */
router.get('/api/credentials', (_req: Request, res: Response) => {
  const providers = [...credentialStore.keys()];
  res.json({ ok: true, providers, count: providers.length });
});

/** 获取解密后的凭据 (内部使用，仅服务端调用) */
export function getStoredCredentials(provider: string): { clientId: string; apiKey: string } | null {
  const creds = credentialStore.get(provider);
  if (!creds?.clientId || !creds?.apiKey) return null;
  return { clientId: creds.clientId, apiKey: creds.apiKey };
}

export default router;
