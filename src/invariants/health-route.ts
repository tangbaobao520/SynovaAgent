/**
 * src/invariants/health-route.ts — GET /api/healthz/invariants 运行期不变量探针（D831）
 *
 * 反接线探针（派单 ④）: 暴露 registered/expected 与每条
 * {code, owner, hitCount, lastFailure, anomalies} + 粘滞降级会话数。
 * 探针自身 fail-closed: registered !== expected（空注册表 / 部分注册）→ 503。
 * 挂载点: src/server.ts 紧邻 healthzRoutes（routes/healthz.ts 是小队 A 地盘，一字不改）。
 *
 * D865 组4 真接线（非为过门禁的假引用）:
 *   expected 不是硬编码数字，而是**声明面** RUNTIME_INVARIANT_COMPANIONS.length——
 *   声明面（该装几条）与运行面（注册表快照装了几条）不一致 = "机制在场但没装全"的
 *   假绿形态（K3 D831 P2-5 同型：探针绿但守卫不在链上），故 503 + missing 清单可诊断。
 *
 * 契约（铁律 47）:
 *   @input  — HTTP GET /api/healthz/invariants（无参数、无鉴权，与 /api/healthz 同口径）
 *   @output — 200 {registered, expected, missing:[], invariants[], stickyDegradedSessions, anomalies[]}
 *             | 503 {registered, expected, missing[], invariants[], error}
 *   @degraded — snapshot() 抛错 → 503 {error, degraded:true} + log.error（不静默）
 *   @error  — 无（探针不抛给 Express；一切异常转 503）
 */

import { Router } from 'express';
import { createLogger } from '@synova/logger';
import { invariantRegistry, RUNTIME_INVARIANT_COMPANIONS } from './index';
import { getStickyDegradedSessions } from './companions/degraded-sticky.invariant';

const log = createLogger('invariants/health-route');
export const invariantHealthRoutes = Router();

invariantHealthRoutes.get('/api/healthz/invariants', (_req, res) => {
  try {
    const snap = invariantRegistry.snapshot();
    // 声明面 → 期望条数（D865 组4: RUNTIME_INVARIANT_COMPANIONS 的唯一真接线消费点）
    const expected = RUNTIME_INVARIANT_COMPANIONS.length;
    const registeredCodes = new Set(snap.invariants.map((i) => i.code));
    const missing = RUNTIME_INVARIANT_COMPANIONS
      .filter((c) => !registeredCodes.has(c.code))
      .map((c) => c.code);
    const invariants = snap.invariants.map((i) => ({
      code: i.code,
      owner: i.owner,
      packageName: i.packageName,
      hitCount: i.hitCount,
      lastFailure: i.lastFailure,
      anomalies: i.anomalies, // D865 P2-3: 非违约异常探针可见（防假绿）
    }));
    if (snap.registered !== expected) {
      // fail-closed：空注册表 / 部分注册都不给 200（防"探针绿但机制不全在场"）
      res.status(503).json({
        registered: snap.registered,
        expected,
        missing,
        invariants,
        error: `invariant registry incomplete — registered=${snap.registered} != expected=${expected} — fail-closed`,
      });
      return;
    }
    res.json({
      registered: snap.registered,
      expected,
      missing,
      invariants,
      stickyDegradedSessions: getStickyDegradedSessions().length,
      anomalies: snap.anomalies, // D865 P2-3: 注册表级异常（条目卸载后仍可见，防假绿）
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '不变量探针读取失败');
    res.status(503).json({ error: msg, degraded: true });
  }
});
