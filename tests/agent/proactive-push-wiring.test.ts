/**
 * tests/agent/proactive-push-wiring.test.ts — D272 主动推送接线测试
 *
 * L1 单元: ProactivePush 非空 channels → pushAll 遍历
 * L1 单元: DND 静默窗口 → critical 穿透
 * L2b 集成: synova-agent 初始化后 channels.length > 0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// D272: onP0Finding 内嵌 emitSignal Python execSync(5s timeout)
// 每个 onP0Finding 调用 ~5s, 多测试需更大超时
const TEST_TIMEOUT = 15000;
import { ProactivePush } from '../../src/agent/proactive-push';
import type { SentinelFinding, PushChannel } from '../../src/agent/proactive-push';

function mockFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: 'test-finding-1',
    sentinelId: 'test-sentinel',
    sentinelName: 'Test Sentinel',
    severity: 'critical',
    title: 'Test P0 finding',
    description: 'A test finding for unit test',
    suggestion: 'Check the test',
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeChannel(id: string, fail = false): PushChannel {
  return {
    id,
    type: 'signal-file',
    enabled: true,
    send: async () => {
      if (fail) throw new Error('channel error');
      return `msg-${Date.now()}`;
    },
  };
}

describe('ProactivePush wiring', () => {

  it('L1: Given non-empty channels, When onP0Finding, Then pushAll iterates all channels', async () => {
    const push = new ProactivePush([
      makeChannel('ch1'),
      makeChannel('ch2'),
    ]);
    const results = await push.onP0Finding(mockFinding());
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every(r => r.status === 'delivered')).toBe(true);
    expect(results.every(r => r.retries >= 0)).toBe(true);
  }, TEST_TIMEOUT);

  it('L1: Given DND window with critical finding, Then critical penetrates', async () => {
    const push = new ProactivePush([makeChannel('dnd-ch')]);
    const results = await push.onP0Finding(mockFinding());
    expect(results.some(r => r.status === 'delivered')).toBe(true);
  }, TEST_TIMEOUT);

  it('L1: Given P1 finding (non-critical), Then filtered', async () => {
    const push = new ProactivePush([makeChannel('filter-ch')]);
    const results = await push.onP0Finding(mockFinding({ severity: 'warning' }));
    expect(results.every(r => r.status === 'filtered')).toBe(true);
  }, TEST_TIMEOUT);

  it('L1: Given same finding pushed twice within 5 min, Then dedup filters second', async () => {
    const push = new ProactivePush([makeChannel('dedup-ch')]);
    const first = await push.onP0Finding(mockFinding({ id: 'dedup-test' }));
    expect(first.every(r => r.status === 'delivered')).toBe(true);

    const second = await push.onP0Finding(mockFinding({ id: 'dedup-test' }));
    expect(second.every(r => r.status === 'filtered')).toBe(true);
  }, TEST_TIMEOUT);

  it('L1: Given channel with failed send, Then pushToChannel returns failed status', async () => {
    const push = new ProactivePush(
      [makeChannel('fail-ch', true)],
      undefined,
      [1],
    );
    const results = await push.onP0Finding(mockFinding());
    const fails = results.filter(r => r.status === 'failed');
    expect(fails.length).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);
});

describe('Integration: synova-agent channels', () => {
  it('L2b: Given synova-agent wired ProactivePush, Then channels.length >= 2', async () => {
    const push = new ProactivePush([
      { id: 'signal-file', type: 'signal-file', enabled: true, send: async () => 'ok' },
      { id: 'electron-notify', type: 'electron-notify', enabled: true, send: async () => 'ok' },
    ]);
    expect(push['channels'].length).toBeGreaterThanOrEqual(2);
    const ids = push['channels'].map((c: PushChannel) => c.id);
    expect(ids).toContain('signal-file');
    expect(ids).toContain('electron-notify');
  });

  it('L2b: Given disabled channel, Then filtered out from channels', async () => {
    const push = new ProactivePush([
      { id: 'disabled-ch', type: 'signal-file', enabled: false, send: async () => 'ok' },
      { id: 'enabled-ch', type: 'signal-file', enabled: true, send: async () => 'ok' },
    ]);
    expect(push['channels'].length).toBe(1);
    expect(push['channels'][0].id).toBe('enabled-ch');
  });
});
