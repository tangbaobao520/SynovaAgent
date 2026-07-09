/**
 * interview/signal-extractor.ts — 访谈信号确定性提取器 (T11 无数据诊断)
 *
 * 契约ID: T11-SIGNAL-EXTRACTOR-v1
 * 模块: interview (L2)
 * 消费方: POST /api/diagnosis/upload/interview → expert-dispatcher
 *
 * 约束2: 三个提取规则(R1/R2/R3)全部是确定性逻辑——if/else + 关键词匹配。
 * 零 LLM 自由发挥。输入结构化，输出结构化，中间过程可测试。
 *
 * R1: 跨角色矛盾检测 — 复用 engine.ts 的 detectContradictions()
 * R2: 痛觉点映射 — 关键词→诊断维度的硬编码映射表
 * R3: 必须性得分 — CEO vs 一线信息衰减检测
 */

import type { RoleResponse, Contradiction } from './engine';
import { detectContradictions } from './engine';
import { INTERVIEW_ROLES } from './roles';
import type { CausalSignal, ExtractedSignals } from './signals';
import { createLogger } from '@synova/logger';

const log = createLogger('interview/signal-extractor');

// ═══ R2: 痛觉点关键词映射表 (硬编码, 确定性) ═══

const PAIN_KEYWORD_MAP: Array<{
  keywords: string[];
  dimension: string;
  signalType: string;
  description: string;
}> = [
  // 信息/沟通类
  { keywords: ['审批太慢', '审批流程', '层层审批', '审批太多', '签了N个人'],
    dimension: 'decision_concentration', signalType: 'bureaucracy', description: '审批链条过长', },
  { keywords: ['不知道公司在做什么', '不知道方向', '目标不清楚', '不知道在忙什么', '战略', '没有方向'],
    dimension: 'signal_transmits', signalType: 'info_loss', description: '战略信息传递衰减', },
  { keywords: ['互相不知道', '信息不通', '沟通不畅', '信息孤岛', '不知道别人在干什么'],
    dimension: 'signal_transmits', signalType: 'info_silo', description: '跨部门信息孤岛', },
  { keywords: ['老板不知道', 'CEO不知道', '上面不知道', '决策层不知道', '领导不知道'],
    dimension: 'signal_transmits', signalType: 'ceo_awareness_gap', description: '决策层信息盲区', },

  // 激励/考核类
  { keywords: ['KPI不合理', 'KPI有问题', '考核不合理', '指标不对', '绩效有问题'],
    dimension: 'incentive_binds', signalType: 'misaligned_kpi', description: 'KPI与目标脱节', },
  { keywords: ['做了不算', '做好了没奖励', '做差了没惩罚', '大锅饭', '平均主义'],
    dimension: 'incentive_binds', signalType: 'incentive_gap', description: '激励机制缺失', },

  // 市场/客户类
  { keywords: ['客户越来越少', '客户流失', '丢客户', '客户不续约', '客户跑了'],
    dimension: 'substitutes', signalType: 'customer_loss', description: '客户流失加速', },
  { keywords: ['价格战', '比价格', '拼价格', '低价竞争', '杀价'],
    dimension: 'market_shift', signalType: 'price_war', description: '市场价格竞争恶化', },
  { keywords: ['竞争太激烈', '对手越来越', '新对手', '被抄袭', '同质化'],
    dimension: 'market_shift', signalType: 'competition_intensity', description: '市场竞争加剧', },
  { keywords: ['市场饱和', '增长不动', '天花板', '没空间了', '存量市场'],
    dimension: 'market_shift', signalType: 'market_maturity', description: '市场趋于饱和', },

  // 资源类
  { keywords: ['缺人', '招不到人', '人手不够', '人力不足', '没人做'],
    dimension: 'resource_allocation', signalType: 'talent_gap', description: '人才资源紧缺', },
  { keywords: ['预算不够', '没钱', '缺钱', '资金紧张', '费用不足'],
    dimension: 'resource_allocation', signalType: 'budget_shortfall', description: '预算资源不足', },
  { keywords: ['资源不够', '分配不均', '资源都在', '我们部门没资源', '抢资源'],
    dimension: 'resource_allocation', signalType: 'resource_inequity', description: '资源分配不均衡', },

  // 流程效率类
  { keywords: ['流程太乱', '流程复杂', '流程不清晰', '不知道流程', '流程缺失'],
    dimension: 'process_efficiency', signalType: 'process_disorder', description: '流程混乱或缺失', },
  { keywords: ['开会太多', '天天开会', '会议太多', '一天都在开会', '无效会议'],
    dimension: 'process_efficiency', signalType: 'meeting_overload', description: '会议过多挤占执行时间', },
  { keywords: ['重复劳动', '做两遍', '重复造', '又要重做', '返工'],
    dimension: 'process_efficiency', signalType: 'redundant_work', description: '重复劳动导致效率低下', },

  // 技术类
  { keywords: ['系统卡', '工具不好用', '系统难用', '技术落后', '系统太老'],
    dimension: 'tech_debt', signalType: 'tool_pain', description: '工具或系统严重拖累效率', },
  { keywords: ['改一个地方', '耦合', '牵一发动全身', '不敢改', '遗留系统'],
    dimension: 'tech_debt', signalType: 'legacy_burden', description: '技术债导致系统脆弱', },

  // 战略/目标类
  { keywords: ['方向不明确', '战略模糊', '目标不清', '不知道重点', '优先级混乱'],
    dimension: 'goal_alignment', signalType: 'strategy_ambiguity', description: '战略方向不清晰', },
  { keywords: ['变了又变', '方向一直在变', '策略反复', '推倒重来', '朝令夕改'],
    dimension: 'goal_alignment', signalType: 'strategy_instability', description: '战略方向频繁变动', },

  // 组织/文化类
  { keywords: ['人才流失', '离职率高', '留不住人', '人都走了', '想走'],
    dimension: 'turnover', signalType: 'talent_drain', description: '核心人才流失', },
  { keywords: ['躺平', '摸鱼', '没干劲', '士气低', '消极', '摆烂'],
    dimension: 'culture', signalType: 'low_morale', description: '团队士气低落', },
  { keywords: ['部门墙', '各部门各自为政', '互相推诿', '不配合', '扯皮'],
    dimension: 'org_structure', signalType: 'org_silo', description: '部门墙阻碍协作', },
  { keywords: ['层级太多', '汇报线长', '中间层', '上传下达', '层层汇报'],
    dimension: 'org_structure', signalType: 'org_layer_excess', description: '组织层级过多', },

  // 风险类
  { keywords: ['现金流', '发不出', '工资快发不', '账上没钱', '回款慢'],
    dimension: 'cashflow_health', signalType: 'cashflow_crisis', description: '现金流紧张', },
  { keywords: ['合规风险', '监管', '被罚', '法律风险', '合同风险'],
    dimension: 'risk_assessment', signalType: 'compliance_risk', description: '合规或监管风险', },

  // 客户/产品类
  { keywords: ['用户反馈', '用户投诉', '客户说', '用户不满意', '投诉很多'],
    dimension: 'user_feedback', signalType: 'user_complaint', description: '用户负面反馈集中', },
  { keywords: ['迭代慢', '上线慢', '交付太慢', '周期太长', '效率太低'],
    dimension: 'iteration_speed', signalType: 'slow_delivery', description: '产品交付周期过长', },
];

