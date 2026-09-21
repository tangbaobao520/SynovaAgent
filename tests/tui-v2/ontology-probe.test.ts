/**
 * tests/tui-v2/ontology-probe.test.ts — D862/P-1 TUI 出站收敛守卫（F-1 闭合）
 *
 * 契约（铁律 47/48）：
 * - 输入：mock 唯一出口 `outboundFetch`（vi.mock 真 seam，与 tests/tools/
 *   outbound-convergence.test.ts 同模式）。
 * - 输出：TUI cron 本体探测经由 outboundFetch；chat.tsx 接线到 probeOntologyGraph
 *   且全文件零裸 `fetch(`（tui-v2 无 HTML 模板，裸 fetch = 回退违规）。
 * - 降级：出口抛错 → log.warn 后正常返回，不抛出到 cron 调度器。
 * - 边界：非 2xx → 静默不消费 JSON，不报错。
 *
 * 守卫语义（"抽掉迁移 → 红"）：
 * - 把 probeOntologyGraph 内部换回裸 fetch → 出口 mock 不被调用 → 前两用例红；
 * - 把 chat.tsx 接线摘除（不再调用 probeOntologyGraph / 引入裸 fetch）→ 接线用例红。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outboundFetchMock = vi.fn<(url: string, init?: Record<string, unknown>) => Promise<Response>>();

vi.mock('../../src/providers/http-exit', () => ({
  outboundFetch: (url: string, init?: Record<string, unknown>) => outboundFetchMock(url, init),
}));

const { probeOntologyGraph } = await import('../../src/tui-v2/lib/ontology-probe');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  outboundFetchMock.mockReset();
});

describe('TUI 本体探测出站收敛（D862/P-1，F-1 闭合）', () => {
  it('正常路径：probeOntologyGraph 经 outboundFetch 打 loopback 本体 API', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({ nodeCount: 3 }));
    await expect(probeOntologyGraph('http://localhost:3000/api/ontology/graph/default')).resolves.toBeUndefined();
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
    expect(outboundFetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/ontology/graph/default');
  });

  it('降级路径：出口抛 OutboundHttpError 等分类错误 → log.warn 后正常返回（探测性降级不抛出）', async () => {
    outboundFetchMock.mockRejectedValue(new Error('UPSTREAM_UNREACHABLE'));
    await expect(probeOntologyGraph('http://localhost:3000/api/ontology/graph/default')).resolves.toBeUndefined();
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
  });

  it('边界路径：非 2xx → 不消费 JSON、不抛出', async () => {
    outboundFetchMock.mockResolvedValue(new Response('busy', { status: 503 }));
    await expect(probeOntologyGraph('http://localhost:3000/api/ontology/graph/default')).resolves.toBeUndefined();
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
  });

  it('接线守卫：chat.tsx 调用 probeOntologyGraph 且全文件零裸 fetch（', async () => {
    const source = readFileSync(resolve(__dirname, '..', '..', 'src', 'tui-v2', 'chat.tsx'), 'utf-8');
    expect(source).toContain('probeOntologyGraph(');
    // chat.tsx 无 HTML 模板字符串——任何非 outboundFetch/probe 的 fetch( 都是回退违规
    const bare = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .filter((line) => /(?<!outbound)(?<!\.)fetch\(/.test(line));
    expect(bare).toEqual([]);
    // 守卫自检：确保正则本身能命中裸 fetch（防正则失效变成恒绿空壳）
    expect(/(?<!outbound)(?<!\.)fetch\(/.test('const r = await fetch(url);')).toBe(true);
  });
});
