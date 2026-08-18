/**
 * tests/contract/l4-contract.test.ts — D355 L4 数据契约收敛契约测试
 *
 * 铁律 33: *.test.ts 单元测试 (使用 :memory: SQLite)
 * 铁律 48: 真实断言 — 正常路径 + 降级路径 + 边界条件
 *
 * 契约锚点 = financial.json ontology schema（cash / operating_expense / receivables）
 *   (Client / Person / Financial / cash / operating_expense)
 *   （D355 曾误锚 compute 读侧 camelCase cashBalance/operatingExpenses，本修复已改为本体 schema snake_case）
 * 覆盖:
 *   1. 写侧映射 JSON 与读侧锚点一致（缺陷 B 修复回归）
 *   2. 上传→查询 roundtrip（写读闭环，缺陷 B 场景 2 复现）
 *   3. 旧库 props_json 构造自动迁移（缺陷 A 场景 1 复现 + 修复验证）
 *   4. 查询 fail-open 升级 log.error（非静默 warn，P0-3 修复验证）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';
import { SqliteGraphStore } from '../../src/adapters/sqlite-graph-store';

// D355: mock logger 单例 — 被测模块与测试共享同一 mock 实例, 可断言 log.error/log.warn 调用
vi.mock('@synova/logger', () => {
  const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { createLogger: () => log };
});

interface MockLog {
  warn: Mock;
  error: Mock;
  info: Mock;
  debug: Mock;
}

const log = createLogger('test') as unknown as MockLog;

const MAPPINGS_DIR = join(process.cwd(), 'extensions', 'ontology', 'field-mappings');

interface FieldMappingConfig {
  name: string;
  label: string;
  targetNodeType: string;
  mappings: Array<{ externalField: string; prop: string; type: string }>;
}

function loadMapping(name: string): FieldMappingConfig {
  const raw = readFileSync(join(MAPPINGS_DIR, `${name}.json`), 'utf-8');
  return JSON.parse(raw) as FieldMappingConfig;
}

function createDb(): Database.Database {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BetterSqlite3 = require('better-sqlite3');
  return new BetterSqlite3(':memory:') as Database.Database;
}

/** 旧库 graph_nodes: 有 props_json 列、无 props 列（K3 P0-3 实测形态） */
function createLegacyGraphNodes(db: Database.Database): void {
  db.exec(`
    CREATE TABLE graph_nodes (
      id TEXT PRIMARY KEY,
      graph TEXT NOT NULL DEFAULT 'default',
      type TEXT NOT NULL,
      name TEXT,
      props_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      valid_from TEXT NOT NULL DEFAULT (datetime('now')),
      valid_to TEXT
    )
  `);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('D355 L4 契约 — 写侧映射 vs 读侧锚点（缺陷 B）', () => {
  it('crm-standard 写侧 targetNodeType == 读侧 Client', () => {
    expect(loadMapping('crm-standard').targetNodeType).toBe('Client');
  });

  it('hr-standard 写侧 targetNodeType == 读侧 Person', () => {
    expect(loadMapping('hr-standard').targetNodeType).toBe('Person');
  });

  it('erp-standard 写侧 targetNodeType == 读侧 Financial', () => {
    expect(loadMapping('erp-standard').targetNodeType).toBe('Financial');
  });

  it('erp-standard 写侧 prop 对齐 financial schema cash/operating_expense（断裂名清零）', () => {
    const props = loadMapping('erp-standard').mappings.map((m) => m.prop);
    expect(props).toContain('cash');
    expect(props).toContain('operating_expense');
    expect(props).not.toContain('cashBalance');
    expect(props).not.toContain('operatingExpenses');
  });
});

describe('D355 L4 契约 — 上传→查询 roundtrip（缺陷 B 场景 2）', () => {
  it('按 crm 映射写 Client 后 queryNodes(Client) 命中', () => {
    const db = createDb();
    const store = new SqliteGraphStore(db);
    const mapping = loadMapping('crm-standard');
    const props: Record<string, unknown> = {};
    for (const m of mapping.mappings) props[m.prop] = m.type === 'number' ? 1 : '2026Q1';

    const id = store.createNode(mapping.targetNodeType, props, 'enterprise');
    const nodes = store.queryNodes('Client', {}, 'enterprise');

    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe(id);
    expect(nodes[0].props.churn_rate).toBe(1);
  });

  it('按 erp 映射写 Financial 后 props.cash/operating_expense 可读', () => {
    const db = createDb();
    const store = new SqliteGraphStore(db);
    const mapping = loadMapping('erp-standard');
    const props: Record<string, unknown> = {};
    for (const m of mapping.mappings) props[m.prop] = m.type === 'number' ? 2 : '2026Q1';

    store.createNode(mapping.targetNodeType, props, 'enterprise');
    const nodes = store.queryNodes('Financial', {}, 'enterprise');

    expect(nodes).toHaveLength(1);
    expect(nodes[0].props.cash).toBe(2);
    expect(nodes[0].props.operating_expense).toBe(2);
  });
});

describe('D355 L4 契约 — 旧库 props_json 构造自动迁移（缺陷 A 场景 1）', () => {
  it('旧库数据经构造迁移后查询可见（不再静默空）', () => {
    const db = createDb();
    createLegacyGraphNodes(db);
    db.prepare("INSERT INTO graph_nodes (id, graph, type, props_json) VALUES ('legacy-1', 'default', 'Client', ?)").run('{"churn_rate":0.12}');

    const store = new SqliteGraphStore(db); // 构造即迁移
    const nodes = store.queryNodes('Client');

    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('legacy-1');
    expect(nodes[0].props.churn_rate).toBe(0.12);
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe('D355 L4 契约 — 查询 fail-open 升级（P0-3 修复）', () => {
  it('schema 漂移（props 列缺失）→ log.error 显式失效，非静默 warn', () => {
    const db = createDb();
    const store = new SqliteGraphStore(db); // 正常 schema 构造
    // 构造后发生 schema 漂移: 删表重建为无 props 列（且无 props_json 可回填）
    db.exec('DROP TABLE graph_nodes');
    db.exec(`
      CREATE TABLE graph_nodes (
        id TEXT PRIMARY KEY,
        graph TEXT NOT NULL DEFAULT 'default',
        type TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        valid_from TEXT NOT NULL DEFAULT (datetime('now')),
        valid_to TEXT
      )
    `);

    const nodes = store.queryNodes('Client');

    expect(nodes).toEqual([]);
    expect(log.error).toHaveBeenCalled();
    const errorMessages = (log.error.mock.calls as unknown[][]).map((c) => String(c[1]));
    expect(errorMessages.some((m) => m.includes('schema 漂移'))).toBe(true);
    // 静默 fail-open 的 warn 路径必须不再出现（构造器 WAL 降级 warn 与查询无关）
    const warnMessages = (log.warn.mock.calls as unknown[][]).map((c) => String(c[1]));
    expect(warnMessages.some((m) => m.includes('查询图节点失败'))).toBe(false);
  });

  it('查询失败（非 schema 漂移）同样升级 log.error', () => {
    const db = createDb();
    const store = new SqliteGraphStore(db);
    db.exec('DROP TABLE graph_nodes'); // 整表缺失 → 任意查询失败
    // 不重建: SELECT 报 no such table → no such table 分支
    const nodes = store.queryNodes('Client');
    expect(nodes).toEqual([]);
    expect(log.error).toHaveBeenCalled();
    const errorMessages = (log.error.mock.calls as unknown[][]).map((c) => String(c[1]));
    expect(errorMessages.some((m) => m.includes('查询图节点失败'))).toBe(true);
  });
});
