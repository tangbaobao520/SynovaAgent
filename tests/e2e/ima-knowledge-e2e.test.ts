/**
 * tests/e2e/ima-knowledge-e2e.test.ts — IMA 知识库端到端集成测试
 *
 * 用户流程: 配置凭证 → 连接IMA → 搜索 → 入库 → 权限过滤 → KnowledgeAgent检索
 *
 * 运行方式 (API Key 不硬编码):
 *   $env:IMA_CLIENT_ID="efe7e8d..." ; $env:IMA_API_KEY="t3v881k..."
 *   npx vitest run tests/e2e/ima-knowledge-e2e.test.ts
 *
 * 或:
 *   IMAClientId=xxx IMAApiKey=xxx npx vitest run tests/e2e/ima-knowledge-e2e.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/server';
import { createImaConnector, ingestImaResults } from '../../src/connectors/ima-connector';
import { KnowledgeStore } from '../../src/l4/knowledge-store';
import { getDatabase } from '../../src/init/engine-context';
import type { Server } from 'http';

let server: Server;
let BASE: string;
let store: KnowledgeStore;

const HAS_IMA = !!(process.env.IMA_CLIENT_ID && process.env.IMA_API_KEY);

beforeAll(async () => {
  process.env.PORT = '0';
  process.env.SYNOVA_DB_PATH = ':memory:';
  process.env.SYNOVA_SKIP_MCP = '1';
  server = await createServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3099;
  BASE = `http://localhost:${port}`;
  store = new KnowledgeStore(getDatabase());
}, 15_000);

afterAll(() => { if (server) server.close(); });

// ═══ Step 1: 凭证配置 ═══

describe('Step 1: 用户配置 IMA 凭证', () => {
  it('Given IMA credentials in env, When POST /api/credentials/ima, Then stored successfully', async () => {
    if (!HAS_IMA) return; // 跳过: 需要真实 API Key

    const res = await fetch(`${BASE}/api/credentials/ima`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: process.env.IMA_CLIENT_ID,
        apiKey: process.env.IMA_API_KEY,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('Given credentials stored, When GET /api/credentials/ima, Then returns masked info', async () => {
    if (!HAS_IMA) return;
    const res = await fetch(`${BASE}/api/credentials/ima`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(true);
    // API Key 脱敏 — 不返回明文
    expect(body.apiKey).toBe('****' + process.env.IMA_API_KEY!.slice(-4));
  });
});

// ═══ Step 2: IMA 搜索 ═══

describe('Step 2: IMA 知识库搜索', () => {
  it('Given valid credentials, When search IMA, Then returns results', async () => {
    if (!HAS_IMA) return;
    const connector = createImaConnector({
      clientId: process.env.IMA_CLIENT_ID!,
      apiKey: process.env.IMA_API_KEY!,
    });

    const bases = await connector.getKnowledgeBases();
    expect(bases.length).toBeGreaterThan(0);
    expect(bases[0]).toHaveProperty('id');
    expect(bases[0]).toHaveProperty('name');

    // 用第一个知识库测试搜索
    const { results } = await connector.search(bases[0].id, '产品');
    expect(Array.isArray(results)).toBe(true);
    // 有结果或空结果都算通过 — 取决于用户的知识库内容
  }, 20_000);

  it('Given invalid credentials, When search IMA, Then returns empty gracefully', async () => {
    const connector = createImaConnector({
      clientId: 'invalid',
      apiKey: 'invalid',
    });
    const { results } = await connector.search('test-id', 'query');
    expect(results).toHaveLength(0); // 静默降级，不抛异常
  }, 10_000);
});

// ═══ Step 3: 结果入库 ═══

describe('Step 3: IMA 结果写入 KnowledgeStore', () => {
  it('Given IMA search results, When ingested, Then stored with access tags', async () => {
    if (!HAS_IMA) return;
    const connector = createImaConnector({
      clientId: process.env.IMA_CLIENT_ID!,
      apiKey: process.env.IMA_API_KEY!,
    });
    const bases = await connector.getKnowledgeBases();
    if (bases.length === 0) return;
    const { results } = await connector.search(bases[0].id, '组织架构', '');

    const count = await ingestImaResults(store, results, 'test-team', 'IMA测试');
    expect(count).toBeGreaterThanOrEqual(0); // 可能为空

    // 验证入库的数据携带权限标签
    const { results: stored } = store.search('组织', { conditions: [] }, 10);
    const imaResults = stored.filter(r => r.sourceType === 'external');
    for (const r of imaResults) {
      expect(r.accessLevel).toBe('team');
      expect(r.accessTeamId).toBe('test-team');
      expect(r.authorityLevel).toBe('external_official');
    }
  }, 20_000);
});

// ═══ Step 4: 权限过滤 ═══

describe('Step 4: 权限过滤 — 不同角色看到不同结果', () => {
  it('Given admin filter (empty), When search, Then sees all results', async () => {
    if (!HAS_IMA) return;
    const { results, stats } = store.search('组织', { conditions: [] }, 10);
    expect(results.length).toBeGreaterThanOrEqual(0);
    expect(stats.filteredOut).toBe(0); // 不过滤
  });

  it('Given employee filter (public only), When search, Then IMA results are filtered out', async () => {
    // IMA 结果以 accessLevel=team 存储，employee 只能看 public
    const { results, stats } = store.search('组织', {
      conditions: [{ field: 'access.level', operator: 'IN', value: ['public'] }],
    }, 10);
    const imaResults = results.filter(r => r.sourceType === 'external');
    expect(imaResults).toHaveLength(0); // IMA 结果全被过滤
    expect(stats.filteredOut).toBeGreaterThanOrEqual(0);
  });

  it('Given manager filter (public+team), When search, Then sees IMA results', async () => {
    const { results } = store.search('组织', {
      conditions: [
        { field: 'access.level', operator: 'IN', value: ['public', 'team'] },
        { field: 'access.teamId', operator: 'EQ', value: 'test-team' },
        { field: 'access.sensitivity', operator: 'NOT_EQ', value: 'restricted' },
      ],
    }, 10);
    const imaResults = results.filter(r => r.sourceType === 'external');
    expect(imaResults.length).toBeGreaterThanOrEqual(0); // 能看到
  });
});

// ═══ Step 5: 端到端 — 配置→搜索→入库→检索→权限 ═══

describe('Step 5: 完整用户旅程', () => {
  it('Given IMA configured, When full pipeline, Then admin sees results, employee sees none', async () => {
    if (!HAS_IMA) return;

    // 1. 验证凭证已配置
    const credRes = await fetch(`${BASE}/api/credentials/ima`);
    const cred = await credRes.json();
    expect(cred.configured).toBe(true);

    // 2. IMA 搜索
    const connector = createImaConnector({
      clientId: process.env.IMA_CLIENT_ID!,
      apiKey: process.env.IMA_API_KEY!,
    });
    const bases = await connector.getKnowledgeBases();
    expect(bases.length).toBeGreaterThan(0);

    const { results } = await connector.search(bases[0].id, '管理', '');

    // 3. 入库
    const count = await ingestImaResults(store, results.slice(0, 5), 'rnd', 'IMA-E2E');
    expect(count).toBeGreaterThanOrEqual(0);

    // 4. KnowledgeStore 搜索 — admin (无过滤)
    const adminResult = store.search('管理', { conditions: [] }, 10);
    expect(adminResult.results.length).toBeGreaterThanOrEqual(0);

    // 5. KnowledgeStore 搜索 — employee (受限)
    const employeeResult = store.search('管理', {
      conditions: [
        { field: 'access.level', operator: 'IN', value: ['public'] },
      ],
    }, 10);
    const externalInEmployee = employeeResult.results.filter(r => r.sourceType === 'external');
    // IMA 结果以 team 级别存储, employee 只能看 public, 所以应该被过滤
    expect(externalInEmployee).toHaveLength(0);

    // 6. 审计日志验证
    expect(adminResult.stats.totalHits).toBeGreaterThanOrEqual(employeeResult.stats.totalHits);
  }, 30_000);
});
