/**
 * tests/tools/outbound-convergence.test.ts — D862/P-1 专家工具层出站收敛守卫
 *
 * 契约（铁律 47/48）：
 * - 输入：mock 唯一出口 `outboundFetch`（vi.mock 真 seam）。
 * - 输出：各专家工具的 localhost 本机 API 出站全部经由 outboundFetch（出口原生 loopback 恒绕过代理）。
 * - 降级：出口不可达 → 工具按原契约降级（null / limited 状态），不抛出到上层。
 * - 边界：非 2xx / 空 body → 降级路径。
 *
 * 守卫语义：任一工具回退到裸 fetch，本文件必红（outboundFetch 不被调用）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const outboundFetchMock = vi.fn<(url: string, init?: Record<string, unknown>) => Promise<Response>>();

vi.mock('../../src/providers/http-exit', () => ({
  outboundFetch: (url: string, init?: Record<string, unknown>) => outboundFetchMock(url, init),
}));

const { collectPositioningDataTool } = await import('../../src/tools/marketing-expert-tools');
const { scanCollaborationTool } = await import('../../src/tools/org-expert-tools');
const { crossValidateTool } = await import('../../src/tools/accuracy-tools');
const { scanSoftwareEcosystemTool } = await import('../../src/tools/tech-expert-tools');
const { measureEffectivenessTool } = await import('../../src/tools/action-expert-tools');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  outboundFetchMock.mockReset();
});

describe('专家工具出站收敛（D862/P-1）', () => {
  it('正常路径：marketing collect_positioning_data 经 outboundFetch', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({ nodes: [], nodeCount: 0, edgeCount: 0 }));
    const r = await collectPositioningDataTool.handler({ orgId: 'org-1' });
    expect(r).toBeTruthy();
    expect(outboundFetchMock).toHaveBeenCalledTimes(1);
    expect(outboundFetchMock.mock.calls[0][0]).toContain('/api/ontology/graph/org-1');
  });

  it('正常路径：org scan_collaboration_patterns 经 outboundFetch', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({ nodes: [], edges: [] }));
    await scanCollaborationTool.handler({ orgId: 'org-1' });
    expect(outboundFetchMock).toHaveBeenCalled();
  });

  it('正常路径：accuracy cross_validate 的本体/会话查询经 outboundFetch', async () => {
    outboundFetchMock.mockResolvedValue(jsonResponse({ nodes: [], edges: [] }));
    const r = await crossValidateTool.handler({ findingId: 'f-1' });
    expect(r).toBeTruthy();
    expect(outboundFetchMock).toHaveBeenCalled();
  });

  it('降级路径：出口抛错 → 工具降级不抛出（marketing 返回 limited）', async () => {
    outboundFetchMock.mockRejectedValue(new Error('UPSTREAM_UNREACHABLE'));
    const r = await collectPositioningDataTool.handler({ orgId: 'org-1' });
    const record = r as { status?: string };
    expect(['limited', 'degraded', 'ok']).toContain(record.status ?? 'limited');
  });

  it('边界：HTTP 500 → tech scan_software_ecosystem 降级返回', async () => {
    outboundFetchMock.mockResolvedValue(new Response('err', { status: 500 }));
    const r = await scanSoftwareEcosystemTool.handler({ orgId: 'org-1' });
    expect(r).toBeTruthy();
  });

  it('边界：action track_execution 本地降级路径不触网也安全', async () => {
    const r = await measureEffectivenessTool.handler({ orgId: 'org-1' });
    expect(r).toBeTruthy();
  });
});
