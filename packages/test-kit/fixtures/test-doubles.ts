/**
 * fixtures/test-doubles.ts — 测试桩
 *
 * 提供可复用的 Mock LLM Provider、Mock GraphStore、Mock DB。
 * 所有测试通过此工厂创建桩，不直接 new 真实实现。
 */
import type Database from 'better-sqlite3';

/** Mock LLM Provider — 返回固定回复 */
export function createMockLLMProvider(reply?: string) {
  return {
    name: 'mock-provider',
    baseUrl: 'http://mock',
    chat: async () => ({
      content: reply || '{"hypothesis": "测试假设", "confidence": 0.8}',
      model: 'mock-model',
    }),
    stream: async (_messages: unknown[], cb: { onToken: (t: string) => void; onComplete?: (r: unknown) => void }) => {
      const text = reply || 'mock response';
      for (const ch of text) cb.onToken(ch);
      cb.onComplete?.({ content: text, model: 'mock-model' });
    },
    healthCheck: async () => ({ healthy: true, latencyMs: 1 }),
    listModels: () => ['mock-model'],
  };
}

/** Mock ToolRegistry — 返回固定结果 */
export function createMockToolRegistry() {
  const tools = new Map();
  return {
    register: (t: unknown) => { /* noop */ },
    listTools: () => [],
    toOpenAITools: () => [],
    execute: async (name: string) => ({ result: `mock-${name}` }),
    getTool: (name: string) => undefined,
  };
}

/** 创建 :memory: SQLite 数据库供测试使用 */
export function createTestDatabase(dbLib: typeof import('better-sqlite3')): Database.Database {
  const db = new dbLib.default(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// ═══ GraphStoreReader 接口与 Mock ═══
interface GraphStoreNode { id: string; type: string; props: Record<string, unknown>; }
interface GraphStoreEdge { id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown>; }

export interface MockGraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): GraphStoreNode[];
  queryEdges(type?: string, from?: string, to?: string, graph?: string): GraphStoreEdge[];
  getNode(id: string, graph: string): GraphStoreNode | null;
}

/**
 * 创建可复用的 Mock GraphStoreReader。
 * queryNodes 按 type + 可选 filters (AND 匹配) 过滤。
 */
export function createMockGraphStoreReader(data: {
  nodes?: Record<string, GraphStoreNode[]>;
  edges?: Record<string, GraphStoreEdge[]>;
}): MockGraphStoreReader {
  const allNodes: GraphStoreNode[] = [];
  const allEdges: GraphStoreEdge[] = [];
  if (data.nodes) for (const ns of Object.values(data.nodes)) allNodes.push(...ns);
  if (data.edges) for (const es of Object.values(data.edges)) allEdges.push(...es);

  return {
    queryNodes(type: string, filters?: Record<string, unknown>, _g?: string): GraphStoreNode[] {
      let r = allNodes.filter(n => n.type === type);
      if (filters) for (const [k, v] of Object.entries(filters)) r = r.filter(n => n.props[k] === v);
      return r;
    },
    queryEdges(type?: string, from?: string, to?: string, _g?: string): GraphStoreEdge[] {
      let r = allEdges;
      if (type) r = r.filter(e => e.type === type);
      if (from) r = r.filter(e => e.from === from);
      if (to) r = r.filter(e => e.to === to);
      return r;
    },
    getNode(id: string, _g: string): GraphStoreNode | null {
      return allNodes.find(n => n.id === id) || null;
    },
  };
}

/** Mock SessionStore */
export function createMockSessionStore() {
  const sessions = new Map();
  return {
    createSession: (orgId: string) => {
      const id = `sess_mock_${Date.now()}`;
      sessions.set(id, { id, orgId, phase: 0 });
      return { id, orgId, phase: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stateJson: null };
    },
    getSession: (id: string) => sessions.get(id) || null,
    listSessions: () => [...sessions.values()],
    addMessage: () => {},
    getMessages: () => [],
    saveState: () => {},
    loadState: () => null,
    search: () => [],
  };
}
