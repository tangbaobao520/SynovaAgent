import { describe, it, expect } from 'vitest';
import { runSentinelForTeam, formatFindingsForLLM } from '../../src/sentinel/sentinel-runner';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import type { SentinelFinding, Sentinel, SentinelCheckResult } from '../../src/sentinel/types';

function mockStore() {
  return {
    queryNodes: () => [
      { id: 'n1', type: 'Person', props: { name: '张三', teamId: 't1', knowledge: ['支付'] } },
    ],
  };
}

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'f1', severity: 'warning', title: '测试', description: '测试描述',
    evidence: [], suggestion: '建议', detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSentinel(id: string, findings: SentinelFinding[]): Sentinel {
  return {
    config: { id, name: id, description: '', category: 'growth', priority: 'P1', mode: 'manual', version: '1', requiredDataSources: [] },
    async check(_context): Promise<SentinelCheckResult> {
      return { sentinelId: id, ok: true, findings, durationMs: 1 };
    },
  };
}

describe('SentinelRunner (V3.8 — registry delegate)', () => {
  it('registry 为空时 runSentinelForTeam 返回空', async () => {
    destroySentinelRegistry();
    const findings = await runSentinelForTeam('t1', mockStore());
    expect(findings).toEqual([]);
  });

  it('注册哨兵后 runSentinelForTeam 返回 Finding', async () => {
    destroySentinelRegistry();
    const registry = getSentinelRegistry();
    registry.register(makeSentinel('test-1', [makeFinding({ id: 'f1', title: '发现' })]));

    const findings = await runSentinelForTeam('t1', mockStore());
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].title).toBe('发现');
  });

  it('哨兵失败不阻断其他哨兵', async () => {
    destroySentinelRegistry();
    const registry = getSentinelRegistry();
    registry.register({
      config: { id: 'bad', name: 'bad', description: '', category: 'growth', priority: 'P1', mode: 'manual', version: '1', requiredDataSources: [] },
      async check(): Promise<SentinelCheckResult> { throw new Error('crash'); },
    });
    registry.register(makeSentinel('good', [makeFinding({ id: 'ok', title: '好的' })]));

    const findings = await runSentinelForTeam('t1', mockStore());
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('ok');
  });

  it('formatFindings 空数组', () => {
    expect(formatFindingsForLLM([])).toBe('');
  });

  it('formatFindings critical + warning', () => {
    const findings: SentinelFinding[] = [
      makeFinding({ id: '1', severity: 'critical', title: '严重' }),
      makeFinding({ id: '2', severity: 'warning', title: '警告' }),
    ];
    const text = formatFindingsForLLM(findings);
    expect(text).toContain('严重');
    expect(text).toContain('警告');
    expect(text).toContain('客观事实');
  });
});
