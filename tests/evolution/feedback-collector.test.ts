import { describe, it, expect } from 'vitest';
import { collectFeedback, getFeedbackByAction } from '../../src/evolution/feedback-collector';

describe('collectFeedback', () => {
  it('confirm → ok+persisted', async () => {
    const result = await collectFeedback({ actionId: 'act_1', decision: 'confirm' });
    expect(result.ok).toBe(true);
    expect(result.record.decision).toBe('confirm');
    expect(result.persisted).toBe(false); // no memoryStore
  });

  it('reject → recorded', async () => {
    const result = await collectFeedback({ actionId: 'act_1', decision: 'reject', reason: '不适用' });
    expect(result.record.reason).toBe('不适用');
  });

  it('modify → recorded with modifiedSuggestion', async () => {
    const result = await collectFeedback({ actionId: 'act_2', decision: 'modify', modifiedSuggestion: '调整定价至35元' });
    expect(result.record.modifiedSuggestion).toBe('调整定价至35元');
  });

  it('getFeedbackByAction → 返回该action的反馈(≥1条)', async () => {
    const r1 = await collectFeedback({ actionId: 'act_z', decision: 'confirm' });
    await collectFeedback({ actionId: 'act_z', decision: 'modify', modifiedSuggestion: 'v2' });
    const list = getFeedbackByAction('act_z');
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].decision).toBe('modify');
  });
});
