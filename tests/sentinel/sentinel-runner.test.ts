import { describe, it, expect } from 'vitest';
import { SentinelRunner, formatFindingsForLLM } from '../../src/sentinel/sentinel-runner';
import type { SentinelFinding } from '../../src/sentinel/types';

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

describe('SentinelRunner', () => {
  it('内置哨兵已自动注册', () => {
    const runner = new SentinelRunner();
    expect(runner.listAll().length).toBeGreaterThanOrEqual(1);
    expect(runner.listAll().find(s => s.id === 'key-person-risk')).toBeDefined();
  });

  it('手动注册哨兵', () => {
    const runner = new SentinelRunner();
    runner.register({ id: 'test', dimension: 'D1', expert: 'finance', async check() { return []; } });
    expect(runner.listAll().find(s => s.id === 'test')).toBeDefined();
  });

  it('runForTeam 返回 Finding[]', async () => {
    const runner = new SentinelRunner();
    runner.register({
      id: 'test-1', dimension: 'D1', expert: 'finance',
      async check(_teamId, _store) {
        return [makeFinding({ id: 'f1', title: '测试发现' })];
      },
    });
    const findings = await runner.runForTeam('t1', mockStore());
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('哨兵失败不阻断其他哨兵', async () => {
    const runner = new SentinelRunner();
    runner.register({
      id: 'bad', dimension: 'D1', expert: 'finance',
      async check() { throw new Error('crash'); },
    });
    runner.register({
      id: 'good', dimension: 'D2', expert: 'org',
      async check() { return [makeFinding({ id: 'ok', title: '好的' })]; },
    });
    const findings = await runner.runForTeam('t1', mockStore());
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('ok');
  });

  it('formatFindings 空数组', () => {
    expect(formatFindingsForLLM([])).toBe('');
  });

  it('formatFindings critical + warning', () => {
    const findings: SentinelFinding[] = [
      makeFinding({ id: '1', severity: 'critical', title: '严重问题' }),
      makeFinding({ id: '2', severity: 'warning', title: '警告问题' }),
    ];
    const text = formatFindingsForLLM(findings);
    expect(text).toContain('严重');
    expect(text).toContain('警告');
    expect(text).toContain('客观事实');
  });
});
