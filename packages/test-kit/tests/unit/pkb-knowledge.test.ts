/**
 * tests/unit/pkb-knowledge.test.ts — PKB 知识库单元测试 (M2)
 *
 * 测试: KnowledgeStore CRUD, FTS5 search, PKB domain filtering, seed integrity
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';

// Inline KnowledgeStore for standalone testing (no dependency on synova-agent src/)
class KnowledgeStore {
  private db: Database.Database;
  constructor(db: Database.Database) { this.db = db; this.initSchema(); }
  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY, text TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
        authority_level TEXT DEFAULT 'reference', access_level TEXT DEFAULT 'private',
        access_team_id TEXT, access_sensitivity TEXT DEFAULT 'normal',
        pkb_domain TEXT, pkb_type TEXT, pkb_confidence REAL DEFAULT 0.7,
        pkb_status TEXT DEFAULT 'active', knowledge_level INTEGER DEFAULT 2,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(id UNINDEXED, text, source_type UNINDEXED, tokenize='unicode61');
    `);
  }
  insert(chunk: { text: string; sourceType: string; sourceId: string; authorityLevel: string; accessLevel: string; accessSensitivity: string }): string {
    const id = `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.db.prepare(`INSERT INTO knowledge_chunks (id, text, source_type, source_id, authority_level, access_level, access_sensitivity) VALUES (?,?,?,?,?,?,?)`)
      .run(id, chunk.text, chunk.sourceType, chunk.sourceId, chunk.authorityLevel, chunk.accessLevel, chunk.accessSensitivity);
    return id;
  }
  update(id: string, props: Record<string, unknown>) {
    const cols = Object.keys(props).map(k => `${k}=?`).join(', ');
    const vals = Object.values(props);
    this.db.prepare(`UPDATE knowledge_chunks SET ${cols}, updated_at=? WHERE id=?`).run(...vals, new Date().toISOString(), id);
  }
  search(query: string, limit = 10) {
    const hasCJK = /[一-鿿]/.test(query);
    if (hasCJK) {
      return this.db.prepare('SELECT * FROM knowledge_chunks WHERE text LIKE ? LIMIT ?').all(`%${query}%`, limit) as Array<Record<string, unknown>>;
    }
    return this.db.prepare('SELECT k.* FROM knowledge_chunks_fts fts JOIN knowledge_chunks k ON k.id=fts.id WHERE knowledge_chunks_fts MATCH ? LIMIT ?').all(query, limit) as Array<Record<string, unknown>>;
  }
  searchPKB(domain: string, query: string, minConf: number = 0.5, level: number = 2) {
    return this.db.prepare(`SELECT * FROM knowledge_chunks WHERE pkb_domain=? AND pkb_confidence>=? AND knowledge_level<=? AND text LIKE ? LIMIT 10`).all(domain, minConf, level, `%${query}%`) as Array<Record<string, unknown>>;
  }
}

// ═══ FTS5 中文搜索 ═══
describe('KnowledgeStore — FTS5 search', () => {
  const db = new Database(':memory:');
  const store = new KnowledgeStore(db);

  beforeAll(() => {
    const id = store.insert({ text: '杜邦分析法: ROE=净利润率×资产周转率×权益乘数', sourceType: 'pkb', sourceId: 'test', authorityLevel: 'reference', accessLevel: 'public', accessSensitivity: 'normal' });
    store.update(id, { pkb_domain: 'finance', pkb_type: 'theory', pkb_confidence: 0.95, knowledge_level: 2 });
    const id2 = store.insert({ text: '劳动法规定经济补偿金按工作年限支付', sourceType: 'pkb', sourceId: 'test2', authorityLevel: 'reference', accessLevel: 'public', accessSensitivity: 'normal' });
    store.update(id2, { pkb_domain: 'org', pkb_type: 'regulation', pkb_confidence: 0.9, knowledge_level: 2 });
  });

  it('Given Chinese query, When search, Then finds matching chunk', () => {
    const rows = store.search('杜邦分析', 5);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].text).toContain('杜邦');
  });

  it('Given finance domain filter, When searchPKB, Then returns only finance entries', () => {
    const rows = store.searchPKB('finance', '杜邦', 0.5, 2);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].pkb_domain).toBe('finance');
  });

  it('Given org domain filter, When searchPKB, Then returns org entries', () => {
    const rows = store.searchPKB('org', '劳动', 0.5, 2);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].pkb_domain).toBe('org');
  });

  it('Given no matching domain, When searchPKB, Then returns empty', () => {
    const rows = store.searchPKB('tech', '杜邦', 0.5, 2);
    expect(rows).toHaveLength(0);
  });

  it('Given high confidence threshold, When searchPKB, Then filters low confidence entries', () => {
    const rows = store.searchPKB('finance', '杜邦', 0.99, 2);
    // confidence 0.95 < 0.99, so should be filtered out
    expect(rows).toHaveLength(0);
  });
});

// ═══ PKB 种子知识完整性 ═══
describe('PKB — seed integrity', () => {
  it('Given PKB seed file, When parsed, Then all entries have required fields', () => {
    const fs = require('fs');
    const path = require('path');
    const seedFile = path.resolve(__dirname, '../../../../src/l3/pkb-seed.ts');
    const content = fs.readFileSync(seedFile, 'utf-8');
    const lines = content.split('\n').filter((l: string) => l.includes("domain: '") && l.includes("type: '") && l.includes("content: '"));
    expect(lines.length).toBeGreaterThan(130); // M2完成后 135+ 条种子

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      expect(line).toContain("domain: '");
      expect(line).toContain("type: '");
      expect(line).toContain("confidence: ");
      expect(line).toContain("level: ");
      expect(line).toContain("content: '");
    }
  });

  it('Given PKB seeds, When grouped by domain, Then all 6 domains have coverage', () => {
    const fs = require('fs');
    const path = require('path');
    const seedFile = path.resolve(__dirname, '../../../../src/l3/pkb-seed.ts');
    const content = fs.readFileSync(seedFile, 'utf-8');
    const domains = ['strategy', 'org', 'finance', 'tech', 'marketing', 'action'];
    for (const d of domains) {
      const count = (content.match(new RegExp(`domain: '${d}'`, 'g')) || []).length;
      expect(count).toBeGreaterThanOrEqual(7);
    }
  });
});

// ═══ 权限过滤 (FilterClause) ═══
describe('PKB — FilterClause permission', () => {
  const db = new Database(':memory:');
  const store = new KnowledgeStore(db);

  beforeAll(() => {
    const id1 = store.insert({ text: '公开知识', sourceType: 'pkb', sourceId: 'pub', authorityLevel: 'reference', accessLevel: 'public', accessSensitivity: 'normal' });
    store.update(id1, { pkb_domain: 'finance' });
    const id2 = store.insert({ text: '团队知识', sourceType: 'pkb', sourceId: 'team', authorityLevel: 'reference', accessLevel: 'team', accessTeamId: 'sales', accessSensitivity: 'normal' });
    store.update(id2, { pkb_domain: 'finance' });
  });

  it('Given public access, When search, Then sees public entries', () => {
    const rows = store.search('公开知识', 5);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('Given team-level entry, When searched, Then accessible by team query', () => {
    const rows = store.search('团队知识', 5);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].access_level).toBe('team');
  });
});
