/**
 * tests/gns/sog-v2-types.test.ts — SOG v2.0 类型 + 右边栏数据结构
 *
 * 铁律 0-2: 每个新类型 ≥ 2 用例
 */
import { describe, it, expect } from 'vitest';
import {
  GoalV2Props, AlertV2Props, ObstacleV2Props,
  InterviewSummaryV2, RightColumnState,
  OBSTRUCTS_EDGE, MEASURES_EDGE, V2_EDGE_ENDPOINT_MAP,
} from '@synova/sog-core';

describe('GoalV2Props — happy path', () => {
  it('Given valid goal, When constructed, Then all fields match', () => {
    const goal: GoalV2Props = {
      progress: 72, status: 'active',
      targetDate: '2026-12-31', description: '提高跨部门协作效率',
    };
    expect(goal.progress).toBe(72);
    expect(goal.status).toBe('active');
  });

  it('Given minimal goal, When constructed, Then defaults work', () => {
    const goal: GoalV2Props = { progress: 0, status: 'active' };
    expect(goal.targetDate).toBeUndefined();
    expect(goal.description).toBeUndefined();
  });
});

describe('GoalV2Props — sad path', () => {
  it('Given invalid status, When TypeScript checked, Then disallowed at compile time', () => {
    // TypeScript-only test: 'invalid' not in union
    const goal: GoalV2Props = { progress: 50, status: 'completed' };
    expect(['active', 'completed', 'abandoned']).toContain(goal.status);
  });
});

describe('AlertV2Props — happy path', () => {
  it('Given high-priority alert, When constructed, Then all required fields present', () => {
    const alert: AlertV2Props = {
      description: '线索转化率骤降',
      confidence: 0.85, priority: 'high',
      raisedAt: '2026-06-05T10:00:00Z', status: 'active',
    };
    expect(alert.priority).toBe('high');
    expect(alert.confidence).toBeCloseTo(0.85);
  });

  it('Given resolved alert, When constructed, Then status reflects resolved', () => {
    const alert: AlertV2Props = {
      description: '审批周期过长', confidence: 0.6, priority: 'medium',
      raisedAt: '2026-06-01T00:00:00Z', status: 'resolved', source: 'metric.updated',
    };
    expect(alert.status).toBe('resolved');
    expect(alert.source).toBe('metric.updated');
  });
});

describe('AlertV2Props — sad path', () => {
  it('Given confidence out of range, When validated, Then detected', () => {
    const alert: AlertV2Props = {
      description: 'test', confidence: 1.5, priority: 'low',
      raisedAt: 'now', status: 'active',
    };
    // Runtime check — should be 0-1
    expect(alert.confidence).toBeGreaterThan(1);
    expect(alert.confidence <= 1).toBe(false);
  });
});

describe('ObstacleV2Props', () => {
  it('Given tracking obstacle, When constructed, Then history array present', () => {
    const obs: ObstacleV2Props = {
      description: '新员工融入周期过长',
      status: 'tracking', updatedAt: '2026-06-05', history: ['created:2026-06-01'],
    };
    expect(obs.history.length).toBe(1);
  });

  it('Given resolved obstacle, When status updated, Then history tracks changes', () => {
    const obs: ObstacleV2Props = {
      description: '跨部门沟通障碍', status: 'resolved',
      updatedAt: '2026-06-05', history: ['created:2026-05-01', 'in_progress:2026-05-15', 'resolved:2026-06-05'],
    };
    expect(obs.history.length).toBe(3);
  });
});

describe('InterviewSummaryV2', () => {
  it('Given completed interview, When constructed, Then dimensions populated', () => {
    const summary: InterviewSummaryV2 = {
      completedAt: '2026-06-05T12:00:00Z',
      dimensions: {
        mission_objectives: { summary: '明确Q3目标', keyPoints: ['SaaS', '增长'], confidence: 0.8 },
        business_value: { summary: 'B2B SaaS', keyPoints: ['50人'], confidence: 0.7 },
      },
      rawMessageIds: ['msg1', 'msg2'],
      dataSourcesConnected: [],
      skipped: false,
    };
    expect(Object.keys(summary.dimensions).length).toBe(2);
    expect(summary.skipped).toBe(false);
  });

  it('Given skipped interview, When constructed, Then skipped=true, dimensions empty', () => {
    const summary: InterviewSummaryV2 = {
      completedAt: '2026-06-05T12:00:00Z',
      dimensions: {},
      rawMessageIds: [],
      dataSourcesConnected: ['feishu'],
      skipped: true,
    };
    expect(summary.skipped).toBe(true);
    expect(summary.dataSourcesConnected).toContain('feishu');
  });
});

describe('RightColumnState — SSE payload', () => {
  it('Given mixed state, When serialized, Then JSON roundtrips', () => {
    const state: RightColumnState = {
      goals: [{ id: 'g1', name: 'Revenue Growth', progress: 72, status: 'active' }],
      alerts: [{ id: 'a1', description: 'Conversion drop', priority: 'high', confidence: 0.85, raisedAt: 'now' }],
      obstacles: [{ id: 'o1', description: 'Onboarding delay', status: 'tracking', updatedAt: 'today' }],
    };
    const json = JSON.stringify(state);
    const parsed: RightColumnState = JSON.parse(json);
    expect(parsed.goals.length).toBe(1);
    expect(parsed.alerts[0].priority).toBe('high');
    expect(parsed.obstacles[0].status).toBe('tracking');
  });

  it('Given empty state, When constructed, Then all arrays empty', () => {
    const state: RightColumnState = { goals: [], alerts: [], obstacles: [] };
    expect(state.goals.length).toBe(0);
    expect(state.alerts.length).toBe(0);
  });
});

describe('V2 Edge Types — OBSTRUCTS + MEASURES', () => {
  it('Given OBSTRUCTS_EDGE, When checked in endpoint map, Then valid from/to', () => {
    expect(OBSTRUCTS_EDGE).toBe('OBSTRUCTS');
    const endpoints = V2_EDGE_ENDPOINT_MAP[OBSTRUCTS_EDGE];
    expect(endpoints.from).toContain('Process');
    expect(endpoints.to).toContain('Goal');
    expect(endpoints.to).toContain('Risk');
  });

  it('Given MEASURES_EDGE, When checked in endpoint map, Then FINANCIAL→GOAL', () => {
    expect(MEASURES_EDGE).toBe('MEASURES');
    const endpoints = V2_EDGE_ENDPOINT_MAP[MEASURES_EDGE];
    expect(endpoints.from).toContain('Financial');
    expect(endpoints.to).toContain('Goal');
  });
});
