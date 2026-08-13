/**
 * routes/reload.ts — 热加载端点 (Phase 0 文件优先范式)
 *
 * POST /api/reload — 重新扫描文件目录, 重新加载专家定义。
 * 不需要重启进程。FDE 改完 SOUL.md 后调用此端点即可生效。
 *
 * 铁律 31: reload 失败返回 degraded 标记, 不影响已运行的引擎。
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';
import type { FileScanner } from '../agent/file-scanner';
import type { ExpertFileLoader } from '../agent/expert-file-loader';
// 铁律 39: L1 不直接引用 L3。ExpertRegistry 由 app.locals DI 注入，运行时由 L2 调用。
// 此处仅需 existence check，不需要具体类型。

const log = createLogger('routes/reload');
const router = Router();

// v3.3 F3: DEFAULT_EXPERT_PROMPTS 已删除。文件优先——无fallback。

router.post('/api/reload', async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const report: string[] = [];

  try {
    // 从 app.locals 获取注入的组件
    const scanner = req.app.locals?.fileScanner as FileScanner | undefined;
    const loader = req.app.locals?.expertFileLoader as ExpertFileLoader | undefined;
    const registry = req.app.locals?.container?.expertRegistry as { getPrompt?: (type: string) => string | null } | undefined;

    if (!scanner) {
      res.status(500).json({ ok: false, error: 'FileScanner 未初始化', code: 'SCANNER_NOT_READY', degraded: true });
      return;
    }

    // 1. 重新扫描文件
    const index = scanner.scan();
    report.push(`扫描完成: ${index.experts.length} 个专家, ${index.measurers.length} 个测量器, ${index.knowledge.length} 个知识库`);
    if (index.errors.length > 0) {
      report.push(`⚠️ ${index.errors.length} 个文件读取失败`);
    }

    // 2. v3.3: 清除 yaml 配置缓存
    const { clearExpertConfigCache, loadExpertConfig } = await import('../agent/expert-config-loader');
    clearExpertConfigCache();
    loadExpertConfig(); // 重新加载

    // 3. 重新加载专家文件
    if (loader && registry) {
      const result = loader.loadFromIndex(index, {}); // v3.3: 无fallback
      report.push(`专家加载: ${result.fromFiles} 从文件, ${result.fromDefaults} 默认, ${result.errors.length} 失败`);
    }

    const durationMs = Date.now() - startedAt;
    log.info({ durationMs, experts: index.experts.length }, '/api/reload 完成');

    res.json({
      ok: true,
      durationMs,
      scannedAt: index.scannedAt,
      summary: {
        experts: index.experts.length,
        measurers: index.measurers.length,
        knowledgeIndustries: index.knowledge.length,
        fileErrors: index.errors.length,
      },
      report,
      errors: index.errors.slice(0, 10), // 最多返回前 10 个错误
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg, code: 'RELOAD_FAILED', phase: 'runtime', retryable: true }, '/api/reload 失败');
    res.status(500).json({
      ok: false,
      error: msg,
      code: 'RELOAD_FAILED',
      degraded: true,
      durationMs: Date.now() - startedAt,
    });
  }
});

export default router;
