/**
 * tests/e2e/pde-seed-real-data.ts — 模拟 PDE 访谈后的完整数据注入
 *
 * 基于真实咨询场景:
 *   某 SaaS 公司，150 人，销售转化率下降，核心员工离职，交付延期
 *
 * 注入: GraphStore entities → 引擎可以完整分析
 * D317: engine-core 退役 — 改用 SqliteGraphStore (src/adapters/sqlite-graph-store)；
 *       gap-recorder 无 Synova 等价实现，降级跳过。
 */
import { initEngineContext, getDatabase } from '../../src/init/engine-context';
import { SqliteGraphStore } from '../../src/adapters/sqlite-graph-store';
import { createLogger } from '@synova/logger';

const log = createLogger('test:pde-seed');

export async function seedRealPdeData(): Promise<string> {
  const orgId = 'default';  // 引擎默认使用 'default', 需要匹配

  // 1. 确保 DB + EngineContext 已初始化
  try { getDatabase(); } catch { initEngineContext(); }

  // 2. 通过 GraphStore API 创建组织节点（自动建表 + SOG 验证）
  const db = getDatabase();
  const store = new SqliteGraphStore(db);

  // 3 个团队
  const salesTeam = store.createNode('Team', { name: '销售团队', teamType: 'permanent', department: 'sales' }, orgId);
  const engTeam   = store.createNode('Team', { name: '研发团队', teamType: 'permanent', department: 'engineering' }, orgId);
  const prodTeam  = store.createNode('Team', { name: '产品团队', teamType: 'permanent', department: 'product' }, orgId);

  // 2 个目标 — goalType ∈ {mission, vision, okr, north_star}
  const goal1 = store.createNode('Goal', { name: 'Q3 营收增长 30%', description: '季度营收目标', goalType: 'okr', progress: 0.45 }, orgId);
  const goal2 = store.createNode('Goal', { name: '核心人才保留率 90%', description: '关键岗位流失控制', goalType: 'okr', progress: 0.60 }, orgId);

  // 3 个风险 — severity 需为数字, riskType 为字符串
  // severity ∈ {low, medium, high, critical}
  const risk1 = store.createNode('Risk', { riskType: 'talent_drain', name: '高级工程师离职潮', severity: 'high', status: 'active' as const }, orgId);
  const risk2 = store.createNode('Risk', { riskType: 'revenue_decline', name: '大客户续费率下降', severity: 'high', status: 'active' as const }, orgId);
  const risk3 = store.createNode('Risk', { riskType: 'delivery_delay', name: '产品交付周期延长', severity: 'medium', status: 'active' as const }, orgId);

  // 2 个流程 — processType ∈ {approval, deployment, meeting, other}
  const proc1 = store.createNode('Process', { name: '销售漏斗管理', processType: 'other' }, orgId);
  const proc2 = store.createNode('Process', { name: '产品交付流程', processType: 'other' }, orgId);

  // 4 个能力 — category ∈ {technical, domain, compliance, leadership}
  const cap1 = store.createNode('Capability', { name: '大客户销售', category: 'domain' }, orgId);
  const cap2 = store.createNode('Capability', { name: '技术架构', category: 'technical' }, orgId);
  const cap3 = store.createNode('Capability', { name: '产品设计', category: 'technical' }, orgId);
  const cap4 = store.createNode('Capability', { name: '客户成功', category: 'domain' }, orgId);

  // 关系
    // createEdge(type, from, to, weight, props, graph) — 每个 edge 需要 SOG validator 要求的 props
  const E = (t: string, f: string, to: string, p: Record<string, unknown> = {}) =>
    store.createEdge(t, f, to, 1.0, p, orgId);

  // OWNS: 需要 ownershipType ∈ {executes, manages, sponsors}
  E('OWNS', salesTeam, proc1, { ownershipType: 'executes' });
  E('OWNS', engTeam, proc2, { ownershipType: 'executes' });

  // ALIGNS_WITH: 需要 alignmentStrength + alignmentType
  const align = { alignmentStrength: 0.8, alignmentType: 'direct' as const };
  E('ALIGNS_WITH', salesTeam, goal1, align);
  E('ALIGNS_WITH', engTeam, goal2, align);

  // AFFECTS: from ∈ {Event, Process}, to ∈ {Financial, Client, Risk}
  E('AFFECTS', proc2, risk3, { direction: 'negative' as const });  // 交付流程 → 延期风险
  E('AFFECTS', proc2, risk2, { direction: 'negative' as const });  // 交付流程 → 续费率下降

  // DEPENDS_ON: from ∈ {Process,Tool,Agent}, to ∈ {Tool,Agent,Process}
  E('DEPENDS_ON', proc2, proc1, { criticality: 'required' as const });  // 交付流程 依赖 销售漏斗

  // PROVIDES: 无必填属性
  E('PROVIDES', engTeam, cap2);
  E('PROVIDES', prodTeam, cap3);
  E('PROVIDES', salesTeam, cap1);

  // 3. GapSnapshot 记录 — D317 降级: engine-core gap-recorder 无 Synova 等价实现，跳过
  log.warn({ orgId }, 'GapSnapshot 记录已降级跳过 (engine-core gap-recorder 退役)');

  log.info({ orgId }, 'PDE 种子数据注入完成（15 节点 + 10 边）');
  return orgId;
}
