/**
 * tests/sentinel/sentinel-service-closure.test.ts — GS-05 告警闭环：run-once → runner 管线 → 工单
 *
 * 契约（D356 缺口修复）: runSentinelOnce 在全局 runner 可用时走 runner.runOnce（记录运行）
 *   + aggregateAndDispatch（信号聚合 → 专家 → sentinel_tickets 工单闭环）；
 *   runner 不可用 → 降级直连 check（D453 行为保持）。
 * 铁律 48: 正常路径（runner 管线调用断言）+ 降级路径（无 runner → 直连）+ expect 断言（非空壳）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSentinelOnce } from '../../src/agent/sentinel-service';

const runOnceMock = vi.fn();
const aggregateMock = vi.fn();
let runnerAvailable = true;

vi.mock('../../src/sentinel/registry', () => ({
  getSentinelRegistry: () => ({
    // id 敏感: 只有完整前缀 id 命中（对齐真实 registry 键），触发 runSentinelOnce 前缀解析
    get: (id: string) => (id === 'sentinel-cash-runway' ? {
      check: async () => ({ ok: true, findings: [], durationMs: 0, checkedAt: '' }),
    } : undefined),
  }),
}));

vi.mock('../../src/sentinel/runner', () => ({
  getGlobalSentinelRunner: () => (runnerAvailable ? {
    runOnce: runOnceMock,
    aggregateAndDispatch: aggregateMock,
  } : null),
}));

vi.mock('../../src/init/engine-context', () => ({
  getDatabase: () => ({ _rawDb: true }),
}));

describe('runSentinelOnce — GS-05 告警闭环（runner 管线）', () => {
  beforeEach(() => {
    runnerAvailable = true;
    runOnceMock.mockReset();
    aggregateMock.mockReset();
    runOnceMock.mockResolvedValue({
      sentinelId: 'sentinel-cash-runway',
      ok: true,
      findings: [{ id: 'cash_critical', severity: 'critical', title: '现金流危急' }],
      durationMs: 0,
      checkedAt: '2026-08-21T00:00:00.000Z',
    });
    aggregateMock.mockResolvedValue(undefined);
  });

  it('正常路径：runner 可用 → runOnce 记录运行 + aggregateAndDispatch 触发告警闭环', async () => {
    const result = await runSentinelOnce('cash-runway');

    expect(result.ok).toBe(true);
    expect(runOnceMock).toHaveBeenCalledWith('sentinel-cash-runway'); // 前缀已解析
    expect(aggregateMock).toHaveBeenCalledTimes(1); // 闭环: 信号 → 专家 → 工单
  });

  it('降级路径：runner 不可用 → 回退直连 check（D453 行为保持，不静默）', async () => {
    runnerAvailable = false;
    const result = await runSentinelOnce('cash-runway');

    expect(result.ok).toBe(true);
    expect(runOnceMock).not.toHaveBeenCalled();
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it('降级路径：runner.runOnce 返回 null（哨兵未找到）→ 回退直连 check', async () => {
    runOnceMock.mockResolvedValue(null);
    const result = await runSentinelOnce('cash-runway');

    expect(result.ok).toBe(true);
    expect(aggregateMock).not.toHaveBeenCalled(); // 无运行记录 → 不触发闭环
  });
});
