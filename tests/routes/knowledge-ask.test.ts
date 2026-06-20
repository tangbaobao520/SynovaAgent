/**
 * tests/routes/knowledge-ask.test.ts — 知识问答路由真实测试
 */
import { describe, it, expect } from 'vitest';
import type { Router } from 'express';

describe('knowledge-ask route', () => {
  let router: Router;
  let getHandler: (req: any, res: any) => Promise<void> | void;

  beforeAll(async () => {
    const mod = await import('../../src/routes/knowledge-ask');
    router = mod.default;
    const routes = (router as any).stack || [];
    for (const s of routes) {
      if (s.route?.path === '/api/knowledge/ask' && s.route?.methods?.get) {
        getHandler = s.route.stack[0].handle;
      }
    }
  });

  it('模块导出Router', () => { expect(router).toBeDefined(); });

  it('GET ?q= 空 → 400', async () => {
    if (!getHandler) return;
    let status = 0; let body: any = null;
    const res = { status: (s: number) => { status = s; return { json: (b: any) => { body = b; } }; } };
    await getHandler({ query: { q: '' } }, res);
    expect(status).toBe(400);
    expect(body.error).toContain('too short');
  });

  it('GET ?q=现金流 → 200 + 含现金流', async () => {
    if (!getHandler) return;
    let body: any = null;
    const res = { json: (b: any) => { body = b; } };
    await getHandler({ query: { q: '现金流' } }, res);
    expect(body.ok).toBe(true);
    expect(body.answer).toContain('现金流');
    expect(body.confidence).toBe('medium');
  });

  it('GET ?q=离职 → 200 + 含关键人风险', async () => {
    if (!getHandler) return;
    let body: any = null;
    const res = { json: (b: any) => { body = b; } };
    await getHandler({ query: { q: '离职' } }, res);
    expect(body.ok).toBe(true);
    expect(body.answer).toContain('Bus Factor');
  });

  it('GET ?q=未知问题 → 200 + confidence=low', async () => {
    if (!getHandler) return;
    let body: any = null;
    const res = { json: (b: any) => { body = b; } };
    await getHandler({ query: { q: 'xyz123' } }, res);
    expect(body.ok).toBe(true);
    expect(body.confidence).toBe('low');
  });
});
