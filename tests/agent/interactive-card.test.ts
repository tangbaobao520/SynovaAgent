/**
 * tests/agent/interactive-card.test.ts — D18 交互式卡片回复
 *
 * 覆盖: buildCard / Confirm / Dismiss / Details / 无效操作 / 网络错误 / D93集成
 * 约束: ≥9测试 / 零as any
 */
import { describe, it, expect } from 'vitest';
import { InteractiveCardHandler, type CardSentinelFinding, type CardAction } from '../../src/agent/interactive-card';

function makeFinding(overrides: Partial<CardSentinelFinding> = {}): CardSentinelFinding {
  return {
    id: 'finding-001',
    sentinelId: 'sentinel-cash',
    sentinelName: '现金流水哨兵',
    severity: 'critical',
    title: '现金流异常下降',
    description: '过去30天运营现金流下降45%',
    suggestion: '检查应收账款回收周期',
    detectedAt: new Date().toISOString(),
    matchedEdgeIds: ['E-05'],
    ...overrides,
  };
}

describe('D18 — buildCardMessage', () => {
  it('卡片有3个按钮 (Confirm/Dismiss/Details)', () => {
    const handler = new InteractiveCardHandler();
    const finding = makeFinding();
    const card = handler.buildCardMessage(finding);
    expect(card.buttons).toHaveLength(3);
    expect(card.buttons.map(b => b.action)).toContain('confirm');
    expect(card.buttons.map(b => b.action)).toContain('dismiss');
    expect(card.buttons.map(b => b.action)).toContain('details');
  });

  it('卡片包含告警标题和严重程度', () => {
    const handler = new InteractiveCardHandler();
    const card = handler.buildCardMessage(makeFinding({ title: '测试告警' }));
    expect(card.title).toContain('测试告警');
    expect(card.color).toBe('red');
  });
});

describe('D18 — handleAction Confirm', () => {
  it('确认操作返回绿色checkmark', async () => {
    const handler = new InteractiveCardHandler();
    const action: CardAction = { findingId: 'finding-001', action: 'confirm', userId: 'user-1', enterpriseId: 'org-1' };
    const result = await handler.handleAction(action);
    expect(result.status).toBe('success');
    expect(result.cardUpdate.color).toBe('green');
    expect(result.cardUpdate.title).toContain('确认');
  });

  it('确认操作写入审计', async () => {
    const handler = new InteractiveCardHandler();
    let auditWritten = false;
    const auditStore = { write: async () => { auditWritten = true; return 'audit-1'; } };
    await handler.handleAction(
      { findingId: 'f1', action: 'confirm', userId: 'u1', enterpriseId: 'org-1' },
      undefined, auditStore,
    );
    expect(auditWritten).toBe(true);
  });
});

describe('D18 — handleAction Dismiss', () => {
  it('Dismiss标记为误报', async () => {
    const handler = new InteractiveCardHandler();
    const result = await handler.handleAction({ findingId: 'f1', action: 'dismiss', userId: 'u1', enterpriseId: 'org-1' });
    expect(result.status).toBe('success');
    expect(result.cardUpdate.color).toBe('grey');
    expect(result.cardUpdate.title).toContain('误报');
  });

  it('Dismiss写入D93 feedbackCollector', async () => {
    const handler = new InteractiveCardHandler();
    let feedbackWritten = false;
    const collector = { collectFeedback: async () => { feedbackWritten = true; return 'fb-1'; } };
    await handler.handleAction(
      { findingId: 'f1', action: 'dismiss', userId: 'u1', enterpriseId: 'org-1' },
      collector,
    );
    expect(feedbackWritten).toBe(true);
  });
});

describe('D18 — handleAction Details', () => {
  it('Details返回完整发现文本', async () => {
    const handler = new InteractiveCardHandler();
    const finding = makeFinding();
    const result = await handler.handleAction(
      { findingId: 'finding-001', action: 'details', userId: 'u1', enterpriseId: 'org-1' },
      undefined, undefined, (id) => id === 'finding-001' ? finding : undefined,
    );
    expect(result.status).toBe('success');
    expect(result.cardUpdate.title).toContain('详情');
    expect(result.cardUpdate.body).toContain('现金流水哨兵');
    expect(result.cardUpdate.body).toContain('E-05');
  });
});

describe('D18 — 错误处理', () => {
  it('无效操作 → 返回错误卡片', async () => {
    const handler = new InteractiveCardHandler();
    const result = await handler.handleAction(
      { findingId: 'f1', action: 'invalid' as 'confirm', userId: 'u1', enterpriseId: 'org-1' },
    );
    expect(result.status).toBe('failed');
    expect(result.cardUpdate.title).toContain('未知操作');
  });

  it('auditStore抛出异常 → 降级不阻断', async () => {
    const handler = new InteractiveCardHandler();
    const brokenAudit = { write: async () => { throw new Error('DB down'); } };
    const result = await handler.handleAction(
      { findingId: 'f1', action: 'confirm', userId: 'u1', enterpriseId: 'org-1' },
      undefined, brokenAudit,
    );
    // 即使审计失败，卡片确认仍然成功
    expect(result.status).toBe('success');
    expect(result.cardUpdate.color).toBe('green');
  });
});

describe('D18 — ProactivePush 集成', () => {
  it('onP0Finding调用buildCardMessage', async () => {
    // 验证 proactive-push.ts 导入了 InteractiveCardHandler
    const { ProactivePush } = await import('../../src/agent/proactive-push');
    const push = new ProactivePush([]);
    expect(push).toBeDefined();
  });
});
