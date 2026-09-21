/**
 * tests/agent/outbound-convergence.test.ts — D862/P-1 agent 层出站收敛守卫
 *
 * 覆盖：boss-mailbox webhook、l1/im-channel 飞书 webhook、deepseek-balance LLM API。
 * 契约：出站全部经 outboundFetch；出口抛错 → 按原契约降级（false / ok:false / 过期缓存）。
 * 守卫语义：任一回退到裸 fetch，本文件必红。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const outboundFetchMock = vi.fn<(url: string, init?: Record<string, unknown>) => Promise<Response>>();

vi.mock('../../src/providers/http-exit', () => ({
  outboundFetch: (url: string, init?: Record<string, unknown>) => outboundFetchMock(url, init),
  OutboundHttpError: class OutboundHttpError extends Error {
    code: string; phase: string; retryable: boolean; degraded: boolean;
    constructor(d: { code: string; phase: string; message: string; retryable: boolean; degraded: boolean }) {
      super(d.message); this.code = d.code; this.phase = d.phase; this.retryable = d.retryable; this.degraded = d.degraded;
    }
  },
}));

const { BossMailbox } = await import('../../src/agent/boss-mailbox');
const { createFeishuWebhookChannel } = await import('../../src/l1/im-channel');
const { fetchDeepseekBalance, clearBalanceCache } = await import('../../src/services/deepseek-balance');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const REPORT = {
  subject: '测试周报', generatedAt: new Date().toISOString(),
  signals: [], actions: [], needsAttention: [],
};

beforeEach(() => {
  outboundFetchMock.mockReset();
  clearBalanceCache();
});

describe('BossMailbox.pushToFeishu 出站收敛（D862/P-1）', () => {
  it('正常路径：经 outboundFetch 且 POST JSON', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({}));
    const ok = await new BossMailbox().pushToFeishu(REPORT as never, 'https://open.feishu.cn/hook/x');
    expect(ok).toBe(true);
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = outboundFetchMock.mock.calls[0];
    expect(url).toBe('https://open.feishu.cn/hook/x');
    expect((init as { method?: string } | undefined)?.method).toBe('POST');
  });

  it('降级路径：出口抛错 → false（不抛出）', async () => {
    outboundFetchMock.mockRejectedValue(new Error('PROXY_UNREACHABLE'));
    const ok = await new BossMailbox().pushToFeishu(REPORT as never, 'https://open.feishu.cn/hook/x');
    expect(ok).toBe(false);
  });

  it('边界：HTTP 500 → false', async () => {
    outboundFetchMock.mockResolvedValue(new Response('err', { status: 500 }));
    const ok = await new BossMailbox().pushToFeishu(REPORT as never, 'https://open.feishu.cn/hook/x');
    expect(ok).toBe(false);
  });
});

describe('飞书 webhook 通道出站收敛（D862/P-1）', () => {
  it('正常路径：sendMessage 经 outboundFetch', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({}));
    const ch = createFeishuWebhookChannel('https://open.feishu.cn/hook/y');
    const r = await ch.sendMessage('t', { text: 'hi' });
    expect(r.ok).toBe(true);
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
  });

  it('降级路径：出口抛错 → ok:false + error', async () => {
    outboundFetchMock.mockRejectedValue(new Error('tunnel failed'));
    const ch = createFeishuWebhookChannel('https://open.feishu.cn/hook/y');
    const r = await ch.sendMessage('t', { text: 'hi' });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('边界：sendCard 经 outboundFetch 且 ok 随 HTTP 状态', async () => {
    outboundFetchMock.mockResolvedValue(new Response('err', { status: 500 }));
    const ch = createFeishuWebhookChannel('https://open.feishu.cn/hook/y');
    const r = await ch.sendCard('t', { title: 'T', content: 'C' });
    expect(r.ok).toBe(false);
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('deepseek-balance 出站收敛（D862/P-1）', () => {
  it('正常路径：经 outboundFetch 且 Bearer 头传递', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '12.34' }],
    }));
    const r = await fetchDeepseekBalance('sk-test');
    expect(r?.total).toBeCloseTo(12.34);
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
    const [, init] = outboundFetchMock.mock.calls[0];
    expect((init as { headers?: Record<string, string> } | undefined)?.headers?.Authorization).toBe('Bearer sk-test');
  });

  it('降级路径：出口抛错 → 返回 null（无缓存时）且不抛出', async () => {
    outboundFetchMock.mockRejectedValue(new Error('UPSTREAM_TIMEOUT'));
    const r = await fetchDeepseekBalance('sk-test');
    expect(r).toBeNull();
  });

  it('边界：HTTP 401 → null', async () => {
    outboundFetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const r = await fetchDeepseekBalance('sk-bad');
    expect(r).toBeNull();
  });
});
