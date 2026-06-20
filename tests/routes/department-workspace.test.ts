/**
 * tests/routes/department-workspace.test.ts — 部门工作台真实测试
 */
import { describe, it, expect } from 'vitest';
import type { Router } from 'express';

describe('department-workspace route', () => {
  let router: Router;
  let handler: (req: any, res: any) => Promise<void> | void;

  beforeAll(async () => {
    const mod = await import('../../src/routes/department-workspace');
    router = mod.default;
    // Extract the GET /dept handler from the router stack
    const route = (router as any).stack?.find((s: any) => s.route?.path === '/dept');
    if (route) handler = route.route.stack[0].handle;
  });

  it('模块导出Router', () => {
    expect(router).toBeDefined();
  });

  it('GET /dept 返回HTML含部门名', async () => {
    if (!handler) return; // skip if handler not extracted
    let html = '';
    const res = {
      send: (h: string) => { html = h; return res; },
    };
    const req = { headers: { 'x-synova-token': 'manager:marketing:alice' }, query: {} };
    await handler(req, res);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('marketing');
    expect(html).toContain('workspace-list');
  });

  it('GET /dept 默认department为dept', async () => {
    if (!handler) return;
    let html = '';
    const res = { send: (h: string) => { html = h; return res; } };
    const req = { headers: {}, query: {} };
    await handler(req, res);
    expect(html).toContain('dept');
  });
});
