/**
 * routes/loops.ts — 循环状态 API 端点 (D20 v2 — 修复版)
 *
 * GET /api/loops/status — 返回全部 6 个循环的当前状态
 * JWT 认证保护。
 *
 * 降级: MainAgent 不可用 → 返回空列表 + degraded:true
 * 铁律 24+31: catch + log + degraded
 * 铁律 38: 零 as any
 */
import { Router } from 'express';
import { createLogger } from '@synova/logger';
import { jwtAuthMiddleware } from '../middleware/auth';

const log = createLogger('routes/loops');
const router = Router();

// ═══ Types ═══

interface ScaleConfig {
  name: string;
  triggerType: string;
  period: string;
}

interface ExecutionRecord {
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs: number;
}

interface LoopItem {
  config: { loopId: string; loopName: string; scales: ScaleConfig[] };
  lastExecution?: ExecutionRecord;
  executionCount: number;
  history?: ExecutionRecord[];
}

interface MainAgentLike {
  listLoops(): LoopItem[];
  getLoopHistory?(loopId: string): ExecutionRecord[];
  executeLoop?(loopId: string): Promise<{ ok: boolean; error?: string }>;
}

// ═══ 依赖注入 ═══

let mainAgent: MainAgentLike | null = null;

export function setMainAgent(agent: MainAgentLike): void {
  mainAgent = agent;
}

// ═══ 辅助函数 ═══

/**
 * 推算下次触发时间（简化实现）。
 * cron: 基于 period 字符串推算
 * event: 等待事件触发（返回 null）
 * hybrid: 按最短周期推算
 */
export function computeNextTrigger(triggerType: string, period: string): string | null {
  if (triggerType === 'event') return null;
  const now = Date.now();
  const match = period.match(/(\d+)\s*(s|m|h|d)/);
  if (!match) return new Date(now + 3600000).toISOString(); // default 1h

  const val = parseInt(match[1], 10);
  const unit = match[2];
  const ms = unit === 's' ? val * 1000 : unit === 'm' ? val * 60000 : unit === 'h' ? val * 3600000 : val * 86400000;
  return new Date(now + ms).toISOString();
}

// ═══ Routes ═══

/**
 * GET /api/loops/status
 * 返回所有已注册循环的状态（含下次触发时间）。
 */
router.get('/api/loops/status', jwtAuthMiddleware, (_req, res) => {
  try {
    if (!mainAgent) {
      res.json({ ok: true, loops: [], degraded: true, message: 'MainAgent not ready' });
      return;
    }

    const loops = mainAgent.listLoops().map(loop => ({
      loopId: loop.config.loopId,
      loopName: loop.config.loopName,
      status: loop.lastExecution?.status || 'pending',
      executionCount: loop.executionCount,
      lastExecution: loop.lastExecution ? {
        status: loop.lastExecution.status,
        startedAt: loop.lastExecution.startedAt,
        completedAt: loop.lastExecution.completedAt,
        durationMs: loop.lastExecution.durationMs,
      } : null,
      scales: loop.config.scales.map(s => ({
        name: s.name,
        triggerType: s.triggerType,
        period: s.period,
        status: 'pending',
        nextAt: computeNextTrigger(s.triggerType, s.period),
      })),
    }));

    res.json({ ok: true, loops, degraded: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Failed to get loop status');
    res.status(500).json({ ok: false, loops: [], error: msg, degraded: true });
  }
});

// ═══ GET /api/loops/:id/history — 循环执行历史 (D20 v2) ═══

router.get('/api/loops/:id/history', jwtAuthMiddleware, (req, res) => {
  try {
    const loopId = req.params.id as string;
    if (!mainAgent || !mainAgent.getLoopHistory) {
      res.json({ ok: true, loopId, history: [], degraded: true });
      return;
    }
    const history = mainAgent.getLoopHistory(loopId) || [];
    res.json({ ok: true, loopId, history: history.slice(0, 10) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Failed to get loop history');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

// ═══ POST /api/loops/:id/execute — 手动触发循环 (D20 v2) ═══

router.post('/api/loops/:id/execute', jwtAuthMiddleware, async (req, res) => {
  try {
    const loopId = req.params.id as string;
    if (!mainAgent || !mainAgent.executeLoop) {
      res.status(400).json({ ok: false, error: 'MainAgent not ready', degraded: true });
      return;
    }
    const result = await mainAgent.executeLoop(loopId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'Failed to execute loop');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

export default router;
