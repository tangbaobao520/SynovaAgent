/**
 * tests/routes/overflow-mount.test.ts — D478 overflow 路由生产挂载 + graphStore 注入接线测试
 *
 * 覆盖 4: ①app.use(overflowRoutes) 挂载存在（修复前仅 import，三端点 404 不可达）
 *         ②挂载点在 404 兜底 handler 之前（挂载在兜底之后 = 永远 404 静默失效）
 *         ③setOverflowGraphStore 生产注入且实参为 graphStore（修复前零生产调用 → 恒 503）
 *         ④注入先于 app.listen（server 接受首个请求前完成，无首请求 503 竞态）
 * 先例: 静态接线断言 tests/routes/ga-enterprise.test.ts（D281 server.ts 断言）。
 * 约束: 零 as any；D476 的 tests/routes/overflow.test.ts 只读回归（verify-parallel 契约，写集零重叠）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const serverSrc = readFileSync('src/server.ts', 'utf-8');

describe('D478 — overflow 路由挂载 + graphStore 生产注入', () => {
  it('① server.ts 挂载 overflowRoutes（修复前仅 import，三端点 404 不可达）', () => {
    expect(serverSrc).toContain('app.use(overflowRoutes)');
  });

  it('② 挂载点位于 404 兜底 handler 之前（挂载在兜底之后 = 永远 404）', () => {
    const mountIdx = serverSrc.indexOf('app.use(overflowRoutes)');
    const notFoundIdx = serverSrc.indexOf('app.use((_req, res)');
    expect(mountIdx).toBeGreaterThan(-1);
    expect(notFoundIdx).toBeGreaterThan(-1);
    expect(mountIdx).toBeLessThan(notFoundIdx);
  });

  it('③ server.ts 生产调用 setOverflowGraphStore 且实参为 graphStore（修复前零生产调用 → 恒 503）', () => {
    expect(serverSrc).toContain('setOverflowGraphStore(graphStore');
  });

  it('④ 注入先于 app.listen（server 接受请求前完成注入，无首请求 503 竞态）', () => {
    // 带开括号匹配调用点而非 import 具名导入行
    const injectIdx = serverSrc.indexOf('setOverflowGraphStore(graphStore');
    const listenIdx = serverSrc.indexOf('app.listen(');
    expect(injectIdx).toBeGreaterThan(-1);
    expect(injectIdx).toBeLessThan(listenIdx);
  });
});
