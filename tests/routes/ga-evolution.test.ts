import { describe, it, expect } from 'vitest';

describe('routes/ga-evolution', () => {
  it('router 被正确导出', async () => {
    const mod = await import('../../src/routes/ga-evolution');
    expect(mod.default).toBeDefined();
    expect(typeof (mod.default as { get: unknown }).get).toBe('function');
  });

  it('包含 /ga/evolution 路径', async () => {
    const mod = await import('../../src/routes/ga-evolution');
    const router = mod.default as { stack?: Array<{ route?: { path: string } }> };
    const paths = (router.stack || [])
      .filter((l: unknown) => (l as { route?: { path: string } }).route?.path)
      .map((l: unknown) => (l as { route: { path: string } }).route.path);
    expect(paths).toContain('/ga/evolution');
  });

  it('HTML 中包含核心功能元素', async () => {
    const mod = await import('../../src/routes/ga-evolution');
    const stack = (mod.default as { stack: Array<{ route: { path: string }; handle: (req: unknown, res: { send: (html: string) => void }) => void }> }).stack;
    const handler = stack.find(l => l.route?.path === '/ga/evolution');
    expect(handler).toBeDefined();

    let renderedHtml = '';
    handler!.handle({} as never, { send: (h: string) => { renderedHtml = h; } } as never);

    expect(renderedHtml).toContain('进化引擎');
    expect(renderedHtml).toContain('proposals');
    expect(renderedHtml).toContain('approve');
  });
});
