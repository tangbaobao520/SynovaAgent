/**
 * tests/routes/diagnosis-token-meter.integration.test.ts — D598 (DSH 借鉴卡 B-03): consult 路由四桶计量 + 预算护栏集成
 *
 * 验证 POST /api/diagnosis/consult 生产路径的 TokenMeter 接线（spec §4 集成 ≥4 用例）:
 *   ① 诊断完成报告带 tokenUsage 四桶字段（SSE complete 帧 + GET /report 均可见，四桶 disjoint 数值精确）
 *   ② 注入超预算 usage → injectManualSignal 被调（signalType='成本预算超限'，告警触发）
 *   ③ 预算未超不告警（injectManualSignal 零调用）
 *   ④ provider 无 usage → meter 降级（degraded:true）不阻断诊断（铁律 24/31）
 *
 * 铁律 12: 集成测试走真实路由（express app + listen(0) + fetch），不 mock 管线——
 *          TokenMeter/bucketsFrom/checkBudget/buildCostFinding 全部为真实实现；仅 mock
 *          引擎工厂（避免真实 LLM）、provider/config 构造（测试密闭）与告警 sink
 *          （sentinel-service 为 DSH 线子系统边界，观察点用 vi.fn 替身）。
 * 模式对齐: tests/routes/diagnosis-consult-events.test.ts（D489 先例）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import type { Server } from 'http';
import { injectManualSignal } from '../../src/agent/sentinel-service';
import type { CostSignalPayload } from '../../src/llm/token-meter';

// ═══ 可变测试状态（vi.mock 工厂提升作用域） ═══
const d598 = vi.hoisted(() => ({
  /** provider.chat 返回的 usage（undefined = 模拟 provider 不上报 usage 的降级场景） */
  usage: undefined as { promptTokens: number; completionTokens: number; cacheReadTokens?: number } | undefined,
  /** fake 引擎调用 deps.chat 的次数（每次调用 = 一次可计量的 LLM 请求） */
  chatCallCount: 1,
  model: 'test-model',
}));

// ═══ Mock 引擎工厂 — fake 引擎真实调用路由注入的 chat adapter（→ provider mock → TokenMeter） ═══
vi.mock('../../src/l3/synova-diagnosis-engine-impl', () => ({
  createSynovaDiagnosisEngine: (deps: { chat: (messages: unknown[], opts?: unknown) => Promise<{ content: string }> }) => ({
    async runConsultation(
      teamId: string,
      _initiator: unknown,
      _scope: unknown,
      onEvent?: (event: { type: string; phase: number; label?: string; message?: string }) => void,
    ) {
      onEvent?.({ type: 'phase_started', phase: 1, label: '数据采集' });
      for (let i = 0; i < d598.chatCallCount; i += 1) {
        await deps.chat([{ role: 'user', content: `d598-scan-${i}` }]);
      }
      return { teamId, report: { summary: 'D598 测试诊断报告' }, totalDurationMs: 7, degradedModules: [] };
    },
  }),
}));

// provider mock — chat 返回 d598.usage（由用例注入四桶数值）
vi.mock('../../src/providers', () => ({
  createProvider: () => ({
    name: 'fake-d598-provider',
    async chat() {
      return { content: 'd598-ok', model: d598.model, usage: d598.usage };
    },
  }),
}));

vi.mock('../../src/providers/detect', () => ({
  detectProvider: () => 'deepseek',
}));

vi.mock('../../src/config', () => ({
  loadConfig: () => ({
    llmApiKey: 'test-key',
    llmBaseUrl: 'http://localhost:1',
    llmModel: 'test-model',
    diagnosis: { maxToolRounds: 2, gateDataCompleteness: 0.3, gateMinHypothesisConfidence: 0.5 },
  }),
}));

// 告警 sink 替身 — 观察 consult 是否触发成本告警（DSH 线子系统边界，不 mock 其余管线）
vi.mock('../../src/agent/sentinel-service', () => ({
  injectManualSignal: vi.fn(() => ({ ok: true, findingId: 'finding-d598', degraded: false })),
}));

function parseSseFrames(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => JSON.parse(chunk.replace(/^data: /, '')) as Record<string, unknown>);
}

interface TokenUsageSnapshotLike {
  totals: { uncachedInputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  totalTokens: number;
  requestCount: number;
  missingUsageCount: number;
  degraded: boolean;
  byModel: Record<string, { uncachedInputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }>;
}

async function postConsult(baseUrl: string, teamId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/diagnosis/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, initiator: { role: 'GA', name: '测试GA' } }),
  });
}