/**
 * 从回答文本中匹配痛觉点关键词，返回匹配的信号列表。
 * R2 确定性规则：关键词匹配 → 维度映射。
 */
function extractPainSignals(
  answers: Array<{ roleId: string; answer: string }>,
): CausalSignal[] {
  const signals: CausalSignal[] = [];
  const seen = new Set<string>();

  for (const { roleId, answer } of answers) {
    for (const mapping of PAIN_KEYWORD_MAP) {
      const matched = mapping.keywords.some(kw => answer.includes(kw));
      if (!matched) continue;

      // dedup: same dimension+role only once
      const key = `${roleId}:${mapping.dimension}`;
      if (seen.has(key)) continue;
      seen.add(key);

      signals.push({
        id: `pain_${signals.length + 1}`,
        dimension: mapping.dimension,
        sourceRole: roleId,
        sourceAnswer: answer.slice(0, 120),
        signalStrength: 'moderate',
        evidenceType: 'pattern',
        description: `${mapping.description}（${roleId}提及）`,
        suggestedEdge: mapping.dimension,
      });
    }
  }

  return signals;
}

/**
 * R3: 必须性得分 — CEO vs 一线的信息衰减检测
 *
 * 检测逻辑：
 * 1. 找 CEO 的 A3 回答（信息传递方式）
 * 2. 找一线角色的 A3 回答（信息传递方式）
 * 3. 如果一线描述的具体问题/例子在 CEO 回答中未被提及
 *    → 信息衰减信号
 */
