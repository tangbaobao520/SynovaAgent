/**
 * tests/routes/admin-knowledge.test.ts — D241 知识审批 + D244 联邦知识 API 测试
 *
 * 覆盖（D391，dev doc §7.1 T1-T8）:
 *   T1 路由可导入 + server 挂载（保留，不回归）
 *   T2 路由注册完整性（8 路径/方法，audit.test.ts stack 遍历模式）
 *   T3 API 行为：pending 注入 mock → 200
 *   T4 API 行为：approve/reject 注入 mock → 200 + 调用参数断言
 *   T5 M3 兜底：不注入 + getDatabase throw → 500 degraded（不再 503，铁律 24/31）
 *   T6 federated 兜底：注入 mock → 200/201；不注入 → new FederatedPipeline() 内存态 → 200 空列表
 *   T7 接线（wire check）：getStore()/getPipeline() 生产调用计数 + 无 '../l4' import + 无 'not ready' 残留
 * (KnowledgeStore 内部方法测试在 tests/l4/knowledge-store-approval.test.ts)
 */
import { describe, it, expect, vi } from 'vitest';
import type { KnowledgeStore } from '../../src/agent/knowledge-bridge-service';
import type { FederatedPipeline } from '../../src/services/federated-pipeline';

// T5 确定性降级路径：getDatabase 模拟未初始化（不依赖测试顺序/全局 db 状态）
vi.mock('../../src/init/engine-context', () => ({
  getDatabase: () => {
    throw new Error('db not init');
  },
}));

