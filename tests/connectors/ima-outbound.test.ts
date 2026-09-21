/**
 * tests/connectors/ima-outbound.test.ts — D862/P-1 ima 出站收敛守卫
 *
 * 契约（铁律 47/48）：
 * - 输入：mock 唯一出口 `outboundFetch`（vi.mock 真 seam，不 mock 全局 fetch）。
 * - 输出：ImaClient / createImaConnector 的出站调用全部经由 outboundFetch。
 * - 降级：出口抛 OutboundHttpError → ima.ts 按原契约降级（空数组/null/false/抛错）。
 * - 边界：AbortSignal.timeout 原语义保留（init.signal 仍被传入出口）。
 *
 * 守卫语义：若任一模块回退到裸 fetch，本文件必红（outboundFetch 不被调用）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const outboundFetchMock = vi.fn<(url: string, init?: Record<string, unknown>) => Promise<Response>>();

vi.mock('../../src/providers/http-exit', () => ({
  outboundFetch: (url: string, init?: Record<string, unknown>) => outboundFetchMock(url, init),
  OutboundHttpError: class OutboundHttpError extends Error {
    code: string;
    phase: string;
    retryable: boolean;
    degraded: boolean;
    constructor(d: { code: string; phase: string; message: string; retryable: boolean; degraded: boolean }) {
      super(d.message);
      this.code = d.code;
      this.phase = d.phase;
      this.retryable = d.retryable;
      this.degraded = d.degraded;
    }
  },
}));

const { ImaClient } = await import('../../src/connectors/ima');
const { createImaConnector } = await import('../../src/connectors/ima-connector');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  outboundFetchMock.mockReset();
});

describe('ima.ts 出站收敛（D862/P-1）', () => {
  const config = { baseUrl: 'https://api.ima.example.com', apiKey: 'sk-test', enterpriseId: 'e1', timeoutMs: 1000 };

  it('正常路径：authenticate 经 outboundFetch 且 signal 原样传入', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({ accessToken: 'tok-1' }));
    const client = new ImaClient(config);
    await expect(client.authenticate()).resolves.toBe('tok-1');
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = outboundFetchMock.mock.calls[0];
    expect(url).toBe('https://api.ima.example.com/v1/auth');
    expect((init as { method?: string } | undefined)?.method).toBe('POST');
    expect((init as { signal?: AbortSignal } | undefined)?.signal).toBeInstanceOf(AbortSignal);
  });

  it('降级路径：出口抛 OutboundHttpError → scanDocuments 返回空数组', async () => {
    const { OutboundHttpError } = await import('../../src/providers/http-exit');
    outboundFetchMock.mockRejectedValue(new OutboundHttpError({
      code: 'UPSTREAM_UNREACHABLE', phase: 'connect', message: 'unreachable', retryable: false, degraded: false,
    }));
    // authenticate 也失败 → scanDocuments 降级为 []
    const client = new ImaClient(config);
    await expect(client.scanDocuments()).resolves.toEqual([]);
    expect(outboundFetchMock).toHaveBeenCalled();
  });

  it('边界：HTTP 非 200 → checkHealth 报 HTTP 状态', async () => {
    outboundFetchMock.mockResolvedValue(new Response('nope', { status: 503 }));
    const client = new ImaClient(config);
    const health = await client.checkHealth();
    expect(health.ok).toBe(false);
    expect(health.message).toContain('503');
  });
});

describe('ima-connector.ts 出站收敛（D862/P-1）', () => {
  it('正常路径：search 经 outboundFetch，凭证头原样传递', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({ code: 0, msg: 'ok', data: { info_list: [], is_end: true, next_cursor: '' } }));
    const conn = createImaConnector({ clientId: 'cid', apiKey: 'k', baseUrl: 'https://ima.example.com' });
    const r = await conn.search('kb-1', 'query');
    expect(r.results).toEqual([]);
    expect(r.hasMore).toBe(false);
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = outboundFetchMock.mock.calls[0];
    expect(url).toBe('https://ima.example.com/openapi/wiki/v1/search_knowledge');
    const headers = (init as { headers?: Record<string, string> } | undefined)?.headers;
    expect(headers?.['ima-openapi-clientid']).toBe('cid');
  });

  it('降级路径：出口抛错 → imaPost 吞错返回 null → search 空结果', async () => {
    outboundFetchMock.mockRejectedValue(new Error('proxy down'));
    const conn = createImaConnector({ clientId: 'cid', apiKey: 'k', baseUrl: 'https://ima.example.com' });
    const r = await conn.search('kb-1', 'q');
    expect(r).toEqual({ results: [], hasMore: false, nextCursor: '' });
  });

  it('边界：业务 code != 0 → 空结果（不抛错）', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({ code: 40001, msg: 'bad key', data: null }));
    const conn = createImaConnector({ clientId: 'cid', apiKey: 'bad', baseUrl: 'https://ima.example.com' });
    const r = await conn.getKnowledgeBases();
    expect(r).toEqual([]);
  });
});