function extractNecessitySignals(
  responses: RoleResponse[],
): CausalSignal[] {
  const signals: CausalSignal[] = [];

  // 按角色分组找 A3 题（通用锚题 Q3: "公司里谁最清楚业务真相？信息怎么传到决策层？"）
  const ceoResponse = responses.find(r => r.roleId === 'ceo' && r.questionIndex === 2); // index 2 = 第三个通用题
  const frontlineResponses = responses.filter(r => {
    const role = INTERVIEW_ROLES.find(ir => ir.id === r.roleId);
    return (role?.level === 'frontline' || r.roleId === 'manager') && r.questionIndex === 2;
  });

  if (!ceoResponse || frontlineResponses.length < 1) {
    return signals; // 无足够数据，返回空
  }

  const ceoLedKeywords = ['我知道', '我清楚', '了解', '透明', '畅通', '及时', '很清楚', '都知道'];
  const ceoKnows = ceoLedKeywords.some(kw => ceoResponse.answer.includes(kw));

  // 一线回答中CEO可能不知道的具体问题
  const frontlineIssueKeywords = ['不知道', '不透明', '瞒报', '不敢说', '报喜不报忧', '隐瞒', '过滤'];
  const frontlineHasIssues = frontlineResponses.some(r =>
    frontlineIssueKeywords.some(kw => r.answer.includes(kw)),
  );

  // 信息质量关键词（一线是否认为信息失真）
  const frontlineDistortionKeywords = ['过滤', '加工', '美化了', '不敢报', '选择性的', '只报好的'];
  const frontlineDistortion = frontlineResponses.some(r =>
    frontlineDistortionKeywords.some(kw => r.answer.includes(kw)),
  );

  if (ceoKnows && frontlineHasIssues) {
    // CEO认为信息透明，一线认为不透明 → 信息衰减严重
    const frontlineRoleNames = frontlineResponses.map(r => r.roleId).join('、');
    signals.push({
      id: 'necessity_1',
      dimension: 'signal_transmits',
      sourceRole: 'ceo',
      sourceAnswer: ceoResponse.answer.slice(0, 120),
      signalStrength: 'strong',
      evidenceType: 'contradiction',
      description: `CEO认为信息传递畅通，但${frontlineRoleNames}反映信息传递有问题——认知偏差显著`,
      suggestedEdge: 'signal_transmits',
    });
  }

  if (frontlineDistortion) {
    signals.push({
      id: 'necessity_2',
      dimension: 'signal_transmits',
      sourceRole: frontlineResponses[0].roleId,
      sourceAnswer: frontlineResponses[0].answer.slice(0, 120),
      signalStrength: frontlineDistortion ? 'strong' : 'moderate',
      evidenceType: 'direct',
      description: '一线反馈信息在传递过程中被过滤/美化的具体证据',
      suggestedEdge: 'signal_transmits',
    });
  }

  // 检查是否没有矛盾（双方一致 → 低严重度，但也记录）
  if (!ceoKnows && frontlineHasIssues) {
    signals.push({
      id: 'necessity_3',
      dimension: 'signal_transmits',
      sourceRole: 'ceo',
      sourceAnswer: ceoResponse.answer.slice(0, 120),
      signalStrength: 'moderate',
      evidenceType: 'direct',
      description: 'CEO和一线的回答一致指出信息传递存在问题',
      suggestedEdge: 'signal_transmits',
    });
  }

  return signals;
}

/**
 * 通用锚题提问索引定义 — QUESTION_INDEX 用于 R3 定位特定题目的回答
 */
const ANCHOR_QUESTION_INDICES = {
  A1: 0, // "公司最大的问题"
  A2: 1, // "岗位匹配度"
  A3: 2, // "信息传递方式"
  A4: 3, // "如果能改一件事"
} as const;

