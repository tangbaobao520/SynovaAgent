/**
 * diagnosis/auto-action.ts — FDE 自动行动引擎
 *
 * 将 FDE 的"解读→判断→开任务"编码为两阶段生成：
 *   1. 规则匹配（< 100ms）：预定义规则映射 "诊断发现 → 行动建议"
 *   2. LLM 补充（并行 3 路）：对规则未覆盖的异常发现做 LLM 推理
 *
 * 设计原则：
 *   1. 规则先行（确定性、低成本），LLM 补充（覆盖边界情况）
 *   2. 去重：基于 title Jaccard 相似度 > 0.7 合并
 *   3. 独立失败：规则失败不影响 LLM，LLM 失败不影响规则
 */

import type {
  FullDiagnosisV2,
  ImprovementActionItem,
  ActionPlan,
  MultiRoleNarrative,
} from './types';
import { createLogger } from '../../infra/logger';

const log = createLogger('engine-server/pipeline/diagnosis/auto-action');

// ====================================================================
// Action Rule type
// ====================================================================

interface ActionRule {
  /** 规则名称（用于日志） */
  name: string;
  /** 检查条件：返回 true 触发 */
  condition: (diag: FullDiagnosisV2) => boolean;
  /** 生成 action item（不包含 id/createdAt，由调用方填充） */
  generate: (diag: FullDiagnosisV2) => Omit<ImprovementActionItem, 'id' | 'createdAt'>;
}

// ====================================================================
// Rule definitions — 20+ rules mapping diagnosis findings to actions
// ====================================================================

