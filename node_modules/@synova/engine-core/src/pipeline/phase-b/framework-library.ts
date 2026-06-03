/**
 * 群像蒸馏 · 框架库种子集
 *
 * 85 个跨学科结构性约束框架（2026-05-21 审计清理后，剔除 17 个 cargo cult 框架）
 * - 原始芒格多元思维模型 + Schema v4.0 框架库
 * - 失败模式反推 + 博弈论信息经济学 + JTBD 迁移
 * - 组织理论：Williamson/Hofstede/Kahn/Hurwicz/Chandler
 * - 麦肯锡核心方法论（MECE/逻辑树/假设驱动）
 * - 科技/互联网方法论（Agile/Kanban/DDD/Team Topologies 等）
 * - 制造业/DAO/反模式（精益/六西格玛/Apache之道/古德哈特定律）
 *
 * 详见 docs/tuning/framework-audit-keep-adapt-remove-20260521.md
 *
 * @date 2026-05-08 (原始) / 2026-05-21 (审计清理 102→85)
 *
 * ═══════════════════════════════════════════════════════════
 * 新增框架准入准则（添加框架前必须逐项勾选）
 * ═══════════════════════════════════════════════════════════
 *
 * 核心判据：框架必须描述结构性约束（对任何多智能体系统成立），
 * 而非人类心理现象或企业文化战术。
 *
 * 一票否决（满足任一即不可准入）：
 * [ ] 不含企业名/品牌名/地区名
 * [ ] 不依赖人类情绪或认知偏差
 * [ ] constraintPatterns ≥ 3（具体、可 grep 的中文关键词）
 * [ ] applicableRoles ≥ 2（可执行的 Agent 角色名）
 * [ ] coreInsight 描述了因果机制，而非现象描述
 * [ ] limitations ≥ 2
 * [ ] 搜索已有 constraintPatterns，确认无 >80% 重叠
 *
 * ═══════════════════════════════════════════════════════════
 * 人类框架 → Agent 框架 转换五步法
 * ═══════════════════════════════════════════════════════════
 *
 * Step 1 提取公因式：去掉所有人类特定假设，提取纯结构内核。
 *     问："如果执行者替换为一台理性机器，框架的哪部分仍然成立？"
 *
 * Step 2 替换心理机制为计算等价物：
 *     损失厌恶 → 不可逆操作高错误成本
 *     从众     → 独立来源的条件采样
 *     过度自信 → 点估计缺失置信区间
 *     信任     → 历史行为重复博弈声誉
 *     责任感   → 单点 owner 不可转让
 *
 * Step 3 可形式化约束：框架必须能翻译为至少一种——
 *     - 规则约束（行为边界）
 *     - 数学约束（WIP ≤ N）
 *     - 拓扑约束（star/chain/full_mesh）
 *     - 激励函数（收益 = 团队产出 × 贡献系数）
 *
 * Step 4 重写 coreInsight：[条件] → [机制] → [Agent 等价约束]
 *
 * Step 5 验证转换完整性：
 *     [ ] 原始因果链保留？[ ] 无心理术语？[ ] constraintPatterns 新增？
 *     [ ] applicableRoles 改为 Agent 角色？[ ] 冷读者能理解？
 *
 * 四种转换模式：
 *     泛化：剥离领域细节，保留抽象结构
 *     重新定义：心理学术语 → 计算术语
 *     反转：描述偏误 → 规定正确行为
 *     限定域：标注仅适用特定场景
 */

export interface Framework {
  id: string;
  name: string;
  category: 'psychology' | 'economics' | 'math-engineering' | 'medicine' | 'biology-physics' | 'law-governance';
  coreInsight: string;
  applicableDecisionTypes: string[];
  limitations: string[];
  /** V1.3: 该框架覆盖的约束类型关键词（用于 Phase A 约束→框架匹配） */
  constraintPatterns: string[];
  /** V1.3: 该框架隐含的角色类型（用于 Phase A 框架→角色推导） */
  applicableRoles: string[];
  /** V1.4: 该框架衍生出的技能（用于 Phase D 框架→技能映射） */
  skillPatterns?: SkillPattern[];
}

/** V1.4 L4 Skill Engineering: 框架→技能映射种子 */
export interface SkillPattern {
  // L1: 基础标识
  name: string;
  summary: string;
  category: string;
  tags: string[];
  isMarketplaceSkill: boolean;
  // L2: 信息前提与失败模式
  /** 使用前需具备的信息或前置技能 */
  prerequisites: string[];
  /** 常见的失败方式 */
  failureModes: string[];
  /** 信源层级 */
  sourceTier: 'verified' | 'inferred' | 'speculative';
  // L3: 协作依赖
  /** 依赖的其他技能 */
  dependsOn: string[];
  /** 互斥技能 */
  conflictsWith: string[];
  /** 触发条件 */
  triggers: string[];
}

