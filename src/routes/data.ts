/**
 * data.ts — 数据上传 API (L1)
 *
 * POST /api/data/upload — 上传结构化数据 → 写入 L4 GraphStore
 *
 * 铁律39: L1 → L2 interfaces only.
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import { getPIIScrubber } from '../security/pii-scrubber';

const log = createLogger('routes/data');
const router = Router();

router.post('/api/data/upload', async (req: Request, res: Response) => {
  const { mapping, rows, graph } = req.body as {
    mapping?: string;
    rows?: Array<Record<string, unknown>>;
    graph?: string;
  };

  if (!mapping) {
    return res.status(400).json({ ok: false, error: 'mapping 必填 (字段映射配置名)' });
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ ok: false, error: 'rows 必填 (至少一行数据)' });
  }

  try {
    const { loadFieldMapping, ingestBatch } = await import('../agent/data-ingest-service');
    const config = loadFieldMapping(mapping);
    if (!config) {
      return res.status(400).json({ ok: false, error: `字段映射配置不存在: ${mapping}` });
    }

    // 从请求上下文获取 GraphStore (通过 server.ts 注入)
    const graphStore = (req.app.locals?.graphStore as { createNode?: Function } | undefined);
    if (!graphStore || typeof graphStore.createNode !== 'function') {
      return res.status(503).json({ ok: false, error: 'GraphStore 不可用' });
    }

    // D34: PII S4预检 — 检测密码/Token/私钥，含则拒绝写入
    const scrubber = getPIIScrubber();
    for (const row of rows) {
      for (const val of Object.values(row)) {
        if (typeof val === 'string') {
          const result = scrubber.scrub(val, 'S4');
          if (result.matches.length > 0) {
            log.warn({ s4Type: result.matches[0].type }, '上传含S4敏感信息，拒绝写入');
            return res.status(422).json({
              ok: false, error: `数据包含S4敏感信息(${result.matches[0].type})，拒绝写入`,
            });
          }
        }
      }
    }

    const result = await ingestBatch(
      graphStore as { createNode(type: string, props: Record<string, unknown>, graph: string): string },
      config,
      rows,
      graph || 'default',
    );

    log.info({ mapping, rows: rows.length, created: result.nodesCreated }, '数据上传完成');
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, '数据上传失败');
    res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
