/**
 * routes/import.ts — 数据导入 API (D231)
 *
 * POST /api/import/csv — 接收 CSV 内容 → CsvImportConnector → GraphStore
 * JWT 认证保护。
 *
 * 降级: CsvImportConnector 不可用 → 500 + degraded
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { jwtAuthMiddleware } from '../middleware/auth';
import { CsvImportConnector, type GraphBridgeLike } from '../connectors/csv-import';

const log = createLogger('routes/import');
const router = Router();

let graphBridge: GraphBridgeLike | null = null;

export function setGraphBridge(bridge: GraphBridgeLike): void {
  graphBridge = bridge;
}

router.post('/api/import/csv', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!graphBridge) {
      return res.status(500).json({ ok: false, error: 'GraphStore not ready', degraded: true });
    }
    const { content } = req.body as { content?: string };
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', message: 'content 必填' });
    }

    const connector = new CsvImportConnector(graphBridge);
    const result = connector.importData(content);

    log.info({ imported: result.imported, warnings: result.warnings.length }, 'CSV 导入完成');
    res.json({ ok: true, imported: result.imported, warnings: result.warnings, degraded: result.degraded });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'CSV 导入异常');
    res.status(500).json({ ok: false, error: msg, degraded: true });
  }
});

export default router;