export const SEED_FRAMEWORKS: Framework[] = [
  // ═══════════════════ 原始30个种子 ═══════════════════
  // ─── 心理学 ──────────
  {
    id: 'incentive_bias',
    name: '激励偏差',
    category: 'psychology',
    coreInsight: '人的行为由激励结构驱动，而非由"应该做什么"决定。改变行为最有效的方式是改变激励，而非说教。',
    applicableDecisionTypes: ['供应商评估', '员工绩效', '合作伙伴选择', '谈判策略'],
    constraintPatterns: ['激励', '绩效', '考核', '奖惩', '提成', 'KPI', 'OKR', '佣金', '分红'],
    applicableRoles: ['激励设计', '绩效管理', '薪酬规划', '组织设计'],
    limitations: ['过度依赖激励会挤出内在动机', '激励效果有时滞', '复杂场景激励会交互扭曲'],
    skillPatterns: [
      { name: '激励方案设计', summary: '基于激励偏差原理设计奖惩机制，对齐利益驱动行为', category: '组织设计', tags: ['激励', '绩效', '薪酬'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
      { name: '绩效指标工程', summary: '设计KPI/OKR体系，避免激励扭曲和指标博弈', category: '管理工具', tags: ['KPI', 'OKR', '考核'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
    ],
  },
  {
    id: 'adversarial_evidence',
    name: '对立证据强制检索',
    category: 'psychology',
    coreInsight: '任何决策前必须主动检索对立证据。如果找不到反面论点，说明检索不充分而非命题为真。适用于任何有界信息 Agent。',
    applicableDecisionTypes: ['风险评估', '投资判断', '安全评估', '代码审查', '实验设计', '产品验证', '合同审查'],
    constraintPatterns: ['反面证据', '对立论点', '反驳', '推翻', '质疑', '挑战假设', '证伪', '反面案例'],
    applicableRoles: ['安全审计', '风险评估', '代码审查', '决策审核'],
    limitations: ['反面证据检索有成本上限', '某些领域缺少可检索的反面证据'],
  },
  {
    id: 'diversity_sampling',
    name: '多样性采样验证',
    category: 'psychology',
    coreInsight: '当信息不足以独立判断时，应采集多个独立来源交叉验证。"多个独立来源指向同一结论"才是信号，单来源不可靠。',
    applicableDecisionTypes: ['市场进入策略', '产品定价', '渠道选择'],
    constraintPatterns: ['多重来源', '独立验证', '交叉验证', '采样', '多样性', '口碑', '评价', '推荐'],
    applicableRoles: ['市场分析', '情报收集', '用户研究', '数据验证'],
    limitations: ['独立来源的判断标准在实践中难以保证', '领域内可用的真实独立来源可能有限'],
  },
  {
    id: 'asymmetric_risk_weighting',
    name: '非对称风险加权',
    category: 'economics',
    coreInsight: '对不可逆操作施加比可逆操作更高的决策阈值。切换成本越高、回滚越困难，决策门槛就应越高。',
    applicableDecisionTypes: ['库存决策', '供应商切换', '定价策略', '合同条款谈判'],
    constraintPatterns: ['不可逆', '高风险', '切换', '变更', '决策阈值', '回滚', '退出', '终止', '保守'],
    applicableRoles: ['风险管理', '决策分析', '变更管理', '谈判代表'],
    limitations: ['风险加权的系数难以精确标定', '过度谨慎可能导致错失可逆机会'],
  },
  {
    id: 'confidence_calibration',
    name: '置信度校准',
    category: 'psychology',
    coreInsight: '任何判断必须附带显式置信度区间。当无法给出区间估计时，应标注"置信度未知"而非隐式假定确定性。精确的错误比模糊的正确更危险。',
    applicableDecisionTypes: ['进度估算', '成本预测', '市场预测', '技术选型', '架构评估', '风险量化', '安全审计'],
    constraintPatterns: ['置信度', '区间估计', '不确定性', '概率', '校准', '精确度', '误差范围', '置信区间'],
    applicableRoles: ['风险评估', '预测分析', '安全审计', '决策支持'],
    limitations: ['显式置信度标注有认知成本', '在某些场景下精确的区间估计不可行'],
  },
  // ─── 经济学/博弈论 ────
  {
    id: 'information_asymmetry',
    name: '信息不对称',
    category: 'economics',
    coreInsight: '交易双方掌握的信息不对等会使市场失效。最了解产品的人不一定最愿意说真话。',
    applicableDecisionTypes: ['供应商筛选', '跨境采购', '合作伙伴尽职调查'],
    constraintPatterns: ['信息', '市场', '供应商', '跨境', '合作伙伴', '数据', '质量', '信任', '验证'],
    applicableRoles: ['市场洞察', '供应商管理', '数据分析', '尽职调查'],
    limitations: ['信息不对称可以通过信誉机制部分缓解', '过度披露可能损害竞争优势'],
    skillPatterns: [
      { name: '供应商尽职调查', summary: '基于信息不对称理论，系统评估供应商的真实能力和风险', category: '采购管理', tags: ['供应商', '尽调', '风险'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
      { name: '信息验证工作流', summary: '建立多层验证机制，降低信息不对称带来的质量风险', category: '质量管理', tags: ['验证', '质量', '审核'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
    ],
  },
  {
    id: 'principal_agent',
    name: '代理人问题',
    category: 'economics',
    coreInsight: '当代理人（执行者）的利益与委托人（决策者）不一致时，代理人会优先服务自己的利益。',
    applicableDecisionTypes: ['团队管理', '外包管理', '跨层级授权'],
    constraintPatterns: ['团队', '管理', '外包', '代理', '授权', '信任', '监督', '激励', '委托'],
    applicableRoles: ['项目经理', '团队管理', '监督者', '激励设计'],
    limitations: ['严格的监控会损害信任和创造力', '完全一致的利益不可能实现'],
    skillPatterns: [
      { name: '代理成本评估', summary: '基于代理人理论评估委托-代理结构中的利益偏离和监控成本', category: '组织设计', tags: ['代理', '成本', '治理'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
      { name: '委托代理合规框架', summary: '设计监督机制和激励兼容契约，防范代理人道德风险', category: '项目管理', tags: ['合规', '监督', '契约'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
    ],
  },
  {
    id: 'opportunity_cost',
    name: '机会成本',
    category: 'economics',
    coreInsight: '选择一个选项的真正成本是放弃的最佳替代选项。做减法比做加法更重要。',
    applicableDecisionTypes: ['资源分配', '产品线选择', '供应链优化'],
    constraintPatterns: ['资源', '预算', '优先级', '选择', '取舍', '有限', '聚焦', '集中'],
    applicableRoles: ['资源分配', '策略规划', '投资决策', '产品经理'],
    limitations: ['机会成本不可精确量化', '过度关注机会成本会导致决策瘫痪'],
  },
  {
    id: 'sunk_cost',
    name: '沉没成本谬误',
    category: 'economics',
    coreInsight: '已经投入且不可收回的成本不应影响未来决策。但人天然倾向于为已经投入的成本继续投入。',
    applicableDecisionTypes: ['项目终止决策', '库存清理', '供应商关系调整'],
    constraintPatterns: ['项目', '投资', '终止', '放弃', '转型', '退出', '止损', '清理'],
    applicableRoles: ['项目评估', '投资决策', '资产处置', '战略审核'],
    limitations: ['承诺与一致性也是重要社会规范', '完全忽略沉没成本在长期关系中不现实'],
  },
  {
    id: 'network_effect',
    name: '网络效应',
    category: 'economics',
    coreInsight: '一个产品或服务的价值随使用人数增加而指数增长。先发优势在强网络效应市场中极难被打破。',
    applicableDecisionTypes: ['市场选择', '平台策略', '渠道建设'],
    constraintPatterns: ['平台', '用户增长', '市场', '双边', '社区', '社交', '生态', '规模'],
    applicableRoles: ['增长策略', '平台运营', '社区管理', '市场拓展'],
    limitations: ['网络效应也可能反向（用户越多体验越差）', '某些市场没有网络效应'],
  },
  // ─── 数学/工程学 ──────
  {
    id: 'margin_of_safety',
    name: '安全边际',
    category: 'math-engineering',
    coreInsight: '永远给自己留比看起来需要的更多的余量。桥梁设计承重×3，质检标准设为客户要求的1.2倍。',
    applicableDecisionTypes: ['质检标准', '库存缓冲', '供应商备选数量', '交付时间估算'],
    constraintPatterns: ['供应链', '质量', '安全', '库存', '风险', '缓冲', '冗余', '时间', '资源储备'],
    applicableRoles: ['供应链管理', '质量监控', '风险控制', '库存规划'],
    limitations: ['过度冗余会增加不必要的成本', '在快节奏行业安全边际可能成为竞争劣势'],
    skillPatterns: [
      { name: '安全库存规划', summary: '基于安全边际原理计算最优库存缓冲，平衡成本与断货风险', category: '供应链管理', tags: ['库存', '安全', '缓冲'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
      { name: '质量冗余设计', summary: '在质量标准和交付时间中嵌入安全因子，降低缺陷率', category: '质量控制', tags: ['质量', '冗余', '标准'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
    ],
  },
  {
    id: 'compounding',
    name: '复利效应',
    category: 'math-engineering',
    coreInsight: '微小的持续改进会产生指数级差异。每天进步1%一年后是37.8倍。',
    applicableDecisionTypes: ['供应商关系维护', '客户口碑积累', '团队技能建设'],
    constraintPatterns: ['长期', '增长', '积累', '品牌', '复利', '持续', '渐进', '关系'],
    applicableRoles: ['增长负责人', '品牌建设', '客户关系', '团队发展'],
    limitations: ['复利需要足够长的时间窗口', '中间波动可能导致提前放弃'],
  },
  {
    id: 'feedback_loop',
    name: '反馈回路',
    category: 'math-engineering',
    coreInsight: '系统的输出会反过来影响其输入。正反馈加速变化，负反馈维持稳定。',
    applicableDecisionTypes: ['质量控制流程', '客户反馈系统', '绩效考核设计'],
    constraintPatterns: ['质量', '客户反馈', '迭代', '改进', '数据驱动', '优化', '监控', '用户'],
    applicableRoles: ['质量监控', '数据分析', '产品优化', '客户体验'],
    limitations: ['反馈延迟会削弱系统稳定性', '正反馈可能导致失控'],
    skillPatterns: [
      { name: '数据驱动迭代框架', summary: '基于反馈回路原理建立"度量→分析→改进"的持续优化循环', category: '产品管理', tags: ['迭代', '数据', '优化'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
      { name: '质量反馈闭环', summary: '将客户反馈系统性接入质检和产品设计流程，形成修正链路', category: '运营管理', tags: ['反馈', '质量', '闭环'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
    ],
  },
  {
    id: 'redundancy',
    name: '冗余备份',
    category: 'math-engineering',
    coreInsight: '关键系统需要有备用方案。单点故障是系统最脆弱之处。',
    applicableDecisionTypes: ['供应商策略', '物流方案', 'IT系统架构'],
    constraintPatterns: ['系统', '备份', '多源', '应急', '稳定性', '可靠', '容灾', '高可用'],
    applicableRoles: ['系统运维', '应急管理', '供应商管理', 'IT架构'],
    limitations: ['过度冗余增加复杂性', '备选方案本身也需要维护'],
  },
  {
    id: 'pareto_principle',
    name: '帕累托原则（二八定律）',
    category: 'math-engineering',
    coreInsight: '80%的效果来自20%的原因。聚焦关键少数比平均用力更有效。',
    applicableDecisionTypes: ['客户管理', '产品线管理', '库存ABC分类'],
    constraintPatterns: ['资源', '预算', '优先级', '效率', '成本', '有限', '聚焦', '重点'],
    applicableRoles: ['运营经理', '产品经理', '资源分配', '策略规划'],
    limitations: ['剩余80%依然重要', '边界不清时难以确定哪20%是关键'],
    skillPatterns: [
      { name: 'ABC分类管理', summary: '基于帕累托原则将管理对象按重要性分为A/B/C三级，差异化投入资源', category: '运营管理', tags: ['分类', '优先级', '效率'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
      { name: '优先级矩阵工具', summary: '用影响度-投入度矩阵筛选关键少数事务，拒绝低价值消耗', category: '策略规划', tags: ['优先级', '矩阵', '决策'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
    ],
  },
  // ─── 医学/风险 ──────
  {
    id: 'first_do_no_harm',
    name: '先不伤害',
    category: 'medicine',
    coreInsight: '在不确定的决策中，优先选择最不可能造成不可逆伤害的方案。不是所有行动都比不行动好。',
    applicableDecisionTypes: ['供应商切换', '大规模库存调整', '合作伙伴更换'],
    constraintPatterns: ['不确定', '高风险', '关键', '安全', '决策', '切换', '变更', '谨慎'],
    applicableRoles: ['风险控制', '决策审核', '安全顾问', '变更管理'],
    limitations: ['"不行动"本身也有风险', '在某些情景下不行动等于放弃机会'],
  },
  {
    id: 'triage',
    name: '分诊原则',
    category: 'medicine',
    coreInsight: '按紧急程度和可治疗性分配资源，而非按到达顺序。有些问题不值得投入最佳资源。',
    applicableDecisionTypes: ['客户投诉处理', '多项目资源分配', '危机管理'],
    constraintPatterns: ['优先级', '紧急', '资源分配', '排序', '有限', '筛选', '分级', '分类'],
    applicableRoles: ['运营管理', '资源调度', '优先级管理', '危机协调'],
    limitations: ['需要准确的快速诊断能力', '在公平性要求高的场景中不适用'],
    skillPatterns: [
      { name: '紧急度分级系统', summary: '基于分诊原则建立四级紧急度矩阵（危重/紧急/一般/可延迟），优化资源分配', category: '运营管理', tags: ['分级', '紧急', '资源'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
      { name: '资源调度框架', summary: '按可治疗性×紧急度双维度排序任务，确保有限资源聚焦高价值事项', category: '项目管理', tags: ['调度', '优先级', '资源'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
    ],
  },
  {
    id: 'base_rate',
    name: '基础概率',
    category: 'medicine',
    coreInsight: '做判断时必须考虑事件的基础发生概率，而非只看个案特征。罕见病的阳性检测结果大概率是误报。',
    applicableDecisionTypes: ['供应商可靠性评估', '市场潜力估算', '风险量化'],
    constraintPatterns: ['数据', '评估', '预测', '概率', '统计', '分析', '量化', '估算'],
    applicableRoles: ['数据分析', '风险评估', '市场研究', '决策支持'],
    limitations: ['基础概率有时难以获取', '某些情境下个案信息比基础概率更重要'],
  },
  // ─── 物理学/生物学 ────
  {
    id: 'critical_mass',
    name: '临界质量',
    category: 'biology-physics',
    coreInsight: '某些变化需要达到一个阈值才会发生质变。不到阈值之前投入看起来"无效"，但过了阈值效应爆发。',
    applicableDecisionTypes: ['市场教育投入', '品牌建设', '团队文化建设'],
    constraintPatterns: ['增长', '市场', '规模', '阈值', '突破', '临界', '积累', '品牌'],
    applicableRoles: ['增长负责人', '市场拓展', '品牌建设', '战略投资'],
    limitations: ['临界点不可预知', '在临界点前放弃是常见错误'],
  },
  {
    id: 'natural_selection',
    name: '自然选择',
    category: 'biology-physics',
    coreInsight: '不是最强的物种生存，而是最能适应变化的。环境选择适应者而非完美者。',
    applicableDecisionTypes: ['组织变革', '业务模式调整', '人才策略'],
    constraintPatterns: ['变革', '适应', '竞争', '环境', '转型', '进化', '调整', '迭代'],
    applicableRoles: ['战略规划', '组织发展', '变革管理', '竞争分析'],
    limitations: ['"适应"是事后判断', '人类组织比生物系统有更多主动选择空间'],
  },
  {
    id: 'entropy',
    name: '熵增定律',
    category: 'biology-physics',
    coreInsight: '封闭系统自发趋向混乱。任何组织如果不投入能量维持秩序，就会自然衰退。',
    applicableDecisionTypes: ['组织架构设计', '流程管理', '文化建设'],
    constraintPatterns: ['流程', '维护', '组织', '制度', '纪律', '秩序', '持续', '运营'],
    applicableRoles: ['流程管理', '运营维护', '制度建设', '组织发展'],
    limitations: ['过度对抗熵增会消耗过多资源', '适度混乱可能激发创新'],
  },
  // ─── 法律/治理 ────
  {
    id: 'checks_and_balances',
    name: '制衡机制',
    category: 'law-governance',
    coreInsight: '权力必须被制衡。没有任何单一角色应该拥有所有决策权。',
    applicableDecisionTypes: ['组织设计', '审批流程', '采购权限'],
    constraintPatterns: ['合规', '审计', '审批', '权力', '监督', '治理', '流程', '权限', '风控'],
    applicableRoles: ['合规专员', '审计员', '流程管理', '治理监督'],
    limitations: ['过度制衡降低决策效率', '制衡不足则易导致滥用'],
    skillPatterns: [
      { name: '合规审查流程', summary: '基于制衡原理设计多层审批节点和权力分立，降低单一决策风险', category: '合规管理', tags: ['合规', '审查', '审批'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
      { name: '权限分离设计', summary: '将高风险操作拆分为提议-审核-执行三道防线，防止权力集中', category: '治理设计', tags: ['权限', '安全', '治理'], isMarketplaceSkill: true, prerequisites: [], failureModes: [], sourceTier: 'inferred' as const, dependsOn: [], conflictsWith: [], triggers: [] },
    ],
  },
  {
    id: 'single_point_accountability',
    name: '单点问责',
    category: 'law-governance',
    coreInsight: '每个任务必须有唯一 owner。多人共责 = 无人负责。当任务需要多人协作时，拆分到子任务粒度直到每个子任务有唯一 owner。',
    applicableDecisionTypes: ['任务分配', '项目管理', '质量管理'],
    constraintPatterns: ['唯一责任人', 'owner', '问责', '分配', '明确', '单点', 'RACI', '执行'],
    applicableRoles: ['项目管理', '任务分配', '责任审计', '质量管理'],
    limitations: ['过度拆分可能导致任务碎片化', '某些创造型任务难以预拆分'],
  },
  {
    id: 'burden_of_proof',
    name: '举证责任',
    category: 'law-governance',
    coreInsight: '提出主张的一方有责任提供证据。不能只靠直觉或他人佐证就采信一个判断。',
    applicableDecisionTypes: ['供应商评估', '问题根因分析'],
    constraintPatterns: ['合规', '验证', '证据', '审计', '审核', '认证', '审查', '评估'],
    applicableRoles: ['合规专员', '审计员', '法务', '质量审核'],
    limitations: ['某些场景下举证成本过高', '过度要求举证会延宕决策'],
  },
  // ─── 额外原始补充 ────
  {
    id: 'optionality',
    name: '可选性',
    category: 'economics',
    coreInsight: '保留多种选择比追求单个最优更重要。选择越多，你在不确定性下的生存概率越高。',
    applicableDecisionTypes: ['供应商策略', '物流方案', '市场进入策略'],
    constraintPatterns: ['灵活', '不确定', '多方案', '创业', '初创', '试错', '探索', '迭代'],
    applicableRoles: ['战略顾问', '业务拓展', '创新管理', '市场探索'],
    limitations: ['过多选择会增加决策复杂度', '维护可选性需要成本'],
  },
  {
    id: 'inversion',
    name: '逆向思考',
    category: 'psychology',
    coreInsight: '解决一个问题，先问"什么会导致失败"而不是"如何成功"。从终局反推比正向规划更清晰。',
    applicableDecisionTypes: ['风险评估', '项目规划', '供应商选择'],
    constraintPatterns: ['风险', '安全', '防御', '失败', '逆向', '漏洞', '攻击', '危机'],
    applicableRoles: ['风险控制', '安全顾问', '质量保障', '应急规划'],
    limitations: ['过度关注负面可能导致保守', '逆向思考需要跳出常规路径'],
  },
  {
    id: 'circle_of_competence',
    name: '能力圈',
    category: 'psychology',
    coreInsight: '明确知道自己知道什么、不知道什么。只在能力圈内做决策，在圈外找专家。',
    applicableDecisionTypes: ['新市场评估', '新业务决策', '投资决策'],
    constraintPatterns: ['专业', '能力', '评估', '专家', '外包', '顾问', '咨询', '审查'],
    applicableRoles: ['专家顾问', '能力评估', '外部咨询', '决策审核'],
    limitations: ['能力圈的边界很难精确划定', '固守能力圈可能错失新机遇'],
  },
  {
    id: 'second_order_thinking',
    name: '二阶思考',
    category: 'economics',
    coreInsight: '不仅考虑决策的直接结果，还要考虑结果之后的结果。一阶思考人人会，二阶思考才产生优势。',
    applicableDecisionTypes: ['定价策略', '激励设计', '供应链决策'],
    constraintPatterns: ['战略', '长期', '政策', '复杂', '决策', '规划', '市场', '竞争'],
    applicableRoles: ['策略师', '决策顾问', 'CEO', '战略规划'],
    limitations: ['二阶链越长越不可靠', '过度分析可能导致决策瘫痪'],
  },
  {
    id: 'premortem',
    name: '事前验尸',
    category: 'psychology',
    coreInsight: '在项目开始前假设项目已经失败，然后倒推失败原因。这种"未来回溯"能暴露常规规划中忽略的风险。',
    applicableDecisionTypes: ['项目规划', '供应商选择', '市场进入'],
    constraintPatterns: ['风险', '项目', '规划', '失败', '预防', '预案', '危机', '应急'],
    applicableRoles: ['项目规划', '风险控制', '应急预案', '质量保障'],
    limitations: ['不能替代正面规划', '最明显的失败原因不一定最可能'],
  },
  {
    id: 'occhams_razor',
    name: '奥卡姆剃刀',
    category: 'math-engineering',
    coreInsight: '最简单的解释通常是正确的。不要为不需要更多假设的理论增添不必要的复杂性。',
    applicableDecisionTypes: ['问题诊断', '流程设计', '组织架构'],
    constraintPatterns: ['简化', '效率', '流程', '架构', '设计', '优化', '精简', '成本'],
    applicableRoles: ['流程优化', '架构设计', '效率管理'],
    limitations: ['简单不等于正确', '有些复杂问题是真复杂'],
  },

  // ═══════════════════════════════════════════════════════
  // 2026-05-09 扩展：失败模式反推 + 博弈论信息经济学 + JTBD 迁移
  // 框架库总量：30 → 45（+15）
  // ═══════════════════════════════════════════════════════

  // ——— 路径1：供应链失败模式反推 (6个) ———
  // 信源：跨境电商倒闭案例(amz123.com)/贸易判例/供应商质量纠纷/单一源依赖/资金链断裂
  {
    id: 'trust_verification',
    name: '可信承诺验证',
    category: 'economics',
    coreInsight: '口头承诺不可信时交叉验证。三证法：合同条款 + 样品检测 + 第三方背书，任一单腿站不稳。',
    applicableDecisionTypes: ['供应商筛选', '供应商评估', '合作伙伴尽职调查'],
    constraintPatterns: ['供应商', '验证', '信任', '审核', '筛选', '背书', '认证', '检测'],
    applicableRoles: ['供应商审核', '尽职调查', '质量验证', '合规审查'],
    limitations: ['验证成本可能超出收益', '过度验证会延迟交易窗口', '第三方背书也可能被伪造'],
  },
  {
    id: 'quality_lot_decision',
    name: '整批退决策框架',
    category: 'math-engineering',
    coreInsight: '质量瑕疵是偶然还是系统性？连续批跟踪：单批瑕疵→让步接收，连续3批瑕疵→停止合作。单点抽样不足以区分信号和噪声。',
    applicableDecisionTypes: ['质检标准', '退货处理', '供应商评估'],
    constraintPatterns: ['质量', '批次', '检测', '抽样', '退货', '缺陷', '统计', '标准'],
    applicableRoles: ['质量检测', '质检员', '供应商评估', '品质管理'],
    limitations: ['连续批跟踪需要时间积累', '小批量采购无法建立统计显著', '食品/医药行业单次瑕疵即致命'],
  },
  {
    id: 'fraud_detection_roi',
    name: '造假者ROI模型',
    category: 'psychology',
    coreInsight: '造假者愿花多少钱伪造，你就得花多少钱验证。高毛利品类（保健品/化妆品/奢侈品）造假ROI远高于低毛利品类。验证资源应按造假激励分配，而非均分。',
    applicableDecisionTypes: ['供应商可信度验证', '品牌保护', '合规风险判断'],
    constraintPatterns: ['验证', '品牌', '造假', '防伪', '高毛利', '奢侈品', '保健品', '化妆品'],
    applicableRoles: ['风险分析', '品牌保护', '防伪验证', '采购审计'],
    limitations: ['造假者ROI不能精确量化', '新型造假手段可能绕过现有验证', '过度防范伤及诚信供应商'],
  },
  {
    id: 'tiered_trust',
    name: '分级信任模型',
    category: 'law-governance',
    coreInsight: '不搞全信或全不信。按历史表现分三级：Tier-1（战略合作，信用巡检）→ Tier-2（稳定合作，抽样检查）→ Tier-3（新供应商，全量验证）。信任级别决定验证密度。',
    applicableDecisionTypes: ['供应商策略', '采购权限', '审批流程'],
    constraintPatterns: ['供应商', '分级', '信任', '战略', '合作', '采购', '审核', '长期'],
    applicableRoles: ['供应商管理', '采购策略', '合作分级', '关系管理'],
    limitations: ['Tier晋升需要客观标准', '长期Tier-1可能滋生腐败', '某些品类天然缺乏Tier-1级供应商'],
  },
  {
    id: 'compliance_checklist',
    name: '合规前置检查清单',
    category: 'law-governance',
    coreInsight: '跨境三道防线：关税分类（HS Code）+ 产品认证（CE/UL/FDA）+ 制裁筛查。事前检查成本通常不到事后赎货成本的1/10。',
    applicableDecisionTypes: ['合规风险判断', '供应商评估', '市场进入策略'],
    constraintPatterns: ['合规', '认证', '跨境', '关税', '法规', '出口', '进口', '海关', '制裁'],
    applicableRoles: ['合规专员', '法务', '认证管理', '跨境运营'],
    limitations: ['法规变化不可预测', '不同国家认证标准不互通', '过度合规错失市场机会'],
  },
  {
    id: 'supplier_lifecycle',
    name: '供应商生命周期管理',
    category: 'economics',
    coreInsight: '区分战略性供应商（长期锁定，深度协作，共用研发）和交易型供应商（一把一清，纯价格驱动）。两者不可用同一套KPI——前者考核响应速度，后者考核单价。',
    applicableDecisionTypes: ['供应商更换', '供应商策略', '合作伙伴选择'],
    constraintPatterns: ['供应商', '生命周期', '采购', '战略', '长期', '合作', '关系', 'KPI'],
    applicableRoles: ['供应商管理', '采购策略', '战略采购', '合作关系管理'],
    limitations: ['战略性供应商的判断边界模糊', '交易型→战略型升级路径不易设计', '同一供应商可能兼具两种属性'],
  },

  // ——— 路径2：博弈论与信息经济学 (5个) ———
  // 信源：Akerlof(1970)/Spence(1973)/Rothschild-Stiglitz(1976)/Kreps(1982)/Hart(1986)
  {
    id: 'lemons_market',
    name: '柠檬市场（逆向选择）',
    category: 'economics',
    coreInsight: '买家无法区分质量时好货被劣货驱逐。一味压价只能筛选出最敢偷工减料的供应商。出价合理反而能降低真实成本——好供应商愿意以合理价格长期合作。',
    applicableDecisionTypes: ['供应商筛选', '定价策略', '采购谈判'],
    constraintPatterns: ['供应商', '筛选', '质量', '定价', '采购', '信息', '评估', '选择'],
    applicableRoles: ['供应商筛选', '采购评估', '质量审查', '定价分析'],
    limitations: ['高价不等于高质量', '信息不对称下价格信号可能被操纵', '柠檬市场效应需要足够大的参与者池'],
  },
  {
    id: 'signaling',
    name: '信号传递',
    category: 'economics',
    coreInsight: '供应商用什么证明自己可信？可伪造的信号（口头承诺、PS认证证书）无价值。不可逆的投入（专用设备、质保金、长期合同违约金）才是真信号。',
    applicableDecisionTypes: ['供应商筛选', '合同条款设计', '合作伙伴选择'],
    constraintPatterns: ['供应商', '验证', '信号', '合同', '承诺', '筛选', '评估', '信任'],
    applicableRoles: ['供应商评估', '合同管理', '采购谈判', '尽职调查'],
    limitations: ['昂贵的信号会排斥小型优质供应商', '信号与质量的关系需要行业验证'],
  },
  {
    id: 'screening',
    name: '筛选机制设计',
    category: 'economics',
    coreInsight: '设计让供应商自我揭示质量的机制。阶梯付款（质量好→付款比例高）、质保金（连续3批合格→退还）、小订单试跑——让供应商用行为而非语言证明自己。',
    applicableDecisionTypes: ['采购谈判', '合同条款设计', '供应商评估'],
    constraintPatterns: ['供应商', '筛选', '机制', '采购', '阶梯', '质保', '付款', '试跑'],
    applicableRoles: ['采购策略', '供应商管理', '合同设计', '质量保障'],
    limitations: ['复杂机制增加交易成本', '供应商可能逆向选择拒绝合作'],
  },
  {
    id: 'reputation_model',
    name: '声誉博弈',
    category: 'economics',
    coreInsight: '供应商在长期关系中维护声誉的动机远大于单次交易的欺骗诱惑。把大单拆为多次小单+公开评价机制=将一次性博弈转为重复博弈。',
    applicableDecisionTypes: ['供应商关系维护', '合作伙伴选择', '长期合同设计'],
    constraintPatterns: ['供应商', '长期', '评价', '声誉', '合作', '博弈', '重复', '信任'],
    applicableRoles: ['供应商关系', '评价管理', '合作策略', '长期采购'],
    limitations: ['声誉建立需要时间——初创期不适用', '评价系统可能被操纵', '行业衰退期声誉约束失效'],
  },
  {
    id: 'incomplete_contract',
    name: '不完全契约',
    category: 'law-governance',
    coreInsight: '合同永远写不全。"关系契约"（默契、共同利益、声誉）比"正式契约"（法律条款）更重要。选择供应商时看对方是否在乎未来合作，而非合同条款多长。',
    applicableDecisionTypes: ['合同条款设计', '供应商关系维护', '合作伙伴选择'],
    constraintPatterns: ['合同', '关系', '合作', '长期', '信任', '法务', '条款', '协议'],
    applicableRoles: ['合同管理', '法务', '合作关系', '供应商维护'],
    limitations: ['关系契约在法律上不可强制执行', '企业文化差异影响"默契"解读'],
  },

  // ——— 路径3：JTBD 与战略理论迁移 (4个) ———
  // 信源：Christensen(2016)/Baldwin&Clark(2000)/Mintzberg(1994)
  {
    id: 'jobs_to_be_done_lens',
    name: '用户雇佣视角',
    category: 'psychology',
    coreInsight: '用户不是"买产品"——是"雇佣"产品来完成某个任务。不是"哪个供应商最便宜"而是"哪个供应商能最好地完成我的交付任务"。',
    applicableDecisionTypes: ['供应商选择', '产品定位', '市场策略'],
    constraintPatterns: ['用户', '需求', '产品', '任务', '场景', '定位', '市场', '匹配'],
    applicableRoles: ['产品设计', '用户研究', '需求分析', '市场定位'],
    limitations: ['JTBD抽象层次容易过高', '同一产品可能被"雇佣"来完成不同任务'],
  },
  {
    id: 'modular_vs_integrated',
    name: '模块化 vs 集成化',
    category: 'math-engineering',
    coreInsight: '行业成熟时模块化（标准接口+可替换供应商）取代集成化（深度绑定）。标准化品类用模块化（多家比价），定制品类用集成化（深度合作）。',
    applicableDecisionTypes: ['供应链策略', '供应商选择', '产品架构设计'],
    constraintPatterns: ['架构', '标准化', '定制', '模块', '接口', '供应链', '集成', '解耦'],
    applicableRoles: ['架构设计', '供应链策略', '产品架构', '标准化管理'],
    limitations: ['模块化与集成化的边界渐进而非突变', '过度模块化导致产品同质化'],
  },
  {
    id: 'disruption_detection',
    name: '颠覆性创新识别',
    category: 'economics',
    coreInsight: '颠覆者从主流玩家"不屑于服务"的边缘市场切入。判断一个新兴供应商是真的"便宜"还是在构建你的竞争对手的下一条供应链。',
    applicableDecisionTypes: ['市场进入策略', '供应商评估', '新业务决策'],
    constraintPatterns: ['创新', '颠覆', '竞争', '边缘', '新兴', '替代', '威胁', '战略'],
    applicableRoles: ['市场分析', '战略规划', '竞争情报', '创新管理'],
    limitations: ['颠覆的识别是后验的——当时看不清', '被"颠覆"的常常是当时的行业领袖'],
  },
  {
    id: 'emergent_strategy',
    name: '涌现型策略',
    category: 'biology-physics',
    coreInsight: '策略不是在会议室里设计出来的——是从一线行动中涌现的。最好的供应链优化往往来自一线采购员的即时判断而非总部的年度规划。给执行层留策略空间。',
    applicableDecisionTypes: ['组织设计', '决策权限分配', '流程优化'],
    constraintPatterns: ['一线', '授权', '策略', '执行', '赋能', '自主', '灵活', '响应'],
    applicableRoles: ['一线管理', '运营授权', '流程优化', '组织设计'],
    limitations: ['完全放权可能导致混乱', '涌现策略需要事后归纳制度化'],
  },

  // ═══════════════════ 出海/跨境电商 新增20条 (2026-05-09 Hermes 补充) ═══════════════════

  // ─── 商业/经济类（10 条）───
  {
    id: 'quality_cost_spiral',
    name: '质量-成本螺旋',
    category: 'economics',
    coreInsight: '纯价格竞争→利润压缩→质量下降→更低价→恶性循环。差异化或成本结构优势是唯一出路。目标不是最便宜，是性价比最高。',
    applicableDecisionTypes: ['pricing', 'product_strategy', 'market_positioning'],
    constraintPatterns: ['定价', '低价', '质量', '利润', '性价比', '竞争', '差异化', '螺旋'],
    applicableRoles: ['定价策略', '产品策略', '质量监控', '竞争分析'],
    limitations: ['低价策略在初期确实能获取用户', '需要区分"价格竞争"和"性价比竞争"'],
  },
  {
    id: 'cross_border_compliance_first',
    name: '跨境合规前置',
    category: 'law-governance',
    coreInsight: '先认证再选品，不是先选品再认证。3C认证/CR认证/EPR合规是入市门槛而非可选项',
    applicableDecisionTypes: ['compliance', 'product_strategy', 'supplier_selection'],
    constraintPatterns: ['跨境', '合规', '认证', '法规', '出口', '进口', '海关', '标准', '审核'],
    applicableRoles: ['合规专员', '认证管理', '法务', '跨境运营'],
    limitations: ['合规前置会增加初始成本和时间', '部分市场的合规标准变化频繁'],
  },
  {
    id: 'localization_logistics_triangle',
    name: '本地化物流三角',
    category: 'economics',
    coreInsight: '跨境直发/海外仓/本地仓——关税优惠、时效、成本的三角不可同时最优。选择取决于品类和阶段',
    applicableDecisionTypes: ['logistics', 'supply_chain', 'cost_optimization'],
    constraintPatterns: ['物流', '仓储', '跨境', '海外仓', '配送', '时效', '成本', '本地'],
    applicableRoles: ['物流管理', '供应链', '仓储规划', '跨境运营'],
    limitations: ['三角模型是简化，实际有更多变量', '政策变化可能打破既有最优选择'],
  },
  {
    id: 'price_war_death_spiral',
    name: '价格战死亡螺旋',
    category: 'economics',
    coreInsight: '小家电同质化→价格竞争→利润归零→无法创新→更低价格。唯一出路是差异化或成本结构优势',
    applicableDecisionTypes: ['pricing', 'product_strategy', 'competitive_analysis'],
    constraintPatterns: ['竞争', '定价', '差异化', '同质化', '利润', '创新', '成本', '价格'],
    applicableRoles: ['竞争策略', '产品差异化', '成本优化', '创新管理'],
    limitations: ['短期价格战有时是必要的市场策略', '差异化需要持续投入'],
  },
  {
    id: 'collaborative_supplier_verification',
    name: '协同过滤式供应商验证',
    category: 'psychology',
    coreInsight: '1个供应商说好可能是假=骗。3+客户的供应链主管都推荐同一家=可信。质量靠交叉验证，不是靠第一次见面',
    applicableDecisionTypes: ['supplier_selection', 'trust_assessment', 'partnership'],
    constraintPatterns: ['供应商', '验证', '推荐', '交叉', '口碑', '审核', '筛选', '调查'],
    applicableRoles: ['供应商审核', '采购调查', '供应链情报', '尽职调查'],
    limitations: ['推荐人可能有利益关联', '小品类供应商圈子小，交叉验证样本不足'],
  },
  {
    id: 'window_of_opportunity',
    name: '窗口期管理',
    category: 'law-governance',
    coreInsight: '外部约束变更（法规/认证/标准）有时间窗口。窗口期内行动成本远低于窗口期后补救。忽视窗口期=被动承担数倍成本。',
    applicableDecisionTypes: ['compliance', 'supply_chain', 'timeline_planning'],
    constraintPatterns: ['合规', '时效', '窗口', '截止', '认证', '法规', '变更', '期限'],
    applicableRoles: ['合规管理', '时间规划', '风险预警', '变更跟踪'],
    limitations: ['外部变化不可预测', '过度关注窗口期可能导致决策犹豫'],
  },
  {
    id: 'multi_channel_redundancy',
    name: '多渠道冗余策略',
    category: 'economics',
    coreInsight: '单一渠道=单点风险。多个独立渠道并行运作时，任一渠道中断不影响全局。但渠道数增加会指数级提升管理复杂度——通常 3 个独立渠道是平衡点。',
    applicableDecisionTypes: ['channel_strategy', 'marketing', 'resource_allocation'],
    constraintPatterns: ['多渠道', '冗余', '平台', '销售', '流量', '品牌', '分发', '营销'],
    applicableRoles: ['渠道管理', '运营策略', '平台管理', '营销推广'],
    limitations: ['全渠道运营成本高', '各渠道规则冲突可能导致策略矛盾'],
  },
  {
    id: 'first_mover_disadvantage',
    name: '先行者劣势',
    category: 'economics',
    coreInsight: '第一个进入新市场的往往是付出最多学习成本的。第二个进入的能学习先行者的错误',
    applicableDecisionTypes: ['market_entry', 'timing', 'competitive_strategy'],
    constraintPatterns: ['市场', '先发', '学习', '进入', '跟随', '时机', '风险', '试探'],
    applicableRoles: ['市场分析', '竞争策略', '时机规划', '战略研究'],
    limitations: ['先行者优势在某些市场仍然显著', '先行者劣势依赖于市场教育成本'],
  },

  // ─── 心理学/决策类（5 条）───
  {
    id: 'over_adaptation_trap',
    name: '过度适应陷阱',
    category: 'psychology',
    coreInsight: '为适配局部需求不断修改核心方案→失去全局一致性和规模优势。适应要有底线——核心层不变，适配层可变。',
    applicableDecisionTypes: ['product_strategy', 'localization', 'brand_strategy'],
    constraintPatterns: ['本地化', '标准化', '适应', '全局', '定制', '统一', '核心', '边界'],
    applicableRoles: ['产品策略', '标准化管理', '架构决策', '方案设计'],
    limitations: ['某些场景确实需要深度定制', '全局标准和局部适应的边界需要经验判断'],
  },
  {
    id: 'domain_blind_spot',
    name: '领域盲区',
    category: 'psychology',
    coreInsight: '专家在非专业领域的判断力急剧下降。一个领域的深度认知不等于另一个领域的直觉准确。承认盲区比强行跨领域判断更可靠。',
    applicableDecisionTypes: ['hiring', 'localization', 'strategy'],
    constraintPatterns: ['盲区', '跨领域', '专家', '本地', '认知', '调研', '顾问', '局限'],
    applicableRoles: ['领域专家', '本地顾问', '市场调研', '外部咨询'],
    limitations: ['外部顾问的判断也可能有偏', '专家认知和本地认知需要平衡'],
  },
  {
    id: 'habitual_saving_fallacy',
    name: '习惯性省钱谬误',
    category: 'psychology',
    coreInsight: '为了省钱跳过认证→省了500美元认证费→损失5000美元退货处理费。短期省钱可以是最贵的决策',
    applicableDecisionTypes: ['cost_optimization', 'compliance', 'risk_management'],
    constraintPatterns: ['成本', '合规', '风险', '认证', '省钱', '退货', '质量', '长期'],
    applicableRoles: ['成本管理', '风险分析', '投资回报', '合规审查'],
    limitations: ['省钱有时确实是最优策略', '需要区分必要开支和可选开支'],
  },
  {
    id: 'local_team_empowerment',
    name: '本地团队赋能',
    category: 'psychology',
    coreInsight: '离市场最近的运营团队应拥有限额内自主决策权。信任前置减少决策延迟，微管理增加隐性成本',
    applicableDecisionTypes: ['delegation', 'operations', 'customer_service'],
    constraintPatterns: ['授权', '本地', '决策', '运营', '信任', '敏捷', '赋能', '自主'],
    applicableRoles: ['本地运营', '区域管理', '授权管理', '一线决策'],
    limitations: ['授权边界不清可能导致失控', '需要建立有效的监督机制'],
  },

  // ─── 通用补充 ───
  {
    id: 'anti_fragile_supply_chain',
    name: '反脆弱供应链',
    category: 'economics',
    coreInsight: '供应链不是追求零中断，而是被中断后能更快恢复。多源采购+安全库存+替代物流=反脆弱三角',
    applicableDecisionTypes: ['supply_chain', 'risk_management', 'cost_optimization'],
    constraintPatterns: ['供应链', '韧性', '多源', '恢复', '中断', '备选', '冗余', '安全'],
    applicableRoles: ['供应链管理', '风险管理', '备选方案', '应急规划'],
    limitations: ['反脆弱需要冗余投入', '过度冗余可能变成效率负担'],
  },
  {
    id: 'trust_building_gradient',
    name: '信任建立梯度',
    category: 'psychology',
    coreInsight: '信任不是二值变量——它沿梯度递增。关系型协作（信任基于互动历史）和契约型协作（信任基于可验证承诺）各有适用场景。错配信任模型=隐性协作成本。',
    applicableDecisionTypes: ['partnership', 'negotiation', 'collaboration_model'],
    constraintPatterns: ['信任', '关系', '契约', '协作', '长期', '合作', '梯度', '渐进'],
    applicableRoles: ['合作关系管理', '协作模式设计', '信任评估', '长期合作策略'],
    limitations: ['关系信任可能被滥用', '契约条款仍然是最终保障'],
  },

  // ═══════════════════════════════════════════════════════
  // V1.3 新增：组织理论框架（知识注入体系 — P0 层）
  // 5 个框架，全部接入引擎推导链
  // 信源：Williamson(1975)/Hofstede(1980)/Kahn(1964)/Hurwicz(1973)/Chandler(1962)
  // ═══════════════════════════════════════════════════════

  {
    id: 'transaction_cost',
    name: '交易成本边界',
    category: 'economics',
    coreInsight: '企业边界由交易成本决定。外部协调成本高于内部管理成本时自己做，反之外包。跨境/多平台/多供应商场景下，必须设置专门的外部接口角色来吸收协调成本。',
    applicableDecisionTypes: ['外包决策', '供应商策略', '组织设计', '跨境运营'],
    constraintPatterns: ['跨境', '多平台', '外部协调', '外包', '多供应商', '合作伙伴', '交易', '接口'],
    applicableRoles: ['外部接口', '供应商管理', '合作伙伴管理', '跨境协调'],
    limitations: ['交易成本难以精确量化', '内部管理成本也可能失控', '"中间型"交易（关系契约）不适用二分法'],
  },
  {
    id: 'hierarchy_acceptance',
    name: '层级接受度',
    category: 'psychology',
    coreInsight: '不同协作环境中层级式决策（自上而下）和扁平式决策（参与协商）的适用性不同。高不确定性+需要快速响应→层级式更高效；高复杂度+需要多视角→扁平式更准确。协作模式必须匹配任务特征而非默认偏好。',
    applicableDecisionTypes: ['团队协作', '组织设计', '决策模式', '协作协议'],
    constraintPatterns: ['层级', '扁平', '决策', '协作', '冲突', '共识', '指挥链', '参与'],
    applicableRoles: ['协作模式设计', '组织架构', '决策流程', '团队管理'],
    limitations: ['任务特征和最优协作模式的映射不是精确科学', '成员个体偏好差异大', '混合模式可能增加沟通开销'],
  },
  {
    id: 'role_conflict',
    name: '角色过载与冲突',
    category: 'psychology',
    coreInsight: '当一个人被赋予不相容的职责（如同时负责合规审查和营收增长），角色冲突必然发生。不相容职责域（合规+营收/质量+速度/创新+稳定）应拆分到不同角色，兼任是冲突的温床。',
    applicableDecisionTypes: ['角色设计', '职责分配', '组织架构', '合规设计'],
    constraintPatterns: ['合规', '营收', '多重职责', '兼任', '冲突', '监督', '执行', '制衡'],
    applicableRoles: ['职责分离', '冲突检测', '组织审计', '角色设计'],
    limitations: ['过度拆分导致沟通成本上升', '小团队无法完全避免兼任', '某些创新型角色受益于张力'],
  },
  {
    id: 'incentive_compatibility',
    name: '激励相容',
    category: 'economics',
    coreInsight: '机制设计的核心原则：每个参与者追求自身利益最大化时，恰好也实现了系统目标。多同层级角色并存时，纯奖励机制会引发过度竞争，纯惩罚机制会引发风险规避——混合机制（底线约束+超额分享）最稳定。',
    applicableDecisionTypes: ['激励设计', '绩效考核', '薪酬结构', '协议参数'],
    constraintPatterns: ['激励', '绩效', '多角色', '同层级', '竞争', '合作', '奖惩', '报酬'],
    applicableRoles: ['激励设计', '机制设计', '绩效管理', '组织设计'],
    limitations: ['最优激励合同需要精确信息（现实中不可得）', '混合机制设计复杂度随角色数指数增长', '某些人类动机（使命感/工匠精神）超出激励模型'],
  },
  {
    id: 'structure_follows_strategy',
    name: '结构跟随战略',
    category: 'law-governance',
    coreInsight: '组织结构的唯一目的是服务战略。任务从"探索"转向"执行"时，组织应从松散耦合转向层级化；从"单一市场"转向"多市场"时，应增设区域协调层。结构不是固定的——它是战略的函数。这是所有组织设计规则的元规则。',
    applicableDecisionTypes: ['组织变革', '阶段管理', '架构设计', '战略规划'],
    constraintPatterns: ['阶段', '转型', '扩张', '探索', '执行', '规模', '增长', '战略', '调整'],
    applicableRoles: ['组织架构', '战略规划', '变革管理', '阶段评估'],
    limitations: ['结构调整有滞后成本', '过分频繁的调整本身损害执行', '"战略先行"假设战略已明确（现实中战略可能是涌现的）'],
  },

  // ═══════════════════════════════════════════════════════
  // V1.4 新增：麦肯锡核心方法论框架（4 个）
  // P0 工程化：MECE / 逻辑树 / SCQA / 假设驱动
  // 信源：McKinsey(1939-)/Minto(1987)/Rasiel(1999)
  // ═══════════════════════════════════════════════════════

  {
    id: 'mece',
    name: 'MECE原则',
    category: 'math-engineering',
    coreInsight: '分析问题时将整体拆分为相互独立（Mutually Exclusive）、完全穷尽（Collectively Exhaustive）的子问题。交叉=冗余盲区，遗漏=决策盲区。每个问题只归属一个分支，所有分支覆盖全部可能。',
    applicableDecisionTypes: ['问题诊断', '任务拆解', '组织设计', '流程分析', '风险评估'],
    constraintPatterns: ['拆解', '分解', '分层', '结构化', '梳理', '归类', '分类', '层次', '维度', '不重不漏'],
    applicableRoles: ['策略规划', '问题分析', '任务拆解', '组织设计', '流程诊断'],
    limitations: ['MECE是理想状态——现实中完全互斥穷尽的拆解难以一次达成', '过度追求MECE可能导致分析瘫痪', '某些复杂系统具有涌现属性，不适用还原论拆解'],
  },
  {
    id: 'issue_tree',
    name: '逻辑树/议题树',
    category: 'math-engineering',
    coreInsight: '从核心问题出发，逐层问"要解决这个问题必须先解决哪些子问题"，直到每个叶节点足够具体可直接执行。逻辑树不是分类——它是因果链和依赖关系的可视化。',
    applicableDecisionTypes: ['问题诊断', '策略规划', '项目拆解', '根因分析'],
    constraintPatterns: ['核心问题', '根因', '依赖', '前提', '前置', '因果', '关键路径', '瓶颈', '阻塞'],
    applicableRoles: ['策略规划', '问题诊断', '根因分析', '项目拆解', '依赖分析'],
    limitations: ['逻辑树的质量取决于根问题的定义质量', '复杂系统的因果网络可能不是树而是图（存在循环依赖）', '过度拆解可能导致执行碎片化'],
  },
  {
    id: 'scqa_narrative',
    name: 'SCQA叙事框架',
    category: 'psychology',
    coreInsight: 'Situation-Complication-Question-Answer叙事结构，仅限Agent到人类输出使用，不用于Agent间通信。',
    applicableDecisionTypes: ["报告编写","人类沟通"],
    constraintPatterns: ["报告","方案呈现","沟通","汇报"],
    applicableRoles: ["报告者","沟通者"],
    limitations: ["仅对Agent到人类单向通讯有效","Agent间通信应使用结构化数据"],
  },
  {
    id: 'hypothesis_driven',
    name: '假设驱动',
    category: 'psychology',
    coreInsight: '从初始假设出发，用数据和追问验证或推翻，而非从空白开始收集所有信息。假设可以错，但不能没有——一个明确的假设即使被推翻，也比没有方向的全面信息收集更高效。',
    applicableDecisionTypes: ['问题诊断', '策略制定', '市场分析', '风险评估', '方案设计'],
    constraintPatterns: ['假设', '验证', '推测', '快速试错', 'MVP', '初步判断', '猜想', '测试', '实验'],
    applicableRoles: ['策略分析', '假设验证', '市场研究', '快速实验', '方案设计'],
    limitations: ['初始假设的质量取决于行业经验——新手可能被错误假设引导', '确认偏误会让人选择性寻找支持假设的证据', '某些高风险决策不适合"先假设再验证"的迭代方式'],
  },

  // ═══════════════════════════════════════════════════════
  // V1.5 新增：Synova 自身方法论教训注入的默认 Agent 基因
  // ═══════════════════════════════════════════════════════

  {
    id: 'no_decision_from_summary',
    name: '摘要不可决策原则',
    category: 'psychology',
    coreInsight: '不基于摘要、标题、片段信息或单指标做关键决策。标题不是内容，摘要不是全文，单指标不是全局。如果只能接触到不完整信息，标注局限性并追问完整上下文，不编造缺失的部分。这是 Synova 自身踩过的坑——基于论文摘要做了错误的技术裁定——转化而来的默认 Agent 基因。',
    applicableDecisionTypes: ['信息评估', '决策判断', '数据分析', '报告审阅', '市场判断'],
    constraintPatterns: ['决策', '信息', '数据', '报告', '摘要', '完整', '来源', '验证', '核实', '上下文'],
    applicableRoles: [],
    limitations: ['某些时效性极强的决策无法等待完整信息', '要求完整信息可能导致分析瘫痪', '"完整"本身是相对的——关键是知道自己有什么、缺什么'],
  },

  // ─── V2.0 科技/互联网方法论（15）───
  {
    id: 'agile_scrum', name: '敏捷 Scrum', category: 'math-engineering',
    coreInsight: '通过短周期迭代、每日站会和回顾机制，在不确定性中快速交付价值。自组织团队比外部指挥更能产生高质量成果。',
    applicableDecisionTypes: ['团队规模', '协作模式', '迭代规划'],
    constraintPatterns: ['敏捷', '迭代', '快速交付', 'Scrum', 'Sprint', '站会'],
    applicableRoles: ['ScrumMaster', 'ProductOwner', '敏捷教练'],
    limitations: ['需要团队自组织能力', '大规模需要扩展框架', '固定价格合同适配性差'],
  },
  {
    id: 'kanban', name: '看板方法', category: 'math-engineering',
    coreInsight: '可视化工作流、限制在制品、让瓶颈自己暴露出来。不改变现有角色，只改变工作方式。',
    applicableDecisionTypes: ['流程优化', '产能规划', '瓶颈识别'],
    constraintPatterns: ['看板', 'WIP', '在制品', '流动', '可视化', '瓶颈'],
    applicableRoles: ['流程经理', '运营协调', '看板管理员'],
    limitations: ['不适合固定时间承诺的场景', '对管理层要求放权意识', 'WIP限制需要纪律执行'],
  },
  {
    id: 'lean_startup', name: '精益创业', category: 'math-engineering',
    coreInsight: '创业是寻找可重复可规模化的商业模式。构建-测量-学习反馈循环是最小化浪费的核心机制。',
    applicableDecisionTypes: ['产品验证', '市场进入', '资源分配'],
    constraintPatterns: ['创业', 'MVP', '验证', 'PMF', '产品市场匹配', '精益'],
    applicableRoles: ['创始人', '产品经理', '增长负责人'],
    limitations: ['快速迭代可能忽视长期战略', '不是所有行业都支持快速实验', 'MVP的"最小"尺度判断依赖经验'],
  },
  {
    id: 'design_thinking', name: '设计思维', category: 'psychology',
    coreInsight: '以人为中心的创新方法论。共情→定义→创想→原型→测试，五阶段非线性迭代。',
    applicableDecisionTypes: ['产品设计', '用户体验', '创新策略'],
    constraintPatterns: ['设计', '创新', '用户体验', '以用户为中心', '共情', '原型'],
    applicableRoles: ['用户体验研究员', '交互设计师', '创新教练'],
    limitations: ['耗时长不适合紧急问题', '对组织文化有要求', '过度依赖共情导致样本偏差'],
  },
  {
    id: 'devops_sre', name: 'DevOps 与 SRE', category: 'math-engineering',
    coreInsight: '通过自动化、监控和SLO消除开发与运维之间的壁垒。错误预算在速度与稳定性之间建立量化决策框架。',
    applicableDecisionTypes: ['技术架构', '运维策略', '容量规划'],
    constraintPatterns: ['DevOps', '运维', '自动化', 'SLO', 'SRE', '可靠性'],
    applicableRoles: ['DevOps工程师', 'SRE', '平台工程师'],
    limitations: ['需要较强的工程文化', '错误预算需要管理层理解', '小团队可能无法负担专职SRE'],
  },
  {
    id: 'team_topologies', name: 'Team Topologies', category: 'math-engineering',
    coreInsight: '四种基本团队拓扑：流对齐、赋能、平台、复杂子系统。团队交互模式三选一：协作、X-as-a-Service、促进。',
    applicableDecisionTypes: ['组织设计', '团队边界', '平台策略'],
    constraintPatterns: ['TeamTopologies', '团队拓扑', '流对齐', '赋能团队', '平台团队', '认知负载'],
    applicableRoles: ['流对齐团队成员', '平台工程师', '赋能教练'],
    limitations: ['从传统组织转型需要时间', '认知负载测量缺乏标准工具', '平台团队容易被当作共享服务滥用'],
  },
  {
    id: 'domain_driven_design', name: '领域驱动设计', category: 'math-engineering',
    coreInsight: '复杂软件设计应围绕业务领域建模。限界上下文是微服务拆分的核心依据。',
    applicableDecisionTypes: ['软件架构', '服务拆分', '业务建模'],
    constraintPatterns: ['DDD', '领域驱动', '限界上下文', '事件风暴', '通用语言'],
    applicableRoles: ['领域架构师', '技术负责人', '业务分析师'],
    limitations: ['学习曲线陡峭', '过度建模风险', '需要领域专家深度参与'],
  },
  {
    id: 'open_collaboration', name: '内部开放协作', category: 'law-governance',
    coreInsight: '将开源社区方法论（开放访问、PR式贡献、治理委员会）应用于共享知识库。Agent 对共享知识的修改应通过可追溯的提议-审查-合并流程，而非直接覆写。',
    applicableDecisionTypes: ['代码共享', '跨团队协作', '知识管理'],
    constraintPatterns: ['开放协作', 'PR', '知识共享', '跨团队贡献', '审查', '合并'],
    applicableRoles: ['知识库维护者', '贡献审查者', '治理委员'],
    limitations: ['贡献者激励不易设计', '安全合规审查需要额外流程'],
  },

  {
    id: 'context_over_control', name: '上下文驱动', category: 'psychology',
    coreInsight: '给 Agent 充分的信息上下文，而不是用细粒度流程指令控制其行为。充分 Context + 明确目标 → Agent 自主找到最优路径。流程控制应在输入和输出边界上设置，而非干预中间推理。',
    applicableDecisionTypes: ['管理方式', '信息共享', '决策授权'],
    constraintPatterns: ['Context', '充分信息', '放权', '自主', '上下文', '信息透明', '信任'],
    applicableRoles: ['团队设计', '信息架构', '系统提示设计'],
    limitations: ['Context的"充分"标准很难精确度量', '过度信息可能稀释关键信号', '放权和失控之间需要边界设计'],
  },
  // ─── V2.0 制造业/专业服务/DAO/反模式 ───
  {
    id: 'toyota_lean', name: '丰田精益生产', category: 'math-engineering',
    coreInsight: '丰田生产体系的两大支柱：准时化（JIT）和自働化。持续改善是底层文化。',
    applicableDecisionTypes: ['生产管理', '库存策略', '质量改进'],
    constraintPatterns: ['丰田', '精益', 'TPS', 'JIT', '准时化', 'Kaizen'],
    applicableRoles: ['精益经理', '生产主管', '质量工程师'],
    limitations: ['精益转型需要3-5年文化改变', 'JIT在供应链波动大时脆弱'],
  },
  {
    id: 'six_sigma', name: '六西格玛', category: 'math-engineering',
    coreInsight: 'DMAIC流程改进方法论。用数据和统计分析替代直觉做决策。目标是将缺陷率降低到3.4/百万。',
    applicableDecisionTypes: ['质量改进', '流程优化', '缺陷减少'],
    constraintPatterns: ['六西格玛', 'DMAIC', '质量', '黑带', '统计分析'],
    applicableRoles: ['六西格玛黑带', '质量经理', '流程改进工程师'],
    limitations: ['DMAIC周期长不适合快速变化场景', '过度强调数据忽略质化因素'],
  },
  {
    id: 'mckinsey_7s', name: '麦肯锡 7S 模型', category: 'psychology',
    coreInsight: '组织成功的七个要素：战略、结构、系统、共同价值观、风格、人员、技能。共同价值观是中心。',
    applicableDecisionTypes: ['组织诊断', '变革管理', '战略对齐'],
    constraintPatterns: ['7S', '麦肯锡', '组织诊断', '战略对齐', '变革'],
    applicableRoles: ['组织发展顾问', '战略顾问', 'HRBP'],
    limitations: ['7S是诊断框架不是行动方案', '要素之间没有优先级'],
  },
  {
    id: 'apache_way', name: 'Apache 之道', category: 'law-governance',
    coreInsight: '精英治理——影响力取决于贡献质量而非头衔；社区优于代码；共识决策。',
    applicableDecisionTypes: ['开源治理', '社区管理', '贡献者激励'],
    constraintPatterns: ['Apache', '开源', '精英治理', '共识', '社区'],
    applicableRoles: ['社区经理', 'PMC成员', '提交者'],
    limitations: ['精英治理可能演化出新的贵族阶层', '共识决策在紧急情况下效率低'],
  },
  {
    id: 'ethereum_dao', name: '以太坊 DAO', category: 'law-governance',
    coreInsight: '智能合约实现去中心化自治组织。提案→投票→执行全流程自动化。',
    applicableDecisionTypes: ['DAO治理', '投票机制', '去中心化决策'],
    constraintPatterns: ['以太坊', 'DAO', '智能合约', 'Token', '治理', '投票'],
    applicableRoles: ['DAO治理官', '协议设计师', '社区协调员'],
    limitations: ['投票参与率低于10%', '大户容易形成寡头治理', '智能合约漏洞可能导致攻击'],
  },
  {
    id: 'homogeneous_decision_risk', name: '同质化决策风险', category: 'psychology',
    coreInsight: '同质化 Agent 群体收敛到错误共识的速度比异质化群体更快。当多个 Agent 共享相同模型/训练数据/提示模式时，它们的一致性不是"验证"而是"同义反复"。多样性不仅是公平问题——是决策安全的基础设施。',
    applicableDecisionTypes: ['团队决策', '风险评估', '战略规划'],
    constraintPatterns: ['同质化', '共识', '多样性', '从众', '异议', '收敛', '不同模型', '独立判断'],
    applicableRoles: ['决策分析师', '多样性检查', '团队设计', '风险评估'],
    limitations: ['异质化群体决策速度较慢', '适度的同质化是效率的来源'],
  },
  {
    id: 'goodhart_law', name: '古德哈特定律', category: 'economics',
    coreInsight: '当一个指标变成目标时就不再是好指标。人们会让数字好看但不让实际变好。',
    applicableDecisionTypes: ['绩效考核', '指标体系', '激励机制'],
    constraintPatterns: ['古德哈特', '指标扭曲', 'KPI', '考核', '激励博弈'],
    applicableRoles: ['绩效经理', '数据分析师', 'HRBP'],
    limitations: ['不是所有指标都会被玩弄', '完全不用指标回到主观评价', '多指标组合可降低风险'],
  },
];

/** 获取框架库的默认实例 */
export function getFrameworkLibrary(): Framework[] {
  return SEED_FRAMEWORKS;
}

/** 按框架ID获取其类别（用于角色-类别权重匹配） */
export function getCategoryForFrameworkId(id: string): Framework['category'] | undefined {
  return SEED_FRAMEWORKS.find(f => f.id === id)?.category;
}
