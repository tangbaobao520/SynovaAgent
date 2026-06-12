/**
 * routes/knowledge.ts — 知识库 API (M1-Slice3)
 *
 * POST /api/knowledge/search — 全文搜索 + 权限过滤
 * POST /api/knowledge/ingest — 写入知识片段
 * GET  /api/knowledge/stats — 存储统计
 *
 * 铁律 39: L1 交互层，委托 L4 KnowledgeStore 执行查询
 */
import { Router, type Request, type Response } from 'express';
import { KnowledgeStore } from '../agent/knowledge-bridge-service';
import { getDatabase } from '../init/engine-context';
import { getCurrentFilterClause } from '../services/request-context';
import { createLogger } from '../logger';
import type { KnowledgeChunk, FilterClause } from '../agent/knowledge-bridge-service';

const log = createLogger('routes/knowledge');
const router = Router();

function getStore(): KnowledgeStore {
  return new KnowledgeStore(getDatabase());
}

// ═══ 搜索 ═══

router.post('/api/knowledge/search', async (req: Request, res: Response) => {
  try {
    const { query, limit } = req.body as { query?: string; limit?: number };
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ ok: false, error: '缺少 query 参数' });
    }

    const store = getStore();
    const filter = await getCurrentFilterClause('KnowledgeChunk') as FilterClause;

    const { results, stats } = store.search(query, filter, limit || 10);

    // 审计日志 (如果有 userId)
    const userId = (req as unknown as Record<string, unknown>).userId as string || 'anonymous';
    store.auditLog('knowledge_query', userId, query, stats);

    res.json({
      ok: true,
      query,
      results: results.map(r => ({
        id: r.id,
        snippet: r.snippet,
        sourceType: r.sourceType,
        authorityLevel: r.authorityLevel,
        createdAt: r.createdAt,
      })),
      stats,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '知识库搜索失败');
    res.status(500).json({ ok: false, error: msg });
  }
});

// ═══ 写入 ═══

router.post('/api/knowledge/ingest', (req: Request, res: Response) => {
  try {
    const { text, sourceType, sourceId, authorityLevel, accessLevel, accessTeamId, accessSensitivity } = req.body as Record<string, string>;
    if (!text || !sourceType || !sourceId) {
      return res.status(400).json({ ok: false, error: '缺少必填字段: text, sourceType, sourceId' });
    }

    const store = getStore();
    const id = store.insert({
      text,
      sourceType,
      sourceId,
      authorityLevel: (authorityLevel as KnowledgeChunk['authorityLevel']) || 'reference',
      accessLevel: (accessLevel as KnowledgeChunk['accessLevel']) || 'private',
      accessTeamId,
      accessSensitivity: (accessSensitivity as KnowledgeChunk['accessSensitivity']) || 'normal',
    });

    res.json({ ok: true, id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// ═══ 统计 ═══

router.get('/api/knowledge/stats', (_req: Request, res: Response) => {
  try {
    const store = getStore();
    res.json({ ok: true, ...store.stats() });
  } catch (err: unknown) {
    res.json({ ok: true, totalChunks: 0, totalSizeBytes: 0 });
  }
});

export default router;
