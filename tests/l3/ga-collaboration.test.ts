/**
 * tests/l3/ga-collaboration.test.ts — D19 GA 人机协作测试
 *
 * 覆盖 >=8: correct/flag/rediagnose/unknown/再诊断失败/collector未配置/CA按钮/CA操作
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GAFeedbackHandler, GAFeedbackActionType } from '../../src/l3/ga-collaboration';
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
        findingId: 'f1', action: 'unknown' as unknown as GAFeedbackActionType,
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

    it('4 参直传 enterpriseId → collectFeedback 收到该值 (D476 O8)', async () => {
      let captured: string | undefined;
      handler.setFeedbackCollector({
        collectFeedback: (data) => {
          captured = data.enterpriseId as string;
          return { id: 'fb-1' };
        },
      });
      const id = await handler.recordCorrection('f1', '修正内容', 'ga-1', 'org-x');
      expect(id).toBe('fb-1');
      expect(captured).toBe('org-x');
    });
  });

  describe('enterpriseId 上下文透传 (D476 O8)', () => {
    it('processFeedback correct → collectFeedback 收到 action.enterpriseId（不落 default）', async () => {
      let captured: string | undefined;
      handler.setFeedbackCollector({
        collectFeedback: (data) => {
          captured = data.enterpriseId as string;
          return { id: 'fb-d476' };
        },
      });
      const result = await handler.processFeedback({
        findingId: 'f2', action: 'correct', correction: '修正',
        gaUserId: 'ga-1', enterpriseId: 'org-x',
      });
      expect(result.status).toBe('success');
      expect(captured).toBe('org-x');
    });
  });
});

describe('recordCorrection 缺省 enterpriseId = config.orgId (D476 O8)', () => {
  beforeEach(() => {
    process.env.SYNOVA_ORG_ID = 'org-test';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.SYNOVA_ORG_ID;
    vi.resetModules();
  });

  it('3 参调用未传 enterpriseId → 回落实例 org（SYNOVA_ORG_ID），不落 default', async () => {
    const { GAFeedbackHandler: FreshHandler } = await import('../../src/l3/ga-collaboration');
    const freshHandler = new FreshHandler();
    let captured: string | undefined;
    freshHandler.setFeedbackCollector({
      collectFeedback: (data) => {
        captured = data.enterpriseId as string;
        return { id: 'fb-1' };
      },
    });
    const id = await freshHandler.recordCorrection('f1', '修正内容', 'ga-1');
    expect(id).toBe('fb-1');
    expect(captured).toBe('org-test');
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

  it('handleAction 经 GAFeedbackHandler 透传 action.enterpriseId (D476 O8)', async () => {
    const gaHandler = new GAFeedbackHandler();
    let captured: string | undefined;
    gaHandler.setFeedbackCollector({
      collectFeedback: (data) => {
        captured = data.enterpriseId as string;
        return { id: 'fb-e2e' };
      },
    });
    const card = new InteractiveCardHandler();
    const result = await card.handleAction(
      { findingId: 'f1', action: 'correct', userId: 'ga-1', enterpriseId: 'e1' },
      undefined, undefined, undefined, undefined, gaHandler,
    );
    expect(result.status).toBe('success');
    expect(captured).toBe('e1');
  });
});
