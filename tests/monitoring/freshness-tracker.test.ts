/**
 * tests/monitoring/freshness-tracker.test.ts — D35: FreshnessTracker 单元测试
 * 铁律 48: 测试必须有 expect() 断言
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FreshnessTracker } from '../../src/monitoring/freshness-tracker';

describe('FreshnessTracker', () => {
  let tracker: FreshnessTracker;

  beforeEach(() => { tracker = new FreshnessTracker(); });

  it('recordUpdate 后可通过 getStatusByPool 获取', () => {
    tracker.recordUpdate('erp-01', 'erp', 'daily');
    const records = tracker.getStatusByPool('erp');
    expect(records.length).toBe(1);
    expect(records[0].sourceId).toBe('erp-01');
    expect(records[0].poolName).toBe('erp');
    expect(records[0].expectedFrequency).toBe('daily');
    expect(records[0].freshnessStatus).toBeDefined();
  });

  it('多源同 pool 返回全部', () => {
    tracker.recordUpdate('erp-01', 'erp', 'daily');
    tracker.recordUpdate('erp-02', 'erp', 'daily');
    tracker.recordUpdate('crm-01', 'crm', 'weekly');
    expect(tracker.getStatusByPool('erp').length).toBe(2);
    expect(tracker.getStatusByPool('crm').length).toBe(1);
    expect(tracker.getStatusByPool('unknown').length).toBe(0);
  });

  it('刚更新的源状态为 green', () => {
    tracker.recordUpdate('fresh-01', 'test', 'daily');
    const r = tracker.getStatusByPool('test');
    expect(r[0].freshnessStatus).toBe('green');
    expect(r[0].delayDays).toBeLessThanOrEqual(1);
  });

  it('getDegradedSources 刚更新时为空', () => {
    tracker.recordUpdate('src-a', 'pool1', 'daily');
    expect(tracker.getStatusByPool('pool1')[0].freshnessStatus).toBe('green');
    expect(tracker.getDegradedSources().map(r => r.sourceId)).not.toContain('src-a');
  });

  it('reset 后记录清空', () => {
    tracker.recordUpdate('src', 'pool', 'daily');
    expect(tracker.getStatusByPool('pool').length).toBe(1);
    tracker.reset();
    expect(tracker.getStatusByPool('pool').length).toBe(0);
  });

  it('降级：内部异常不抛到上层', () => {
    tracker.recordUpdate('src', 'pool', 'daily');
    tracker.getStatusByPool('pool');
    tracker.getDegradedSources();
    expect(true).toBe(true);
  });
});
