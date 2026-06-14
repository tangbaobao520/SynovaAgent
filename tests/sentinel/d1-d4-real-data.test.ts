/**
 * tests/sentinel/d1-d4-real-data.test.ts — D1+D4 哨兵虚拟数据测试
 *
 * 用 SQLite in-memory 模拟真实场景，验证哨兵正确检测异常。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';

// 创建共享的内存数据库
let db: ReturnType<typeof Database>;
function getDb() { return db; }

// Mock engine-core 的 getEngineContext (哨兵通过 helpers.ts 调用)
vi.mock('../../../packages/engine-core/src/engine-context', () => ({
  getEngineContext: () => ({ database: { getDb } }),
}));

import { cashFlowSentinel } from '../../src/sentinel/adapters/cash-flow-sentinel';
import { customerDynamicsSentinel } from '../../src/sentinel/adapters/customer-dynamics-sentinel';
import { revenueDecompositionSentinel } from '../../src/sentinel/adapters/revenue-decomposition-sentinel';
import { integrationHealthSentinel } from '../../src/sentinel/adapters/integration-health-sentinel';
import { dataSilosSentinel } from '../../src/sentinel/adapters/data-silos-sentinel';
import { apiAccessibilitySentinel } from '../../src/sentinel/adapters/api-accessibility-sentinel';
import { dataReadinessSentinel } from '../../src/sentinel/adapters/data-readiness-sentinel';
import { protocolCoverageSentinel } from '../../src/sentinel/adapters/protocol-coverage-sentinel';
import { financialImpactSentinel } from '../../src/sentinel/adapters/financial-impact-sentinel';
import { financialsnapshotSentinel } from '../../src/sentinel/adapters/financial-snapshot-sentinel';
import { goalalignmentSentinel } from '../../src/sentinel/adapters/goal-alignment-sentinel';
import { riskaggregatorSentinel } from '../../src/sentinel/adapters/risk-aggregator-sentinel';

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE IF NOT EXISTS diagnosis_snapshots (team_id TEXT, data TEXT, created_at TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS graph_nodes (id TEXT, type TEXT, team_id TEXT, props TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS graph_edges (id TEXT, source_id TEXT, target_id TEXT, type TEXT, props TEXT)`);
});

describe('D1 增长动力哨兵 (虚拟数据)', () => {
  it('现金流哨兵: 跑道不足3个月 → critical', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('fin-1', 'FINANCIAL', 'default', JSON.stringify({ cash: 500000, burn_rate: 200000, name: '主营账户' }));
    db.prepare(`INSERT INTO diagnosis_snapshots (team_id, data, created_at) VALUES (?, ?, ?)`)
      .run('default', '{}', new Date().toISOString());

    const result = await cashFlowSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[0].title).toContain('2.5');
  });

  it('现金流哨兵: 无数据 → degraded', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    const result = await cashFlowSentinel.check({ db, now: new Date() });
    expect(result.degraded).toBe(true);
    expect(result.findings.length).toBe(0);
  });

  it('客户动态哨兵: 高流失率 → critical', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    for (let i = 1; i <= 10; i++) {
      const churned = i <= 3;
      db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
        .run(`cli-${i}`, 'CLIENT', 'default', JSON.stringify({ name: `客户${i}`, revenue: 50000, status: churned ? 'churned' : 'active', churn: churned }));
    }
    db.prepare(`INSERT INTO diagnosis_snapshots (team_id, data, created_at) VALUES (?, ?, ?)`)
      .run('default', '{}', new Date().toISOString());

    const result = await customerDynamicsSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[0].title).toContain('30%');
  });

  it('客户动态哨兵: 最大客户集中度>40% → warning', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('cli-big', 'CLIENT', 'default', JSON.stringify({ name: '大客户A', revenue: 400000, status: 'active' }));
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('cli-small', 'CLIENT', 'default', JSON.stringify({ name: '小客户B', revenue: 20000, status: 'active' }));
    db.prepare(`INSERT INTO diagnosis_snapshots (team_id, data, created_at) VALUES (?, ?, ?)`)
      .run('default', '{}', new Date().toISOString());

    const result = await customerDynamicsSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.some(f => f.title.includes('95%'))).toBe(true);
  });

  it('营收分解哨兵: 单一产品线>50% → warning', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('rev-1', 'FINANCIAL', 'default', JSON.stringify({ name: '产品A', productLine: 'SaaS订阅', revenue: 700000 }));
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('rev-2', 'FINANCIAL', 'default', JSON.stringify({ name: '产品B', productLine: '咨询服务', revenue: 100000 }));
    db.prepare(`INSERT INTO diagnosis_snapshots (team_id, data, created_at) VALUES (?, ?, ?)`)
      .run('default', '{}', new Date().toISOString());

    const result = await revenueDecompositionSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].title).toContain('SaaS订阅');
  });
});

describe('D4 软件生态哨兵 (虚拟数据)', () => {
  it('集成健康: 半数集成异常 → critical', async () => {
    db.exec(`DELETE FROM graph_nodes`); db.exec(`DELETE FROM graph_edges`);
    for (let i = 1; i <= 4; i++) {
      db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
        .run(`tool-${i}`, 'TOOL', 'default', JSON.stringify({ name: `系统${i}`, url: `https://sys${i}.example.com` }));
    }
    // 4条集成边，3条broken → healthRate=25% < 50% → critical
    for (let i = 1; i <= 4; i++) {
      const broken = i <= 3;
      db.prepare(`INSERT INTO graph_edges (id, source_id, target_id, type, props) VALUES (?, ?, ?, ?, ?)`)
        .run(`edge-${i}`, `tool-${i}`, `tool-${(i%4)+1}`, 'INTEGRATES', JSON.stringify({ status: broken ? 'broken' : 'healthy' }));
    }

    const result = await integrationHealthSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe('critical');
  });

  it('集成健康: 工具多但集成少 → warning', async () => {
    db.exec(`DELETE FROM graph_nodes`); db.exec(`DELETE FROM graph_edges`);
    for (let i = 1; i <= 10; i++) {
      db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
        .run(`tool-${i}`, 'TOOL', 'default', JSON.stringify({ name: `系统${i}` }));
    }
    // 只有1条集成边
    db.prepare(`INSERT INTO graph_edges (id, source_id, target_id, type, props) VALUES (?, ?, ?, ?, ?)`)
      .run('edge-1', 'tool-1', 'tool-2', 'INTEGRATES', JSON.stringify({ status: 'healthy' }));

    const result = await integrationHealthSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.some(f => f.title.includes('集成债务'))).toBe(true);
  });

  it('数据孤岛: 半数工具无集成 → critical', async () => {
    db.exec(`DELETE FROM graph_nodes`); db.exec(`DELETE FROM graph_edges`);
    for (let i = 1; i <= 10; i++) {
      db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
        .run(`tool-${i}`, 'TOOL', 'default', JSON.stringify({ name: `孤立系统${i}` }));
    }
    // 只有2条集成边覆盖4个工具，6个完全孤立
    db.prepare(`INSERT INTO graph_edges (id, source_id, target_id, type, props) VALUES (?, ?, ?, ?, ?)`)
      .run('edge-1', 'tool-1', 'tool-2', 'INTEGRATES', JSON.stringify({ status: 'healthy' }));
    db.prepare(`INSERT INTO graph_edges (id, source_id, target_id, type, props) VALUES (?, ?, ?, ?, ?)`)
      .run('edge-2', 'tool-3', 'tool-4', 'INTEGRATES', JSON.stringify({ status: 'healthy' }));

    const result = await dataSilosSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[0].title).toContain('6/10');
  });
});

describe('D5 软件Agent适配哨兵 (虚拟数据)', () => {
  it('API可访问性: 无TOOL节点 → degraded', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    const result = await apiAccessibilitySentinel.check({ db, now: new Date() });
    expect(result.degraded).toBe(true);
  });

  it('数据就绪: PII检测', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('node-1', 'PERSON', 'default', JSON.stringify({ name: '张三', phone: '13800138000', email: 'zhang@example.com' }));
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('node-2', 'PERSON', 'default', JSON.stringify({ name: '李四' }));

    const result = await dataReadinessSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.some(f => f.title.includes('PII'))).toBe(true);
  });

  it('协议覆盖: 无TOOL节点 → degraded', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    const result = await protocolCoverageSentinel.check({ db, now: new Date() });
    expect(result.degraded).toBe(true);
  });
});


describe('骨架升real (2026-06-14)', () => {
  it('财务影响: 高成本+风险乘数 → critical+warning', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('fin-1', 'FINANCIAL', 'default', JSON.stringify({ totalMonthlyCost: 80000, riskMultiplier: 2.0, '沟通低效': 30000, '信息断裂': 25000, '单点依赖': 15000 }));
    db.prepare(`INSERT INTO diagnosis_snapshots (team_id, data, created_at) VALUES (?, ?, ?)`)
      .run('default', JSON.stringify({ teamSize: 10 }), new Date().toISOString());

    const result = await financialImpactSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBe(2);
    expect(result.findings.some(f => f.severity === 'critical')).toBe(true);
  });

  it('财务快照: 低毛利率+低人均 → 2 warnings', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('fs-1', 'FINANCIAL', 'default', JSON.stringify({ revenue: 200000, cost: 170000 }));
    for (let i = 1; i <= 15; i++) {
      db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
        .run(`person-${i}`, 'PERSON', 'default', JSON.stringify({ name: `员工${i}` }));
    }

    const result = await financialsnapshotSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBe(2);
    expect(result.findings.some(f => f.title.includes('毛利率'))).toBe(true);
    expect(result.findings.some(f => f.title.includes('人均'))).toBe(true);
  });

  it('目标对齐: 未对齐团队目标 → warning', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    // discoverTeams 需要 diagnosis_snapshots 行才能找到团队
    db.prepare(`INSERT INTO diagnosis_snapshots (team_id, data, created_at) VALUES (?, ?, ?)`)
      .run('default', JSON.stringify({ teamSize: 3 }), new Date().toISOString());
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('goal-1', 'GOAL', 'default', JSON.stringify({ name: '2024年度营收翻倍', level: 'org' }));
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('goal-2', 'GOAL', 'default', JSON.stringify({ name: '重构前端', level: 'team' }));
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('goal-3', 'GOAL', 'default', JSON.stringify({ name: '提升测试覆盖率', level: 'team' }));
    db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
      .run('team-1', 'TEAM', 'default', JSON.stringify({ name: '研发团队' }));

    const result = await goalalignmentSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some(f => f.title.includes('未对齐'))).toBe(true);
  });

  it('风险聚合: critical风险 → critical finding', async () => {
    db.exec(`DELETE FROM graph_nodes`);
    const risks = [
      { name: '关键人离职风险', severity: 'critical', probability: 0.3, impact: 9, category: '人员' },
      { name: '现金流断裂', severity: 'critical', probability: 0.2, impact: 10, category: '财务' },
      { name: '竞品上线', severity: 'high', probability: 0.5, impact: 7, category: '市场' },
    ];
    for (const r of risks) {
      db.prepare(`INSERT INTO graph_nodes (id, type, team_id, props) VALUES (?, ?, ?, ?)`)
        .run(`risk-${r.name}`, 'RISK', 'default', JSON.stringify(r));
    }

    const result = await riskaggregatorSentinel.check({ db, now: new Date() });
    expect(result.ok).toBe(true);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[0].title).toContain('2');
  });
});
