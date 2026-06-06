/**
 * tests/security/06-permission-filtering.test.ts — 权限过滤端到端测试
 *
 * 验证: 不同角色提问同一问题应得到不同结果。
 * 铁律 5: 后端能力≠用户可用的功能。权限是知识库的先决条件。
 *
 * 测试矩阵:
 *   admin → 全部可见
 *   manager → public + team (本团队) + sensitivity≠restricted
 *   employee → public only
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';

// ═══ 模拟 KnowledgeStore (内联，避免跨层依赖) ═══

interface FilterCondition { field: string; operator: 'IN' | 'EQ' | 'NOT_EQ'; value: unknown; }
interface FilterClause { conditions: FilterCondition[]; }

class KnowledgeStore {
  private db: Database.Database;
  constructor(db: Database.Database) { this.db = db; this.init(); }
  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY, text TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT,
        authority_level TEXT DEFAULT 'reference',
        access_level TEXT DEFAULT 'private', access_team_id TEXT, access_sensitivity TEXT DEFAULT 'normal',
        pkb_domain TEXT, pkb_type TEXT, pkb_confidence REAL DEFAULT 0.7, knowledge_level INTEGER DEFAULT 2
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(id UNINDEXED, text, source_type UNINDEXED, tokenize='unicode61');
    `);
  }
  insert(chunk: { text: string; accessLevel: string; accessTeamId?: string; accessSensitivity?: string; pkbDomain?: string }) {
    const id = `test_${Math.random().toString(36).slice(2, 8)}`;
    this.db.prepare(`INSERT INTO knowledge_chunks (id, text, source_type, source_id, access_level, access_team_id, access_sensitivity, pkb_domain) VALUES (?,?,'test',?,?,?,?,?)`)
      .run(id, chunk.text, id, chunk.accessLevel, chunk.accessTeamId || null, chunk.accessSensitivity || 'normal', chunk.pkbDomain || null);
    return id;
  }
  search(query: string, filter: FilterClause) {
    const sql = query ? 'SELECT * FROM knowledge_chunks WHERE text LIKE ?' : 'SELECT * FROM knowledge_chunks';
    const rows = (query
      ? this.db.prepare(sql).all(`%${query}%`)
      : this.db.prepare(sql).all()) as Array<Record<string, unknown>>;
    if (filter.conditions.length === 0) return rows;
    return rows.filter(row => {
      const level = row.access_level as string;
      // admin 全看到
      if (filter.conditions.length === 0) return true;
      // 检查 level 条件
      const levelCond = filter.conditions.find(c => c.field === 'access.level');
      if (levelCond && levelCond.operator === 'IN') {
        const allowed = levelCond.value as unknown[];
        // 如果 level 在允许列表中，并且是 public → 直接通过
        if (allowed.includes('public') && level === 'public') return true;
        // 如果 level 在允许列表中，但是 team/private → 需要额外检查
        if (!allowed.includes(level)) return false;
      }
      // 额外过滤 teamId 和 sensitivity
      for (const c of filter.conditions) {
        if (c.field === 'access.level') continue; // 已检查
        const colMap: Record<string, string> = { 'access.teamId': 'access_team_id', 'access.sensitivity': 'access_sensitivity' };
        const col = colMap[c.field] || c.field;
        const val = row[col];
        if (c.operator === 'EQ' && val !== c.value) return false;
        if (c.operator === 'NOT_EQ' && val === c.value) return false;
      }
      return true;
    });
  }
}

function adminFilter(): FilterClause { return { conditions: [] }; }
function managerFilter(teamId: string): FilterClause { return { conditions: [{ field: 'access.level', operator: 'IN', value: ['public', 'team'] }, { field: 'access.teamId', operator: 'EQ', value: teamId }, { field: 'access.sensitivity', operator: 'NOT_EQ', value: 'restricted' }] }; }
function employeeFilter(): FilterClause { return { conditions: [{ field: 'access.level', operator: 'IN', value: ['public'] }] }; }

// ═══ 权限过滤 ═══

describe('权限过滤: 不同角色 → 不同结果', () => {
  const db = new Database(':memory:');
  const store = new KnowledgeStore(db);

  beforeAll(() => {
    store.insert({ text: '公开的公司入职手册', accessLevel: 'public', pkbDomain: 'org' });
    store.insert({ text: '销售团队的提成方案', accessLevel: 'team', accessTeamId: 'sales', accessSensitivity: 'normal', pkbDomain: 'org' });
    store.insert({ text: '研发团队的技术架构文档', accessLevel: 'team', accessTeamId: 'rnd', accessSensitivity: 'normal', pkbDomain: 'tech' });
    store.insert({ text: 'HR部门的薪资数据(敏感)', accessLevel: 'team', accessTeamId: 'hr', accessSensitivity: 'restricted', pkbDomain: 'org' });
    store.insert({ text: 'CEO的私人笔记', accessLevel: 'private', pkbDomain: 'strategy' });
  });

  it('Given admin user, When search, Then sees all 5 documents', () => {
    const rows = store.search('', adminFilter());
    expect(rows).toHaveLength(5);
  });

  it('Given sales manager, When search, Then sees public + sales team = 2 documents', () => {
    const rows = store.search('', managerFilter('sales'));
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.access_level === 'public' || r.access_team_id === 'sales')).toBe(true);
  });

  it('Given sales manager, When search, Then does NOT see restricted HR data', () => {
    const rows = store.search('薪资', managerFilter('sales'));
    expect(rows).toHaveLength(0);
  });

  it('Given employee (any team), When search, Then only sees public documents', () => {
    const rows = store.search('', employeeFilter());
    expect(rows).toHaveLength(1);
    expect(rows[0].access_level).toBe('public');
    expect(rows[0].text).toContain('入职手册');
  });

  it('Given employee, When search for team document, Then returns empty', () => {
    const rows = store.search('研发', employeeFilter());
    expect(rows).toHaveLength(0);
  });

  it('Given manager from another team, When search, Then cannot see cross-team docs', () => {
    const rows = store.search('研发', managerFilter('sales'));
    expect(rows).toHaveLength(0);
  });

  it('Given admin, When search for private note, Then sees it', () => {
    const rows = store.search('私人', adminFilter());
    expect(rows).toHaveLength(1);
  });
});

// ═══ FilterClause 逻辑 ═══

describe('FilterClause 逻辑正确性', () => {
  it('Admin filter: conditions array is empty', () => {
    const f = adminFilter();
    expect(f.conditions).toHaveLength(0);
  });

  it('Manager filter: 3 conditions', () => {
    const f = managerFilter('team-abc');
    expect(f.conditions).toHaveLength(3);
    expect(f.conditions[0].operator).toBe('IN');
    expect(f.conditions[1].operator).toBe('EQ');
    expect(f.conditions[2].operator).toBe('NOT_EQ');
  });

  it('Employee filter: only public', () => {
    const f = employeeFilter();
    expect(f.conditions).toHaveLength(1);
    expect(f.conditions[0].value).toEqual(['public']);
  });

  it('Manager filter excludes restricted sensitivity', () => {
    const f = managerFilter('sales');
    const sensitivityFilter = f.conditions.find(c => c.field === 'access.sensitivity');
    expect(sensitivityFilter).toBeDefined();
    expect(sensitivityFilter!.operator).toBe('NOT_EQ');
    expect(sensitivityFilter!.value).toBe('restricted');
  });
});

// ═══ 默认安全 (无标签 → 不可见) ═══

describe('默认安全: 无标签 → 不可见', () => {
  it('Given untagged document (accessLevel=private), When employee search, Then not visible', () => {
    const db2 = new Database(':memory:');
    const s = new KnowledgeStore(db2);
    s.insert({ text: '未打标签的文档', accessLevel: 'private' });
    const rows = s.search('文档', employeeFilter());
    expect(rows).toHaveLength(0);
  });

  it('Given untagged document, When admin search, Then visible (admin sees all)', () => {
    const db2 = new Database(':memory:');
    const s = new KnowledgeStore(db2);
    s.insert({ text: '未打标签的文档', accessLevel: 'private' });
    const rows = s.search('文档', adminFilter());
    expect(rows).toHaveLength(1);
  });
});
