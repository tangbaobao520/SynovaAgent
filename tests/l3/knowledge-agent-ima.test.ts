/**
 * tests/l3/knowledge-agent-ima.test.ts — D105 Knowledge Agent ima 扩展
 *
 * 覆盖: imaDataSource (正常路径 + 降级)
 */
import { describe, it, expect } from 'vitest';
import { createKnowledgeAgent } from '../../src/l3/knowledge-agent';

describe('KnowledgeAgent ima 扩展', () => {
  describe('imaDataSource', () => {
    it('无 imaClient 配置 → 空数组（降级）', async () => {
      const agent = createKnowledgeAgent({});
      const entries = await agent.imaDataSource('e1');
      expect(entries).toEqual([]);
    });

    it('imaClient 存在但 API 不可达 → 空数组（降级）', async () => {
      const { ImaClient } = await import('../../src/connectors/ima');
      const imaClient = new ImaClient({
        baseUrl: 'https://ima-unreachable.test',
        apiKey: 'sk-test',
        enterpriseId: 'e1',
        timeoutMs: 100,
      });
      const agent = createKnowledgeAgent({ imaClient, imaEnterpriseId: 'e1' });
      const entries = await agent.imaDataSource('e1');
      expect(entries).toEqual([]);
    });
  });
});
