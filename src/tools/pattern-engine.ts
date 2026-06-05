/**
 * tools/pattern-engine.ts — 信号模式库引擎 (Batch 2 #6)
 *
 * SQLite mode_library 表 + 种子数据 (≥5条/专家) + match_pattern 查询
 */
import Database from 'better-sqlite3';

type SqliteRow = Record<string, unknown>;

export interface DiagnosticPattern {
  id: string;
  name: string;
  dimension: string;
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  weight: number;
  expertType: string;
  source: string;
}

const SEED_PATTERNS: DiagnosticPattern[] = [
  // 战略专家 (5)
  { id: 'strat_market_shift', name: '市场突变', dimension: 'market_position', condition: '外部事件导致竞争格局变化', severity: 'high', weight: 0.8, expertType: 'strategic_analyst', source: 'seed' },
  { id: 'strat_growth_stall', name: '增长停滞', dimension: 'growth_rate', condition: '连续3季度增长率<5%', severity: 'critical', weight: 0.9, expertType: 'strategic_analyst', source: 'seed' },
  { id: 'strat_biz_model_risk', name: '商业模式风险', dimension: 'business_model', condition: '单一收入源>70%', severity: 'high', weight: 0.85, expertType: 'strategic_analyst', source: 'seed' },
  { id: 'strat_competitor_entry', name: '新竞争者进入', dimension: 'competitive_position', condition: '新进入者市场份额>5%', severity: 'medium', weight: 0.7, expertType: 'strategic_analyst', source: 'seed' },
  { id: 'strat_dependency', name: '关键依赖风险', dimension: 'supply_chain', condition: '单一供应商或平台依赖度>50%', severity: 'high', weight: 0.8, expertType: 'strategic_analyst', source: 'seed' },
  // 组织专家 (5)
  { id: 'org_info_silo', name: '信息孤岛', dimension: 'information_flow', condition: 'INTERACTS_WITH 边权重<0.3且跨部门', severity: 'high', weight: 0.8, expertType: 'org_diagnostician', source: 'seed' },
  { id: 'org_key_person', name: '关键人风险', dimension: 'centrality', condition: 'degreeCentrality>0.9', severity: 'critical', weight: 0.9, expertType: 'org_diagnostician', source: 'seed' },
  { id: 'org_collab_decay', name: '协作衰减', dimension: 'collaboration', condition: 'INTERACTS_WITH权重连续3周下降', severity: 'medium', weight: 0.7, expertType: 'org_diagnostician', source: 'seed' },
  { id: 'org_decision_bottleneck', name: '决策瓶颈', dimension: 'decision_flow', condition: '审批链长度>4', severity: 'high', weight: 0.75, expertType: 'org_diagnostician', source: 'seed' },
  { id: 'org_trust_decay', name: '信任衰减', dimension: 'trust', condition: 'HTM信任曲线连续下降', severity: 'high', weight: 0.8, expertType: 'org_diagnostician', source: 'seed' },
  // 财务专家 (5)
  { id: 'fin_cost_spike', name: '成本异常增长', dimension: 'cost_structure', condition: '月成本环比增长>20%', severity: 'high', weight: 0.85, expertType: 'financial_analyst', source: 'seed' },
  { id: 'fin_revenue_concentration', name: '收入集中风险', dimension: 'revenue_quality', condition: '单一客户收入占比>40%', severity: 'critical', weight: 0.9, expertType: 'financial_analyst', source: 'seed' },
  { id: 'fin_token_waste', name: 'Token浪费', dimension: 'token_economics', condition: '无效Token消耗>30%', severity: 'medium', weight: 0.7, expertType: 'financial_analyst', source: 'seed' },
  { id: 'fin_cash_burn', name: '现金流危机', dimension: 'cash_flow', condition: 'Runway<6个月', severity: 'critical', weight: 0.95, expertType: 'financial_analyst', source: 'seed' },
  { id: 'fin_margin_erosion', name: '利润率侵蚀', dimension: 'profitability', condition: '毛利率连续4季度下降', severity: 'high', weight: 0.8, expertType: 'financial_analyst', source: 'seed' },
  // 技术专家 (5)
  { id: 'tech_tool_fragmentation', name: '工具碎片化', dimension: 'tool_ecosystem', condition: 'TOOL节点>10且无互联', severity: 'medium', weight: 0.65, expertType: 'tech_architect', source: 'seed' },
  { id: 'tech_legacy_debt', name: '遗留技术债', dimension: 'code_health', condition: '技术债热点>5个文件', severity: 'high', weight: 0.8, expertType: 'tech_architect', source: 'seed' },
  { id: 'tech_ai_gap', name: 'AI能力缺口', dimension: 'ai_maturity', condition: 'AGENT节点<1且无LLM使用', severity: 'medium', weight: 0.7, expertType: 'tech_architect', source: 'seed' },
  { id: 'tech_single_point', name: '技术单点故障', dimension: 'architecture', condition: '关键服务无冗余', severity: 'critical', weight: 0.9, expertType: 'tech_architect', source: 'seed' },
  { id: 'tech_security_gap', name: '安全缺口', dimension: 'security', condition: '无自动化安全扫描', severity: 'high', weight: 0.85, expertType: 'tech_architect', source: 'seed' },
  // 营销专家 (5)
  { id: 'mkt_positioning_blur', name: '定位模糊', dimension: 'positioning', condition: '客户无法清晰描述差异化', severity: 'high', weight: 0.8, expertType: 'marketing_analyst', source: 'seed' },
  { id: 'mkt_channel_inefficiency', name: '渠道低效', dimension: 'gtm', condition: 'CAC>LTV/3', severity: 'high', weight: 0.75, expertType: 'marketing_analyst', source: 'seed' },
  { id: 'mkt_competitor_gap', name: '竞品差距', dimension: 'competitive', condition: '竞品功能覆盖度>我方120%', severity: 'high', weight: 0.8, expertType: 'marketing_analyst', source: 'seed' },
  { id: 'mkt_churn_signal', name: '流失信号', dimension: 'retention', condition: '月流失率>5%', severity: 'critical', weight: 0.9, expertType: 'marketing_analyst', source: 'seed' },
  { id: 'mkt_segment_misfit', name: '客群不匹配', dimension: 'customer_fit', condition: 'ICP外客户占比>40%', severity: 'medium', weight: 0.7, expertType: 'marketing_analyst', source: 'seed' },
  // 行动专家 (5)
  { id: 'act_backlog_growth', name: '行动积压', dimension: 'execution', condition: 'open行动项>20且增长', severity: 'high', weight: 0.75, expertType: 'action_advisor', source: 'seed' },
  { id: 'act_low_adoption', name: '低采纳率', dimension: 'adoption', condition: '行动项采纳率<40%', severity: 'high', weight: 0.8, expertType: 'action_advisor', source: 'seed' },
  { id: 'act_no_followup', name: '无跟进', dimension: 'tracking', condition: '行动项创建后7天无状态更新', severity: 'medium', weight: 0.7, expertType: 'action_advisor', source: 'seed' },
  { id: 'act_priority_misalign', name: '优先级错位', dimension: 'prioritization', condition: '低影响行动项占用>50%资源', severity: 'medium', weight: 0.65, expertType: 'action_advisor', source: 'seed' },
  { id: 'act_cycle_slow', name: '闭环周期过长', dimension: 'feedback_loop', condition: '诊断→行动→验证周期>30天', severity: 'medium', weight: 0.7, expertType: 'action_advisor', source: 'seed' },
];

