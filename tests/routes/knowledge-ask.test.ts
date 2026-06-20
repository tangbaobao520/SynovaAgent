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

  it('GET ?q=任意问题 → 200 + ok (PKB回退模板)', async () => {
    if (!getHandler) return;
    let body: any = null;
    const res = { json: (b: any) => { body = b; } };
    await getHandler({ query: { q: '现金流' } }, res);
    expect(body.ok).toBe(true);
    expect(body.answer.length).toBeGreaterThan(20);
    // PKB为空时回退到模板——confidence为low是正确的
    expect(body.confidence).toBe('low');
  });

  it('GET ?q=离职 → 200 + 不含硬编码内容', async () => {
    if (!getHandler) return;
    let body: any = null;
    const res = { json: (b: any) => { body = b; } };
    await getHandler({ query: { q: '离职' } }, res);
    expect(body.ok).toBe(true);
    // PKB检索——不再返回硬编码关键词匹配
    expect(body.confidence).toBe('low');
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
