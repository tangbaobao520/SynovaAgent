import { describe, it, expect } from 'vitest';
import { checkKeyPersonRisk, computeBusFactor, formatRiskForLLM, type KeyPersonRiskResult } from '../../src/sentinel/key-person-risk';

describe('KeyPersonRisk', () => {
  it('空图 → 空结果', () => {
    const store = { queryNodes: () => [] };
    const r = checkKeyPersonRisk(store, 't1');
    expect(r.findings).toHaveLength(0);
    expect(r.assessments).toHaveLength(0);
  });

  it('无知识域 → Bus Factor 99', () => {
    const store = {
      queryNodes: () => [{ id: 'n1', type: 'Person', props: { name: '张三', teamId: 't1' } }],
    };
    const r = checkKeyPersonRisk(store, 't1');
    expect(r.assessments[0].busFactor).toBe(99);
    expect(r.assessments[0].riskLevel).toBe('low');
  });

  it('独占知识域 → 高风险', () => {
    const store = {
      queryNodes: () => [
        { id: 'n1', type: 'Person', props: { name: '张三', teamId: 't1', knowledge: ['支付系统', '数据库'] } },
        { id: 'n2', type: 'Person', props: { name: '李四', teamId: 't1', knowledge: ['前端'] } },
      ],
    };
    const r = checkKeyPersonRisk(store, 't1');
    expect(r.assessments).toHaveLength(2);
    const zhangsan = r.assessments.find(a => a.personName === '张三')!;
    expect(zhangsan.orphanedDomains).toContain('支付系统');
    expect(zhangsan.orphanedDomains).toContain('数据库');
    expect(zhangsan.busFactor).toBe(1); // 2 orphaned → 2-2+1=1
    expect(zhangsan.riskLevel).toBe('high'); // 2 orphaned → high
  });

  it('共享知识域 → 低风险', () => {
    const store = {
      queryNodes: () => [
        { id: 'n1', type: 'Person', props: { name: '张三', teamId: 't1', knowledge: ['支付', '数据库'] } },
        { id: 'n2', type: 'Person', props: { name: '李四', teamId: 't1', knowledge: ['支付', '数据库'] } },
      ],
    };
    const r = checkKeyPersonRisk(store, 't1');
    for (const a of r.assessments) {
      expect(a.orphanedDomains).toHaveLength(0);
      expect(a.riskLevel).toBe('low');
    }
  });

  it('3 独占 → critical', () => {
    const store = {
      queryNodes: () => [
        { id: 'n1', type: 'Person', props: { name: '张三', teamId: 't1', knowledge: ['A', 'B', 'C'] } },
      ],
    };
    const r = checkKeyPersonRisk(store, 't1');
    expect(r.assessments[0].riskLevel).toBe('critical');
  });

  it('formatRiskForLLM', () => {
    const result: KeyPersonRiskResult = {
      findings: [],
      assessments: [
        { personId: '1', personName: '张三', busFactor: 1, orphanedDomains: ['支付'], riskLevel: 'medium' },
        { personId: '2', personName: '李四', busFactor: 99, orphanedDomains: [], riskLevel: 'low' },
      ],
    };
    const text = formatRiskForLLM(result);
    expect(text).toContain('张三');
    expect(text).toContain('Bus Factor 1');
    expect(text).not.toContain('李四'); // low risk filtered out
  });

  it('异常 → 降级空结果', () => {
    const store = { queryNodes: () => { throw new Error('DB error'); } };
    const r = checkKeyPersonRisk(store, 't1');
    expect(r.findings).toEqual([]);
    expect(r.assessments).toEqual([]);
  });
});
