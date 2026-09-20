import { describe, it, expect } from "vitest";
import { collectFeedback, getFeedbackByAction, collectAllFeedback, collectGaCalibrationFeedback, detectBehavioralValidation, aggregateExternalData, detectCostTemplateDrift, detectDiagnosisContradiction, updateSignalSourceWeight } from "@synova/evolution";
import type { AgentMemoryStoreLike, GaCalibrationAction } from "@synova/evolution";

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
    // D829: id 唯一化后同毫秒写入不再互相覆盖 → 断言「两条独立记录」而非「1 条被覆盖」。
    // 旧实现同毫秒两次写入 id 相同 → Map/UPSERT 覆盖 → 本用例此前靠覆盖才能过。
    await new Promise((r) => setTimeout(r, 5)); // 保证 timestamp 严格递增（降序断言的物理前提）
    await collectFeedback({ orgId: 'test-org', actionId: 'act_z', decision: 'modify', modifiedSuggestion: 'v2' });
    const list = getFeedbackByAction('act_z');
    expect(r1.record.id).toBeTruthy();
    expect(list.length).toBe(2);
    expect(list[0].decision).toBe('modify');
    expect(list.map((x) => x.decision)).toContain('confirm');
  });

  it('orgId 必选 — record 中包含 orgId', async () => {
    const result = await collectFeedback({ orgId: 'my-org', actionId: 'act_3', decision: 'confirm' });
    expect(result.record.orgId).toBe('my-org');
  });
});
describe('collectAllFeedback', () => {
  it('collects from 4 sources', async () => {
    const r = await collectAllFeedback(undefined,
      () => [{ id:'b1', source:'user_behavior' as const, timestamp:'', teamId:'t1', payload:{}, requiresReview:false, autoApplicable:true }],
      () => [{ id:'e1', source:'external_data' as const, timestamp:'', teamId:'t1', payload:{}, requiresReview:true, autoApplicable:false }],
      () => [{ id:'c1', source:'diagnosis_contradiction' as const, timestamp:'', teamId:'t1', payload:{}, requiresReview:true, autoApplicable:false }]);
    expect(r.events.length).toBeGreaterThanOrEqual(3); expect(r.autoApplied).toBe(1); expect(r.reviewRequired).toBeGreaterThanOrEqual(2);
  });
  it('degrades on throw', async () => { const r = await collectAllFeedback(undefined, () => { throw new Error('fail'); }); expect(r.degraded).toBe(true); });
});

describe('v3 org-adapter functions', () => {
  const ms = { queryNodes: () => [{ id:'d1', type:'Document', props:{ text:'需要重新考虑现金流', teamId:'t1' } }], queryEdges: () => [], getNode: () => null };
  it('detectBehavioralValidation', () => { expect(detectBehavioralValidation(ms, null, 't1').some(x => x.originalClassification === 'silenced')).toBe(true); });
  it('aggregateExternalData', () => { const s = { queryNodes: () => [{ id:'f1', type:'FINANCIAL', props:{ revenue:5000000 } }], queryEdges: () => [], getNode: () => null }; expect(aggregateExternalData(s, 't1')[0].dimension).toBe('industry_avg_revenue'); });
  it('detectCostTemplateDrift', () => { const s = { queryNodes: () => [{ id:'f1', type:'FINANCIAL', props:{ cogs:80000, benchmarkCost:100000 } }], queryEdges: () => [], getNode: () => null }; expect(detectCostTemplateDrift(s, 't1')[0].driftPercent).toBeGreaterThan(0); });
  it('detectDiagnosisContradiction', () => { const s = { queryNodes: () => [{ id:'a1', type:'Activity' }], queryEdges: () => [], getNode: () => null }; expect(detectDiagnosisContradiction(s, null, 't1').length).toBeGreaterThanOrEqual(1); });
  it('updateSignalSourceWeight', () => { expect(updateSignalSourceWeight(null, 't1', 's1', 'confirmed').newWeight).toBeGreaterThan(0.5); expect(updateSignalSourceWeight(null, 't1', 's2', 'dismissed').newWeight).toBeLessThan(0.5); });
});

// ═══ D829: GA 校准动作 → evolution decision 映射（L0 语义留 L0；L1 只薄调用） ═══

type RememberArg = Parameters<AgentMemoryStoreLike['remember']>[0];

/** 记录型 memoryStore 桩 —— 只捕获 remember 入参，用于断言「映射后的 decision/tags 落库形状」 */
function recordingStore(): { written: RememberArg[]; store: AgentMemoryStoreLike } {
  const written: RememberArg[] = [];
  const store: AgentMemoryStoreLike = {
    remember: (entry) => { written.push(entry); return entry; },
    recall: () => null,
    list: () => [],
    forget: () => true,
  };
  return { written, store };
}

