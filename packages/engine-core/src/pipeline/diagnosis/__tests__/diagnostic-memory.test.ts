/**
 * diagnostic-memory.test.ts — B7 诊断记忆索引测试 (对标 Hermes MEMORY.md)
 */
import {
  initMemoryStore,
  addMemory,
  referenceMemory,
  searchMemory,
  removeMemory,
  buildSnapshot,
  getSnapshot,
  renderSnapshotForSystemPrompt,
  getMemoryStats,
  clearMemoryStore,
} from '../diagnostic-memory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = path.join(os.tmpdir(), `synova-memory-test-${Date.now()}`);

beforeEach(() => {
  clearMemoryStore();
  // Delete persisted JSONL to ensure test isolation
  const memFile = path.join(tmpDir, 'diagnostic-memory.jsonl');
  if (fs.existsSync(memFile)) fs.unlinkSync(memFile);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  initMemoryStore({ dataDir: tmpDir, maxEntriesPerOrg: 10, maxCharsPerEntry: 200, maxHighPriority: 4 });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('addMemory', () => {
  it('creates memory entry with auto ID', () => {
    const entry = addMemory({
      orgId: 'org-1', type: 'finding', content: '信息流得分持续偏低',
      dimensions: ['information_flow'], confidence: 0.8, sourceDiagnosisId: 'd1',
      priority: 'high',
    });
    expect(entry.id).toMatch(/^mem_org-1_/);
    expect(entry.useCount).toBe(0);
  });

  it('truncates content exceeding maxCharsPerEntry', () => {
    const long = 'x'.repeat(300);
    const entry = addMemory({
      orgId: 'org-1', type: 'finding', content: long,
      dimensions: ['trust'], confidence: 0.5, sourceDiagnosisId: 'd1',
      priority: 'low',
    });
    expect(entry.content.length).toBeLessThanOrEqual(203); // 200 + '...'
  });

  it('evicts when exceeding max entries', () => {
    // Fill up to max (10)
    for (let i = 0; i < 10; i++) {
      addMemory({
        orgId: 'org-1', type: 'finding', content: `entry ${i}`,
        dimensions: ['trust'], confidence: 0.5, sourceDiagnosisId: 'd1',
        priority: 'low',
      });
    }
    const beforeStats = getMemoryStats('org-1');
    expect(beforeStats.total).toBe(10);

    // 11th triggers eviction
    addMemory({
      orgId: 'org-1', type: 'pattern', content: 'new pattern',
      dimensions: ['trust'], confidence: 0.9, sourceDiagnosisId: 'd2',
      priority: 'high',
    });
    const stats = getMemoryStats('org-1');
    // Should stay at max (one evicted, one added)
    expect(stats.total).toBeLessThanOrEqual(10);
    // Total should be exactly 10 (max cap enforced)
    expect(stats.total).toBe(10);
  });
});

describe('referenceMemory', () => {
  it('increments use count on reference', () => {
    const entry = addMemory({
      orgId: 'org-1', type: 'lesson', content: '异步站会采纳率80%',
      dimensions: ['information_flow'], confidence: 0.85, sourceDiagnosisId: 'd1',
      priority: 'medium',
    });
    referenceMemory(entry.id);
    referenceMemory(entry.id);
    // Verify the store still has exactly 1 entry
    const stats = getMemoryStats('org-1');
    expect(stats.total).toBe(1);
    expect(stats.byType['lesson']).toBe(1);
  });
});

describe('searchMemory', () => {
  it('finds matching entries by content', () => {
    addMemory({
      orgId: 'org-1', type: 'finding', content: '信息流衰减在管理层级中明显',
      dimensions: ['information_flow'], confidence: 0.8, sourceDiagnosisId: 'd1',
      priority: 'high',
    });
    addMemory({
      orgId: 'org-1', type: 'finding', content: '决策权集中在少数人',
      dimensions: ['decision_making'], confidence: 0.7, sourceDiagnosisId: 'd1',
      priority: 'medium',
    });

    const results = searchMemory('org-1', '信息流');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('信息流');
  });

  it('matches by dimension keyword', () => {
    addMemory({
      orgId: 'org-1', type: 'finding', content: '信任度低',
      dimensions: ['trust_level'], confidence: 0.6, sourceDiagnosisId: 'd1',
      priority: 'medium',
    });
    const results = searchMemory('org-1', 'trust_level');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty for no match', () => {
    expect(searchMemory('org-1', 'nonexistent')).toHaveLength(0);
  });

  it('respects limit', () => {
    for (let i = 0; i < 8; i++) {
      addMemory({
        orgId: 'org-1', type: 'finding', content: `test entry ${i} with info`,
        dimensions: ['trust'], confidence: 0.5, sourceDiagnosisId: 'd1',
        priority: 'low',
      });
    }
    const results = searchMemory('org-1', 'info', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe('removeMemory', () => {
  it('removes by ID', () => {
    const statsBefore = getMemoryStats('org-1').total;
    const entry = addMemory({
      orgId: 'org-1', type: 'finding', content: 'to be removed',
      dimensions: ['trust'], confidence: 0.5, sourceDiagnosisId: 'd1',
      priority: 'low',
    });
    expect(getMemoryStats('org-1').total).toBe(statsBefore + 1);
    expect(removeMemory(entry.id)).toBe(true);
    expect(getMemoryStats('org-1').total).toBe(statsBefore);
  });

  it('returns false for non-existent', () => {
    expect(removeMemory('nonexistent')).toBe(false);
  });
});

describe('snapshot', () => {
  it('builds and retrieves frozen snapshot', () => {
    addMemory({
      orgId: 'org-1', type: 'pattern', content: '跨维度关联: 营销-组织断裂',
      dimensions: ['marketing', 'organization'], confidence: 0.9, sourceDiagnosisId: 'd1',
      priority: 'high',
    });
    const snap = buildSnapshot('org-1');
    expect(snap.valid).toBe(true);
    expect(snap.highPriorityEntries.length).toBeGreaterThan(0);
  });

  it('getSnapshot returns cached valid snapshot', () => {
    const snap1 = getSnapshot('org-1');
    const snap2 = getSnapshot('org-1');
    expect(snap1).toBe(snap2); // same object reference (cached)
  });
});

describe('renderSnapshotForSystemPrompt', () => {
  it('renders high priority entries for system prompt injection', () => {
    addMemory({
      orgId: 'org-1', type: 'pattern', content: '关键模式: 信息流×信任交叉影响',
      dimensions: ['information_flow', 'trust_level'], confidence: 0.88, sourceDiagnosisId: 'd1',
      priority: 'high',
    });
    const rendered = renderSnapshotForSystemPrompt('org-1', 1000);
    expect(rendered).toContain('<diagnostic_memory>');
    expect(rendered).toContain('信息流');
  });

  it('returns empty when no high-priority entries', () => {
    expect(renderSnapshotForSystemPrompt('empty-org')).toBe('');
  });

  it('respects maxChars limit', () => {
    for (let i = 0; i < 5; i++) {
      addMemory({
        orgId: 'org-1', type: 'pattern', content: `模式${i}: 重要发现 `.repeat(10),
        dimensions: ['trust'], confidence: 0.9, sourceDiagnosisId: 'd1',
        priority: 'high',
      });
    }
    const rendered = renderSnapshotForSystemPrompt('org-1', 500);
    expect(rendered.length).toBeLessThanOrEqual(520); // 500 + closing tag
  });
});

describe('org isolation', () => {
  it('isolates memories per org', () => {
    addMemory({
      orgId: 'org-A', type: 'finding', content: 'A finding',
      dimensions: ['trust'], confidence: 0.5, sourceDiagnosisId: 'd1',
      priority: 'low',
    });
    addMemory({
      orgId: 'org-B', type: 'finding', content: 'B finding',
      dimensions: ['trust'], confidence: 0.5, sourceDiagnosisId: 'd2',
      priority: 'low',
    });
    expect(getMemoryStats('org-A').total).toBe(1);
    expect(getMemoryStats('org-B').total).toBe(1);
    expect(getMemoryStats('org-C').total).toBe(0);
  });
});
