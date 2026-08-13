/**
 * interview/question-bank.ts — 访谈问题种子库 (T11 无数据诊断)
 *
 * 契约ID: T11-QUESTION-BANK-v1
 * 模块: interview (L2)
 * 消费方: question-generator.ts (Phase B), manual interview by GA
 *
 * 三层结构:
 *   第一层: 通用锚题 (4道, targetRoles=[], 所有角色都问)
 *   第二层: 角色锚题 (7角色×5维度×~3题=~105道)
 *   第三层: 行业拓展题 (~40道, 按 tags 过滤)
 *
 * 约束4: 检索通过 tags 过滤, 非 if-else 硬编码。
 */

export interface InterviewQuestion {
  id: string;
  /** 问题模板, 支持 {role} 替换 */
  text: string;
  /** 目标诊断维度 */
  dimension: string;
  /** 目标角色 (空=通用锚题, 所有角色都问) */
  targetRoles: string[];
  /** 行业标签 (如 'consumer','saas','manufacturing','finance','healthcare') */
  tags: string[];
  /** 期望提取的信号类型 */
  signalType: string;
  /** 优先级 */
  priority: 'required' | 'recommended' | 'optional';
}

/**
 * 种子题库 —— 所有问题存储在单一数组中。
 * 通过 getQuestions() 的 tags 过滤机制检索, 不引入 if-else 分支。
 */
