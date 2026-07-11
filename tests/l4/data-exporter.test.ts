/**
 * tests/l4/data-exporter.test.ts — DataExporter 单元测试 (D40)
 *
 * 铁律 48: 测试必须有 expect() 断言
 * 覆盖: 正常导出 / 空数据 / 隔离验证 / 降级
 */
import { describe, it, expect } from 'vitest';
import { DataExporter, type ExportManifest, type ExportArchive } from '../../src/l4/data-exporter';
import type { GraphStore } from '../../src/l4/graph-bridge';
import type { SessionStore, SessionRow, MessageRow } from '../../src/store/session-store';
import type { AgentMemoryStore, MemoryEntry } from '../../src/l4/agent-memory-store';

// ═══ Mocks ═══

function createMockGraphStore(nodesByType: Record<string, Array<{ id: string; props: Record<string, unknown> }>>): GraphStore {
  return {
    createNode: () => '',
    createNodes: () => [],
    queryNodes: (type: string) => nodesByType[type] || [],
    getNode: () => null,
    updateNode: () => {},
    deleteNode: () => {},
    deleteEdge: () => {},
    queryEdges: () => [],
    createEdge: () => '',
    createEdges: () => [],
    traverse: () => null,
    findPaths: () => [],
    queryTriples: () => [],
    getNodeAtTime: () => null,
  };
}

function createMockSessionStore(sessions: Array<Partial<SessionRow>>): SessionStore {
  const sessionRows: SessionRow[] = sessions.map((s) => ({
    id: s.id || '',
    orgId: s.orgId || '',
    phase: s.phase ?? 0,
    stateJson: s.stateJson ?? null,
    createdAt: s.createdAt || new Date().toISOString(),
    updatedAt: s.updatedAt || new Date().toISOString(),
  }));
  return {
    listSessions: () => sessionRows,
    getMessages: (_id: string): MessageRow[] => [],
    deleteSession: () => {},
    getSession: () => null,
    listSessionsWithState: () => [],
    searchSessions: () => [],
  } as unknown as SessionStore;
}

function createMockMemoryStore(entries: MemoryEntry[]): AgentMemoryStore {
  return {
    list: (query: { orgId: string }) => entries.filter((e) => e.orgId === query.orgId),
    forget: () => true,
    recall: () => null,
    listByType: () => [],
    search: () => [],
    searchMemory: () => [],
    getStats: () => ({ totalEntries: 0, byType: {}, byOrg: {}, expiredCount: 0 }),
    purgeExpired: () => 0,
  } as unknown as AgentMemoryStore;
}

// ═══ Tests ═══

describe('DataExporter 正常导出', () => {
  it('导出含全部模块数据 → manifest 含 checksum + exportId', async () => {
    const graphStore = createMockGraphStore({
      'resource/person': [
        { id: 'p1', props: { name: '张三', orgId: 'tenant-1' } },
        { id: 'p2', props: { name: '李四', orgId: 'tenant-1' } },
      ],
    });
    const sessionStore = createMockSessionStore([
      { id: 'sess-1', orgId: 'tenant-1' },
    ]);
    const memoryStore = createMockMemoryStore([
      { id: 'm1', orgId: 'tenant-1', key: 'pref_a', value: 'x', type: 'preference', confidence: 0.8, source: 'manual', tags: [], createdAt: '', updatedAt: '', expiresAt: null, accessCount: 0 },
    ]);

    const exporter = new DataExporter(graphStore, sessionStore, memoryStore);
    const { archive, manifest } = await exporter.export('tenant-1');

    // manifest 字段验证
    expect(manifest).toBeDefined();
    expect(manifest.tenantId).toBe('tenant-1');
    expect(manifest.exportId).toMatch(/^exp_/);
    expect(manifest.exportedAt).toBeDefined();
    expect(manifest.checksum).toBeDefined();
    expect(manifest.checksum.length).toBeGreaterThanOrEqual(8);

    // 汇总数据
    expect(manifest.summary.nodes).toBe(2);
    expect(manifest.summary.sessions).toBe(1);
    expect(manifest.summary.memories).toBe(1);

    // archive 可解析
    const archiveObj = JSON.parse(archive.toString('utf-8')) as ExportArchive;
    expect(archiveObj.tenantId).toBe('tenant-1');
    expect(archiveObj.nodes.length).toBe(2);
    expect(archiveObj.sessions.length).toBe(1);
    expect(archiveObj.memories.length).toBe(1);
  });

  it('无数据 → 返回空数组 + 汇总零', async () => {
    const graphStore = createMockGraphStore({});
    const sessionStore = createMockSessionStore([]);
    const memoryStore = createMockMemoryStore([]);

    const exporter = new DataExporter(graphStore, sessionStore, memoryStore);
    const { archive, manifest } = await exporter.export('tenant-empty');

    expect(manifest.summary.nodes).toBe(0);
    expect(manifest.summary.sessions).toBe(0);
    expect(manifest.summary.memories).toBe(0);

    const archiveObj = JSON.parse(archive.toString('utf-8')) as ExportArchive;
    expect(archiveObj.nodes).toEqual([]);
    expect(archiveObj.sessions).toEqual([]);
    expect(archiveObj.memories).toEqual([]);
  });
});

