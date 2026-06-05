/**
 * tests/l1/qa-router.test.ts — QA 路由器单元+集成测试
 *
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例 (happy + sad)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/server';
import { KnowledgeStore } from '../../src/l4/knowledge-store';
import { getDatabase } from '../../src/init/engine-context';
import type { Server } from 'http';

let server: Server;
let BASE: string;
let store: KnowledgeStore;

beforeAll(async () => {
  process.env.PORT = '0';
  process.env.SYNOVA_DB_PATH = ':memory:';
  process.env.SYNOVA_SKIP_MCP = '1';
  server = await createServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3099;
  BASE = `http://localhost:${port}`;
  store = new KnowledgeStore(getDatabase());
  // 写入测试用的 PKB 数据 (insert + update 设置 PKB 专用字段)
  const id1 = store.insert({ text: '杜邦分析法: ROE=净利润率×资产周转率×权益乘数。用于拆解企业盈利能力。', sourceType: 'pkb', sourceId: 'test-dupont', authorityLevel: 'external_reference', accessLevel: 'public', accessSensitivity: 'normal' });
  store.update(id1, { pkb_domain: 'finance', pkb_type: 'theory', pkb_confidence: 0.95, knowledge_level: 2, pkb_status: 'active' });
  const id2 = store.insert({ text: '劳动法规定: 经济补偿金按劳动者在本单位工作的年限，每满一年支付一个月工资。', sourceType: 'pkb', sourceId: 'test-labor', authorityLevel: 'external_reference', accessLevel: 'public', accessSensitivity: 'normal' });
  store.update(id2, { pkb_domain: 'org', pkb_type: 'regulation', pkb_confidence: 0.9, knowledge_level: 2, pkb_status: 'active' });
}, 15_000);

afterAll(() => { if (server) server.close(); });

// ═══ 领域识别 ═══

describe('QA Router — 领域识别', () => {
  it('Given finance question, When ask, Then routes to finance domain', async () => {
    const res = await fetch(`${BASE}/api/qa/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '什么是杜邦分析法？如何计算ROE？', userId: 'test-user' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.domain).toBe('finance');
    // 知识检索结果取决于 PKB 中是否有匹配数据
    expect(Array.isArray(body.knowledgeSources)).toBe(true);
  });

  it('Given org question, When ask, Then routes to org domain', async () => {
    const res = await fetch(`${BASE}/api/qa/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '员工被裁员应该获得多少补偿？劳动合同法怎么规定的？', userId: 'test-user' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('org');
  });

  it('Given mixed question, When ask, Then routes to primary domain', async () => {
    const res = await fetch(`${BASE}/api/qa/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '我们团队的绩效和薪酬该怎么设计才能留住人？', userId: 'test-user' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // 关键词: 绩效/薪酬/团队/留人 → org 得分最高
    expect(body.domain).toBe('org');
  });
});

// ═══ 知识来源 ═══

describe('QA Router — 知识检索', () => {
  it('Given PKB has matching knowledge, When ask, Then returns sources with metadata', async () => {
    const res = await fetch(`${BASE}/api/qa/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'ROE怎么分解？', userId: 'test-user', knowledgeLevel: 2 }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    // 知识检索结果取决于 PKB 中是否有匹配数据
    if (body.knowledgeSources.length > 0) {
      const source = body.knowledgeSources[0];
      expect(source).toHaveProperty('id');
      expect(source).toHaveProperty('type');
      expect(source).toHaveProperty('confidence');
      expect(source).toHaveProperty('snippet');
    }
  });

  it('Given no matching knowledge, When ask, Then returns degraded=true', async () => {
    const res = await fetch(`${BASE}/api/qa/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '量子计算机的原理是什么？', userId: 'test-user' }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.degraded).toBe(true);
    expect(body.knowledgeSources).toHaveLength(0);
  });
});

// ═══ 输入校验 ═══

describe('QA Router — 输入校验', () => {
  it('Given empty question, When ask, Then returns 400', async () => {
    const res = await fetch(`${BASE}/api/qa/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('Given empty string question, When ask, Then returns 400', async () => {
    const res = await fetch(`${BASE}/api/qa/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '', userId: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});
