/**
 * src/invariants/health-route.ts — GET /api/healthz/invariants 运行期不变量探针（D831）
 *
 * 反接线探针（派单 ④）: 暴露 registered 与每条 {code, owner, hitCount, lastFailure}
 * + 粘滞降级会话数。registered==0 → 503（注册表空转 = 探针自身 fail-closed）。
 * 挂载点: src/server.ts 紧邻 healthzRoutes（routes/healthz.ts 是小队 A 地盘，一字不改）。
 */

import { Router } from 'express';
import { createLogger } from '@synova/logger';
import { invariantRegistry } from './index';
import { getStickyDegradedSessions } from './companions/degraded-sticky.invariant';

const log = createLogger('invariants/health-route');
export const invariantHealthRoutes = Router();

invariantHealthRoutes.get('/api/healthz/invariants', (_req, res) => {
  try {
    const snap = invariantRegistry.snapshot();
    if (snap.registered === 0) {
      // fail-closed：空注册表不给 200（防"探针绿但机制不在场"）
      res.status(503).json({ registered: 0, invariants: [], error: 'invariant registry empty — fail-closed' });
      return;
    }
    res.json({
      registered: snap.registered,
      invariants: snap.invariants.map((i) => ({
        code: i.code,
        owner: i.owner,
        packageName: i.packageName,
        hitCount: i.hitCount,
        lastFailure: i.lastFailure,
      })),
      stickyDegradedSessions: getStickyDegradedSessions().length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '不变量探针读取失败');
    res.status(503).json({ error: msg, degraded: true });
  }
});