describe('D598: consult 路由四桶计量 + 预算护栏接线', () => {
  let server: Server;
  let baseUrl: string;
  let db: Database.Database;

  beforeAll(async () => {
    const diagnosisRouter = (await import('../../src/routes/diagnosis')).default;
    const app = express();
    app.use(express.json());
    db = new Database(':memory:');
    app.locals.orchestration = { db };
    app.use(diagnosisRouter);
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') baseUrl = `http://localhost:${addr.port}`;
    });
    await new Promise<void>(resolve => {
      const t = setInterval(() => { if (baseUrl) { clearInterval(t); resolve(); } }, 10);
    });
  });

  afterAll(() => {
    return new Promise<void>(resolve => { server.close(() => resolve()); });
  });

  beforeEach(() => {
    vi.mocked(injectManualSignal).mockClear();
    d598.usage = undefined;
    d598.chatCallCount = 1;
  });

  it('① 诊断完成报告带 tokenUsage 四桶字段（SSE complete + GET /report 均可见，disjoint 数值精确）', async () => {
    d598.usage = { promptTokens: 1000, completionTokens: 200, cacheReadTokens: 400 };
    const res = await postConsult(baseUrl, 'org-d598-a');
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    const complete = frames.find(f => f.type === 'complete') as { report?: { summary?: string; tokenUsage?: TokenUsageSnapshotLike } } | undefined;
    expect(complete?.report?.summary).toBe('D598 测试诊断报告');

    // 四桶 disjoint 精确值: uncached = 1000 - 400（DeepSeek 口径，cache 命中从 prompt 减出）
    const tu = complete?.report?.tokenUsage;
    expect(tu).toBeTruthy();
    expect(tu?.totals.uncachedInputTokens).toBe(600);
    expect(tu?.totals.cacheReadTokens).toBe(400);
    expect(tu?.totals.outputTokens).toBe(200);
    expect(tu?.totals.cacheWriteTokens).toBe(0);
    expect(tu?.totalTokens).toBe(1200);
    expect(tu?.requestCount).toBe(1);
    expect(tu?.degraded).toBe(false);
    expect(tu?.byModel['test-model']).toEqual({ uncachedInputTokens: 600, outputTokens: 200, cacheReadTokens: 400, cacheWriteTokens: 0 });

    // 结果可见性第二入口: GET /consult/:id/report 的缓存报告同样带 tokenUsage
    const consultId = res.headers.get('X-Consult-Id');
    expect(consultId).toBeTruthy();
    const rep = await fetch(`${baseUrl}/api/diagnosis/consult/${consultId}/report`);
    expect(rep.status).toBe(200);
    const body = (await rep.json()) as { ok: boolean; report: { tokenUsage?: TokenUsageSnapshotLike } };
    expect(body.ok).toBe(true);
    expect(body.report.tokenUsage?.totals.cacheReadTokens).toBe(400);
  });

  it('② 注入超预算 usage → injectManualSignal 被调（signalType=成本预算超限，severity 1-10）', async () => {
    // spent = 595000 + 5000 + 1000 = 601000 ≥ 默认预算 500000 → exceed（ratio≈1.2 → severity 7 critical）
    d598.usage = { promptTokens: 600_000, completionTokens: 1_000, cacheReadTokens: 5_000 };
    const res = await postConsult(baseUrl, 'org-d598-b');
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    expect(frames.map(f => f.type)).toContain('complete');

    expect(injectManualSignal).toHaveBeenCalledTimes(1);
    // 生产构造的载荷形状 = CostSignalPayload（向下断言：GaManualSignalInput 为其结构超集接口）
    const arg = vi.mocked(injectManualSignal).mock.calls[0][0] as CostSignalPayload;
    expect(arg.signalType).toBe('成本预算超限');
    expect(arg.severity).toBe(7);
    expect(arg.severityLabel).toBe('critical');
    expect(arg.orgId).toBe('org-d598-b');
    expect(arg.confidence).toBe(100);
    expect(arg.description).toContain('601000');
    expect(Array.isArray(arg.evidence)).toBe(true);
  });

  it('③ 预算未超不告警（injectManualSignal 零调用，tokenUsage 仍随报告可见）', async () => {
    // disjoint 口径: uncached=(100-20)=80 + output=10 + cacheRead=20 → totalTokens=110
    d598.usage = { promptTokens: 100, completionTokens: 10, cacheReadTokens: 20 };
    const res = await postConsult(baseUrl, 'org-d598-c');
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    const complete = frames.find(f => f.type === 'complete') as { report?: { tokenUsage?: TokenUsageSnapshotLike } } | undefined;
    expect(complete?.report?.tokenUsage?.totalTokens).toBe(110);
    expect(injectManualSignal).not.toHaveBeenCalled();
  });

  it('④ provider 无 usage → meter 降级（degraded:true）不阻断诊断（铁律 24/31）', async () => {
    d598.usage = undefined;
    const res = await postConsult(baseUrl, 'org-d598-d');
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    const types = frames.map(f => f.type);
    expect(types).toContain('complete');
    expect(types).not.toContain('error');
    const complete = frames.find(f => f.type === 'complete') as { report?: { summary?: string; tokenUsage?: TokenUsageSnapshotLike } } | undefined;
    expect(complete?.report?.summary).toBe('D598 测试诊断报告');
    expect(complete?.report?.tokenUsage?.degraded).toBe(true);
    expect(complete?.report?.tokenUsage?.missingUsageCount).toBe(1);
    expect(complete?.report?.tokenUsage?.totals.uncachedInputTokens).toBe(0);
    expect(injectManualSignal).not.toHaveBeenCalled();
  });
});