export const QUESTION_BANK: InterviewQuestion[] = [
  // ════════════════════════════════════════════════════════════════
  // 第一层: 通用锚题 (targetRoles=[]) — 所有角色都问
  // ════════════════════════════════════════════════════════════════
  {
    id: 'G-A1', text: '你觉得公司现在最大的问题是什么？',
    dimension: 'goal_alignment', targetRoles: [],
    tags: ['通用'], signalType: 'contradiction', priority: 'required',
  },
  {
    id: 'G-A2', text: '你每天花最多时间在做的事情，和你的岗位职责匹配吗？',
    dimension: 'org_structure', targetRoles: [],
    tags: ['通用'], signalType: 'role_clarity', priority: 'required',
  },
  {
    id: 'G-A3', text: '你觉得公司里谁最清楚业务真相？信息是怎么传到决策层的？',
    dimension: 'communication', targetRoles: [],
    tags: ['通用'], signalType: 'information_flow', priority: 'required',
  },
  {
    id: 'G-A4', text: '如果有一件事你可以立刻改掉，是什么？',
    dimension: 'pain_point', targetRoles: [],
    tags: ['通用'], signalType: 'pain_mapping', priority: 'required',
  },

  // ════════════════════════════════════════════════════════════════
  // 第二层: CEO 角色锚题 (ceo)
  // ════════════════════════════════════════════════════════════════
  {
    id: 'CEO-D1-Q1', text: '如果让三个部门总监分别写下公司今年的三件要事，你觉得他们写的一样吗？',
    dimension: 'goal_alignment', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'goal_consistency', priority: 'required',
  },
  {
    id: 'CEO-D1-Q2', text: '你上一次感觉到"团队不在一个方向上"是什么时候？',
    dimension: 'goal_alignment', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'goal_misalignment', priority: 'recommended',
  },
  {
    id: 'CEO-D2-Q1', text: '你的战略是"聚焦"还是"扩张"？如果只能选一个，哪个？',
    dimension: 'strategy_clarity', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'strategy_focus', priority: 'required',
  },
  {
    id: 'CEO-D2-Q2', text: '你判断战略是否正确的依据是什么？数据还是直觉？',
    dimension: 'strategy_clarity', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'strategy_basis', priority: 'recommended',
  },
  {
    id: 'CEO-D3-Q1', text: '你觉得现在最缺的不是钱，是什么资源？',
    dimension: 'resource_allocation', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'resource_gap', priority: 'required',
  },
  {
    id: 'CEO-D3-Q2', text: '如果明天多给你 20% 的预算，你最先投在哪？',
    dimension: 'resource_allocation', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'investment_priority', priority: 'recommended',
  },
  {
    id: 'CEO-D4-Q1', text: '你最担心的风险是什么？这个问题你有跟团队聊过吗？',
    dimension: 'risk_assessment', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'risk_awareness', priority: 'required',
  },
  {
    id: 'CEO-D4-Q2', text: '如果最大的客户突然不续约了，公司能撑多久？',
    dimension: 'risk_assessment', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'business_resilience', priority: 'optional',
  },
  {
    id: 'CEO-D5-Q1', text: '你现在的组织架构是为增长设计的，还是为控制成本的？',
    dimension: 'org_structure', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'structure_strategy_fit', priority: 'required',
  },
  {
    id: 'CEO-D5-Q2', text: '你觉得现在的层级是太多还是太少？为什么？',
    dimension: 'org_structure', targetRoles: ['ceo'],
    tags: ['通用'], signalType: 'org_layers', priority: 'recommended',
  },

  // ════════════════════════════════════════════════════════════════
  // 第二层: CTO 角色锚题 (cto)
  // ════════════════════════════════════════════════════════════════
  {
    id: 'CTO-D1-Q1', text: '如果让你列出现有系统中最想重写的三样东西，是什么？',
    dimension: 'tech_debt', targetRoles: ['cto'],
    tags: ['通用', 'saas', 'enterprise'], signalType: 'tech_debt_scope', priority: 'required',
  },
  {
    id: 'CTO-D1-Q2', text: '你现在有多少技术债是"知道但没时间修"的？占比多少？',
    dimension: 'tech_debt', targetRoles: ['cto'],
    tags: ['通用'], signalType: 'tech_debt_ratio', priority: 'recommended',
  },
  {
    id: 'CTO-D2-Q1', text: '团队每天用的工具和基础设施，你觉得整体效率怎么样？最卡的地方在哪？',
    dimension: 'tool_chain', targetRoles: ['cto'],
    tags: ['通用'], signalType: 'tool_efficiency', priority: 'required',
  },
  {
    id: 'CTO-D2-Q2', text: '有没有哪个流程或工具是"大家都知道该换了但一直没换"的？',
    dimension: 'tool_chain', targetRoles: ['cto'],
    tags: ['通用', 'saas'], signalType: 'tool_decision_paralysis', priority: 'recommended',
  },
  {
    id: 'CTO-D3-Q1', text: '团队的技术栈里，哪些技能是核心竞争力，哪些是历史包袱？',
    dimension: 'team_skill', targetRoles: ['cto'],
    tags: ['通用'], signalType: 'skill_core_vs_legacy', priority: 'required',
  },
  {
    id: 'CTO-D3-Q2', text: '你最担心哪个关键成员离职？有没有后备？',
    dimension: 'team_skill', targetRoles: ['cto'],
    tags: ['通用'], signalType: 'bus_factor', priority: 'recommended',
  },
  {
    id: 'CTO-D4-Q1', text: '现在的架构能支撑未来多少用户/业务增长？瓶颈在哪？',
    dimension: 'architecture_scalability', targetRoles: ['cto'],
    tags: ['通用', 'saas'], signalType: 'scaling_bottleneck', priority: 'required',
  },
  {
    id: 'CTO-D4-Q2', text: '最近一次因为架构问题导致线上事故是什么时候？根因是什么？',
    dimension: 'architecture_scalability', targetRoles: ['cto'],
    tags: ['通用'], signalType: 'arch_incident', priority: 'recommended',
  },
  {
    id: 'CTO-D5-Q1', text: '你们的 CI/CD 自动化到什么程度了？从代码到上线需要多久？',
    dimension: 'automation', targetRoles: ['cto'],
    tags: ['通用'], signalType: 'automation_maturity', priority: 'required',
  },
  {
    id: 'CTO-D5-Q2', text: '有没有什么手工操作是你觉得"2026 年了还在手动做"的？',
    dimension: 'automation', targetRoles: ['cto'],
    tags: ['通用'], signalType: 'manual_toil', priority: 'recommended',
  },

  // ════════════════════════════════════════════════════════════════
  // 第二层: CFO 角色锚题 (cfo)
  // ════════════════════════════════════════════════════════════════
  {
    id: 'CFO-D1-Q1', text: '公司的成本结构中，最大的三项支出是什么？占比多少？',
    dimension: 'cost_structure', targetRoles: ['cfo'],
    tags: ['通用'], signalType: 'cost_composition', priority: 'required',
  },
  {
    id: 'CFO-D1-Q2', text: '固定成本和变动成本的比例大概是多少？哪部分的降本空间最大？',
    dimension: 'cost_structure', targetRoles: ['cfo'],
    tags: ['通用', 'manufacturing'], signalType: 'cost_leverage', priority: 'recommended',
  },
  {
    id: 'CFO-D2-Q1', text: '你觉得公司过去一年回报率最高的投入是什么？最低的呢？',
    dimension: 'investment_roi', targetRoles: ['cfo'],
    tags: ['通用'], signalType: 'roi_awareness', priority: 'required',
  },
  {
    id: 'CFO-D2-Q2', text: '有没有一直投但看不出效果的项目？为什么还在投？',
    dimension: 'investment_roi', targetRoles: ['cfo'],
    tags: ['通用'], signalType: 'zombie_investment', priority: 'recommended',
  },
  {
    id: 'CFO-D3-Q1', text: '你觉得预算制定的过程是"自上而下"还是"自下而上"？实际情况和预算偏差大吗？',
    dimension: 'budget_transparency', targetRoles: ['cfo'],
    tags: ['通用'], signalType: 'budget_process', priority: 'required',
  },
  {
    id: 'CFO-D3-Q2', text: '各部门有没有"年底突击花钱"的情况？为什么？',
    dimension: 'budget_transparency', targetRoles: ['cfo'],
    tags: ['通用'], signalType: 'budget_gaming', priority: 'optional',
  },
  {
    id: 'CFO-D4-Q1', text: '按照目前的烧钱速度，公司的现金流还能撑多久？',
    dimension: 'cashflow_health', targetRoles: ['cfo'],
    tags: ['通用', 'startup'], signalType: 'runway', priority: 'required',
  },
  {
    id: 'CFO-D4-Q2', text: '公司有没有"收入到账前先垫钱"的情况？金额大吗？',
    dimension: 'cashflow_health', targetRoles: ['cfo'],
    tags: ['通用'], signalType: 'cashflow_gap', priority: 'recommended',
  },
  {
    id: 'CFO-D5-Q1', text: '你觉得公司当前最大的财务风险是什么？有预案吗？',
    dimension: 'financial_risk', targetRoles: ['cfo'],
    tags: ['通用'], signalType: 'finrisk_awareness', priority: 'required',
  },
  {
    id: 'CFO-D5-Q2', text: '公司有没有汇率、利率或供应链方面的财务敞口？',
    dimension: 'financial_risk', targetRoles: ['cfo'],
    tags: ['通用', 'manufacturing'], signalType: 'finrisk_exposure', priority: 'optional',
  },

  // ════════════════════════════════════════════════════════════════
  // 第二层: Manager 角色锚题 (manager)
  // ════════════════════════════════════════════════════════════════
  {
    id: 'MGR-D1-Q1', text: '你觉得团队目前最大的流程瓶颈在哪里？卡在谁那？',
    dimension: 'process_efficiency', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'process_bottleneck', priority: 'required',
  },
  {
    id: 'MGR-D1-Q2', text: '从决策到执行，通常需要经过多少层审批？你觉得合理吗？',
    dimension: 'process_efficiency', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'approval_layers', priority: 'recommended',
  },
  {
    id: 'MGR-D2-Q1', text: '跨部门协作中，最让你头疼的是什么？',
    dimension: 'team_collaboration', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'crossfunc_friction', priority: 'required',
  },
  {
    id: 'MGR-D2-Q2', text: '有没有"这件事本应是 A 部门负责但最后是 B 做的"情况？',
    dimension: 'team_collaboration', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'responsibility_ambiguity', priority: 'recommended',
  },
  {
    id: 'MGR-D3-Q1', text: '你觉得上级的指令传到你这时，信息损失了多少？',
    dimension: 'communication', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'info_loss_mid', priority: 'required',
  },
  {
    id: 'MGR-D3-Q2', text: '你多久和上级做一次一对一沟通？有效吗？',
    dimension: 'communication', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'one_on_one_quality', priority: 'recommended',
  },
  {
    id: 'MGR-D4-Q1', text: '你觉得目前的绩效考核能真实反映团队贡献吗？',
    dimension: 'performance_evaluation', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'perf_review_validity', priority: 'required',
  },
  {
    id: 'MGR-D4-Q2', text: '你的团队里有没有"明明很努力但绩效不高"的人？为什么？',
    dimension: 'performance_evaluation', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'effort_vs_outcome', priority: 'optional',
  },
  {
    id: 'MGR-D5-Q1', text: '要完成你们部门的 OKR/KPI，最大的资源缺口是什么？',
    dimension: 'resource_bottleneck', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'resource_shortfall', priority: 'required',
  },
  {
    id: 'MGR-D5-Q2', text: '你觉得公司资源分配最不合理的地方在哪？',
    dimension: 'resource_bottleneck', targetRoles: ['manager'],
    tags: ['通用'], signalType: 'resource_misallocation', priority: 'recommended',
  },

  // ════════════════════════════════════════════════════════════════
  // 第二层: Engineer 角色锚题 (engineer)
  // ════════════════════════════════════════════════════════════════
  {
    id: 'ENG-D1-Q1', text: '如果明天你只能用一个工具，你会删掉哪些？为什么？',
    dimension: 'tool_pain', targetRoles: ['engineer'],
    tags: ['通用', 'saas'], signalType: 'tool_waste', priority: 'required',
  },
  {
    id: 'ENG-D1-Q2', text: '有没有哪个工具是"大家都在用但没人喜欢"的？',
    dimension: 'tool_pain', targetRoles: ['engineer'],
    tags: ['通用'], signalType: 'tool_low_adoption', priority: 'recommended',
  },
  {
    id: 'ENG-D2-Q1', text: '最近一次因为技术原因推不了需求是什么时候？卡在哪？',
    dimension: 'tech_obstacle', targetRoles: ['engineer'],
    tags: ['通用'], signalType: 'tech_blocker', priority: 'required',
  },
  {
    id: 'ENG-D2-Q2', text: '你有没有"改一行代码要等半小时"的经历？',
    dimension: 'tech_obstacle', targetRoles: ['engineer'],
    tags: ['通用', 'enterprise'], signalType: 'dev_experience', priority: 'recommended',
  },
  {
    id: 'ENG-D3-Q1', text: '从写完代码到上线，需要几步？你觉得应该几步？',
    dimension: 'deployment_process', targetRoles: ['engineer'],
    tags: ['通用', 'saas'], signalType: 'deploy_efficiency', priority: 'required',
  },
  {
    id: 'ENG-D3-Q2', text: '你上次上线出问题是什么原因？测试流程有漏洞吗？',
    dimension: 'deployment_process', targetRoles: ['engineer'],
    tags: ['通用'], signalType: 'deploy_incident', priority: 'recommended',
  },
  {
    id: 'ENG-D4-Q1', text: '你觉得产品的整体代码质量会影响你的工作热情吗？',
    dimension: 'code_quality', targetRoles: ['engineer'],
    tags: ['通用'], signalType: 'code_quality_morale', priority: 'required',
  },
  {
    id: 'ENG-D4-Q2', text: '你上次在 code review 中发现的最严重的问题是什么？',
    dimension: 'code_quality', targetRoles: ['engineer'],
    tags: ['通用'], signalType: 'code_review_depth', priority: 'recommended',
  },
  {
    id: 'ENG-D5-Q1', text: '你在这家公司学到的最有价值的东西是什么？还想学什么？',
    dimension: 'learning_opportunity', targetRoles: ['engineer'],
    tags: ['通用'], signalType: 'learning_growth', priority: 'required',
  },
  {
    id: 'ENG-D5-Q2', text: '你觉得公司有没有为你的成长投入足够资源？',
    dimension: 'learning_opportunity', targetRoles: ['engineer'],
    tags: ['通用'], signalType: 'growth_investment', priority: 'recommended',
  },

  // ════════════════════════════════════════════════════════════════
  // 第二层: Designer 角色锚题 (designer)
  // ════════════════════════════════════════════════════════════════
  {
    id: 'DES-D1-Q1', text: '从需求提出到你看到设计稿，通常需要多久？流程清晰吗？',
    dimension: 'requirement_flow', targetRoles: ['designer'],
    tags: ['通用'], signalType: 'req_flow_time', priority: 'required',
  },
  {
    id: 'DES-D1-Q2', text: '有没有"需求方自己都没想清楚就提需求"的情况？多吗？',
    dimension: 'requirement_flow', targetRoles: ['designer'],
    tags: ['通用'], signalType: 'req_ambiguity', priority: 'recommended',
  },
  {
    id: 'DES-D2-Q1', text: '设计评审会有多少人参加？你觉得谁应该参加但没参加？',
    dimension: 'design_review', targetRoles: ['designer'],
    tags: ['通用', 'saas'], signalType: 'design_review_efficacy', priority: 'required',
  },
  {
    id: 'DES-D2-Q2', text: '你的设计被"凭感觉"否定的情况多吗？',
    dimension: 'design_review', targetRoles: ['designer'],
    tags: ['通用'], signalType: 'design_subjectivity', priority: 'recommended',
  },
  {
    id: 'DES-D3-Q1', text: '你们多久做一次用户调研或客户访谈？最近一次有什么发现？',
    dimension: 'user_feedback', targetRoles: ['designer'],
    tags: ['通用', 'consumer'], signalType: 'user_research_frequency', priority: 'required',
  },
  {
    id: 'DES-D3-Q2', text: '用户的真实反馈到产品决策的路径是什么样的？有过滤吗？',
    dimension: 'user_feedback', targetRoles: ['designer'],
    tags: ['通用'], signalType: 'feedback_to_product', priority: 'recommended',
  },
  {
    id: 'DES-D4-Q1', text: '一个功能从想法到上线，平均需要多久？你觉得应该多久？',
    dimension: 'iteration_speed', targetRoles: ['designer'],
    tags: ['通用', 'saas'], signalType: 'iteration_cycle', priority: 'required',
  },
  {
    id: 'DES-D4-Q2', text: '迭代速度最近是变快了还是变慢了？主要原因是什么？',
    dimension: 'iteration_speed', targetRoles: ['designer'],
    tags: ['通用'], signalType: 'iteration_trend', priority: 'recommended',
  },
  {
    id: 'DES-D5-Q1', text: '你和开发、产品之间的协作，哪个环节最不顺？',
    dimension: 'crossfunc_collaboration', targetRoles: ['designer'],
    tags: ['通用'], signalType: 'crossfunc_gap', priority: 'required',
  },
  {
    id: 'DES-D5-Q2', text: '有没有"开发做出来的和设计稿完全不同"的情况？为什么？',
    dimension: 'crossfunc_collaboration', targetRoles: ['designer'],
    tags: ['通用'], signalType: 'design_dev_gap', priority: 'recommended',
  },

  // ════════════════════════════════════════════════════════════════
  // 第二层: HR 角色锚题 (hr)
  // ════════════════════════════════════════════════════════════════
  {
    id: 'HR-D1-Q1', text: '最近半年主动离职率是多少？离职的主要原因是什么？',
    dimension: 'turnover', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'turnover_rate', priority: 'required',
  },
  {
    id: 'HR-D1-Q2', text: '有没有"本来不想走但因为某件事走了"的关键人员？',
    dimension: 'turnover', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'turnover_trigger', priority: 'recommended',
  },
  {
    id: 'HR-D2-Q1', text: '你觉得公司现在的文化氛围用一个词概括是什么？为什么？',
    dimension: 'culture', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'culture_one_word', priority: 'required',
  },
  {
    id: 'HR-D2-Q2', text: '新员工入职后，大概多久能融入？有没有一直融不进去的？',
    dimension: 'culture', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'onboarding_friction', priority: 'recommended',
  },
  {
    id: 'HR-D3-Q1', text: '你觉得现在的薪酬水平在行业里是什么位置？有数据支撑吗？',
    dimension: 'compensation', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'pay_competitiveness', priority: 'required',
  },
  {
    id: 'HR-D3-Q2', text: '有没有因为薪酬原因流失过候选人？多吗？',
    dimension: 'compensation', targetRoles: ['hr'],
    tags: ['通用', 'startup'], signalType: 'pay_offer_fail', priority: 'recommended',
  },
  {
    id: 'HR-D4-Q1', text: '员工在这家公司典型的职业路径是什么？有清晰的晋升标准吗？',
    dimension: 'career_path', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'career_clarity', priority: 'required',
  },
  {
    id: 'HR-D4-Q2', text: '你觉得员工离职想去哪？（去大厂？创业？留学？转行？）',
    dimension: 'career_path', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'career_aspiration', priority: 'optional',
  },
  {
    id: 'HR-D5-Q1', text: '从发 JD 到入职，平均需要多久？哪步最慢？',
    dimension: 'hiring_efficiency', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'hiring_cycle', priority: 'required',
  },
  {
    id: 'HR-D5-Q2', text: '招聘中最难找到的是什么角色？为什么难？',
    dimension: 'hiring_efficiency', targetRoles: ['hr'],
    tags: ['通用'], signalType: 'hard_to_hire', priority: 'recommended',
  },

  // ════════════════════════════════════════════════════════════════
  // 第三层: 行业拓展题 (~40 道)
  // ════════════════════════════════════════════════════════════════
  // SaaS / 科技行业
  {
    id: 'IND-S1', text: '你们的 MRR/ARR 最近三个月的趋势怎么样？增速在变快还是变慢？',
    dimension: 'revenue_health', targetRoles: ['ceo', 'cfo'],
    tags: ['saas'], signalType: 'mrr_trend', priority: 'recommended',
  },
  {
    id: 'IND-S2', text: '你们的客户 churn rate 是多少？主要流失原因有分析过吗？',
    dimension: 'revenue_health', targetRoles: ['ceo', 'cfo'],
    tags: ['saas'], signalType: 'churn_rate', priority: 'recommended',
  },
  {
    id: 'IND-S3', text: '你们的 NPS 或 CSAT 是多少？有系统收集用户反馈吗？',
    dimension: 'user_feedback', targetRoles: ['designer', 'ceo'],
    tags: ['saas', 'consumer'], signalType: 'nps_score', priority: 'recommended',
  },
  {
    id: 'IND-S4', text: '你觉得产品的 PMF 阶段到了吗？用什么指标判断的？',
    dimension: 'strategy_clarity', targetRoles: ['ceo', 'cto'],
    tags: ['saas', 'startup'], signalType: 'pmf_assessment', priority: 'optional',
  },
  {
    id: 'IND-S5', text: '你们的 infrastructure 成本占收入的比例是多少？增速快吗？',
    dimension: 'cost_structure', targetRoles: ['cfo', 'cto'],
    tags: ['saas'], signalType: 'infra_cost_ratio', priority: 'optional',
  },
  {
    id: 'IND-S6', text: '客户 onboarding 到激活的平均时长是多少？瓶颈在哪？',
    dimension: 'process_efficiency', targetRoles: ['manager', 'ceo'],
    tags: ['saas'], signalType: 'time_to_value', priority: 'optional',
  },
  {
    id: 'IND-S7', text: '你们的产品迭代是 feature-driven 还是 metric-driven？',
    dimension: 'strategy_clarity', targetRoles: ['cto', 'designer'],
    tags: ['saas'], signalType: 'build_philosophy', priority: 'optional',
  },

  // 消费/零售行业
  {
    id: 'IND-C1', text: '复购率是多少？客户平均生命周期是多长？',
    dimension: 'revenue_health', targetRoles: ['ceo', 'cfo'],
    tags: ['consumer'], signalType: 'repeat_rate', priority: 'recommended',
  },
  {
    id: 'IND-C2', text: '你们的主要获客渠道是什么？CAC 最近的趋势怎么样？',
    dimension: 'resource_allocation', targetRoles: ['ceo', 'manager'],
    tags: ['consumer'], signalType: 'cac_trend', priority: 'recommended',
  },
  {
    id: 'IND-C3', text: '库存周转天数是多少？有没有长期滞销的 SKU？',
    dimension: 'process_efficiency', targetRoles: ['manager', 'cfo'],
    tags: ['consumer', 'manufacturing'], signalType: 'inventory_turnover', priority: 'recommended',
  },
  {
    id: 'IND-C4', text: '你们和主要渠道商的关系怎么样？账期多长？',
    dimension: 'risk_assessment', targetRoles: ['ceo', 'cfo'],
    tags: ['consumer'], signalType: 'channel_dependency', priority: 'optional',
  },

  // 制造业
  {
    id: 'IND-M1', text: '生产线的 OEE（设备综合效率）大概是多少？瓶颈工序在哪？',
    dimension: 'process_efficiency', targetRoles: ['manager'],
    tags: ['manufacturing'], signalType: 'oee', priority: 'recommended',
  },
  {
    id: 'IND-M2', text: '供应商的准时交付率是多少？有没有单一供应商风险？',
    dimension: 'risk_assessment', targetRoles: ['manager', 'cfo'],
    tags: ['manufacturing'], signalType: 'supplier_risk', priority: 'recommended',
  },
  {
    id: 'IND-M3', text: '你们的质量管理体系是哪个标准？最近一次重大质量问题是？',
    dimension: 'process_efficiency', targetRoles: ['manager'],
    tags: ['manufacturing'], signalType: 'quality_incident', priority: 'recommended',
  },
  {
    id: 'IND-M4', text: '产线自动化的比例大概是多少？最大的自动化 gap 在哪？',
    dimension: 'automation', targetRoles: ['cto', 'manager'],
    tags: ['manufacturing'], signalType: 'automation_gap', priority: 'optional',
  },

  // 金融/Fintech
  {
    id: 'IND-F1', text: '你们当前的合规成本占运营成本的比例是多少？趋势如何？',
    dimension: 'cost_structure', targetRoles: ['cfo'],
    tags: ['finance'], signalType: 'compliance_cost', priority: 'recommended',
  },
  {
    id: 'IND-F2', text: '最近一次监管检查或审计有什么发现？有需要整改的吗？',
    dimension: 'risk_assessment', targetRoles: ['ceo', 'cfo'],
    tags: ['finance'], signalType: 'regulatory_finding', priority: 'recommended',
  },
  {
    id: 'IND-F3', text: '你们的核心系统有多久没升级了？升级的风险评估过吗？',
    dimension: 'tech_debt', targetRoles: ['cto'],
    tags: ['finance', 'enterprise'], signalType: 'core_system_legacy', priority: 'optional',
  },

  // 医疗/Healthcare
  {
    id: 'IND-H1', text: '你们的医疗数据合规（HIPAA/等保）是怎么管理的？谁负责？',
    dimension: 'risk_assessment', targetRoles: ['cto', 'cfo'],
    tags: ['healthcare'], signalType: 'data_compliance', priority: 'recommended',
  },
  {
    id: 'IND-H2', text: '患者的获取成本大概是多少？主要的转介渠道是什么？',
    dimension: 'resource_allocation', targetRoles: ['ceo', 'manager'],
    tags: ['healthcare'], signalType: 'patient_acquisition', priority: 'optional',
  },
  {
    id: 'IND-H3', text: '你们的临床或服务流程有标准化的 SOP 吗？执行力如何？',
    dimension: 'process_efficiency', targetRoles: ['manager'],
    tags: ['healthcare'], signalType: 'sop_adherence', priority: 'optional',
  },

  // 企业服务/Enterprise
  {
    id: 'IND-E1', text: '你们的大客户集中度是多少？Top 3 客户占收入的比例？',
    dimension: 'risk_assessment', targetRoles: ['ceo', 'cfo'],
    tags: ['enterprise'], signalType: 'customer_concentration', priority: 'recommended',
  },
  {
    id: 'IND-E2', text: '销售周期的平均时长是多少？有没有卡在某个阶段？',
    dimension: 'process_efficiency', targetRoles: ['manager', 'ceo'],
    tags: ['enterprise'], signalType: 'sales_cycle', priority: 'recommended',
  },
  {
    id: 'IND-E3', text: '你们的实施交付团队和销售团队之间的配合怎么样？',
    dimension: 'team_collaboration', targetRoles: ['manager'],
    tags: ['enterprise'], signalType: 'sales_delivery_gap', priority: 'optional',
  },

  // 初创公司特定
  {
    id: 'IND-ST1', text: '现在的 burn rate 还能撑多久？下一轮融资的计划是什么？',
    dimension: 'cashflow_health', targetRoles: ['ceo', 'cfo'],
    tags: ['startup'], signalType: 'fundraising_plan', priority: 'recommended',
  },
  {
    id: 'IND-ST2', text: '你们找 PMF 的过程中，pivot 过几次？为什么？',
    dimension: 'strategy_clarity', targetRoles: ['ceo'],
    tags: ['startup'], signalType: 'pivot_history', priority: 'optional',
  },
  {
    id: 'IND-ST3', text: '创始团队的分工清晰吗？有没有"两个创始人做同一件事"的情况？',
    dimension: 'org_structure', targetRoles: ['ceo'],
    tags: ['startup'], signalType: 'founder_overlap', priority: 'recommended',
  },
  {
    id: 'IND-ST4', text: '你们什么时候开始招第一个非技术岗的？招对了还是早了？',
    dimension: 'org_structure', targetRoles: ['ceo', 'hr'],
    tags: ['startup'], signalType: 'hiring_milestone', priority: 'optional',
  },

  // 通用跨行业问题
  {
    id: 'IND-G1', text: '你觉得你们和竞争对手最大的差异化优势是什么？能维持多久？',
    dimension: 'strategy_clarity', targetRoles: ['ceo', 'manager'],
    tags: ['通用', 'consumer', 'enterprise', 'saas'],
    signalType: 'competitive_advantage', priority: 'recommended',
  },
  {
    id: 'IND-G2', text: '公司有没有定期的 all-hands 或战略对齐会？大家说实话吗？',
    dimension: 'communication', targetRoles: ['ceo', 'hr'],
    tags: ['通用'], signalType: 'allhands_candor', priority: 'recommended',
  },
  {
    id: 'IND-G3', text: '你觉得公司现在的增长速度是"正常""慢"还是"快"？依据是什么？',
    dimension: 'strategy_clarity', targetRoles: ['ceo', 'cfo'],
    tags: ['通用'], signalType: 'growth_perception', priority: 'recommended',
  },
  {
    id: 'IND-G4', text: '有没有什么问题是你提了很多次但一直没被解决的？为什么？',
    dimension: 'communication', targetRoles: ['engineer', 'designer', 'manager'],
    tags: ['通用'], signalType: 'unresolved_issues', priority: 'recommended',
  },
  {
    id: 'IND-G5', text: '你觉得公司应该更"专注于现有业务"还是"探索新方向"？为什么？',
    dimension: 'strategy_clarity', targetRoles: ['ceo', 'cto', 'cfo'],
    tags: ['通用'], signalType: 'focus_vs_explore', priority: 'optional',
  },
];

