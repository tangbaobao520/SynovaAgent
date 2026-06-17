/** tests/sentinel/adapters/d4-software-sentinels.test.ts — D4 软件生态哨兵单元测试 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock GraphStore DB
const mockAll = vi.fn();
const mockPrepare = vi.fn(() => ({ all: mockAll }));
const mockDb = { prepare: mockPrepare };

function ctx(overrides?: Partial<{ now: Date }>) {
  return { db: mockDb, now: overrides?.now ?? new Date('2026-06-17T09:00:00Z') };
}

// ═══ SaaS Utilization ═══
describe('saasUtilizationSentinel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Given 无工具节点 → info 类 finding + 非 degraded', async () => {
    mockAll.mockReturnValue([]);
    const { saasUtilizationSentinel } = await import('../../../src/sentinel/adapters/saas-utilization-sentinel');
    const r = await saasUtilizationSentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe('info');
  });

  it('Given 3工具全部闲置 → critical finding', async () => {
    mockAll.mockReturnValue([
      { id: 't1', props: JSON.stringify({ name: 'Slack', status: 'unused' }) },
      { id: 't2', props: JSON.stringify({ name: 'Zoom', status: 'idle' }) },
      { id: 't3', props: JSON.stringify({ name: 'Notion', status: 'idle' }) },
    ]);
    const { saasUtilizationSentinel } = await import('../../../src/sentinel/adapters/saas-utilization-sentinel');
    const r = await saasUtilizationSentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings.some((f: { severity: string }) => f.severity === 'critical')).toBe(true);
  });

  it('Given null db → degraded', async () => {
    const { saasUtilizationSentinel } = await import('../../../src/sentinel/adapters/saas-utilization-sentinel');
    const r = await saasUtilizationSentinel.check({ db: null, now: new Date() });
    expect(r.degraded).toBe(true);
  });
});

// ═══ Data Silos ═══
describe('dataSilosSentinel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Given <2 系统 → 无 findings', async () => {
    mockAll.mockReturnValueOnce([{ id: 's1', props: JSON.stringify({ name: 'CRM' }) }]);
    const { dataSilosSentinel } = await import('../../../src/sentinel/adapters/data-silos-sentinel');
    const r = await dataSilosSentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('Given 多个系统但零边 → 孤岛 critical', async () => {
    mockAll.mockReturnValueOnce([
      { id: 's1', props: JSON.stringify({ name: 'CRM' }) },
      { id: 's2', props: JSON.stringify({ name: 'ERP' }) },
      { id: 's3', props: JSON.stringify({ name: 'HR' }) },
    ]);
    mockAll.mockReturnValueOnce([]); // edges empty
    const { dataSilosSentinel } = await import('../../../src/sentinel/adapters/data-silos-sentinel');
    const r = await dataSilosSentinel.check(ctx());
    expect(r.findings.some((f: { id: string }) => f.id.includes('ds-critical'))).toBe(true);
  });

  it('Given null db → degraded', async () => {
    const { dataSilosSentinel } = await import('../../../src/sentinel/adapters/data-silos-sentinel');
    const r = await dataSilosSentinel.check({ db: null, now: new Date() });
    expect(r.degraded).toBe(true);
  });
});

// ═══ Integration Health ═══
describe('integrationHealthSentinel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Given 无系统 → 无 findings', async () => {
    mockAll.mockReturnValue([]);
    const { integrationHealthSentinel } = await import('../../../src/sentinel/adapters/integration-health-sentinel');
    const r = await integrationHealthSentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('Given 低 MCP 支持 → critical finding', async () => {
    mockAll.mockReturnValue([
      { id: 't1', props: JSON.stringify({ name: 'CRM', mcpSupport: 'none' }) },
      { id: 't2', props: JSON.stringify({ name: 'ERP', mcpSupport: 'none' }) },
      { id: 't3', props: JSON.stringify({ name: 'Slack', mcpSupport: 'native' }) },
      { id: 't4', props: JSON.stringify({ name: 'Jira', mcpSupport: 'none' }) },
    ]);
    const { integrationHealthSentinel } = await import('../../../src/sentinel/adapters/integration-health-sentinel');
    const r = await integrationHealthSentinel.check(ctx());
    expect(r.findings.some((f: { id: string }) => f.id.includes('ih-mcp'))).toBe(true);
  });

  it('Given null db → degraded', async () => {
    const { integrationHealthSentinel } = await import('../../../src/sentinel/adapters/integration-health-sentinel');
    const r = await integrationHealthSentinel.check({ db: null, now: new Date() });
    expect(r.degraded).toBe(true);
  });
});

// ═══ Shadow IT ═══
describe('shadowITSentinel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Given 全部授权 → 无 findings', async () => {
    mockAll.mockReturnValue([
      { id: 't1', props: JSON.stringify({ name: 'Slack', authorized: true }) },
      { id: 't2', props: JSON.stringify({ name: 'Jira', authorized: 'approved' }) },
    ]);
    const { shadowITSentinel } = await import('../../../src/sentinel/adapters/shadow-it-sentinel');
    const r = await shadowITSentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('Given 未授权文件共享工具 → critical finding', async () => {
    mockAll.mockReturnValue([
      { id: 't1', props: JSON.stringify({ name: 'Dropbox', authorized: false, category: 'file_sharing' }) },
      { id: 't2', props: JSON.stringify({ name: 'Slack', authorized: true }) },
      { id: 't3', props: JSON.stringify({ name: 'WeTransfer', authorized: false, category: 'file_sharing' }) },
      { id: 't4', props: JSON.stringify({ name: 'Notion', authorized: 'no', category: 'note_taking' }) },
    ]);
    const { shadowITSentinel } = await import('../../../src/sentinel/adapters/shadow-it-sentinel');
    const r = await shadowITSentinel.check(ctx());
    expect(r.findings.some((f: { severity: string }) => f.severity === 'critical')).toBe(true);
  });

  it('Given null db → degraded', async () => {
    const { shadowITSentinel } = await import('../../../src/sentinel/adapters/shadow-it-sentinel');
    const r = await shadowITSentinel.check({ db: null, now: new Date() });
    expect(r.degraded).toBe(true);
  });
});
