/**
 * orchestrator/dimension-registry.ts — 可扩展诊断维度注册表 (Iter 3)
 *
 * 维度不是硬编码 6 个。不同行业/场景通过 Extension Registry 注册新维度。
 * LLM 根据对话上下文自主决定激活哪些维度。
 */
import { createLogger } from '../logger';

const log = createLogger('orchestrator/dimension-registry');

// ═══ Types ═══

export interface DimensionQuestion {
  id: string;
  text: string;
  /** 为什么问这个 ("我想了解___，因为这会影响___") */
  reason: string;
  required: boolean;
  /** 追问条件 (答案模糊时触发) */
  followUpCondition?: string;
}

export interface DiagnosticDimension {
  id: string;
  name: string;
  category: 'core' | 'industry' | 'scenario';
  /** 适用行业 (空=通用) */
  applicableIndustries?: string[];
  /** 适用场景 */
  applicableScenarios?: string[];
  /** 触发关键词 (用于 LLM 激活判断) */
  triggerSignals?: string[];
  questions: DimensionQuestion[];
  /** 默认优先级 (越小越优先) */
  priority: number;
}

export interface DimensionCoverage {
  dimensionId: string;
  status: 'covered' | 'partial' | 'uncovered' | 'skipped';
  confidence: number;
  evidenceCount: number;
}

// ═══ Core Dimensions ═══

const CORE_DIMENSIONS: DiagnosticDimension[] = [
  {
    id: 'mission_objectives', name: '任务目标', category: 'core', priority: 1,
    triggerSignals: ['愿景', '目标', '方向', '战略', '规划'],
    questions: [
      { id: 'mo_1', text: '公司未来1-3年的核心战略方向是什么？', reason: '确定诊断范围和深度', required: true },
      { id: 'mo_2', text: '团队各级对这个方向的理解程度如何？', reason: '评估战略传达的有效性', required: true },
      { id: 'mo_3', text: '如果有理解偏差，通常出在哪个层级？', reason: '定位沟通断层', required: false },
    ],
  },
  {
    id: 'business_value', name: '业务价值', category: 'core', priority: 2,
    triggerSignals: ['业务', '客户', '价值', '产品', '市场'],
    questions: [
      { id: 'bv_1', text: '主营业务是什么？核心价值主张？', reason: '确定关键流程和协作模式', required: true },
      { id: 'bv_2', text: '客户最认可你们的哪一点？', reason: '发现竞争优势', required: true },
    ],
  },
  {
    id: 'current_state', name: '现状起点', category: 'core', priority: 3,
    triggerSignals: ['现状', '已有', '现有', '架构', '流程'],
    questions: [
      { id: 'cs_1', text: '现有组织架构是怎样的？有哪些团队？', reason: '确定迁移路径', required: true },
      { id: 'cs_2', text: '目前在用什么工具和系统？', reason: '评估集成复杂度', required: false },
    ],
  },
  {
    id: 'resource_constraints', name: '资源约束', category: 'core', priority: 4,
    triggerSignals: ['预算', '人员', '资源', '成本', '投入'],
    questions: [
      { id: 'rc_1', text: '团队规模和预算是怎样的？', reason: '确定诊断维度的优先级', required: true },
      { id: 'rc_2', text: '是否有人员或预算的限制需要提前知道？', reason: '避免不切实际的建议', required: false },
    ],
  },
  {
    id: 'risk_bottlenecks', name: '风险瓶颈', category: 'core', priority: 5,
    triggerSignals: ['风险', '担心', '瓶颈', '坑', '失败', '问题'],
    questions: [
      { id: 'rb_1', text: '你最担心的是什么？以前踩过哪些坑？', reason: '确定安全门和防护策略', required: true },
      { id: 'rb_2', text: '如果这个项目失败，最可能的原因是什么？', reason: '预判风险信号', required: false },
    ],
  },
  {
    id: 'success_criteria', name: '成功标准', category: 'core', priority: 6,
    triggerSignals: ['北极星', '指标', '成功', '考核', 'KPI', 'OKR'],
    questions: [
      { id: 'sc_1', text: '北极星指标是什么？怎么衡量成功？', reason: '确定优先级排序和验证方式', required: true },
      { id: 'sc_2', text: '如果6个月后回顾，什么样的结果会让你觉得"这次诊断值了"？', reason: '设定成功基线', required: false },
    ],
  },
];

