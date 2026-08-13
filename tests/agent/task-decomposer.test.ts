/**
 * tests/agent/task-decomposer.test.ts — D8b 任务分解协议测试
 */
import { describe, it, expect, vi } from 'vitest';

describe('TaskDecomposer — 分解策略', () => {
  it('decompose: 1 sentinel finding → 1 sub-task', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = td.decompose({
      enterpriseId: 'test-ent',
      sentinelFindings: [{ id: 'F1', severity: 'critical', title: '利润偏低', description: '净利润率5%', sentinel: 'margin-health' }],
      triggeredBy: 'manual',
    });
    expect(result.subTasks).toHaveLength(1);
    expect(result.subTasks[0].priority).toBe(0);
    expect(result.subTasks[0].expertType).toBe('finance');
    expect(result.degraded).toBe(false);
  });

  it('decompose: 5 findings → 5 sub-tasks', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = td.decompose({
      enterpriseId: 'test-ent',
      sentinelFindings: [
        { id: 'F1', severity: 'critical', title: '利润偏低', description: '', sentinel: 'margin-health' },
        { id: 'F2', severity: 'warning', title: '人才流失', description: '', sentinel: 'talent-density' },
        { id: 'F3', severity: 'warning', title: '渠道不足', description: '', sentinel: 'competitive-position' },
        { id: 'F4', severity: 'info', title: '现金流正常', description: '', sentinel: 'cash-runway' },
        { id: 'F5', severity: 'warning', title: '技术债务', description: '', sentinel: 'tech-debt' },
      ],
      triggeredBy: 'manual',
    });
    expect(result.subTasks).toHaveLength(5);
    // 所有子任务 ID 唯一
    const ids = result.subTasks.map((s) => s.id);
    expect(new Set(ids).size).toBe(5);
    // 按优先级排序: P0 → P1 → P2
    expect(result.subTasks[0].priority).toBe(0);
    expect(result.subTasks[1].priority).toBe(1);
  });

  it('decompose: 空 findings → degraded:true', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = td.decompose({
      enterpriseId: 'test-ent',
      sentinelFindings: [],
      triggeredBy: 'manual',
    });
    expect(result.subTasks).toHaveLength(0);
    expect(result.degraded).toBe(true);
  });
});

describe('TaskDecomposer — 子任务执行', () => {
  it('executeSubTask: success → completed + output', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = await td.executeSubTask({
      id: 'st-1', dimension: 'financial', priority: 0, expertType: 'finance',
      inputFindings: [{ id: 'F1', severity: 'critical', title: '利润偏低', description: '' }],
      status: 'pending',
    });
    expect(result.status).toBe('completed');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('executeSubTask: with empty findings → still completes', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = await td.executeSubTask({
      id: 'st-2', dimension: 'market', priority: 1, expertType: 'marketing',
      inputFindings: [],
      status: 'pending',
    });
    expect(result.status).toBe('completed');
  });
});

describe('TaskDecomposer — 结果聚合', () => {
  it('aggregate: 全部成功 → completed', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = td.aggregate([
      { subTaskId: 'st-1', status: 'completed', output: 'ok', durationMs: 100, confidence: 0.9 },
      { subTaskId: 'st-2', status: 'completed', output: 'ok', durationMs: 200, confidence: 0.8 },
    ]);
    expect(result.status).toBe('completed');
    expect(result.degraded).toBe(false);
    expect(result.totalDurationMs).toBe(300);
  });

  it('aggregate: 部分失败 → partial + degraded', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = td.aggregate([
      { subTaskId: 'st-1', status: 'completed', output: 'ok', durationMs: 100, confidence: 0.9 },
      { subTaskId: 'st-2', status: 'failed', error: 'error', durationMs: 50, confidence: 0 },
      { subTaskId: 'st-3', status: 'completed', output: 'ok', durationMs: 150, confidence: 0.7 },
    ]);
    expect(result.status).toBe('partial');
    expect(result.degraded).toBe(true);
  });
});

describe('TaskDecomposer — 专家映射', () => {
  it('financial sentinel → finance expert', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = td.decompose({
      enterpriseId: 'test',
      sentinelFindings: [{ id: 'F1', severity: 'critical', title: '利润', description: '', sentinel: 'margin-health' }],
      triggeredBy: 'manual',
    });
    expect(result.subTasks[0].expertType).toBe('finance');
  });

  it('talent sentinel → org expert', async () => {
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = td.decompose({
      enterpriseId: 'test',
      sentinelFindings: [{ id: 'F1', severity: 'warning', title: '人才流失', description: '', sentinel: 'talent-density' }],
      triggeredBy: 'manual',
    });
    expect(result.subTasks[0].expertType).toBe('org');
  });
});

describe('MainAgent — TaskDecomposer 集成', () => {
  it('MainAgent 接受 TaskDecomposer 构造参数', async () => {
    const { MainAgent } = await import('../../src/agent/main-agent');
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const agent = new MainAgent(undefined, td);
    expect(agent).toBeDefined();
  });

  it('loop-1 使用 TaskDecomposer 分解', async () => {
    const { MainAgent } = await import('../../src/agent/main-agent');
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const agent = new MainAgent(undefined, td);
    const { LOOP_TRIGGER_MATRIX } = await import('../../src/loops/loop-trigger-config');
    for (const config of LOOP_TRIGGER_MATRIX) {
      agent.registerLoop(config);
    }
    const result = await agent.executeLoop('loop-1');
    expect(result.status).toBe('completed');
    expect(result.degraded).toBe(false);
  });
});
