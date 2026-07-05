import { describe, it, expect } from "vitest";
import { collectFeedback, getFeedbackByAction, collectAllFeedback, detectBehavioralValidation, aggregateExternalData, detectCostTemplateDrift, detectDiagnosisContradiction, updateSignalSourceWeight } from "@synova/evolution";

describe('collectFeedback', () => {
  it('confirm → ok+persisted', async () => {
    const result = await collectFeedback({ orgId: 'test-org', actionId: 'act_1', decision: 'confirm' });
    expect(result.ok).toBe(true);
    expect(result.record.decision).toBe('confirm');
    expect(result.persisted).toBe(false); // no memoryStore
  });

  it('reject → recorded', async () => {
    const result = await collectFeedback({ orgId: 'test-org', actionId: 'act_1', decision: 'reject', reason: '不适用' });
    expect(result.record.reason).toBe('不适用');
  });

  it('modify → recorded with modifiedSuggestion', async () => {
    const result = await collectFeedback({ orgId: 'test-org', actionId: 'act_2', decision: 'modify', modifiedSuggestion: '调整定价至35元' });
    expect(result.record.modifiedSuggestion).toBe('调整定价至35元');
  });

  it('getFeedbackByAction → 返回该action的反馈(≥1条)', async () => {
    const r1 = await collectFeedback({ orgId: 'test-org', actionId: 'act_z', decision: 'confirm' });
    await collectFeedback({ orgId: 'test-org', actionId: 'act_z', decision: 'modify', modifiedSuggestion: 'v2' });
    const list = getFeedbackByAction('act_z');
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].decision).toBe('modify');
  });

  it('orgId 必选 — record 中包含 orgId', async () => {
    const result = await collectFeedback({ orgId: 'my-org', actionId: 'act_3', decision: 'confirm' });
    expect(result.record.orgId).toBe('my-org');
  });
});

describe('collectAllFeedback (v3)', () => {
  it('collects from 4 sources', async () => {
    const r = await collectAllFeedback(
      undefined,
      () => [{ id:'bh-1', source:'user_behavior' as const, timestamp:'', teamId:'t1', payload:{}, requiresReview:false, autoApplicable:true }],
      () => [{ id:'ed-1', source:'external_data' as const, timestamp:'', teamId:'t1', payload:{}, requiresReview:true, autoApplicable:false }],
      () => [{ id:'dc-1', source:'diagnosis_contradiction' as const, timestamp:'', teamId:'t1', payload:{}, requiresReview:true, autoApplicable:false }],
    );
    expect(r.events.length).toBeGreaterThanOrEqual(3);
    expect(r.autoApplied).toBe(1);
    expect(r.reviewRequired).toBeGreaterThanOrEqual(2);
  });
  it('degrades on throw', async () => {
    const r = await collectAllFeedback(undefined, () => { throw new Error('fail'); });
    expect(r.degraded).toBe(true);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('detectBehavioralValidation', () => {
  const ms = { queryNodes: () => [{ id:'d1', type:'Document', props:{ text:'需要重新考虑现金流', teamId:'t1' } }], queryEdges: () => [], getNode: () => null };
  it('silenced signal detected', () => {
    const r = detectBehavioralValidation(ms, null, 't1');
    expect(r.some(x => x.originalClassification === 'silenced')).toBe(true);
  });
});
describe('aggregateExternalData', () => {
  it('aggregates revenue', () => {
    const s = { queryNodes: () => [{ id:'f1', type:'FINANCIAL', props:{ revenue:5000000 } }], queryEdges: () => [], getNode: () => null };
    expect(aggregateExternalData(s, 't1')[0].dimension).toBe('industry_avg_revenue');
  });
});
describe('detectCostTemplateDrift', () => {
  it('detects drift', () => {
    const s = { queryNodes: () => [{ id:'f1', type:'FINANCIAL', props:{ cogs:80000, benchmarkCost:100000 } }], queryEdges: () => [], getNode: () => null };
    expect(detectCostTemplateDrift(s, 't1')[0].driftPercent).toBeGreaterThan(0);
  });
});
describe('detectDiagnosisContradiction', () => {
  it('detects contradiction', () => {
    const s = { queryNodes: () => [{ id:'a1', type:'Activity' }], queryEdges: () => [], getNode: () => null };
    expect(detectDiagnosisContradiction(s, null, 't1').length).toBeGreaterThanOrEqual(1);
  });
});
describe('updateSignalSourceWeight', () => {
  it('confirmed increases weight', () => {
    const s = { queryNodes: () => [], queryEdges: () => [], getNode: () => null };
    expect(updateSignalSourceWeight(s, 't1', 's1', 'confirmed').newWeight).toBeGreaterThan(0.5);
  });
  it('dismissed decreases weight', () => {
    const s = { queryNodes: () => [], queryEdges: () => [], getNode: () => null };
    expect(updateSignalSourceWeight(s, 't1', 's2', 'dismissed').newWeight).toBeLessThan(0.5);
  });
});
