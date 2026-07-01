/**
 * routes/evolution.ts — L0 进化引擎管理 API (L1)
 *
 * 提供 FDE（前线部署工程师）操作 L0 进化引擎的 HTTP 接口：
 *   GET    /api/evolution/proposals            — 列出提案（可选 ?status=）
 *   POST   /api/evolution/proposals/:id/approve — 审批通过
 *   POST   /api/evolution/proposals/:id/reject  — 拒绝
 *   POST   /api/evolution/aggregate/:industry   — 手动触发行业聚合
 *
 * 铁律 39: L1 不直接调用 L4，所有 L4 调用通过 L0 包的惰性 import 完成。
 * 铁律 24+31: 每个 catch 有 log + degraded，单端点失败不阻断服务器。
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/evolution');
const router = Router();

// ═══ 辅助：惰性加载 L0 模块 ═══

async function loadL0() {
  return await import('@synova/evolution');
}

async function loadMemoryStore() {
  const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
  const { getDatabase } = await import('../init/engine-context');
  const db = getDatabase();
  return getAgentMemoryStore(db);
}

async function loadL3API() {
  const { getGlobalSentinelRunner } = await import('../sentinel/runner');
  const runner = getGlobalSentinelRunner();
  if (!runner) return null;
  return runner.getL0API();
}

// ═══ GET /api/evolution/proposals ═══

/**
 * 列出所有提案，可选按 status 过滤。
 * Query params: ?status=pending|approved|rejected|applied
 */
router.get('/api/evolution/proposals', async (req: Request, res: Response) => {
  try {
    const { listProposals } = await loadL0();
    const memoryStore = await loadMemoryStore();
    const status = req.query.status as string | undefined;
    const proposals = listProposals(
      memoryStore as unknown as import('@synova/evolution').AgentMemoryStoreLike,
      status as import('@synova/evolution').ProposalStatus | undefined,
    );
    res.json({ ok: true, proposals, count: proposals.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'GET /api/evolution/proposals 失败');
    res.status(500).json({ ok: false, error: '获取提案列表失败', degraded: true });
  }
});

// ═══ POST /api/evolution/proposals/:id/approve ═══

/**
 * 审批通过一个 pending 提案。
 * 触发: snapshot → gradualRollout(10%) → 标记 approved
 */
// ═══ GET /api/evolution/status ═══

/**
 * 进化引擎运行状态。返回 metrics 快照 + 操作日志。
 * 零外部依赖，纯内存计数器。
 */
router.get('/api/evolution/status', async (_req: Request, res: Response) => {
  try {
    const { EvolutionMetrics } = await import('@synova/evolution');
    const metrics = EvolutionMetrics.getInstance();
    const snapshot = metrics.getSnapshot();
    res.json({ ok: true, ...snapshot });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, 'GET /api/evolution/status 失败 — degraded');
    res.status(200).json({ ok: true, degraded: true, counters: {}, recentLogs: [] });
  }
});

// ═══ POST /api/evolution/proposals/:id/approve ═══

router.post('/api/evolution/proposals/:id/approve', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const { approveProposal, RuleVersionManager } = await loadL0();
    const memoryStore = await loadMemoryStore();
    const l3 = await loadL3API();
    if (!l3) {
      res.status(503).json({ ok: false, error: 'L3WriteAPI 不可用', degraded: true });
      return;
    }

    const rvm = new RuleVersionManager(
      memoryStore as unknown as import('@synova/evolution').AgentMemoryStoreLike,
    );

    const orgPool = req.body?.orgPool as string[] | undefined;
    const proposal = await approveProposal(
      memoryStore as unknown as import('@synova/evolution').AgentMemoryStoreLike,
      id,
      l3,
      rvm,
      orgPool,
    );

    if (!proposal) {
      res.status(404).json({ ok: false, error: '提案不存在或状态不允许审批' });
      return;
    }

    const { EvolutionMetrics } = await import('@synova/evolution');
    EvolutionMetrics.getInstance().recordProposalApprove(id);

    res.json({ ok: true, proposal });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, proposalId: id }, 'POST proposal/approve 失败');
    res.status(500).json({ ok: false, error: '审批失败', degraded: true });
  }
});

// ═══ POST /api/evolution/proposals/:id/reject ═══

router.post('/api/evolution/proposals/:id/reject', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  try {
    const { rejectProposal } = await loadL0();
    const memoryStore = await loadMemoryStore();
    const proposal = await rejectProposal(
      memoryStore as unknown as import('@synova/evolution').AgentMemoryStoreLike,
      id,
    );
    if (!proposal) {
      res.status(404).json({ ok: false, error: '提案不存在或状态不允许拒绝' });
      return;
    }

    const { EvolutionMetrics } = await import('@synova/evolution');
    EvolutionMetrics.getInstance().recordProposalReject(id);

    res.json({ ok: true, proposal });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, proposalId: id }, 'POST proposal/reject 失败');
    res.status(500).json({ ok: false, error: '拒绝失败', degraded: true });
  }
});

// ═══ POST /api/evolution/aggregate/:industry ═══

/**
 * 手动触发行业阈值聚合。
 * 聚合结果自动写入 extensions/industries/{name}/thresholds.json，
 * 同时生成 EvolutionProposal 供 FDE 审批。
 */
router.post('/api/evolution/aggregate/:industry', async (req: Request, res: Response) => {
  const { industry } = req.params as { industry: string };
  try {
    const {
      aggregateIndustryBaseline, generateThresholdProposal,
    } = await loadL0();
    const l3 = await loadL3API();
    if (!l3) {
      res.status(503).json({ ok: false, error: 'L3WriteAPI 不可用', degraded: true });
      return;
    }

    const memoryStore = await loadMemoryStore();
    const baseline = await aggregateIndustryBaseline(
      industry,
      l3,
    );

    // 如果有阈值建议，生成提案
    let proposal = null;
    if (baseline.thresholdSuggestions.length > 0) {
      proposal = await generateThresholdProposal(
        industry,
        baseline.thresholdSuggestions,
        memoryStore as unknown as import('@synova/evolution').AgentMemoryStoreLike,
      );
    }

    res.json({
      ok: true,
      baseline: {
        industry: baseline.industry,
        sentinelStats: baseline.sentinelStats.length,
        suggestions: baseline.thresholdSuggestions.length,
      },
      proposal,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, industry }, 'POST aggregate 失败');
    res.status(500).json({ ok: false, error: '聚合失败', degraded: true });
  }
});

export default router;
