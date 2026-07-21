/**
 * routes/loops.ts — 循环状态 API 端点 (D20)
 *
 * GET /api/loops/status — 返回全部 6 个循环的当前状态
 *
 * 从 MainAgent 读取已注册循环 + 执行记录。
 * 降级: MainAgent 不可用 → 返回空列表 + degraded:true
 */
import { Router } from 'express';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/loops');
const router = Router();

// MainAgent 实例（由 server.ts 注入）
let mainAgent: { listLoops: () => Array<{ config: { loopId: string; loopName: string; scales: Array<{ name: string; triggerType: string; period: string }> }; lastExecution?: { status: string; startedAt: string; completedAt?: string; durationMs: number }; executionCount: number }> } | null = null;

export function setMainAgent(agent: typeof mainAgent): void {
  mainAgent = agent;
}

/**
 * GET /api/loops/status
 * 返回所有已注册循环的状态。
 */
router.get('/api/loops/status', (_req, res) => {
  try {
    if (!mainAgent) {
      res.json({ ok: true, loops: [], degraded: true, message: 'MainAgent 未就绪' });
      return;
    }

    const loops = mainAgent.listLoops().map(loop => {
      const lastExe = loop.lastExecution;
      const now = Date.now();
      const lastRunAgo = lastExe ? Math.floor((now - new Date(lastExe.startedAt).getTime()) / 1000) : null;

      return {
        loopId: loop.config.loopId,
        loopName: loop.config.loopName,
        status: lastExe?.status || 'pending',
        executionCount: loop.executionCount,
        lastExecution: lastExe ? {
          status: lastExe.status,
          startedAt: lastExe.startedAt,
          completedAt: lastExe.completedAt,
          durationMs: lastExe.durationMs,
          lastRunAgoSeconds: lastRunAgo,
        } : null,
        scales: loop.config.scales.map(s => ({
          name: s.name,
          triggerType: s.triggerType,
          period: s.period,
          status: 'pending' as const,
        })),
      };
    });

    res.json({ ok: true, loops, degraded: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '获取循环状态失败');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

export default router;