describe('D829 collectGaCalibrationFeedback — 动作映射 + 降级契约', () => {
  it('D829 mark_error → decision=reject + 落 enterprise_fact/user_correction', async () => {
    const { written, store } = recordingStore();
    const r = await collectGaCalibrationFeedback({
      orgId: 'd829-org', targetId: 'diag-1', action: 'mark_error',
      sentinelId: 'sentinel-d829', reason: 'GA 校准 mark_error', userId: 'ga-1',
    }, store);
    expect(r.collected).toBe(true);
    expect(r.persisted).toBe(true);
    expect(r.degraded).toBe(false);
    expect(r.record?.decision).toBe('reject');
    expect(r.record?.actionId).toBe('diag-1');
    expect(r.record?.orgId).toBe('d829-org');
    expect(written).toHaveLength(1);
    expect(written[0].orgId).toBe('d829-org');
    expect(written[0].type).toBe('enterprise_fact');
    expect(written[0].source).toBe('user_feedback');
    expect(written[0].tags).toEqual(['user_correction', 'reject', 'sentinel-d829']);
    // OrgAdapter 消费形状: value 必须是可解析的 FeedbackRecord
    expect(JSON.parse(written[0].value).actionId).toBe('diag-1');
  });

  it('D829 rewrite_logic → decision=modify + modifiedSuggestion 落库', async () => {
    const { written, store } = recordingStore();
    const r = await collectGaCalibrationFeedback({
      orgId: 'd829-org', targetId: 'logic-1', action: 'rewrite_logic',
      modifiedSuggestion: 'GA 重写后的逻辑', reason: 'GA 校准 rewrite_logic', userId: 'ga-1',
    }, store);
    expect(r.record?.decision).toBe('modify');
    expect(r.record?.modifiedSuggestion).toBe('GA 重写后的逻辑');
    expect(written[0].tags).toEqual(['user_correction', 'modify', 'unknown']);
  });

  it('D829 demote_signal → decision=reject（evolution 无 ineffective 枚举，归一为否定）+ sentinelId 进 tags', async () => {
    const { written, store } = recordingStore();
    const r = await collectGaCalibrationFeedback({
      orgId: 'd829-org', targetId: 'finding-1', action: 'demote_signal',
      sentinelId: 'sentinel-demoted', reason: 'GA 校准 demote_signal',
    }, store);
    expect(r.record?.decision).toBe('reject');
    expect(written[0].tags).toEqual(['user_correction', 'reject', 'sentinel-demoted']);
  });

  it('D829 add_context 不收集（边界: 背景卡是上下文增强，非纠错信号）', async () => {
    const { written, store } = recordingStore();
    const r = await collectGaCalibrationFeedback({
      orgId: 'd829-org', targetId: 'diag-ctx', action: 'add_context', reason: 'GA 校准 add_context',
    }, store);
    expect(r.collected).toBe(false);
    expect(r.reason).toBe('not_a_correction');
    expect(r.record).toBeUndefined();
    expect(r.degraded).toBe(false);
    expect(written).toHaveLength(0);
  });

  it('D829 降级: 无 memoryStore → 收集成功但不持久化 + degraded=true（铁律 31 传播）', async () => {
    const r = await collectGaCalibrationFeedback({
      orgId: 'd829-org', targetId: 'diag-nostore', action: 'mark_error', reason: 'reason',
    });
    expect(r.collected).toBe(true);
    expect(r.persisted).toBe(false);
    expect(r.degraded).toBe(true);
    expect(r.record?.id).toBeTruthy();
  });

  it('D829 降级: memoryStore.remember 抛错 → 不抛给调用方 + degraded=true（铁律 24 非空吞）', async () => {
    const throwing: AgentMemoryStoreLike = {
      remember: () => { throw new Error('D829 injected store failure'); },
      recall: () => null,
      list: () => [],
      forget: () => true,
    };
    const r = await collectGaCalibrationFeedback({
      orgId: 'd829-org', targetId: 'diag-throw', action: 'mark_error', reason: 'reason',
    }, throwing);
    expect(r.collected).toBe(true);
    expect(r.persisted).toBe(false);
    expect(r.degraded).toBe(true);
  });

  it('D829 边界: 未知动作 → 不收集（防御, 不落库不抛）', async () => {
    const { written, store } = recordingStore();
    const outOfUnion = 'unknown_action' as GaCalibrationAction;
    const r = await collectGaCalibrationFeedback({
      orgId: 'd829-org', targetId: 'x', action: outOfUnion,
    }, store);
    expect(r.collected).toBe(false);
    expect(r.degraded).toBe(false);
    expect(written).toHaveLength(0);
  });

  it('D829 回归: 同毫秒连续纠错不得 id/key 相撞（旧实现 5 连写 distinct=1 → UPSERT 静默覆盖）', async () => {
    const { written, store } = recordingStore();
    for (const t of ['t1', 't2', 't3', 't4', 't5']) {
      await collectGaCalibrationFeedback({
        orgId: 'd829-org', targetId: t, action: 'mark_error', sentinelId: 's-race', reason: '同毫秒连写',
      }, store);
    }
    expect(written).toHaveLength(5);
    const keys = written.map((w) => w.key);
    expect(new Set(keys).size).toBe(5);
    expect(new Set(written.map((w) => JSON.parse(w.value).id)).size).toBe(5);
  });
});
