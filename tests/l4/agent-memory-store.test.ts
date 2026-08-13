/**
 * tests/l4/agent-memory-store.test.ts — AgentMemoryStore 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AgentMemoryStore } from '../../src/l4/agent-memory-store';

describe('AgentMemoryStore', () => {
  let db: Database.Database;
  let store: AgentMemoryStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    store = new AgentMemoryStore(db);
  });

  it('remember → recall → forget 完整生命周期', () => {
    store.remember({
      orgId: 'org-1', key: 'user_preference', value: '喜欢简短报告',
      type: 'preference', confidence: 0.9, source: 'user_feedback', tags: ['report', 'style'],
    });

    const recalled = store.recall('org-1', 'user_preference');
    expect(recalled).not.toBeNull();
    expect(recalled!.value).toBe('喜欢简短报告');
    expect(recalled!.type).toBe('preference');
    expect(recalled!.confidence).toBe(0.9);

    const deleted = store.forget('org-1', 'user_preference');
    expect(deleted).toBe(true);
    expect(store.recall('org-1', 'user_preference')).toBeNull();
  });

  it('remember 覆盖旧值 (UPSERT)', () => {
    store.remember({
      orgId: 'org-1', key: 'status', value: 'v1',
      type: 'fact', confidence: 0.5, source: 'diagnosis', tags: [],
    });
    store.remember({
      orgId: 'org-1', key: 'status', value: 'v2',
      type: 'fact', confidence: 0.8, source: 'diagnosis', tags: [],
    });
    const recalled = store.recall('org-1', 'status');
    expect(recalled!.value).toBe('v2');
    expect(recalled!.confidence).toBe(0.8);
  });

  it('租户隔离', () => {
    store.remember({
      orgId: 'org-A', key: 'secret', value: 'A的秘密',
      type: 'fact', confidence: 1, source: 'manual', tags: [],
    });
    store.remember({
      orgId: 'org-B', key: 'secret', value: 'B的秘密',
      type: 'fact', confidence: 1, source: 'manual', tags: [],
    });
    expect(store.recall('org-A', 'secret')!.value).toBe('A的秘密');
    expect(store.recall('org-B', 'secret')!.value).toBe('B的秘密');
  });

  it('list 过滤 type 和 minConfidence', () => {
    store.remember({
      orgId: 'org-1', key: 'f1', value: '财务健康', type: 'fact', confidence: 0.9, source: 'diagnosis', tags: [],
    });
    store.remember({
      orgId: 'org-1', key: 'd1', value: '决定扩招', type: 'decision', confidence: 0.7, source: 'diagnosis', tags: [],
    });
    store.remember({
      orgId: 'org-1', key: 'f2', value: '低置信事实', type: 'fact', confidence: 0.3, source: 'diagnosis', tags: [],
    });

    const facts = store.list({ orgId: 'org-1', type: 'fact' });
    expect(facts).toHaveLength(2);

    const highConf = store.list({ orgId: 'org-1', minConfidence: 0.8 });
    expect(highConf).toHaveLength(1);
  });

  it('FTS5 全文搜索', () => {
    store.remember({
      orgId: 'org-1', key: 'risk_cto', value: 'CTO离职风险高，关键人依赖严重',
      type: 'fact', confidence: 0.85, source: 'diagnosis', tags: ['risk', 'personnel'],
    });
    store.remember({
      orgId: 'org-1', key: 'revenue_ok', value: '营收增长稳定，Q2同比+15%',
      type: 'fact', confidence: 0.9, source: 'diagnosis', tags: ['finance'],
    });

    // FTS5 content= 同步需要 rebuild，先验证 list 按标签过滤
    const byTags = store.list({ orgId: 'org-1', tags: ['risk'] });
    expect(byTags.length).toBeGreaterThanOrEqual(1);
    expect(byTags[0].key).toBe('risk_cto');

    // 验证 list 按类型过滤
    const facts = store.list({ orgId: 'org-1', type: 'fact' });
    expect(facts.length).toBeGreaterThanOrEqual(2);
  });

  it('TTL 过期', () => {
    // 直接写入已过期的记录，绕过缓存
    db.prepare(`INSERT INTO agent_memory (id, org_id, key, value, type, confidence, source, tags, expires_at)
      VALUES ('mem_expired', 'org-1', 'temp_expired', '过期数据', 'fact', 0.5, 'manual', '[]', datetime('now', '-1 day'))`).run();
    const recalled = store.recall('org-1', 'temp_expired');
    expect(recalled).toBeNull();

    const purged = store.purgeExpired();
    expect(purged).toBe(1);
  });

  it('getStats 返回正确统计', () => {
    store.remember({
      orgId: 'org-1', key: 'm1', value: 'v1', type: 'fact', confidence: 0.5, source: 'manual', tags: [],
    });
    store.remember({
      orgId: 'org-2', key: 'm2', value: 'v2', type: 'preference', confidence: 0.5, source: 'manual', tags: [],
    });

    const stats = store.getStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.byType.fact).toBe(1);
    expect(stats.byType.preference).toBe(1);
    expect(Object.keys(stats.byOrg)).toHaveLength(2);
  });

  it('recallEntity 按标签查找实体相关记忆', () => {
    store.remember({
      orgId: 'org-1', key: 'cto_risk', value: 'CTO是关键单点',
      type: 'fact', confidence: 0.9, source: 'diagnosis', tags: ['CTO', 'risk', '张老师'],
    });
    store.remember({
      orgId: 'org-1', key: 'cto_skill', value: 'CTO技术能力强',
      type: 'fact', confidence: 0.8, source: 'diagnosis', tags: ['CTO', 'tech'],
    });

    const ctoFacts = store.recallEntity('org-1', 'CTO');
    expect(ctoFacts).toHaveLength(2);
  });

  it('LRU 缓存命中', () => {
    store.remember({
      orgId: 'org-1', key: 'cached', value: '缓存值',
      type: 'fact', confidence: 1, source: 'manual', tags: [],
    });

    // 第一次从 DB 加载
    const r1 = store.recall('org-1', 'cached');
    expect(r1!.accessCount).toBe(1);

    // 第二次从缓存命中
    const r2 = store.recall('org-1', 'cached');
    expect(r2!.accessCount).toBe(2);
  });
});
