/**
 * tests/l3/ga-collaboration.test.ts — D19 GA 人机协作测试
 *
 * 覆盖 >=8: correct/flag/rediagnose/unknown/再诊断失败/collector未配置/CA按钮/CA操作
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GAFeedbackHandler } from '../../src/l3/ga-collaboration';
import { InteractiveCardHandler } from '../../src/agent/interactive-card';

describe('GAFeedbackHandler', () => {
  let handler: GAFeedbackHandler;

  beforeEach(() => { handler = new GAFeedbackHandler(); });

  describe('processFeedback', () => {
    it('correct → 状态 success', async () => {
      const result = await handler.processFeedback({
        findingId: 'f1', action: 'correct', correction: '该告警为误报，客户已于上月补充资金',
        gaUserId: 'ga-1', enterpriseId: 'e1',
      });
      expect(result.status).toBe('success');
      expect(result.action).toBe('correct');
      expect(result.message).toContain('纠正');
    });

    it('flag → 降级（再诊断引擎未配置）', async () => {
      const result = await handler.processFeedback({
        findingId: 'f1', action: 'flag',
        gaUserId: 'ga-1', enterpriseId: 'e1',
      });
      expect(result.status).toBe('degraded');
      expect(result.reDiagnosisId).toBeUndefined();
    });

    it('rediagnose → 降级（再诊断引擎未配置）', async () => {
      const result = await handler.processFeedback({
        findingId: 'f1', action: 'rediagnose',
        gaUserId: 'ga-1', enterpriseId: 'e1',
      });
      expect(result.status).toBe('degraded');
    });

    it('未知操作 → failed', async () => {
      const result = await handler.processFeedback({
        findingId: 'f1', action: 'unknown' as any,
        gaUserId: 'ga-1', enterpriseId: 'e1',
      });
      expect(result.status).toBe('failed');
    });
  });

  describe('triggerReDiagnosis', () => {
    it('引擎未配置 → 空字符串', async () => {
      const id = await handler.triggerReDiagnosis('f1', 'ga-1');
      expect(id).toBe('');
    });

    it('引擎配置后 → 返回 diagnosisId', async () => {
      handler.setReDiagnosisEngine({
        triggerReDiagnosis: async () => 'diag-new-1',
      });
      const id = await handler.triggerReDiagnosis('f1', 'ga-1');
      expect(id).toBe('diag-new-1');
    });

    it('引擎失败 → 空字符串', async () => {
      handler.setReDiagnosisEngine({
        triggerReDiagnosis: async () => { throw new Error('D75 不可用'); },
      });
      const id = await handler.triggerReDiagnosis('f1', 'ga-1');
      expect(id).toBe('');
    });
  });

  describe('recordCorrection', () => {
    it('collector 未配置 → unrecorded', async () => {
      const id = await handler.recordCorrection('f1', '修正内容', 'ga-1');
      expect(id).toBe('unrecorded');
    });
  });
});

describe('InteractiveCardHandler GA 扩展', () => {
  it('buildGACardMessage → 包含 GA 按钮', () => {
    const card = new InteractiveCardHandler();
    const msg = card.buildGACardMessage({
      id: 'f1', sentinelId: 's1', sentinelName: '哨兵',
      severity: 'critical', title: '测试告警',
      detectedAt: new Date().toISOString(),
    });
    const gaActions = msg.buttons.filter(b => ['flag', 'correct', 'rediagnose'].includes(b.action));
    expect(gaActions.length).toBe(3);
  });

  it('handleAction 接受 GA action 类型', async () => {
    const card = new InteractiveCardHandler();
    const result = await card.handleAction({
      findingId: 'f1', action: 'flag', userId: 'ga-1', enterpriseId: 'e1',
    });
    expect(result.status).toBe('success');
  });
});
