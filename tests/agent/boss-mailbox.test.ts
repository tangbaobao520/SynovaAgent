import { describe, it, expect } from 'vitest';
import { BossMailbox } from '../../src/agent/boss-mailbox';

const mailbox = new BossMailbox();

describe('BossMailbox.generateReport', () => {
  it('generates report with critical + warning signals', () => {
    const report = mailbox.generateReport('XX科技', '2026-W27', [
      { severity: 'critical', title: '现金流预警', description: '连续3周恶化', trend: 'worsening' },
      { severity: 'warning', title: '人员流失', description: '2人离职', trend: 'stable' },
    ], []);
    expect(report.subject).toContain('XX科技');
    expect(report.subject).toContain('2026-W27');
    expect(report.signals).toHaveLength(2);
    expect(report.needsAttention).toHaveLength(1);
    expect(report.needsAttention[0]).toContain('现金流预警');
  });

  it('stalled actions auto-flagged as needsAttention', () => {
    const report = mailbox.generateReport('测试', 'W1', [], [
      { title: '知识转移项目', status: 'stalled', detail: '张老师未配合' },
      { title: 'CRM上线', status: 'in_progress', detail: '按计划推进' },
    ]);
    expect(report.needsAttention).toHaveLength(1);
    expect(report.needsAttention[0]).toContain('知识转移项目');
  });

  it('empty input → empty report', () => {
    const report = mailbox.generateReport('测试', 'W1', [], []);
    expect(report.signals).toEqual([]);
    expect(report.needsAttention).toEqual([]);
  });
});

describe('BossMailbox.renderText', () => {
  it('renders critical + warning + actions + footer', () => {
    const text = mailbox.renderText({
      subject: '测试周报',
      generatedAt: new Date().toISOString(),
      signals: [
        { severity: 'critical', title: '现金流断裂', description: '资金链紧张', trend: 'worsening' },
        { severity: 'warning', title: '客户流失', description: '大客户B流失风险', trend: 'stable' },
      ],
      actions: [{ title: '成本优化', status: 'in_progress', detail: '正在进行' }],
      needsAttention: ['现金流断裂: 资金链紧张'],
    });
    expect(text).toContain('一、本周关键信号');
    expect(text).toContain('二、正在执行的方案进展');
    expect(text).toContain('三、需要你关注的事');
    expect(text).toContain('Synova Agent 自动生成');
  });

  it('renders empty signals gracefully', () => {
    const text = mailbox.renderText({
      subject: '空报告', generatedAt: new Date().toISOString(),
      signals: [], actions: [], needsAttention: [],
    });
    expect(text).toContain('本周无关键信号');
  });
});