/**
 * 按维度、角色、行业标签检索问题。
 * 约束4: 通过 tags 过滤而非 if-else 硬编码。
 *
 * @param dimension - 目标维度（可选，空=所有维度）
 * @param roleId - 目标角色（可选，空=通用锚题+匹配该角色的题）
 * @param industry - 行业标签（可选，匹配 tags 中包含该行业的问题）
 * @returns 匹配的问题列表
 */
export function getQuestions(
  dimension?: string,
  roleId?: string,
  industry?: string,
): InterviewQuestion[] {
  return QUESTION_BANK.filter(q => {
    // 维度过滤
    if (dimension && q.dimension !== dimension) return false;

    // 角色过滤：targetRoles=[] 是通用锚题（任何角色都匹配）
    // 指定角色时：通用锚题 + 该角色专属题
    if (roleId) {
      // targetRoles=[] 是通用锚题 → 匹配
      if (q.targetRoles.length === 0) return true;
      // 否则需要匹配指定角色
      if (!q.targetRoles.includes(roleId)) return false;
    } else {
      // 未指定角色：只返回通用锚题
      if (q.targetRoles.length > 0) return false;
    }

    // 行业过滤
    if (industry && !q.tags.includes(industry) && !q.tags.includes('通用')) return false;

    return true;
  });
}

/**
 * 获取指定角色的完整问卷（通用锚题 + 角色专属题 + 可选的行业题）
 */
export function getQuestionSet(roleId: string, industry?: string): InterviewQuestion[] {
  const anchors = getQuestions(undefined, roleId);
  if (industry) {
    const industryQuestions = getQuestions(undefined, roleId, industry);
    // 合并去重（以 id 为键）
    const seen = new Set(anchors.map(q => q.id));
    const extras = industryQuestions.filter(q => !seen.has(q.id));
    return [...anchors, ...extras];
  }
  return anchors;
}

/**
 * 计算问题总量（用于验证 150 道种子题）
 */
export function getTotalQuestionCount(): number {
  return QUESTION_BANK.length;
}