export class PatternEngine {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
    this.seed();
  }

  private initSchema(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS mode_library (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, dimension TEXT, condition_text TEXT,
      severity TEXT DEFAULT 'medium', weight REAL DEFAULT 0.5,
      expert_type TEXT, source TEXT DEFAULT 'seed', created_at TEXT DEFAULT (datetime('now'))
    )`);
  }

  private seed(): void {
    const count = this.db.prepare('SELECT COUNT(*) as c FROM mode_library').get() as SqliteRow;
    if (count.c === 0) {
      const insert = this.db.prepare('INSERT INTO mode_library (id,name,dimension,condition_text,severity,weight,expert_type,source) VALUES (?,?,?,?,?,?,?,?)');
      const tx = this.db.transaction(() => {
        for (const p of SEED_PATTERNS) insert.run(p.id, p.name, p.dimension, p.condition, p.severity, p.weight, p.expertType, p.source);
      });
      tx();
    }
  }

  getPatternsForExpert(expertType: string): DiagnosticPattern[] {
    const rows = this.db.prepare('SELECT * FROM mode_library WHERE expert_type=?').all(expertType) as SqliteRow[];
    return rows.map(r => r as unknown as DiagnosticPattern);
  }

  matchPatterns(dimension: string): DiagnosticPattern[] {
    const rows = this.db.prepare('SELECT * FROM mode_library WHERE dimension=? OR dimension IS NULL').all(dimension) as SqliteRow[];
    return rows.map(r => r as unknown as DiagnosticPattern);
  }

  getAllPatterns(): DiagnosticPattern[] {
    const rows = this.db.prepare('SELECT * FROM mode_library ORDER BY weight DESC').all() as SqliteRow[];
    return rows.map(r => r as unknown as DiagnosticPattern);
  }
}
