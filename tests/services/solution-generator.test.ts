/**
 * tests/services/solution-generator.test.ts — 方案生成器单元测试 (Phase 3.4)
 *
 * 铁律 33: *.test.ts (纯函数，无 I/O)
 */
import { describe, it, expect } from 'vitest';
import {
  generateSolutions,
  getSolutions,
  getSolutionById,
  updateSolutionStatus,
  pushToLiaison,
  VALID_SOLUTION_STATUSES,
} from '../../src/services/solution-generator';

describe('solution-generator 单元测试', () => {

  it('VALID_SOLUTION_STATUSES 包含 5 种状态', () => {
    expect(VALID_SOLUTION_STATUSES.length).toBe(5);
    expect(VALID_SOLUTION_STATUSES).toContain('draft');
    expect(VALID_SOLUTION_STATUSES).toContain('confirmed');
    expect(VALID_SOLUTION_STATUSES).toContain('executing');
    expect(VALID_SOLUTION_STATUSES).toContain('completed');
    expect(VALID_SOLUTION_STATUSES).toContain('rejected');
  });

  it('generateSolutions — 空参数生成通用方案', async () => {
    const result = await generateSolutions('test-r-1', 'test-org', [], []);
    expect(result.solutions.length).toBe(1);
    expect(result.solutions[0].reportId).toBe('test-r-1');
    expect(result.solutions[0].status).toBe('draft');
    expect(result.solutions[0].patternName).toBe('general');
  });

  it('generateSolutions — 携带 recommendations 生成方案', async () => {
    const result = await generateSolutions('test-r-2', 'test-org', [
      { action: '改善现金流', priority: 'critical', expert: 'finance' },
      { action: '优化组织架构', priority: 'high', expert: 'org' },
    ], ['F1', 'O3']);
    expect(result.solutions.length).toBeGreaterThanOrEqual(1);
    expect(result.solutions[0].recommendations.length).toBeGreaterThanOrEqual(1);
  });

  it('generateSolutions — 报告 ID 区分不同方案', async () => {
    const r1 = await generateSolutions('report-a', 'org-1', [], []);
    const r2 = await generateSolutions('report-b', 'org-1', [], []);
    expect(r1.solutions[0].reportId).toBe('report-a');
    expect(r2.solutions[0].reportId).toBe('report-b');
  });

  it('getSolutions — 按 reportId 查询', async () => {
    await generateSolutions('query-test', 'org-2', [], []);
    const result = await getSolutions('query-test', 'org-2');
    expect(result.solutions.length).toBe(1);
    expect(result.solutions[0].reportId).toBe('query-test');
  });

  it('getSolutionById — 存在时返回方案', async () => {
    const gen = await generateSolutions('get-by-id', 'org-3', [], []);
    const id = gen.solutions[0].id;
    const result = await getSolutionById(id);
    expect(result.solution).not.toBeNull();
    expect(result.solution!.id).toBe(id);
  });

  it('getSolutionById — 不存在时返回 null', async () => {
    const result = await getSolutionById('nonexistent-id');
    expect(result.solution).toBeNull();
  });

  it('updateSolutionStatus — draft → confirmed 合法', async () => {
    const gen = await generateSolutions('status-test-1', 'org-4', [], []);
    const id = gen.solutions[0].id;
    const result = await updateSolutionStatus(id, 'confirmed');
    expect(result.success).toBe(true);
  });

  it('updateSolutionStatus — completed → draft 非法', async () => {
    const gen = await generateSolutions('status-test-2', 'org-5', [], []);
    const id = gen.solutions[0].id;
    // 先设为 completed
    await updateSolutionStatus(id, 'completed');
    // 尝试回退到 draft — 非法
    const result = await updateSolutionStatus(id, 'draft');
    expect(result.success).toBe(false);
  });

  it('pushToLiaison — 不存在时返回 pushed=false', async () => {
    const result = await pushToLiaison('nonexistent-id', ['electron']);
    expect(result.pushed).toBe(false);
    expect(result.note).toBe('方案不存在');
  });

  it('pushToLiaison — 存在时推送到 electron', async () => {
    const gen = await generateSolutions('push-test', 'org-6', [], []);
    const id = gen.solutions[0].id;
    const result = await pushToLiaison(id, ['electron']);
    // 推送可能 degraded（测试环境无 notification adapter），但 pushed=true
    expect(result.pushed).toBe(true);
  });
});