const ACTION_RULES: ActionRule[] = [
  // ── Trust / Incentive ──
  {
    name: 'trust-sticky',
    condition: (d) => {
      const sticky = d.dynamics?.stickyDimensions?.find(s => s.dimension === 'trust_incentive');
      return !!(sticky && sticky.stickinessScore > 0.7 && sticky.monthsUnchanged >= 6);
    },
    generate: () => ({
      sourceModule: 'dynamics',
      sourceDimension: 'trust_incentive',
      title: '团队信任机制长期僵化，建议引入轮值决策实验',
      description: `信任维度已 ${6}+ 个月未发生显著变化（粘性得分 > 0.7）。长期不变的信任模式可能导致团队适应性下降。建议在非关键决策中引入轮值决策人机制，观察 4-6 周后重新评估。`,
      targetSystem: 'manual',
      priority: 'high',
      estimatedEffortHours: 8,
      status: 'pending',
      suggestion: '选择一个低风险项目，试点轮值决策人。4 周后用引擎重新诊断，对比信任维度变化。',
    }),
  },
  {
    name: 'trust-health-low',
    condition: (d) => {
      const htm = d.htm;
      return !!(htm && htm.trustHealthScore < 0.5);
    },
    generate: (d) => ({
      sourceModule: 'htm',
      sourceDimension: 'trust_incentive',
      title: '混合信任健康度偏低，建议建立信任校准机制',
      description: `当前信任健康度 ${((d.htm?.trustHealthScore ?? 0) * 100).toFixed(0)}%，低于 50% 阈值。人对 Agent 的修正率或 Agent 间的不信任可能影响协作效率。`,
      targetSystem: 'manual',
      priority: 'high',
      estimatedEffortHours: 12,
      status: 'pending',
      suggestion: '审查最近的 HITL 修正事件，识别高频修正场景。为这些场景建立自动化规则，减少人工介入。',
    }),
  },
  {
    name: 'single-point-risk',
    condition: (d) => !!(d.htm?.singlePointRisks?.some(r => r.risk === 'critical')),
    generate: (d) => {
      const criticalRisks = d.htm?.singlePointRisks?.filter(r => r.risk === 'critical') ?? [];
      const names = criticalRisks.map(r => r.agentId).join('、');
      return {
        sourceModule: 'htm',
        sourceDimension: 'trust_incentive',
        title: `检测到关键单点依赖风险：${names}`,
        description: `Agent ${names} 承担了过多路由依赖，一旦失效将影响整体协作网络。建议为这些 Agent 建立冗余路由或知识备份。`,
        targetSystem: 'jira',
        priority: 'critical',
        estimatedEffortHours: 16,
        status: 'pending',
        suggestion: `为 ${names} 各自指定一个备份 Agent，完成知识蒸馏和路由过渡。`,
      };
    },
  },

  // ── Information Flow ──
  {
    name: 'info-flow-star',
    condition: (d) => {
      const infoFlow = d.gaps.gaps['information_flow'];
      return !!(infoFlow && infoFlow.mode === 'star' && infoFlow.engineScore < 0.4);
    },
    generate: () => ({
      sourceModule: 'gaps',
      sourceDimension: 'information_flow',
      title: '信息流过度集中（星型拓扑），建议向网状拓扑过渡',
      description: '团队信息流采用星型拓扑，中心节点成为瓶颈。信息必须经过中心节点转发，导致延迟增加和单点故障风险。',
      targetSystem: 'jira',
      priority: 'high',
      estimatedEffortHours: 20,
      status: 'pending',
      suggestion: '识别 2-3 条高频信息路径，试点对等直连。监控信息延迟和错误率变化。',
    }),
  },
  {
    name: 'ipu-high',
    condition: (d) => !!(d.ipu && d.ipu.overloadScore > 0.7),
    generate: (d) => ({
      sourceModule: 'ipu',
      sourceDimension: 'information_flow',
      title: `信息过载得分 ${((d.ipu?.overloadScore ?? 0) * 100).toFixed(0)}%，${d.ipu?.bottleneckAgent ? `瓶颈 Agent: ${d.ipu.bottleneckAgent}` : '建议分流'}`,
      description: `信息处理过载严重。队列深度 ${d.ipu?.queueDepth ?? '?'}/10，死锁率 ${((d.ipu?.deadlockRate ?? 0) * 100).toFixed(1)}%。${d.ipu?.recommendation ?? ''}`,
      targetSystem: 'jira',
      priority: 'critical',
      estimatedEffortHours: 24,
      status: 'pending',
      suggestion: '立即审查瓶颈 Agent 的路由规则，增加并行处理通道或限流策略。',
    }),
  },
  {
    name: 'hona-fragmented',
    condition: (d) => !!(d.hona && d.hona.structure === 'fragmented'),
    generate: (d) => ({
      sourceModule: 'hona',
      sourceDimension: 'information_flow',
      title: `Agent 网络碎片化（${d.hona?.isolatedCount ?? 0} 个孤立节点），建议建立桥接路由`,
      description: `网络密度 ${((d.hona?.density ?? 0) * 100).toFixed(1)}%，存在 ${d.hona?.isolatedCount ?? 0} 个孤立节点。碎片化网络导致信息孤岛和重复工作。`,
      targetSystem: 'jira',
      priority: 'high',
      estimatedEffortHours: 12,
      status: 'pending',
      suggestion: '为孤立节点建立定期同步路由，考虑增加 bridge 角色 Agent 连接碎片子网。',
    }),
  },

  // ── Authority / Governance ──
  {
    name: 'authority-weak',
    condition: (d) => {
      const auth = d.gaps.gaps['authority_governance'];
      return !!(auth && auth.engineScore < 0.35);
    },
    generate: () => ({
      sourceModule: 'gaps',
      sourceDimension: 'authority_governance',
      title: '权限治理偏弱，建议明确决策权限矩阵',
      description: '权限治理维度得分 < 35%，可能存在决策权模糊或审批瓶颈。建议建立 RACI 矩阵明确各角色决策边界。',
      targetSystem: 'manual',
      priority: 'high',
      estimatedEffortHours: 6,
      status: 'pending',
      suggestion: '召集团队定义关键决策类型的 RACI（负责人/审批人/咨询人/知情者），录入引擎 Blueprint。',
    }),
  },
  {
    name: 'eob-zombie',
    condition: (d) => !!(d.eob && d.eob.zombiePermissions.length > 0),
    generate: (d) => ({
      sourceModule: 'eob',
      sourceDimension: 'authority_governance',
      title: `检测到 ${d.eob?.zombiePermissions.length ?? 0} 个僵尸权限，建议清理`,
      description: `以下权限已长期未使用但仍保留：${d.eob?.zombiePermissions.join('、')}。僵尸权限增加安全攻击面。`,
      targetSystem: 'jira',
      priority: 'medium',
      estimatedEffortHours: 4,
      status: 'pending',
      suggestion: '逐项确认权限是否仍需保留，清理不再需要的权限。设置权限自动过期策略。',
    }),
  },

  // ── Division of Labor ──
  {
    name: 'labor-blur',
    condition: (d) => {
      const labor = d.gaps.gaps['division_of_labor'];
      return !!(labor && labor.confidence === 'low');
    },
    generate: () => ({
      sourceModule: 'gaps',
      sourceDimension: 'division_of_labor',
      title: '分工边界模糊（置信度 low），建议明确角色职责文档',
      description: '引擎对分工模式的置信度较低，说明团队角色边界不够清晰。模糊的分工导致重复工作和责任推诿。',
      targetSystem: 'manual',
      priority: 'medium',
      estimatedEffortHours: 8,
      status: 'pending',
      suggestion: '为每个角色编写一页职责说明（输入/输出/不负责事项），存入 SOUL.md。',
    }),
  },
  {
    name: 'capability-gap',
    condition: (d) => !!(d.capabilitySpectrum && d.capabilitySpectrum.gapCount > 2),
    generate: (d) => ({
      sourceModule: 'capability-spectrum',
      sourceDimension: 'division_of_labor',
      title: `组织能力存在 ${d.capabilitySpectrum?.gapCount ?? 0} 个缺口，建议补充或外包`,
      description: `能力整体覆盖度 ${((d.capabilitySpectrum?.overallCoverage ?? 0) * 100).toFixed(0)}%。缺失能力：${d.capabilitySpectrum?.dimensions?.filter(dim => dim.missingLabels.length > 0).flatMap(dim => dim.missingLabels).join('、')}`,
      targetSystem: 'jira',
      priority: 'high',
      estimatedEffortHours: 24,
      status: 'pending',
      suggestion: '优先填补覆盖度为 0 的能力维度，考虑外包或招聘。对部分覆盖的能力建立培训计划。',
    }),
  },

  // ── Knowledge Sharing ──
  {
    name: 'knowledge-low-confidence',
    condition: (d) => {
      const ks = d.gaps.gaps['knowledge_sharing'];
      return !!(ks && ks.confidence === 'low');
    },
    generate: () => ({
      sourceModule: 'gaps',
      sourceDimension: 'knowledge_sharing',
      title: '知识共享模式不确定，建议建立知识沉淀机制',
      description: '引擎对知识共享的置信度较低，可能团队缺乏系统化的知识管理。隐性知识集中在个人手中。',
      targetSystem: 'manual',
      priority: 'medium',
      estimatedEffortHours: 10,
      status: 'pending',
      suggestion: '建立每周知识蒸馏会议，将关键决策和教训写入团队共享文档。启用引擎知识注入功能。',
    }),
  },

  // ── External Interface ──
  {
    name: 'external-risk',
    condition: (d) => !!(d.capabilitySpectrum && d.capabilitySpectrum.externalInterfaceRisk),
    generate: () => ({
      sourceModule: 'capability-spectrum',
      sourceDimension: 'external_interface',
      title: '外部接口能力存在风险，建议建立对外交付 SOP',
      description: '能力谱系检测到与外部接口维度的联动风险。团队可能缺乏标准化的对外交付流程。',
      targetSystem: 'manual',
      priority: 'medium',
      estimatedEffortHours: 12,
      status: 'pending',
      suggestion: '制定对外交付检查清单（安全审查/文档/回滚方案），每次对外发布前强制执行。',
    }),
  },

  // ── Self-Awareness ──
  {
    name: 'self-awareness-gap',
    condition: (d) => d.selfAwareness.overallGap > 0.3,
    generate: (d) => ({
      sourceModule: 'self-awareness',
      sourceDimension: 'trust_incentive',
      title: `自知偏差显著（${Math.round(d.selfAwareness.overallGap * 100)}%），建议组织匿名反馈`,
      description: `团队自评与引擎观测存在 ${Math.round(d.selfAwareness.overallGap * 100)}% 的偏差。显著偏离维度：${d.selfAwareness.significantDimensions.map(s => s.dimension).join('、')}。`,
      targetSystem: 'manual',
      priority: 'high',
      estimatedEffortHours: 6,
      status: 'pending',
      suggestion: '组织匿名 360 度评估，将结果与引擎诊断对比。重点关注偏差 > 0.3 的维度。',
    }),
  },
  {
    name: 'no-self-assessment',
    condition: (d) => d.selfAwareness.deltas.length === 0,
    generate: () => ({
      sourceModule: 'self-awareness',
      sourceDimension: 'trust_incentive',
      title: '尚未收集团队自评数据，无法校准引擎判断',
      description: '没有自评数据的诊断是单向的。引擎观测到的模式可能与人感知到的不一致。',
      targetSystem: 'manual',
      priority: 'low',
      estimatedEffortHours: 2,
      status: 'pending',
      suggestion: '在诊断页面嵌入一键自评入口，收集 6 个维度的团队自评（每个维度只需选 1-10 分）。',
    }),
  },

  // ── HACD ──
  {
    name: 'hacd-low-auto',
    condition: (d) => !!(d.hacd && d.hacd.hitlRatio > 0.5),
    generate: (d) => ({
      sourceModule: 'hacd',
      sourceDimension: 'authority_governance',
      title: `人工介入率过高（${((d.hacd?.hitlRatio ?? 0) * 100).toFixed(0)}%），建议增加自动化规则`,
      description: `当前协作等级 ${d.hacd?.level ?? '?'}，自主完成率仅 ${((d.hacd?.autoRatio ?? 0) * 100).toFixed(0)}%。高频人工介入消耗团队注意力。`,
      targetSystem: 'jira',
      priority: 'high',
      estimatedEffortHours: 16,
      status: 'pending',
      suggestion: '分析最近 30 天的 HITL 修正事件，识别可自动化的高频修正模式。为每种模式建立自动化规则。',
    }),
  },

  // ── CPC ──
  {
    name: 'cpc-incomplete',
    condition: (d) => !!(d.cpc && d.cpc.level === 'minimal'),
    generate: (d) => ({
      sourceModule: 'cpc',
      sourceDimension: 'authority_governance',
      title: '协作协议完备性为最低等级，建议补齐核心协议',
      description: `协议完备性得分 ${((d.cpc?.completenessScore ?? 0) * 100).toFixed(0)}%。缺失的核心能力：${d.cpc?.gaps?.filter(g => g.severity === 'critical').map(g => g.missing).join('、')}`,
      targetSystem: 'jira',
      priority: 'critical',
      estimatedEffortHours: 20,
      status: 'pending',
      suggestion: '按严重程度从 critical → moderate → minor 逐步补齐协议缺口。先从分工和信息流两个维度开始。',
    }),
  },

  // ── Identity ──
  {
    name: 'identity-weak',
    condition: (d) => d.identity.markers.length === 0,
    generate: () => ({
      sourceModule: 'identity',
      sourceDimension: 'knowledge_sharing',
      title: '未检测到团队身份标记，建议开展团队价值观讨论',
      description: '引擎无法从对话中提取团队身份标记。团队可能缺乏共同的身份认同或未在沟通中表达。',
      targetSystem: 'manual',
      priority: 'low',
      estimatedEffortHours: 4,
      status: 'pending',
      suggestion: '组织一次团队价值观工作坊，共同定义"我们是谁"和"我们如何工作"。将结果写入 SOUL.md。',
    }),
  },

  // ── Financial ──
  {
    name: 'financial-inefficiency',
    condition: (d) => !!(d.financialImpact && d.financialImpact.totalInefficiencyCost > 10000),
    generate: (d) => ({
      sourceModule: 'financial-impact',
      sourceDimension: 'trust_incentive',
      title: `月度低效成本 ¥${(d.financialImpact?.totalInefficiencyCost ?? 0).toFixed(0)}，优化后可节省约 ¥${(d.financialImpact?.improvementPotential ?? 0).toFixed(0)}`,
      description: `主要低效来源：${d.financialImpact?.breakdown?.slice(0, 3).map(b => `${b.label}（¥${b.monthlyCost}）`).join('、')}。${d.financialImpact?.interpretation ?? ''}`,
      targetSystem: 'jira',
      priority: 'high',
      estimatedEffortHours: 20,
      status: 'pending',
      suggestion: '优先修复成本最高的前 3 个低效来源，预计可在 2 个月内看到财务改善。',
    }),
  },
  {
    name: 'token-waste',
    condition: (d) => !!(d.tokenEconomics && d.tokenEconomics.efficiency.reworkTokenRatio > 0.3),
    generate: (d) => ({
      sourceModule: 'token-economics',
      sourceDimension: 'information_flow',
      title: `Token 重做率 ${((d.tokenEconomics?.efficiency.reworkTokenRatio ?? 0) * 100).toFixed(0)}%，信任未校准可能导致浪费`,
      description: `重做 Token 浪费 ¥${(d.tokenEconomics?.wasteBreakdown?.trustMiscalibrationCost ?? 0).toFixed(0)}。信任过高导致错误未被拦截，信任过低导致不必要的 HITL 修正。`,
      targetSystem: 'jira',
      priority: 'medium',
      estimatedEffortHours: 10,
      status: 'pending',
      suggestion: '校准 Agent 信任阈值：对高置信度场景提升自动接受率，对低置信度场景保持人工审查。',
    }),
  },

  // ── Intent Alignment ──
  {
    name: 'intent-misaligned',
    condition: (d) => !!(d.intentAlignment && (
      d.intentAlignment.humanOrgGap > 0.4 ||
      d.intentAlignment.agentOrgGap > 0.4 ||
      d.intentAlignment.humanAgentGap > 0.4
    )),
    generate: (d) => {
      const ia = d.intentAlignment!;
      const issues: string[] = [];
      if (ia.humanOrgGap > 0.4) issues.push('人的注意力与组织目标偏离');
      if (ia.agentOrgGap > 0.4) issues.push('Agent 任务方向与组织目标不一致');
      if (ia.humanAgentGap > 0.4) issues.push('人与 Agent 工作方向存在分歧');
      return {
        sourceModule: 'intent-alignment',
        sourceDimension: 'division_of_labor',
        title: `意图对齐偏差：${issues.join('；')}`,
        description: `人-组织偏差 ${(ia.humanOrgGap * 100).toFixed(0)}%，Agent-组织偏差 ${(ia.agentOrgGap * 100).toFixed(0)}%，人-Agent 偏差 ${(ia.humanAgentGap * 100).toFixed(0)}%。${ia.interpretation}`,
        targetSystem: 'manual',
        priority: 'high',
        estimatedEffortHours: 8,
        status: 'pending',
        suggestion: '组织季度 OKR 对齐会议，确保人、Agent、组织三方目标一致。将组织目标编码为 Agent 的 Standing Orders。',
      };
    },
  },
];