describe('DataExporter 隔离验证', () => {
  it('只导出请求 tenantId 对应的数据 — 不混入其他租户', async () => {
    const graphStore = createMockGraphStore({
      'resource/person': [
        { id: 'p1', props: { name: '张三', orgId: 'tenant-1' } },
        { id: 'p2', props: { name: '李四', orgId: 'tenant-2' } },
      ],
      'outcome/financial': [
        { id: 'f1', props: { revenue: 100, orgId: 'tenant-1' } },
      ],
    });
    const sessionStore = createMockSessionStore([
      { id: 's1', orgId: 'tenant-1' },
      { id: 's2', orgId: 'tenant-2' },
    ]);
    const memoryStore = createMockMemoryStore([
      { id: 'm1', orgId: 'tenant-1', key: 'k1', value: 'v1', type: 'fact', confidence: 0.9, source: 'manual', tags: [], createdAt: '', updatedAt: '', expiresAt: null, accessCount: 0 },
    ]);

    const exporter = new DataExporter(graphStore, sessionStore, memoryStore);
    const { archive, manifest } = await exporter.export('tenant-1');

    expect(manifest.summary.nodes).toBe(2); // p1 + f1
    expect(manifest.summary.sessions).toBe(1); // s1 only
    expect(manifest.summary.memories).toBe(1);

    // 验证导出的节点都标记为 tenant-1
    const archiveObj = JSON.parse(archive.toString('utf-8')) as ExportArchive;
    for (const node of archiveObj.nodes) {
      expect(node.props.orgId || node.props.tenantId).toBe('tenant-1');
    }
  });
});

describe('DataExporter 降级处理', () => {
  it('GraphStore 不可用时返回空数组而非崩溃', async () => {
    const brokenStore: GraphStore = {
      createNode: () => { throw new Error('store down'); },
      createNodes: () => { throw new Error('store down'); },
      queryNodes: () => { throw new Error('store down'); },
      getNode: () => { throw new Error('store down'); },
      updateNode: () => { throw new Error('store down'); },
      deleteNode: () => { throw new Error('store down'); },
      deleteEdge: () => { throw new Error('store down'); },
      queryEdges: () => { throw new Error('store down'); },
      createEdge: () => { throw new Error('store down'); },
      createEdges: () => { throw new Error('store down'); },
      traverse: () => { throw new Error('store down'); },
      findPaths: () => { throw new Error('store down'); },
      queryTriples: () => { throw new Error('store down'); },
      getNodeAtTime: () => { throw new Error('store down'); },
    };
    const sessionStore = createMockSessionStore([]);
    const memoryStore = createMockMemoryStore([]);

    const exporter = new DataExporter(brokenStore, sessionStore, memoryStore);
    const { manifest } = await exporter.export('tenant-broken');

    // 降级后 nodes/edges 为空但整体不崩溃
    expect(manifest.summary.nodes).toBe(0);
    expect(manifest.summary.sessions).toBe(0);
    expect(manifest.summary.memories).toBe(0);
    expect(manifest.exportId).toBeDefined();
  });
});
