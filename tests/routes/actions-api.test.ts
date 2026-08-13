import { describe, it, expect } from 'vitest';
import type { Router } from 'express';

describe('actions-api', () => {
  let router: Router;
  beforeAll(async () => { router = (await import('../../src/routes/actions-api')).default; });
  it('模块导出', () => { expect(router).toBeDefined(); });

  it('POST /api/actions → 创建成功', async () => {
    const handler = (router as any).stack[0].route.stack[0].handle;
    let body: any = null;
    await handler({ body: { workspaceId: 'ws1', title: '修复现金流' } }, { json: (b: any) => { body = b; } });
    expect(body.ok).toBe(true);
    expect(body.action.status).toBe('pending');
    expect(body.action.title).toBe('修复现金流');
  });

  it('POST 缺字段 → 400', async () => {
    const handler = (router as any).stack[0].route.stack[0].handle;
    let status = 0; let body: any = null;
    const res = { status: (s: number) => { status = s; return { json: (b: any) => { body = b; } }; } };
    await handler({ body: {} }, res);
    expect(status).toBe(400);
  });

  it('PUT status → 流转成功', async () => {
    // First create
    const postHandler = (router as any).stack[0].route.stack[0].handle;
    let created: any = null;
    await postHandler({ body: { workspaceId: 'ws1', title: '测试' } }, { json: (b: any) => { created = b; } });

    // Then update
    const putHandler = (router as any).stack[2].route.stack[0].handle;
    let updated: any = null;
    await putHandler({ params: { id: created.action.id }, body: { status: 'confirmed' } }, { json: (b: any) => { updated = b; } });
    expect(updated.ok).toBe(true);
    expect(updated.action.status).toBe('confirmed');
  });

  it('GET → 列表过滤', async () => {
    const handler = (router as any).stack[1].route.stack[0].handle;
    let body: any = null;
    await handler({ query: { workspaceId: 'ws1' } }, { json: (b: any) => { body = b; } });
    expect(body.ok).toBe(true);
    expect(body.actions.length).toBeGreaterThanOrEqual(1);
  });
});