// ====================================================================
// Jaccard similarity for deduplication
// ====================================================================

function tokenize(str: string): Set<string> {
  return new Set(
    str.toLowerCase()
      .replace(/[^a-z一-鿿0-9]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function deduplicateItems(items: ImprovementActionItem[]): ImprovementActionItem[] {
  const result: ImprovementActionItem[] = [];
  for (const item of items) {
    const isDuplicate = result.some(existing =>
      jaccardSimilarity(existing.title, item.title) > 0.7,
    );
    if (!isDuplicate) result.push(item);
  }
  return result;
}

let idCounter = 0;
function generateId(): string {
  idCounter++;
  return `action-${Date.now()}-${idCounter}`;
}

// ====================================================================
// LLM supplement prompt
// ====================================================================

const ACTION_LLM_SYSTEM_PROMPT = `你是 Synova 诊断引擎的行动建议生成器。基于团队诊断数据，生成具体可操作的改进行动。

你必须以严格的 JSON 格式回复，不要任何额外文字：
{
  "items": [
    {
      "title": "行动标题（15字以内）",
      "description": "详细描述（100字以内）",
      "priority": "critical" | "high" | "medium" | "low",
      "targetSystem": "jira" | "linear" | "manual",
      "estimatedEffortHours": 数字,
      "suggestion": "给团队的具体执行建议（80字以内）"
    }
  ]
}

要求：
- 只生成规则引擎未覆盖的重要发现
- 每个建议必须有明确的"做什么"和"为什么"
- priority 严格按影响程度判定：critical=影响整体运作，high=显著改善空间，medium=值得改进，low=锦上添花
- 如果诊断数据整体健康，返回空数组 []
- 最多生成 3 条`;

// ====================================================================
// Public API
// ====================================================================

/**
 * 为诊断结果生成行动方案。
 *
 * 两阶段生成：
 *   1. 规则匹配（确定性、低成本）
 *   2. LLM 补充（覆盖规则未及的边界情况）
 *
 * 结果经过去重合并。
 *
 * @param diagnosis 已完成组装的 V2 诊断
 * @param narrative 多角色解读（可选，用于增强 LLM prompt 上下文）
 * @returns 行动方案
 */
export async function generateActionPlan(
  diagnosis: FullDiagnosisV2,
  narrative?: MultiRoleNarrative | null,
): Promise<ActionPlan> {
  const degradedModules: string[] = [];
  const allItems: ImprovementActionItem[] = [];
  const now = new Date().toISOString();

  // ── Phase 1: Rule matching ──
  try {
    for (const rule of ACTION_RULES) {
      try {
        if (rule.condition(diagnosis)) {
          const partial = rule.generate(diagnosis);
          allItems.push({
            ...partial,
            id: generateId(),
            createdAt: now,
          } as ImprovementActionItem);
        }
      } catch (ruleErr) {
        log.warn({ err: ruleErr, rule: rule.name }, '[auto-action] rule failed');
      }
    }
    log.debug(`[auto-action] rules generated ${allItems.length} items`);
  } catch (err) {
    log.warn({ err }, '[auto-action] rule phase failed entirely');
    degradedModules.push('auto-action-rules');
  }

  // ── Phase 2: LLM supplement ──
  try {
    const llmItems = await generateLLMItems(diagnosis, narrative, allItems);
    allItems.push(...llmItems);
    log.debug(`[auto-action] LLM generated ${llmItems.length} additional items`);
  } catch (err) {
    log.warn({ err }, '[auto-action] LLM supplement failed, using rules only');
    degradedModules.push('auto-action-llm');
  }

  // ── Deduplicate ──
  const deduplicated = deduplicateItems(allItems);

  // ── Sort by priority ──
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  deduplicated.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    teamId: diagnosis.teamId,
    generatedAt: now,
    items: deduplicated,
    degradedModules,
  };
}

// ====================================================================
// LLM supplement
// ====================================================================

async function generateLLMItems(
  diagnosis: FullDiagnosisV2,
  narrative: MultiRoleNarrative | null | undefined,
  existingItems: ImprovementActionItem[],
): Promise<ImprovementActionItem[]> {
  const { chat } = await import('../../llm-client');

  // Build a terse summary of what rules already covered
  const existingDimensions = new Set(existingItems.map(i => i.sourceDimension));
  const existingTitles = existingItems.map(i => i.title).join('；');

  // Extract key anomalies not yet covered by rules
  const uncoveredGaps = Object.entries(diagnosis.gaps.gaps)
    .filter(([dim]) => !existingDimensions.has(dim))
    .filter(([, s]) => s.confidence === 'low' || s.engineScore < 0.35 || s.engineScore > 0.8);

  const context = {
    teamId: diagnosis.teamId,
    narrative: narrative?.ceoSummary?.slice(0, 200) ?? '',
    existingActions: existingTitles.slice(0, 300),
    uncoveredAnomalies: uncoveredGaps.map(([dim, s]) => ({
      dimension: dim,
      score: Math.round(s.engineScore * 100),
      confidence: s.confidence,
      mode: s.mode,
    })),
    selfAwarenessGap: diagnosis.selfAwareness.overallGap,
    degradedModules: diagnosis.degradedModules,
  };

  // 仅当诊断结果整体健康（无未覆盖异常、自知偏差低、无严重规则命中、无降级模块）时跳过 LLM。
  // 否则 LLM 可以发现规则引擎遗漏的跨维度模式。
  const hasSevereRules = existingItems.some(i => i.priority === 'critical' || i.priority === 'high');
  const hasDegraded = (diagnosis.degradedModules?.length ?? 0) > 0;
  if (uncoveredGaps.length === 0 && diagnosis.selfAwareness.overallGap < 0.15 && !hasSevereRules && !hasDegraded) {
    return [];
  }

  const result = await chat({
    systemPrompt: ACTION_LLM_SYSTEM_PROMPT,
    userMessage: JSON.stringify(context, null, 2),
    temperature: 0.3,
    maxTokens: 2000,
  });

  const parsed = parseActionItems(result.content, diagnosis.teamId);
  return parsed;
}

function parseActionItems(content: string, teamId: string): ImprovementActionItem[] {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const items = parsed.items ?? (Array.isArray(parsed) ? parsed : []);

    if (!Array.isArray(items)) return [];

    const now = new Date().toISOString();
    return items.slice(0, 3).map((item: Record<string, unknown>) => ({
      id: generateId(),
      sourceModule: 'llm-supplement',
      sourceDimension: (item.sourceDimension as string) || 'unknown',
      title: (item.title as string) || '未命名行动',
      description: (item.description as string) || '',
      targetSystem: (item.targetSystem as ImprovementActionItem['targetSystem']) || 'manual',
      priority: (item.priority as ImprovementActionItem['priority']) || 'medium',
      estimatedEffortHours: Number(item.estimatedEffortHours) || 4,
      createdAt: now,
      status: 'pending' as const,
      suggestion: (item.suggestion as string) || '',
    }));
  } catch {
    log.debug('[auto-action] failed to parse LLM response');
    return [];
  }
}