/**
 * 主入口：从多角色访谈回答中提取因果信号。
 *
 * @param responses - 多角色访谈回答（来自 interview/engine.ts）
 * @param roleIds - 参与访谈的角色 ID 列表
 * @returns 结构化信号输出
 */
export function extractSignals(
  responses: RoleResponse[],
  roleIds: string[],
): ExtractedSignals {
  const warnings: string[] = [];
  const allSignals: CausalSignal[] = [];

  // 降级条件：访谈角色不足 3 个
  const uniqueRoles = new Set(roleIds);
  if (uniqueRoles.size < 3) {
    log.warn({ roleCount: uniqueRoles.size }, '访谈角色数不足3 —— 信号提取置信度低');
    warnings.push(`访谈角色数不足(${uniqueRoles.size}<3)，信号提取置信度低`);
  }

  // ═══ R1: 跨角色矛盾检测 (复用 engine.ts) ═══
  log.debug({ responseCount: responses.length }, 'R1: 启动跨角色矛盾检测');
  const contradictions: Contradiction[] = detectContradictions(responses);

  // 矛盾 → 信号转换
  for (const c of contradictions) {
    const roleA = c.responses[0].roleId;
    const roleB = c.responses[1].roleId;
    allSignals.push({
      id: `r1_contradiction_${allSignals.length + 1}`,
      dimension: c.dimension,
      sourceRole: roleA,
      sourceAnswer: c.responses[0].answer.slice(0, 120),
      signalStrength: c.differenceScore >= 0.6 ? 'strong' as const : 'moderate' as const,
      evidenceType: 'contradiction',
      description: c.description,
    });
  }

  // ═══ R2: 痛觉点映射 (关键词 → 维度) ═══
  log.debug('R2: 启动痛觉点映射');
  // 收集通用锚题 A4（如果能改一件事）和其他开放题的回答
  const painAnswers = responses
    .filter(r => r.questionIndex === ANCHOR_QUESTION_INDICES.A4) // A4: 如果能改一件事
    .map(r => ({ roleId: r.roleId, answer: r.answer }));

  // 也收集 A1（最大问题）的回答
  const a1Answers = responses
    .filter(r => r.questionIndex === ANCHOR_QUESTION_INDICES.A1)
    .map(r => ({ roleId: r.roleId, answer: r.answer }));

  const painSignals = extractPainSignals([...painAnswers, ...a1Answers]);
  allSignals.push(...painSignals);

  // ═══ R3: 必须性得分 (CEO最后一个知道检测) ═══
  log.debug('R3: 启动必须性得分检测');
  const necessitySignals = extractNecessitySignals(responses);
  allSignals.push(...necessitySignals);

  // ═══ 盲区检测 ═══
  const BLIND_SPOT_DIMENSIONS = [
    'goal_alignment', 'strategy_clarity', 'resource_allocation',
    'risk_assessment', 'org_structure', 'process_efficiency', 'culture',
  ];
  // RoleDimensionStrategy 的中文维度名 → 英文维度键
  const DIMENSION_KEY_MAP: Record<string, string> = {
    '目标对齐度': 'goal_alignment',
    '战略清晰度': 'strategy_clarity',
    '资源分配': 'resource_allocation',
    '风险评估': 'risk_assessment',
    '组织架构': 'org_structure',
    '流程效率': 'process_efficiency',
    '文化氛围': 'culture',
  };

  const coveredDimensions = new Set(allSignals.map(s => s.dimension));
  // 也检查 contradiction dimension (格式如 "q_0")
  const contradictionDims = contradictions.map(c => {
    // "q_X" 格式 → 提取题号, 但在盲区检测中用不上
    return c.dimension;
  });

  const blindSpots = BLIND_SPOT_DIMENSIONS.filter(
    dim => !coveredDimensions.has(dim) && !contradictionDims.some(cd => cd === dim),
  );

  const degraded = uniqueRoles.size < 3;

  log.info({
    signalCount: allSignals.length,
    contradictionCount: contradictions.length,
    blindSpotCount: blindSpots.length,
    degraded,
  }, '信号提取完成');

  return {
    signals: allSignals,
    contradictions,
    blindSpots,
    degraded,
    warnings,
  };
}