/** express Router stack 最小类型（避免 as any，铁律 38） */
interface RouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: (req: unknown, res: unknown) => void }>;
  };
}
interface RouterLike {
  stack: RouteLayer[];
}

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeRes(): MockRes {
  const res: MockRes = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

/** 每个用例独立模块实例 — 隔离模块级 knowledgeStore/federatedPipeline 状态 */
async function loadMod() {
  vi.resetModules();
  return await import('../../src/routes/admin-knowledge');
}

function findHandler(router: RouterLike, path: string, method: 'get' | 'post') {
  const layer = router.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer?.route) throw new Error(`route not registered: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

describe('D241 Admin Knowledge Routes', () => {
  it('T1a admin-knowledge router 可导入', async () => {
    const mod = await import('../../src/routes/admin-knowledge');
    expect(mod.default).toBeDefined();
    expect(typeof mod.setKnowledgeStore).toBe('function');
    expect(typeof mod.setFederatedPipeline).toBe('function');
  });

  it('T1b server.ts 已挂载 admin-knowledge 路由', async () => {
    const fs = await import('fs');
    const server = fs.readFileSync('src/server.ts', 'utf-8');
    expect(server).toContain('admin-knowledge');
    expect(server).toContain('adminKnowledgeRoutes');
  });
});

describe('T2 路由注册完整性', () => {
  const expected: Array<[string, 'get' | 'post']> = [
    ['/api/admin/knowledge/pending', 'get'],
    ['/api/admin/knowledge/:id/approve', 'post'],
    ['/api/admin/knowledge/:id/reject', 'post'],
    ['/api/admin/knowledge/:id/mark-shareable', 'post'],
    ['/api/admin/knowledge/federated/pending', 'get'],
    ['/api/admin/knowledge/federated/:id/approve', 'post'],
    ['/api/admin/knowledge/federated/degraded', 'get'],
    ['/api/admin/knowledge/federated/ga-weight-drop', 'post'],
  ];

  it('Router stack 至少 7 个路由', async () => {
    const mod = await loadMod();
    const count = (mod.default as unknown as RouterLike).stack.filter((l) => l.route).length;
    expect(count).toBeGreaterThanOrEqual(7);
  });

  it.each(expected)('已注册 %s %s', async (path, method) => {
    const mod = await loadMod();
    const layer = (mod.default as unknown as RouterLike).stack.find(
      (l) => l.route?.path === path && l.route?.methods?.[method],
    );
    expect(layer).toBeTruthy();
  });
});

describe('T3/T4 API 行为 — 注入 mock 正常路径', () => {
  it('T3 GET pending 注入 mock → 200 + 数据形状', async () => {
    const mod = await loadMod();
    const store = {
      listPendingPkb: vi.fn().mockReturnValue([{ id: 'k1', snippet: 's' }]),
    } as unknown as KnowledgeStore;
    mod.setKnowledgeStore(store);

    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/pending', 'get');
    const res = makeRes();
    handler({ headers: {} }, res);

    expect(store.listPendingPkb).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: [{ id: 'k1', snippet: 's' }], count: 1 });
    expect(res.status).not.toHaveBeenCalledWith(503);
  });

  it('T3b 空 pending 列表 → 200 count 0（边界）', async () => {
    const mod = await loadMod();
    mod.setKnowledgeStore({ listPendingPkb: vi.fn().mockReturnValue([]) } as unknown as KnowledgeStore);

    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/pending', 'get');
    const res = makeRes();
    handler({ headers: {} }, res);

    expect(res.json).toHaveBeenCalledWith({ ok: true, data: [], count: 0 });
  });

  it('T4 POST approve 注入 mock → 200 + 调用参数断言', async () => {
    const mod = await loadMod();
    const approvePkb = vi.fn();
    mod.setKnowledgeStore({ approvePkb } as unknown as KnowledgeStore);

    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/:id/approve', 'post');
    const res = makeRes();
    handler({ params: { id: 'k1' }, headers: { 'x-user-id': 'tester' }, body: {} }, res);

    expect(approvePkb).toHaveBeenCalledWith('k1', 'tester');
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: { id: 'k1', status: 'approved' } });
  });

  it('T4b POST reject 注入 mock → 200 + 默认审批人/原因（边界）', async () => {
    const mod = await loadMod();
    const rejectPkb = vi.fn();
    mod.setKnowledgeStore({ rejectPkb } as unknown as KnowledgeStore);

    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/:id/reject', 'post');
    const res = makeRes();
    handler({ params: { id: 'k2' }, headers: {}, body: {} }, res);

    expect(rejectPkb).toHaveBeenCalledWith('k2', 'admin', 'No reason provided');
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: { id: 'k2', status: 'rejected', reason: 'No reason provided' } });
  });
});

describe('T5 M3 兜底 — 不注入 + DB 未初始化 → 500 degraded（不再 503）', () => {
  it('GET pending 不注入 → getDatabase throw → 500 + degraded:true', async () => {
    const mod = await loadMod(); // 不调 setKnowledgeStore
    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/pending', 'get');
    const res = makeRes();
    handler({ headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, degraded: true }),
    );
  });

  it('POST approve 不注入 → 500 + degraded:true（同款兜底覆盖）', async () => {
    const mod = await loadMod();
    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/:id/approve', 'post');
    const res = makeRes();
    handler({ params: { id: 'k9' }, headers: {}, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, degraded: true }),
    );
  });
});

describe('T6 federated 兜底 — 注入/不注入均可用（不再 503）', () => {
  it('T6a GET federated/pending 注入 mock → 200 合并两状态列表', async () => {
    const mod = await loadMod();
    const listByStatus = vi.fn().mockReturnValue([{ id: 'f1' }]);
    mod.setFederatedPipeline({ listByStatus } as unknown as FederatedPipeline);

    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/federated/pending', 'get');
    const res = makeRes();
    handler({ headers: {} }, res);

    expect(listByStatus).toHaveBeenCalledWith('pending_admin');
    expect(listByStatus).toHaveBeenCalledWith('pending_ga');
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: [{ id: 'f1' }, { id: 'f1' }], count: 2 });
  });

  it('T6b GET federated/pending 不注入 → new FederatedPipeline() 内存态 → 200 空列表', async () => {
    const mod = await loadMod(); // 不调 setFederatedPipeline
    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/federated/pending', 'get');
    const res = makeRes();
    handler({ headers: {} }, res);

    expect(res.status).not.toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: [], count: 0 });
  });

  it('T6c POST mark-shareable 注入 mock → 201', async () => {
    const mod = await loadMod();
    const markShareable = vi.fn().mockReturnValue({ id: 'fed-1', status: 'pending_admin' });
    mod.setFederatedPipeline({ markShareable } as unknown as FederatedPipeline);

    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/:id/mark-shareable', 'post');
    const res = makeRes();
    handler({ params: { id: 'k1' }, headers: {}, body: { text: 'hello', orgId: 'org1' } }, res);

    expect(markShareable).toHaveBeenCalledWith('k1', 'hello', 'org1');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('T6d POST mark-shareable 缺 text/orgId → 400 VALIDATION_ERROR（校验不回归）', async () => {
    const mod = await loadMod();
    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/:id/mark-shareable', 'post');
    const res = makeRes();
    handler({ params: { id: 'k1' }, headers: {}, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, code: 'VALIDATION_ERROR' }),
    );
  });

  it('T6e POST ga-weight-drop 注入 mock → 200 + 缺 gaUserId 400（边界）', async () => {
    const mod = await loadMod();
    const checkGaWeightDrop = vi.fn().mockReturnValue(3);
    mod.setFederatedPipeline({ checkGaWeightDrop } as unknown as FederatedPipeline);

    const handler = findHandler(mod.default as unknown as RouterLike, '/api/admin/knowledge/federated/ga-weight-drop', 'post');
    const res = makeRes();
    handler({ params: {}, headers: {}, body: { gaUserId: 'ga-7' } }, res);
    expect(checkGaWeightDrop).toHaveBeenCalledWith('ga-7');
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: { gaUserId: 'ga-7', affectedEntries: 3 } });

    const res2 = makeRes();
    handler({ params: {}, headers: {}, body: {} }, res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });
});

describe('T7 接线（wire check）— grep 物理断言', () => {
  it('getStore()/getPipeline() 被生产 handler 调用 + 无跨层 import + 无 503 守卫残留', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/routes/admin-knowledge.ts', 'utf-8');

    expect(src).not.toContain("from '../l4");
    expect(src).toContain("from '../agent/knowledge-bridge-service'");
    expect(src).not.toContain('not ready');

    // getStore: pending/approve/reject ≥3 个 handler 调用；getPipeline: ≥5 个 handler 调用（dev doc §8）
    expect((src.match(/getStore\(\)/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((src.match(/getPipeline\(\)/g) || []).length).toBeGreaterThanOrEqual(5);
  });
});
