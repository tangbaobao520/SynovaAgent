/**
 * tests/interview/signal-extractor.test.ts — T11 signal-extractor 测试
 *
 * 约束6: ≥3个测试（正常路径+边界+降级）
 * 约束2: 验证提取规则是确定性的 if/else 逻辑
 */
import { describe, it, expect } from 'vitest';
import { extractSignals } from '../../src/interview/signal-extractor';
import type { RoleResponse } from '../../src/interview/engine';

/**
 * 构建模拟的 RoleResponse 数据
 */
function makeResponses(overrides: Partial<RoleResponse>[]): RoleResponse[] {
  return overrides.map((o, i) => ({
    roleId: 'ceo',
    questionIndex: 0,
    answer: '默认回答',
    confidence: 0.5,
    ...o,
    // 确保 id 不冲突
  }));
}

describe('T11 signal-extractor', () => {
  it('R1: 正常路径 — CEO矛盾检测 (认知偏差大)', () => {
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 0, answer: '公司最大的问题是市场竞争太激烈', confidence: 0.9 },
      { roleId: 'engineer', questionIndex: 0, answer: '公司最大的问题是内部流程太乱，没人知道方向', confidence: 0.2 },
      { roleId: 'cto', questionIndex: 0, answer: '技术债拖慢了所有事情', confidence: 0.8 },
    ];
    const roleIds = ['ceo', 'engineer', 'cto'];
    const result = extractSignals(responses, roleIds);

    expect(result.degraded).toBe(false);
    expect(result.signals.length).toBeGreaterThanOrEqual(1);
    // 应该有 contradiction 类型的信号
    const contradictions = result.signals.filter(s => s.evidenceType === 'contradiction');
    expect(contradictions.length).toBeGreaterThanOrEqual(1);
  });

  it('R2: 痛觉点映射 — 关键词匹配', () => {
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 3, answer: '审批太慢了，签一个合同要过五个人', confidence: 0.8 },
      { roleId: 'engineer', questionIndex: 3, answer: '工具不好用，系统卡得不想干活', confidence: 0.7 },
      { roleId: 'manager', questionIndex: 3, answer: '部门墙太严重，互相不配合', confidence: 0.6 },
    ];
    const roleIds = ['ceo', 'engineer', 'manager'];
    const result = extractSignals(responses, roleIds);

    expect(result.signals.length).toBeGreaterThanOrEqual(3);
    // 检查痛觉点信号（R2）
    const painSignals = result.signals.filter(s => s.id.startsWith('pain_'));
    expect(painSignals.length).toBeGreaterThanOrEqual(1);
    // 验证关键词映射正确
    const approvalSignal = painSignals.find(s => s.dimension === 'decision_concentration');
    expect(approvalSignal).toBeDefined();
    if (approvalSignal) {
      expect(approvalSignal.sourceRole).toBe('ceo');
    }
  });

  it('R3: 必须性得分 — 信息衰减检测', () => {
    // CEO 认为信息畅通，一线认为不透明 → 衰减信号
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 2, answer: '我知道团队的所有情况，信息传递很透明很及时', confidence: 0.9 },
      { roleId: 'engineer', questionIndex: 2, answer: '很多事情CEO不知道，下面报喜不报忧，信息被过滤了', confidence: 0.3 },
      { roleId: 'manager', questionIndex: 2, answer: '上面不了解下面的真实情况，不敢说真话', confidence: 0.4 },
    ];
    const roleIds = ['ceo', 'engineer', 'manager'];
    const result = extractSignals(responses, roleIds);

    // 应该有 R3 信号
    const necessitySignals = result.signals.filter(s => s.id.startsWith('necessity_'));
    expect(necessitySignals.length).toBeGreaterThanOrEqual(1);
    // 信息衰减信号应该指向 signal_transmits
    const transmitsSignal = result.signals.find(s => s.dimension === 'signal_transmits');
    expect(transmitsSignal).toBeDefined();
  });

  it('降级: 访谈角色不足3个 → degraded:true', () => {
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 0, answer: '最大问题是市场', confidence: 0.8 },
    ];
    const roleIds = ['ceo']; // 只有 1 个角色
    const result = extractSignals(responses, roleIds);

    expect(result.degraded).toBe(true);
    expect(result.warnings.some(w => w.includes('角色数不足'))).toBe(true);
  });

  it('降级: 空数据和角色列表 → 不崩溃', () => {
    const result = extractSignals([], []);
    expect(result).toBeDefined();
    expect(result.signals.length).toBe(0);
    expect(result.contradictions.length).toBe(0);
    expect(result.degraded).toBe(true);
  });

  it('正常: 多角色多维度信号混合提取', () => {
    const responses: RoleResponse[] = [
      // CEO: A1(最大问题) + A4(改一件事)
      { roleId: 'ceo', questionIndex: 0, answer: '市场增长放缓，获客成本上升', confidence: 0.8 },
      { roleId: 'ceo', questionIndex: 3, answer: '预算审批流程太复杂', confidence: 0.7 },
      // CTO: A1 + A3(信息传递)
      { roleId: 'cto', questionIndex: 0, answer: '技术债太多，改一个功能要动十几个服务', confidence: 0.85 },
      { roleId: 'cto', questionIndex: 2, answer: '沟通靠口头传递，没有系统记录', confidence: 0.5 },
      // Engineer: A1 + A4
      { roleId: 'engineer', questionIndex: 0, answer: '重复劳动太多，需求变来变去', confidence: 0.4 },
      { roleId: 'engineer', questionIndex: 3, answer: 'KPI不合理，做得好不如说得好', confidence: 0.6 },
      // Manager: A1
      { roleId: 'manager', questionIndex: 0, answer: '资源不够，流程混乱', confidence: 0.5 },
    ];
    const roleIds = ['ceo', 'cto', 'engineer', 'manager'];
    const result = extractSignals(responses, roleIds);

    expect(result.signals.length).toBeGreaterThanOrEqual(5);
    // 应该同时有 contradiction 和 pain 信号
    expect(result.signals.some(s => s.evidenceType === 'contradiction')).toBe(true);
    expect(result.signals.some(s => s.id.startsWith('pain_'))).toBe(true);
    expect(result.degraded).toBe(false);
  });

  it('约束2: 确定性规则 — 相同输入产生相同输出', () => {
    const responses: RoleResponse[] = [
      { roleId: 'ceo', questionIndex: 3, answer: '人员流失太严重了，留不住人', confidence: 0.8 },
      { roleId: 'manager', questionIndex: 3, answer: '薪酬没有竞争力，人都想走', confidence: 0.6 },
      { roleId: 'hr', questionIndex: 3, answer: '离职率高，招聘效率低', confidence: 0.5 },
    ];
    const roleIds = ['ceo', 'manager', 'hr'];

    const result1 = extractSignals(responses, roleIds);
    const result2 = extractSignals(responses, roleIds);

    // 确定性 — 两次提取结果必须一致
    expect(result1.signals.length).toBe(result2.signals.length);
    for (let i = 0; i < result1.signals.length; i++) {
      expect(result1.signals[i].dimension).toBe(result2.signals[i].dimension);
      expect(result1.signals[i].signalStrength).toBe(result2.signals[i].signalStrength);
    }
  });
});
