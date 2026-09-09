/**
 * tests/routes/diagnosis-customer-config.test.ts — D600: 诊断第一命令消费客户配置（reportDepth/template）
 *
 * spec: docs/plans/codex/implementation/SYNOVA-IMPL-D600-cfg-productize-first-command-20260908.md §4
 * 依赖: D599 resolveCustomerConfig（src/config/customer-config-package.ts 已交付，本测试不重写机制）。
 *
 * 验证 consult 生产路径消费 customerConfig.config（修复前 config 未消费 → reportDepth 恒 'raw' → red）:
 *   ① 客户配置 diagnosis.reportDepth='ceo' 驱动报告深度（覆盖 'raw' fallback）
 *   ② scope.reportDepth 显式请求优先于客户配置（显式 > 配置，spec §4.5 决策点 1）
 *   ③ 无客户配置包 → 回退 'raw'（fallback 不回归）
 *   ④ broken 包 degraded 不阻断诊断（铁律 24/31）
 *   ⑤ diagnosis.template 驱动一页纸模板选择（'ceo'|'flywheel'）
 *
 * 铁律 12: 集成测试走真实路由（express app + listen(0) + fetch），不 mock 管线——
 *          仅 mock 引擎工厂（避免真实 LLM 调用）与 provider/config 构造（保持测试密闭，D489 先例）。
 * 测试夹具: cwd/customer-config/{orgId}/config.yml（afterAll 只删本测试 orgId 子目录，不删共享根，防并行竞态）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Server } from 'http';

// ═══ Mock 引擎工厂 — 路由 import('../l3/synova-diagnosis-engine-impl') 拿到 fake 引擎（D489 同型）═══
vi.mock('../../src/l3/synova-diagnosis-engine-impl', () => ({
  createSynovaDiagnosisEngine: () => ({
    async runConsultation(
      teamId: string,
      _initiator: unknown,
      _scope: unknown,
      onEvent?: (event: { type: string; phase: number; label?: string; message?: string; confidence?: number }) => void,
    ) {
      onEvent?.({ type: 'phase_started', phase: 1, label: '数据采集', confidence: 0.9 });
      return {
        teamId,
        report: {
          summary: 'D600 测试诊断报告',
          rootCauses: [],
          recommendations: [],
          expertReports: [],
        },
        totalDurationMs: 7,
        degradedModules: [],
      };
    },
  }),
}));

// provider/config 仅被路由构造（fake 引擎从不调用 chat）——mock 掉保持密闭，不触真实网关
vi.mock('../../src/providers', () => ({
  createProvider: () => ({ name: 'fake-d600-provider' }),
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

function parseSseFrames(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => JSON.parse(chunk.replace(/^data: /, '')) as Record<string, unknown>);
}

async function postConsult(baseUrl: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${baseUrl}/api/diagnosis/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface CompleteReportShape {
  assembled?: { depth?: string };
  onePager?: unknown;
  customerConfig?: { degraded?: boolean; applied?: { reportDepth?: string; template?: string } };
}

function completeFrame(frames: Array<Record<string, unknown>>): { report?: CompleteReportShape } {
  const frame = frames.find(f => f.type === 'complete') as { report?: CompleteReportShape } | undefined;
  if (!frame) throw new Error('SSE 流缺少 complete 帧');
  return frame;
}

// ═══ 夹具: cwd/customer-config/{orgId}/config.yml（vitest cwd = 仓库根，与路由 resolveCustomerConfig 同根）═══
const ORG_CEO = 'd600-org-ceo';
const ORG_TPL = 'd600-org-tpl';
const ORG_BROKEN = 'd600-org-broken';
const CONFIG_ROOT = join(process.cwd(), 'customer-config');

function writeOrgConfig(orgId: string, yaml: string): void {
  mkdirSync(join(CONFIG_ROOT, orgId), { recursive: true });
  writeFileSync(join(CONFIG_ROOT, orgId, 'config.yml'), yaml, 'utf8');
}

describe('D600: consult 消费客户配置（reportDepth/template 诊断第一命令）', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    writeOrgConfig(ORG_CEO, 'diagnosis:\n  reportDepth: ceo\n');
    writeOrgConfig(ORG_TPL, 'diagnosis:\n  reportDepth: expert\n  template: flywheel\n');
    mkdirSync(join(CONFIG_ROOT, ORG_BROKEN), { recursive: true });
    writeFileSync(join(CONFIG_ROOT, ORG_BROKEN, 'config.yml'), '::: [不是合法 YAML', 'utf8');

    const diagnosisRouter = (await import('../../src/routes/diagnosis')).default;
    const app = express();
    app.use(express.json());
    app.locals.orchestration = {}; // 无 db → 会话落流降级跳过（D489 案例③同路径，本测试不查 session_events）
    app.use(diagnosisRouter);
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') baseUrl = `http://localhost:${addr.port}`;
    });
    await new Promise<void>(resolve => { const t = setInterval(() => { if (baseUrl) { clearInterval(t); resolve(); } }, 10); });
  });

  afterAll(() => {
    for (const orgId of [ORG_CEO, ORG_TPL, ORG_BROKEN]) {
      rmSync(join(CONFIG_ROOT, orgId), { recursive: true, force: true });
    }
    return new Promise<void>(resolve => { server.close(() => resolve()); });
  });

  it('① 客户配置 diagnosis.reportDepth=ceo 驱动报告深度（修复前恒 raw → red）', async () => {
    const res = await postConsult(baseUrl, { teamId: ORG_CEO, initiator: { role: 'GA', name: '测试GA' } });
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    expect(frames.map(f => f.type)).not.toContain('error');
    const report = completeFrame(frames).report;
    // 配置驱动的核心断言：客户配置 ceo 覆盖硬编码 raw fallback
    expect(report?.assembled?.depth).toBe('ceo');
    expect(report?.customerConfig?.applied?.reportDepth).toBe('ceo');
    expect(typeof report?.onePager).toBe('string');
    expect((report?.onePager as string).length).toBeGreaterThan(0);
  });

  it('② scope.reportDepth 显式请求优先于客户配置（显式 > 配置）', async () => {
    const res = await postConsult(baseUrl, {
      teamId: ORG_CEO,
      initiator: { role: 'GA', name: '测试GA' },
      scope: { reportDepth: 'flywheel' },
    });
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    expect(frames.map(f => f.type)).not.toContain('error');
    const report = completeFrame(frames).report;
    expect(report?.assembled?.depth).toBe('flywheel');
    expect(report?.customerConfig?.applied?.reportDepth).toBe('flywheel');
  });

  it('③ 无客户配置包 → 回退 raw（fallback 不回归）', async () => {
    const res = await postConsult(baseUrl, { teamId: 'd600-org-none', initiator: { role: 'GA', name: '测试GA' } });
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    expect(frames.map(f => f.type)).not.toContain('error');
    const report = completeFrame(frames).report;
    expect(report?.assembled).toBeUndefined();
    expect(report?.customerConfig?.applied?.reportDepth).toBe('raw');
    expect(report?.customerConfig?.degraded).toBe(true);
  });

  it('④ broken 包 degraded 不阻断诊断（铁律 24/31）', async () => {
    const res = await postConsult(baseUrl, { teamId: ORG_BROKEN, initiator: { role: 'GA', name: '测试GA' } });
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    expect(frames.map(f => f.type)).not.toContain('error');
    const report = completeFrame(frames).report;
    expect(report?.customerConfig?.degraded).toBe(true);
    expect(report?.assembled).toBeUndefined();
    expect(report?.customerConfig?.applied?.reportDepth).toBe('raw');
  });

  it('⑤ diagnosis.template=flywheel 驱动一页纸模板选择', async () => {
    const res = await postConsult(baseUrl, {
      teamId: ORG_TPL,
      initiator: { role: 'GA', name: '测试GA' },
      scope: { reportDepth: 'expert' },
    });
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    expect(frames.map(f => f.type)).not.toContain('error');
    const report = completeFrame(frames).report;
    expect(report?.assembled?.depth).toBe('expert');
    expect(report?.customerConfig?.applied?.template).toBe('flywheel');
    expect(typeof report?.onePager).toBe('string');
    expect((report?.onePager as string).length).toBeGreaterThan(0);
  });
});
