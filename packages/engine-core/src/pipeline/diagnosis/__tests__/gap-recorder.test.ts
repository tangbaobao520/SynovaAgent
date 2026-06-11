/**
 * gap-recorder.test.ts — 缝隙记录器单元测试
 *
 * 验证: 基本记录/检索 / 100条上限淘汰 / 多团队隔离 / 清空
 */

import {
  recordGapSnapshot,
  getGapTimeline,
  getLatestSnapshot,
  getSnapshotCount,
  clearTeamSnapshots,
  resetAllSnapshots,
  buildGapSnapshot,
  GAP_DIMENSIONS,
} from '../gap-recorder';
import type { GapSnapshot } from '../types';

// Minimal stub snapshot for testing (not via buildGapSnapshot which needs full pipeline types)
function stubSnapshot(teamId: string, observedAt?: string): GapSnapshot {
  const gaps = {} as Record<string, any>;
  for (const dim of GAP_DIMENSIONS) {
    gaps[dim] = {
      mode: 'test-mode',
      engineScore: 0.5,
      confidence: 'medium',
      sourceBreakdown: { test: 1.0 },
    };
  }
  return {
    teamId,
    observedAt: observedAt ?? new Date().toISOString(),
    sourcePipeline: 'phase-c',
    gaps: gaps as GapSnapshot['gaps'],
  };
}

describe('gap-recorder', () => {
  beforeEach(() => {
    resetAllSnapshots();
  });

  afterAll(() => {
    resetAllSnapshots();
  });

  test('记录并检索单个快照', () => {
    const snap = stubSnapshot('team-1');
    recordGapSnapshot(snap);

    expect(getSnapshotCount('team-1')).toBe(1);
    expect(getLatestSnapshot('team-1')).not.toBeNull();
    expect(getLatestSnapshot('team-1')!.teamId).toBe('team-1');
  });

  test('多个快照按时间排列', () => {
    for (let i = 0; i < 5; i++) {
      recordGapSnapshot(stubSnapshot('team-1', `2024-01-0${i + 1}T00:00:00Z`));
    }

    const timeline = getGapTimeline('team-1');
    expect(timeline.length).toBe(5);
    // 最早排第一
    expect(timeline[0].observedAt).toBe('2024-01-01T00:00:00Z');
    expect(timeline[4].observedAt).toBe('2024-01-05T00:00:00Z');
  });

  test('getGapTimeline 带 limit 返回最新 N 条倒序', () => {
    for (let i = 0; i < 10; i++) {
      recordGapSnapshot(stubSnapshot('team-1', `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
    }

    const latest = getGapTimeline('team-1', 3);
    expect(latest.length).toBe(3);
    // 倒序: 最新在前
    expect(latest[0].observedAt).toBe('2024-01-10T00:00:00Z');
    expect(latest[2].observedAt).toBe('2024-01-08T00:00:00Z');
  });

  test('多团队数据隔离', () => {
    recordGapSnapshot(stubSnapshot('team-a'));
    recordGapSnapshot(stubSnapshot('team-b'));
    recordGapSnapshot(stubSnapshot('team-a'));

    expect(getSnapshotCount('team-a')).toBe(2);
    expect(getSnapshotCount('team-b')).toBe(1);
    expect(getSnapshotCount('team-c')).toBe(0);
  });

  test('超 100 条上限淘汰最旧快照', () => {
    for (let i = 0; i < 150; i++) {
      recordGapSnapshot(stubSnapshot('team-1', `2024-01-01T00:${String(i).padStart(2, '0')}:00Z`));
    }

    const count = getSnapshotCount('team-1');
    expect(count).toBeLessThanOrEqual(100);

    // 保留的是最新的100条
    const timeline = getGapTimeline('team-1');
    // 最早一条应该接近 #50 (150 - 100 = 50 被淘汰)
    expect(timeline[0].observedAt).toBe('2024-01-01T00:50:00Z');
  });

  test('clearTeamSnapshots 清除单个团队', () => {
    recordGapSnapshot(stubSnapshot('team-a'));
    recordGapSnapshot(stubSnapshot('team-b'));

    const deleted = clearTeamSnapshots('team-a');
    expect(deleted).toBe(true);
    expect(getSnapshotCount('team-a')).toBe(0);
    expect(getSnapshotCount('team-b')).toBe(1);
  });

  test('不存在的团队返回 0 条和 null 最新快照', () => {
    expect(getSnapshotCount('no-such-team')).toBe(0);
    expect(getLatestSnapshot('no-such-team')).toBeNull();
    expect(getGapTimeline('no-such-team')).toEqual([]);
  });
});