// ═══ Industry Extension Dimensions ═══

const INDUSTRY_DIMENSIONS: DiagnosticDimension[] = [
  {
    id: 'compliance', name: '合规监管', category: 'industry',
    applicableIndustries: ['finance', 'healthcare', 'legal'],
    triggerSignals: ['合规', '监管', 'GDPR', 'SOC2', 'ISO', '审计', '法规'],
    priority: 7,
    questions: [
      { id: 'cp_1', text: '是否有行业监管要求需要遵守？', reason: '评估合规风险', required: true },
      { id: 'cp_2', text: '目前的合规流程是怎样的？遇到过合规问题吗？', reason: '发现合规缺口', required: false },
    ],
  },
  {
    id: 'supply_chain', name: '供应链', category: 'industry',
    applicableIndustries: ['manufacturing', 'retail', 'logistics'],
    triggerSignals: ['供应链', '库存', '采购', '供应商', '物流', '上下游'],
    priority: 7,
    questions: [
      { id: 'sp_1', text: '上下游依赖是怎样的？库存周转周期多长？', reason: '评估供应链复杂度', required: true },
    ],
  },
  {
    id: 'rd_efficiency', name: '研发效能', category: 'industry',
    applicableIndustries: ['tech', 'saas'],
    triggerSignals: ['研发', '交付', '技术债', '部署', '上线', '迭代'],
    priority: 7,
    questions: [
      { id: 'rd_1', text: '团队的交付频率和稳定性如何？', reason: '评估研发效能', required: true },
      { id: 'rd_2', text: '技术债有多重？是否影响了新功能开发？', reason: '发现技术瓶颈', required: false },
    ],
  },
];

// ═══ Dimension Registry ═══

export class DimensionRegistry {
  private dimensions = new Map<string, DiagnosticDimension>();

  constructor() {
    // Register core dimensions
    for (const dim of CORE_DIMENSIONS) this.register(dim);
    // Register industry dimensions
    for (const dim of INDUSTRY_DIMENSIONS) this.register(dim);
  }

  /** Register a dimension (supports runtime extension) */
  register(dimension: DiagnosticDimension): void {
    this.dimensions.set(dimension.id, dimension);
    log.debug({ id: dimension.id, name: dimension.name }, '维度注册');
  }

  /** Get all registered dimensions */
  listAll(): DiagnosticDimension[] {
    return [...this.dimensions.values()].sort((a, b) => a.priority - b.priority);
  }

  /** Get dimensions applicable to a specific industry */
  listForIndustry(industry: string): DiagnosticDimension[] {
    return this.listAll().filter(d =>
      d.category === 'core' ||
      !d.applicableIndustries ||
      d.applicableIndustries.includes(industry),
    );
  }

  /** Get dimension by ID */
  get(id: string): DiagnosticDimension | undefined {
    return this.dimensions.get(id);
  }

  /** Select dimensions based on user signals (LLM-assisted) */
  selectBySignals(signals: string[], industry?: string): DiagnosticDimension[] {
    const applicable = industry ? this.listForIndustry(industry) : this.listAll();
    const scored = applicable.map(dim => {
      const score = (dim.triggerSignals || []).filter(s =>
        signals.some(userSignal => userSignal.includes(s) || s.includes(userSignal)),
      ).length;
      return { dim, score };
    });

    // Return dimensions with matching signals, sorted by score then priority
    return scored
      .filter(s => s.score > 0 || s.dim.category === 'core')
      .sort((a, b) => b.score - a.score || a.dim.priority - b.dim.priority)
      .map(s => s.dim);
  }
}
