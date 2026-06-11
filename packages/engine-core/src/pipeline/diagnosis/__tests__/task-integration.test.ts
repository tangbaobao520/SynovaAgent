/**
 * task-integration.test.ts — FDE 任务集成测试
 *
 * 覆盖：manual 项跳过、已创建项跳过、未配置系统跳过、结果结构
 */

import { pushActionItems } from '../task-integration';
import type { ImprovementActionItem, TaskIntegrationResult } from '../types';

// ====================================================================
// 测试辅助
// ====================================================================

function makeItem(overrides: Partial<ImprovementActionItem> = {}): ImprovementActionItem {
  return {
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceModule: 'test-module',
    sourceDimension: 'test-dim',
    title: '测试行动项',
    description: '测试描述',
    targetSystem: 'manual',
    priority: 'medium',
    estimatedEffortHours: 4,
    createdAt: new Date().toISOString(),
    status: 'pending',
    suggestion: '测试建议',
    ...overrides,
  };
}

function expectValidResult(result: TaskIntegrationResult): void {
  expect(Array.isArray(result.created)).toBe(true);
  expect(Array.isArray(result.failed)).toBe(true);
  expect(Array.isArray(result.skipped)).toBe(true);
}

// ====================================================================
// Manual 项跳过
// ====================================================================

describe('task-integration: manual items', () => {
  it('skips all items with targetSystem === "manual"', async () => {
    // Given: 3 manual items
    const items: ImprovementActionItem[] = [
      makeItem({ id: '1', targetSystem: 'manual', title: '手动任务1' }),
      makeItem({ id: '2', targetSystem: 'manual', title: '手动任务2' }),
      makeItem({ id: '3', targetSystem: 'manual', title: '手动任务3' }),
    ];

    // When
    const result = await pushActionItems('test-team', items);

    // Then: all skipped, none created or failed
    expectValidResult(result);
    expect(result.created).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
    for (const s of result.skipped) {
      expect(s.reason).toContain('manual');
    }
  });
});

// ====================================================================
// 已创建项跳过
// ====================================================================

describe('task-integration: already-created items', () => {
  it('skips items with status === "created" and externalId set', async () => {
    // Given: items that were already pushed
    const items: ImprovementActionItem[] = [
      makeItem({ id: '1', targetSystem: 'jira', status: 'created', externalId: 'JIRA-123' }),
      makeItem({ id: '2', targetSystem: 'linear', status: 'created', externalId: 'LIN-456' }),
    ];

    // When
    const result = await pushActionItems('test-team', items);

    // Then: skipped with "already created" reason
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0].reason).toContain('already created');
    expect(result.skipped[1].reason).toContain('already created');
  });
});

// ====================================================================
// 未配置系统跳过
// ====================================================================

describe('task-integration: unconfigured systems', () => {
  it('skips jira items when Jira is not configured', async () => {
    // Given: jira item but no JIRA_* env vars set
    const items: ImprovementActionItem[] = [
      makeItem({ id: '1', targetSystem: 'jira', title: 'Jira Task' }),
    ];

    // When
    const result = await pushActionItems('test-team', items);

    // Then: skipped because Jira not configured
    expect(result.created).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('not configured');
  });

  it('skips linear items when Linear is not configured', async () => {
    // Given: linear item but no LINEAR_API_KEY set
    const items: ImprovementActionItem[] = [
      makeItem({ id: '1', targetSystem: 'linear', title: 'Linear Task' }),
    ];

    // When
    const result = await pushActionItems('test-team', items);

    // Then: skipped because Linear not configured
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('not configured');
  });
});

// ====================================================================
// 混合场景
// ====================================================================

describe('task-integration: mixed scenarios', () => {
  it('handles mix of manual, jira, and linear items correctly', async () => {
    // Given: a mixed set of items
    const items: ImprovementActionItem[] = [
      makeItem({ id: '1', targetSystem: 'manual', title: 'Manual' }),
      makeItem({ id: '2', targetSystem: 'jira', title: 'Jira Item' }),
      makeItem({ id: '3', targetSystem: 'linear', title: 'Linear Item' }),
      makeItem({ id: '4', targetSystem: 'jira', status: 'created', externalId: 'JIRA-999', title: 'Already Done' }),
    ];

    // When
    const result = await pushActionItems('test-team', items);

    // Then
    expectValidResult(result);
    // Manual skipped
    expect(result.skipped.some(s => s.localId === '1')).toBe(true);
    // Jira/Linear skipped (not configured)
    expect(result.skipped.some(s => s.localId === '2')).toBe(true);
    expect(result.skipped.some(s => s.localId === '3')).toBe(true);
    // Already created skipped
    expect(result.skipped.some(s => s.localId === '4')).toBe(true);
    // Nothing created (no external systems configured in test)
    expect(result.created).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('returns empty arrays when given empty item list', async () => {
    // Given: no items
    // When
    const result = await pushActionItems('test-team', []);

    // Then: all arrays empty
    expect(result.created).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });
});
