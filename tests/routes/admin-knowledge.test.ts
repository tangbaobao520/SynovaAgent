/**
 * tests/routes/admin-knowledge.test.ts — D241 知识审批测试
 *
 * 覆盖: approvePkb/rejectPkb API 接线 = 2 tests
 * (KnowledgeStore 内部方法测试在 tests/l4/knowledge-store-approval.test.ts)
 */
import { describe, it, expect } from 'vitest';

describe('D241 Admin Knowledge Routes', () => {
  it('admin-knowledge router 可导入', async () => {
    const mod = await import('../../src/routes/admin-knowledge');
    expect(mod.default).toBeDefined();
    expect(typeof mod.setKnowledgeStore).toBe('function');
  });

  it('server.ts 已挂载 admin-knowledge 路由', async () => {
    // 验证 server.ts 包含 admin-knowledge 引用
    const fs = await import('fs');
    const server = fs.readFileSync('src/server.ts', 'utf-8');
    expect(server).toContain('admin-knowledge');
    expect(server).toContain('adminKnowledgeRoutes');
  });
});
