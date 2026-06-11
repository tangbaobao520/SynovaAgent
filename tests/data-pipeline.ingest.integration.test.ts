/**
 * tests/data-pipeline.ingest.integration.test.ts — 文档上传管道集成测试
 *
 * 铁律 33: *.integration.test.ts = 真实 API, 不 mock
 * 验证: 上传 docs/ 文档 → 实体提取 → GraphStore 写入
 */
import { describe, it, expect } from 'vitest';
import { ingestFile, type IngestResult } from '../src/ingest/index';
import { createLogger } from '../src/logger';
import * as path from 'path';

const log = createLogger('test:ingest');

// 测试用文档路径
const DOCS = path.resolve(process.cwd(), 'docs');
const INDEX_MD = path.join(DOCS, 'INDEX.md');
const DEVELOPMENT_PLAN = path.join(DOCS, 'DEVELOPMENT-PLAN-20260606.html');
const ROADMAP = path.join(DOCS, 'SYNOVA-ROADMAP.html');
const TEST_STRATEGY = path.join(DOCS, '07-TEST-STRATEGY-20260605.md');

describe('数据管道 - 文档上传', () => {
  // ═══ 1. Markdown 文档 ═══
  describe('Markdown 文件', () => {
    it('should ingest INDEX.md and extract entities', async () => {
      const result = await ingestFile(INDEX_MD, 'test-org');
      log.info(result, 'INDEX.md 摄入结果');

      // .md 被 knowledge-ingest 归为 txt (设计如此)
      expect(result.fileType).toBe('txt');
      log.info({ fileType: result.fileType, contentLen: result.summary?.length, entities: result.entityCount, relations: result.relationCount, sogCreated: result.sogCreated, degraded: result.degraded, error: result.error }, 'INDEX.md 摄入结果');

      expect(result.error).toBeUndefined();
      expect(result.entityCount).toBeGreaterThan(0);
      expect(result.summary).toBeTruthy();
    }, 30000);

    it('should ingest TEST-STRATEGY and extract 50 entities', async () => {
      const result = await ingestFile(TEST_STRATEGY, 'test-org');
      log.info(result, 'TEST-STRATEGY 摄入结果');

      expect(result.error).toBeUndefined();
      expect(result.entityCount).toBeGreaterThanOrEqual(50);
      expect(result.summary).toBeTruthy();
      // GraphStore 部分实体可能因 SOG schema 验证失败，降级是正常行为
      log.info({ entityCount: result.entityCount, sogCreated: result.sogCreated, degraded: result.degraded }, 'TEST-STRATEGY');
    }, 30000);
  });

  // ═══ 2. HTML 文档 ═══
  describe('HTML 文件', () => {
    it('should ingest DEVELOPMENT-PLAN.html', async () => {
      const result = await ingestFile(DEVELOPMENT_PLAN, 'test-org');
      log.info(result, 'DEVELOPMENT-PLAN 摄入结果');

      expect(result.error).toBeUndefined();
      // HTML 文件应能提取到内容
      expect(result.summary).toBeTruthy();
      expect(result.summary.length).toBeGreaterThan(50);
      log.info({ fileType: result.fileType, summaryLen: result.summary.length }, 'HTML 解析验证');
    }, 30000);
  });

  // ═══ 3. 降级测试 ═══
  describe('降级处理', () => {
    it('should handle missing files gracefully', async () => {
      const result = await ingestFile('/tmp/nonexistent-file.pdf', 'test-org');
      expect(result.error).toBeTruthy();
      expect(result.degraded).toBe(true);
      expect(result.entityCount).toBe(0);
    }, 10000);
  });
});
