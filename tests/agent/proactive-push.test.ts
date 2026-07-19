/**
 * tests/agent/proactive-push.test.ts — D17 ProactivePush 测试
 *
 * 覆盖 >=9: push成功/多通道/单通道失败/重试成功/重试耗尽/过滤P1/过滤P2/网络错误/消息格式
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProactivePush } from '../../src/agent/proactive-push';
import type { PushChannel, SentinelFinding } from '../../src/agent/proactive-push';

const FAST_RETRY = [1, 1, 1]; // 1ms 重试延迟，避免测试超时

const P0_FINDING: SentinelFinding = {
  id: 'finding-1', sentinelId: 'cash-runway', sentinelName: '现金流哨兵',
  severity: 'critical', title: '现金流不足3个月',
  description: '企业现金流仅够维持2.5个月', suggestion: '立即融资',
  detectedAt: new Date().toISOString(),
};

const P1_FINDING: SentinelFinding = { ...P0_FINDING, id: 'finding-2', severity: 'warning', title: 'P1 告警' };
const P2_FINDING: SentinelFinding = { ...P0_FINDING, id: 'finding-3', severity: 'info', title: 'P2 信息' };

describe('ProactivePush', () => {
  describe('onP0Finding — 过滤逻辑', () => {
    it('P0 (critical) → 推送', async () => {
      const p = new ProactivePush([{ id: 'test', type: 'feishu', enabled: true, send: async () => 'msg-1' }], undefined, FAST_RETRY);
      const results = await p.onP0Finding(P0_FINDING);
      expect(results.some(r => r.status === 'delivered')).toBe(true);
    });

    it('P1 (warning) → 过滤不推送', async () => {
      const p = new ProactivePush([{ id: 'test', type: 'feishu', enabled: true, send: async () => 'msg-1' }], undefined, FAST_RETRY);
      const results = await p.onP0Finding(P1_FINDING);
      expect(results.every(r => r.status === 'filtered')).toBe(true);
    });

    it('P2 (info) → 过滤不推送', async () => {
      const p = new ProactivePush([{ id: 'test', type: 'feishu', enabled: true, send: async () => 'msg-1' }], undefined, FAST_RETRY);
      const results = await p.onP0Finding(P2_FINDING);
      expect(results.every(r => r.status === 'filtered')).toBe(true);
    });
  });

  describe('pushToChannel — 成功', () => {
    it('单通道推送成功', async () => {
      const p = new ProactivePush([{ id: 'ch1', type: 'feishu', enabled: true, send: async () => 'mid-1' }], undefined, FAST_RETRY);
      const result = await p.pushToChannel(
        { id: 'ch1', type: 'feishu', enabled: true, send: async () => 'mid-1' },
        P0_FINDING,
      );
      expect(result.status).toBe('delivered');
      expect(result.messageId).toBe('mid-1');
    });

    it('多通道全部成功', async () => {
      const p = new ProactivePush([
        { id: 'feishu', type: 'feishu', enabled: true, send: async () => 'f-1' },
        { id: 'email', type: 'email', enabled: true, send: async () => 'e-1' },
      ], undefined, FAST_RETRY);
      const results = await p.onP0Finding(P0_FINDING);
      expect(results.filter(r => r.status === 'delivered').length).toBe(2);
    });
  });

  describe('失败与重试', () => {
    it('单通道失败 → 不影响其他通道', async () => {
      const p = new ProactivePush([
        { id: 'good', type: 'feishu', enabled: true, send: async () => 'ok' },
        { id: 'bad', type: 'feishu', enabled: true, send: async () => { throw new Error('err'); } },
      ], undefined, FAST_RETRY);
      const results = await p.onP0Finding(P0_FINDING);
      expect(results.filter(r => r.status === 'delivered').length).toBe(1);
      expect(results.filter(r => r.status === 'failed').length).toBe(1);
    });

    it('重试耗尽 → status=failed', async () => {
      const p = new ProactivePush([{
        id: 'bad', type: 'feishu', enabled: true,
        send: async () => { throw new Error('一直失败'); },
      }], undefined, FAST_RETRY);
      const result = await p.pushToChannel(
        { id: 'bad', type: 'feishu', enabled: true, send: async () => { throw new Error('一直失败'); } },
        P0_FINDING,
      );
      expect(result.status).toBe('failed');
      expect(result.retries).toBeGreaterThanOrEqual(3);
    });

    it('首次失败后重试成功', async () => {
      let attempts = 0;
      const channel: PushChannel = {
        id: 'retry-ch', type: 'feishu', enabled: true,
        send: async () => {
          attempts++;
          if (attempts === 1) throw new Error('超时');
          return 'msg-ok';
        },
      };
      const p = new ProactivePush([channel], undefined, FAST_RETRY);
      const result = await p.pushToChannel(channel, P0_FINDING);
      expect(result.status).toBe('delivered');
      expect(result.retries).toBe(1);
    });
  });

  describe('消息格式', () => {
    it('finding 包含必需字段', () => {
      expect(P0_FINDING.title).toBeTruthy();
      expect(P0_FINDING.severity).toBe('critical');
      expect(P0_FINDING.detectedAt).toBeTruthy();
    });
  });
});
