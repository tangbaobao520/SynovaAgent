/**
 * routes/adapters.ts — 适配器管理 API (L1)
 *
 * GET  /api/adapters          → 列出已注册适配器
 * POST /api/adapters/reload   → 重新扫描 field-mappings/ + 注册新适配器
 *
 * 对标 reload.ts 热加载模式。
 * 铁律31: 降级返回 degraded 标记，不影响服务。
 * 铁律39: L1 不直接引用 L3/L4/L5。
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/adapters');
const router = Router();

router.get('/api/adapters', (_req: Request, res: Response) => {
  try {
    const { AdapterRegistry } = require('../agent/adapter-registry');
    const registry = AdapterRegistry.getInstance();
    const state = registry.state();
    res.json({
      ok: true,
      count: state.count,
      adapters: state.adapters.map((a: { name: string; label: string; targetNodeType: string; registeredAt: string }) => ({
        name: a.name,
        label: a.label,
        targetNodeType: a.targetNodeType,
        registeredAt: a.registeredAt,
      })),
      degraded: state.degraded,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '获取适配器列表失败');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

router.post('/api/adapters/reload', (_req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const { reloadAdapters } = require('../agent/data-ingest-service');
    const result = reloadAdapters();
    const durationMs = Date.now() - startedAt;
    log.info({ updated: result.updated, errors: result.errors.length, durationMs }, '适配器重新加载完成');
    res.json({ ok: true, durationMs, updated: result.updated, errors: result.errors.slice(0, 20) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '适配器重新加载失败');
    res.status(500).json({ ok: false, error: msg, degraded: true, durationMs: Date.now() - startedAt });
  }
});

export default router;
