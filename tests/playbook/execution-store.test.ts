/**
 * tests/playbook/execution-store.test.ts — D80 Playbook执行记录持久化
 *
 * 覆盖: store 6 + 类型 2 + 集成 2 = ≥10
 * 约束: 零as any / all expect() asserted
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { ExecutionStore } from '../../src/playbook/execution-store';
import { recordPlaybookExecution } from '../../src/playbook/playbook-loader';
import type { PlaybookExecutionRecord } from '../../src/playbook/playbook-types';

// ═══ Fixture ═══

function makeRecord(overrides: Partial<PlaybookExecutionRecord> = {}): PlaybookExecutionRecord {
  return {
    executionId: `exec-${Date.now()}`,
    playbookId: 'PB-finance-cashflow',
    playbookVersion: '1.0.0',
    enterpriseId: 'test-enterprise',
    triggerType: 'manual',
    triggerDetail: { manualBy: 'test' },
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 1234,
    appliedOverrides: {},
    stepResults: [
      { stepId: 's1', stepIndex: 0, expert: 'finance', toolCalled: 'compute-metric', startTime: '', endTime: '', durationMs: 100, status: 'success', retryCount: 0 },
    ],
    crossExpertInteractions: [],
    finalOutput: { reportRef: 'report-1', confidence: 0.85, degradedSteps: 0, failedSteps: 0 },
    tokenUsage: { totalInput: 1000, totalOutput: 500 },
    costEstimate: 0.02,
    ...overrides,
  };
}

// ═══ Tests ═══

describe('D80 — ExecutionStore 创建与查询', () => {
  let db: Database.Database;
  let store: ExecutionStore;

  beforeAll(() => {
    db = new Database(':memory:');
    store = new ExecutionStore(db);
  });

  it('createExecutionRecord → 返回 executionId', () => {
    const record = makeRecord();
    const id = store.createExecutionRecord(record);
    expect(id).toBe(record.executionId);
  });

  it('getExecutionRecord → 返回完整记录', () => {
    const record = makeRecord();
    store.createExecutionRecord(record);
    const loaded = store.getExecutionRecord(record.executionId);
    expect(loaded).not.toBeNull();
    expect(loaded!.playbookId).toBe('PB-finance-cashflow');
    expect(loaded!.enterpriseId).toBe('test-enterprise');
    expect(loaded!.stepResults).toHaveLength(1);
    expect(loaded!.tokenUsage.totalInput).toBe(1000);
  });

  it('不存在的 executionId → 返回 null', () => {
    const loaded = store.getExecutionRecord('nonexistent');
    expect(loaded).toBeNull();
  });
});

describe('D80 — ExecutionStore 列表查询', () => {
  let db: Database.Database;
  let store: ExecutionStore;

  beforeAll(() => {
    db = new Database(':memory:');
    store = new ExecutionStore(db);
    // 为两个 playbook 各创建 2 条记录
    for (let i = 0; i < 2; i++) {
      store.createExecutionRecord(makeRecord({ executionId: `exec-pb1-${i}`, playbookId: 'PB-pb1', enterpriseId: 'org-a' }));
    }
    for (let i = 0; i < 3; i++) {
      store.createExecutionRecord(makeRecord({ executionId: `exec-pb2-${i}`, playbookId: 'PB-pb2', enterpriseId: 'org-b' }));
    }
  });

  it('listExecutionsByPlaybook → 返回该 playbook 的记录', () => {
    const results = store.listExecutionsByPlaybook('PB-pb1');
    expect(results).toHaveLength(2);
  });

  it('listExecutionsByEnterprise → 返回该企业的记录', () => {
    const results = store.listExecutionsByEnterprise('org-b');
    expect(results).toHaveLength(3);
  });

  it('不存在的 playbook → 返回空数组', () => {
    const results = store.listExecutionsByPlaybook('nonexistent');
    expect(results).toHaveLength(0);
  });
});

describe('D80 — ExecutionStore 清理', () => {
  it('cleanExpiredRecords → 无过期记录时返回 0', () => {
    const db = new Database(':memory:');
    const store = new ExecutionStore(db);
    const count = store.cleanExpiredRecords();
    expect(count).toBe(0);
  });
});

describe('D80 — PlaybookExecutionRecord 类型', () => {
  it('完整记录包含所有必要字段', () => {
    const record = makeRecord();
    expect(record.executionId).toBeDefined();
    expect(record.playbookId).toBeDefined();
    expect(record.playbookVersion).toBeDefined();
    expect(record.enterpriseId).toBeDefined();
    expect(record.triggerType).toBeDefined();
    expect(record.startTime).toBeDefined();
    expect(record.stepResults).toBeDefined();
    expect(record.finalOutput).toBeDefined();
    expect(record.tokenUsage).toBeDefined();
    expect(typeof record.costEstimate).toBe('number');
  });

  it('最小记录创建（仅必需字段）', () => {
    const record: PlaybookExecutionRecord = {
      executionId: 'minimal',
      playbookId: 'PB-min',
      playbookVersion: '1.0',
      enterpriseId: 'e1',
      triggerType: 'manual',
      triggerDetail: {},
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 0,
      appliedOverrides: {},
      stepResults: [],
      crossExpertInteractions: [],
      finalOutput: { reportRef: '', confidence: 0, degradedSteps: 0, failedSteps: 0 },
      tokenUsage: { totalInput: 0, totalOutput: 0 },
      costEstimate: 0,
    };
    expect(record.stepResults).toEqual([]);
  });
});

describe('D80 — playbook-loader 集成', () => {
  it('recordPlaybookExecution → 写入成功返回 true', () => {
    const db = new Database(':memory:');
    const store = new ExecutionStore(db);
    const record = makeRecord();
    const result = recordPlaybookExecution(record, store);
    expect(result).toBe(true);
    // 验证确实写入了
    const loaded = store.getExecutionRecord(record.executionId);
    expect(loaded).not.toBeNull();
  });

  it('recordPlaybookExecution → store异常时返回 false, 不抛异常', () => {
    const brokenStore = {
      createExecutionRecord: () => { throw new Error('DB error'); },
    };
    const record = makeRecord();
    // 不应抛出异常
    const result = recordPlaybookExecution(record, brokenStore);
    expect(result).toBe(false);
  });
});
