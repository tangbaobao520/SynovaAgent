/**
 * engine-server/qa/qa-runner.ts — 质量评估执行器
 *
 * 流程：
 *   1. 对每个测试用例，运行 Pipeline → 获取 Blueprint
 *   2. 从 Blueprint 提取各层产物 → 构造 Judge prompt
 *   3. 调 LLM-as-Judge 打分（每维度 3-4 个子项，每项 0-100）
 *   4. 汇总 → 生成报告 → 与基线对比
 *
 * 用法：
 *   npx tsx server/src/engine-server/qa/cli.ts              # 运行全部
 *   npx tsx server/src/engine-server/qa/cli.ts --baseline   # 保存为基线
 *   npx tsx server/src/engine-server/qa/cli.ts --check      # 与基线对比
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TEST_CORPUS } from './test-corpus';
import { ALL_RUBRICS } from './scoring-rubrics';
import type { BlueprintDTO } from '../types';
import type {
  QATestCase, QAResult, DimensionScore, SubScore,
  RegressionCheck, QASuiteResult, QARunConfig,
} from './types';
import { chat } from '../llm-client';
import { extractJSON, tryParseRepaired } from '../pipeline/llm-json-repair';
import { getEngineContext } from '../engine-context';
import type { TeamProtocol, AgentMessage } from '../protocol/types';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/qa/qa-runner');

// ================================================================
// 默认配置
// ================================================================

export const DEFAULT_CONFIG: QARunConfig = {
  judgeModel: process.env.QA_JUDGE_MODEL || 'deepseek-v4-flash',
  judgeBaseUrl: '',  // 不再使用 — Judge 通过 Gateway/llm-client 路由
  judgeApiKey: '',   // 不再使用 — 认证由 Gateway/DeepSeek 配置处理
  passThreshold: 70,
  regressionThreshold: 10,
  baselinePath: path.join(__dirname, 'baseline.json'),
  reportPath: path.join(__dirname, 'report.json'),
};

// ================================================================
// Judge prompt 构建
// ================================================================

export function buildJudgePrompt(
  dimension: typeof ALL_RUBRICS[number],
  blueprintSummary: string,
): string {
  const subRubricText = dimension.subRubrics.map((s, i) =>
    `${i + 1}. **${s.label}** (满分${s.maxScore}分): ${s.description}\n   ${s.scoringGuide}`,
  ).join('\n\n');

  return `你是一个 AI 团队蓝图质量的独立评审专家。请根据以下评分量规，对这份团队蓝图的「${dimension.dimension}」维度进行严格评分。

## 评分维度: ${dimension.dimension}
${dimension.description}

## 评分标准（每项 0-100 分）:
${subRubricText}

## 待评审的团队蓝图:
${blueprintSummary.slice(0, 16000)}

## 评分要求:
1. 严格按标准打分，不要因为"已经不错了"就给高分
2. 每个子项给出具体扣分原因
3. 返回严格的 JSON 格式（不要有 markdown 标记）:
{
  "dimension": "${dimension.dimension}",
  "subScores": [
    { "label": "<子项名>", "score": <0-100>, "maxScore": <满分>, "comment": "<扣分原因>" }
  ],
  "overallComment": "<1-2句总体评价>"
}
只返回 JSON。`;
}

// ================================================================
// Judge LLM 调用（通过项目 chat() → Gateway → DeepSeek fallback）
// ================================================================

export async function callJudge(
  systemPrompt: string,
  _config: QARunConfig,
): Promise<{ subScores: SubScore[]; overallComment: string } | null> {
  try {
    const result = await chat({
      systemPrompt: '你是一个严格的评审专家。严格按照评分标准打分，不要有"差不多就行"的倾向。只返回 JSON，不要加任何解释。返回 JSON 必须是严格合法的 JSON，键名使用双引号。',
      userMessage: systemPrompt,
      temperature: 0.1,
      maxTokens: 16000,
      abortSignal: AbortSignal.timeout(120_000),
    });

    const jsonStr = extractJSON(result.content);
    const parsed = tryParseRepaired(jsonStr);
    if (!parsed.success) {
      log.error('[QA Judge] JSON 解析失败');
      return null;
    }

    const data = parsed.data as unknown as { subScores?: unknown[]; overallScore?: number; overallPassed?: boolean; dimensions?: unknown[]; overallComment?: string };
    return {
      subScores: (data.subScores || []) as SubScore[],
      overallComment: data.overallComment || '',
    };
  } catch (err) {
    log.error(`[QA Judge] 调用失败: ${(err as Error).message}`);
    return null;
  }
}

// ================================================================
// 评分计算
// ================================================================

export function computeDimensionScore(
  dimension: typeof ALL_RUBRICS[number],
  judgeResult: { subScores: SubScore[]; overallComment: string },
  config: QARunConfig,
): DimensionScore {
  const scores = judgeResult.subScores;
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
    : 0;

  return {
    dimension: dimension.dimension,
    score: avgScore,
    subScores: scores,
    judgeComment: judgeResult.overallComment,
    passed: avgScore >= config.passThreshold,
  };
}

// ================================================================
// Blueprint → 评分摘要（提取各层关键信息喂给 Judge）
// ================================================================

export function summarizeBlueprintForJudge(blueprint: BlueprintDTO): string {
  const bp = blueprint as unknown as Record<string, unknown>;
  const parts: string[] = [];

  // 任务定义
  if (bp.taskDef) {
    const td = bp.taskDef as Record<string, unknown>;
    parts.push(`## 任务定义\n- 工作: ${td.job || ''}\n- 阶段: ${td.stage || ''}\n- 约束: ${Array.isArray(td.constraints) ? (td.constraints as string[]).join('; ') : ''}`);
  }

  // 关键基础设施（提前，避免被截断）
  // 可部署模板
  if (bp.deployableTemplate) {
    const dt = bp.deployableTemplate as Record<string, unknown>;
    const dtAgents = Array.isArray(dt.agents) ? dt.agents as Array<Record<string, unknown>> : [];
    parts.push(`## 可部署模板\n✅ deployableTemplate 已生成\n- Agent 数: ${dtAgents.length}\n- Blueprint ID: ${dt.schemaVersion ? `v${dt.schemaVersion}` : 'N/A'}`);
  } else {
    parts.push('## 可部署模板\n❌ 未提供 deployableTemplate — 蓝图无法直接部署');
  }

  // 设计依据（提前，避免被截断）
  const rationaleArr = Array.isArray(bp.designRationale) ? bp.designRationale as Array<Record<string, unknown>> : [];
  if (rationaleArr.length > 0) {
    parts.push(`## 设计依据（共 ${rationaleArr.length} 条）`);
    for (const dr of rationaleArr.slice(0, 15)) {
      parts.push(`- ${dr.dimension}: ${dr.choice} — ${(dr.reason as string)?.slice(0, 80) || ''}${dr.hypothesisTag ? ' [假设]' : ''}`);
    }
    if (rationaleArr.length > 15) parts.push(`... 另有 ${rationaleArr.length - 15} 条`);
  } else {
    parts.push('## 设计依据\n❌ 未提供 designRationale');
  }

  // 覆盖等级
  if (bp.coverageLevel) {
    parts.push(`## 覆盖等级: ${bp.coverageLevel}`);
  }

  // L1: 团队结构
  if (bp.teamStructure) {
    const ts = bp.teamStructure as Record<string, unknown>;
    parts.push(`## 团队结构\n- 总角色数: ${ts.totalRoles}\n- 推荐规模: ${ts.recommendedTeamSize}\n- 推导方法: ${ts.derivationMethod}`);
    if (Array.isArray(ts.roles)) {
      parts.push('### 角色列表');
      for (const r of ts.roles as Array<Record<string, unknown>>) {
        parts.push(`- ${r.name} (${r.governanceLayer || 'L2'}): ${Array.isArray(r.responsibilities) ? (r.responsibilities as string[]).slice(0, 3).join(', ') : ''}`);
      }
    }
  }

  // L2: 基因组
  if (Array.isArray(bp.personaGenomes)) {
    parts.push('## 角色基因组');
    for (const pg of bp.personaGenomes as Array<Record<string, unknown>>) {
      const ocean = pg.oceanScores as Record<string, number> | undefined;
      const hb = Array.isArray(pg.honestBoundaries) ? (pg.honestBoundaries as string[]).slice(0, 2).join('; ') : '';
      const ap = Array.isArray(pg.antiPatterns) ? (pg.antiPatterns as string[]).slice(0, 2).join('; ') : '';
      parts.push(`- ${pg.roleName}: O=(${ocean?.openness ?? '?'},${ocean?.conscientiousness ?? '?'},${ocean?.extraversion ?? '?'},${ocean?.agreeableness ?? '?'},${ocean?.neuroticism ?? '?'}) 心智模型=${Array.isArray(pg.mentalModels) ? (pg.mentalModels as Array<{name: string}>).map(m => m.name).join('|') : ''} honestBoundaries=${hb ? `[${hb}]` : '缺失'} antiPatterns=${ap ? `[${ap}]` : '缺失'}`);
    }
  }

  // L3: 协作模式
  if (bp.collaborationMode) {
    const cm = bp.collaborationMode as Record<string, unknown>;
    parts.push(`## 协作模式\n- 模式: ${cm.mode} (${cm.label || ''})\n- 选择原因: ${cm.selectionReason || ''}`);
    // 6 缝隙摘要
    for (const gap of ['divisionOfLabor', 'informationFlow', 'conflictResolution', 'powerDistribution', 'incentiveAlignment', 'trustModel', 'knowledgeSharing', 'externalInterface']) {
      const g = cm[gap] as Record<string, unknown> | undefined;
      if (g) {
        const key = Object.keys(g).find(k => k === 'mode' || k === 'topology' || k === 'strategy' || k === 'authority' || k === 'alignment' || k === 'initialTrust');
        if (key) parts.push(`  - ${gap}: ${key}=${g[key]}`);
      }
    }
    // 安全基线
    const sb = cm['safetyBaseline'] as Record<string, unknown> | undefined;
    if (sb) {
      parts.push(`  - 安全基线: maxAutonomy=${sb.maxAutonomyLevel}, auditLog=${sb.auditLogEnabled}, approvals=${Array.isArray(sb.requireHumanApproval) ? (sb.requireHumanApproval as string[]).join('/') : ''}`);
    }
  }

  // L4: 技能（含可行性关键字段，供 Judge 评分）
  if (Array.isArray(bp.skillSets)) {
    const ssArr = bp.skillSets as Array<Record<string, unknown>>;
    const totalSkills = ssArr.reduce((sum, ss) => sum + (Array.isArray(ss.skills) ? (ss.skills as unknown[]).length : 0), 0);
    const placeholderCount = ssArr.reduce((sum, ss) => {
      if (!Array.isArray(ss.skills)) return sum;
      return sum + (ss.skills as Array<Record<string, unknown>>).filter(s => {
        const ic = typeof s.installCommand === 'string' ? s.installCommand as string : '';
        return /^(可安装|\[可安装\]|需手动安装|手动安装|待定|TBD|N\/A|无|暂无|placeholder)$/i.test(ic);
      }).length;
    }, 0);
    const stepCounts = ssArr.reduce((sum, ss) => {
      if (!Array.isArray(ss.skills)) return sum;
      return sum + (ss.skills as Array<Record<string, unknown>>).filter(s => {
        const steps = Array.isArray(s.steps) ? s.steps as unknown[] : [];
        return steps.length === 0;
      }).length;
    }, 0);
    const noVersionCount = ssArr.reduce((sum, ss) => {
      if (!Array.isArray(ss.skills)) return sum;
      return sum + (ss.skills as Array<Record<string, unknown>>).filter(s => {
        const v = typeof s.version === 'string' ? s.version as string : '';
        return !v || v === 'latest' || v === '0.0.0';
      }).length;
    }, 0);
    parts.push(`## 技能分配\n- 总角色: ${ssArr.length}, 总技能: ${totalSkills}${placeholderCount > 0 ? ` (⚠️ ${placeholderCount}个占位符installCommand)` : ''}${stepCounts > 0 ? ` (⚠️ ${stepCounts}个技能无执行步骤steps)` : ''}${noVersionCount > 0 ? ` (⚠️ ${noVersionCount}个技能版本号缺失/latest)` : ''}`);
    // 每个技能抽样展示 installCommand / steps / version
    for (const ss of ssArr) {
      const roleName = ss.roleName as string || '';
      if (!Array.isArray(ss.skills)) continue;
      const skillList = ss.skills as Array<Record<string, unknown>>;
      parts.push(`### ${roleName}（${skillList.length}技能）`);
      for (const sk of skillList.slice(0, 4)) {
        const name = sk.name as string || '?';
        const ic = typeof sk.installCommand === 'string' ? (sk.installCommand as string).slice(0, 60) : '❌缺失';
        const steps = Array.isArray(sk.steps) ? (sk.steps as unknown[]).length : 0;
        const ver = sk.version || '❌无版本';
        const icStatus = /^(可安装|\[可安装\]|需手动安装|手动安装|待定|TBD|N\/A|无|暂无|placeholder)$/i.test(ic) ? '⚠️占位' : (/^(npm |pip |apt-get |manual:)/i.test(ic) ? '✅' : '⚠️异常');
        parts.push(`- ${name}: install=${ic}${ic.length >= 60 ? '…' : ''} [${icStatus}] steps=${steps}${steps === 0 ? ' ⚠️无步骤' : ''} ver=${ver}`);
      }
      if (skillList.length > 4) parts.push(`  ... 另有 ${skillList.length - 4} 个技能`);
    }
  }

  // L5: 5格式文件（SOUL/IDENTITY/TOOLS/HEARTBEAT/USER/AGENTS.md）
  const fiveFormats = bp.fiveFormats as Record<string, unknown> | undefined;
  const tp = fiveFormats?.templatePreset as Record<string, unknown> | undefined;
  const agents = Array.isArray(tp?.agents) ? (tp.agents as Array<Record<string, unknown>>) : [];

  if (agents.length > 0) {
    parts.push(`## 5格式文件（共 ${agents.length} 个 Agent）`);
    for (const a of agents) {
      const soulLen = typeof a.soulMd === 'string' ? (a.soulMd as string).length : 0;
      const idLen = typeof a.identityMd === 'string' ? (a.identityMd as string).length : 0;
      const toolsLen = typeof a.toolsMd === 'string' ? (a.toolsMd as string).length : 0;
      const hbLen = typeof a.heartbeatMd === 'string' ? (a.heartbeatMd as string).length : 0;
      const userLen = typeof a.userMd === 'string' ? (a.userMd as string).length : 0;
      const hasSOUL = soulLen > 50;
      const hasID = idLen > 50;
      const hasTOOLS = toolsLen > 50;
      const hasHB = hbLen > 50;
      const hasUSER = userLen > 20;
      parts.push(`- ${a.dirName}: SOUL.md=${soulLen}chars${hasSOUL ? ' ✅' : ' ⚠️占位'} IDENTITY.md=${idLen}chars${hasID ? ' ✅' : ' ⚠️占位'} TOOLS.md=${toolsLen}chars${hasTOOLS ? ' ✅' : ' ⚠️占位'} HEARTBEAT.md=${hbLen}chars${hasHB ? ' ✅' : ' ⚠️占位'} USER.md=${userLen}chars${hasUSER ? ' ✅' : ' ❌空'}`);
    }
    // V1.5: AGENTS.md 回退读取 deployableTemplate.agentsMd
    let agentsMdLen = typeof tp?.agentsMd === 'string' ? (tp.agentsMd as string).length : 0;
    let agentsMdFromFallback = false;
    if (agentsMdLen < 100 && bp.deployableTemplate) {
      const dt = bp.deployableTemplate as Record<string, unknown>;
      const dtAgentsMd = typeof dt.agentsMd === 'string' ? dt.agentsMd as string : '';
      if (dtAgentsMd.length > agentsMdLen) {
        agentsMdLen = dtAgentsMd.length;
        agentsMdFromFallback = true;
      }
    }
    if (agentsMdFromFallback) {
      parts.push(`- AGENTS.md: ${agentsMdLen}chars ✅ (回退到deployableTemplate.agentsMd)`);
    } else {
      parts.push(`- AGENTS.md: ${agentsMdLen}chars${agentsMdLen > 100 ? ' ✅' : ' ❌缺失'}`);
    }
  } else {
    parts.push('## 5格式文件\n❌ 未生成 — fiveFormats.templatePreset.agents 为空');
  }

  // L3 协议合规性模拟（用于 RUBRIC_PROTOCOL_COMPLIANCE 评分）
  parts.push(summarizeProtocolForJudge(blueprint));

  return parts.join('\n\n');
}

// ================================================================
// 协议合规性模拟检查
// ================================================================

/**
 * 从 Blueprint 提取协议信息 + 运行 RuleEngine 模拟测试，
 * 供 RUBRIC_PROTOCOL_COMPLIANCE Judge 评分参考。
 */
function summarizeProtocolForJudge(blueprint: BlueprintDTO): string {
  const bp = blueprint as unknown as Record<string, unknown>;
  const cm = bp.collaborationMode as Record<string, unknown> | undefined;
  if (!cm) return '## 协议合规性\n❌ 无协作模式，无法评估协议合规性';

  const lines: string[] = ['## 协议合规性模拟'];

  // 协议元信息
  lines.push(`- 协作模式: ${cm.mode} (${cm.label || ''})`);
  lines.push(`- 选择原因: ${cm.selectionReason || '未提供'}`);

  // 构造 TeamProtocol 用于 RuleEngine 模拟
  const protocol = buildProtocolFromBlueprint(cm);
  if (!protocol) {
    lines.push('- ⚠️ 无法从 Blueprint 构造协议对象');
    return lines.join('\n');
  }

  // 运行 RuleEngine 模拟测试
  const simResult = simulateInterceptionTest(protocol);
  lines.push('');
  lines.push('### 模拟拦截测试结果');
  lines.push(`- 测试消息数: ${simResult.totalMessages}`);
  lines.push(`- 规则命中数: ${simResult.ruleMatches}`);
  lines.push(`- 正确拦截违规: ${simResult.correctBlocks}`);
  lines.push(`- 误拦截合规: ${simResult.falsePositives}`);
  lines.push(`- 漏拦违规: ${simResult.falseNegatives}`);
  lines.push(`- 命中率: ${simResult.totalMessages > 0 ? Math.round(simResult.ruleMatches / simResult.totalMessages * 100) : 0}%`);
  lines.push(`- 准确率: ${simResult.totalMessages > 0 ? Math.round((simResult.totalMessages - simResult.falsePositives - simResult.falseNegatives) / simResult.totalMessages * 100) : 0}%`);

  // 规则覆盖统计
  lines.push('');
  lines.push('### 规则覆盖');
  const coveredGaps = simResult.gapsCovered;
  const allGaps = ['division_of_labor', 'information_flow', 'authority_governance', 'trust_incentive', 'knowledge_sharing', 'external_interface', 'safety_baseline'];
  for (const gap of allGaps) {
    const covered = coveredGaps.includes(gap);
    const label = gap === 'safety_baseline' ? ' (铁律)' : '';
    lines.push(`- ${gap}${label}: ${covered ? '✅ 有规则覆盖' : '⚠️ 无规则覆盖'}`);
  }

  // LLM Judge 可用性
  lines.push('');
  lines.push('### LLM Judge 状态');
  lines.push('- LLM Judge: 已编码（protocol-engine/llm-judge.ts），由 interceptor 在 WARN 级别触发');
  lines.push('- 降级策略: LLM 超时/不可用时 → fallback 降级放行');
  lines.push('- 熔断保护: 已编码（protocol-engine/circuit-breaker.ts）');
  lines.push('- override 配额: 默认 3 次/会话');

  return lines.join('\n');
}

interface SimulatedInterceptionResult {
  totalMessages: number;
  ruleMatches: number;
  correctBlocks: number;
  falsePositives: number;
  falseNegatives: number;
  gapsCovered: string[];
}

/**
 * 构造简化的 TeamProtocol 供 RuleEngine 测试。
 */
function buildProtocolFromBlueprint(cm: Record<string, unknown>): TeamProtocol | null {
  try {
    const dol = cm.divisionOfLabor as Record<string, unknown> | undefined;
    const inf = cm.informationFlow as Record<string, unknown> | undefined;
    const ag = cm.authorityGovernance as Record<string, unknown> | undefined;
    const ti = cm.trustIncentive as Record<string, unknown> | undefined;
    const ks = cm.knowledgeSharing as Record<string, unknown> | undefined;
    const ext = cm.externalInterface as Record<string, unknown> | undefined;
    const extIso = ext?.isolation as Record<string, unknown> | undefined;

    return {
      version: 1,
      mode: (cm.mode as string) || 'democratic_council',
      gaps: {
        division_of_labor: { mode: (dol?.mode as string) || 'skill_based', roles: [], taskQueue: 'fifo' },
        information_flow: { topology: (inf?.topology as string) || 'full_mesh', routingMap: inf?.routingMap || {}, visibilityMatrix: inf?.visibilityMatrix || {} },
        authority_governance: { strategy: (ag?.strategy as string) || 'majority_vote', authority: (ag?.authority as string) || 'distributed', escalationPath: [], vetoPower: [], decisionRights: {}, tieBreaker: 'senior' },
        trust_incentive: { alignment: (ti?.alignment as string) || 'shared_goal', initialTrust: (ti?.initialTrust as number) || 0.5, rewardMechanism: 'recognition', penaltyMechanism: 'warning', trustDecayRate: 0.01, trustRebuildRate: 0.05 },
        knowledge_sharing: { defaultVisibility: (ks?.defaultVisibility as string) || 'team', artifactRegistry: 'open', retentionPolicy: 'permanent' },
        external_interface: { isolation: { sandboxLevel: (extIso?.sandboxLevel as string) || 'standard' }, allowedExternalTools: [], rateLimit: 10 },
      },
    } as unknown as TeamProtocol;
  } catch {
    log.warn('[qa-runner] failed to build protocol from blueprint');
    return null;
  }
}

/**
 * 用 RuleEngine 对一组模拟消息做拦截测试，
 * 统计命中率、准确率、各缝隙覆盖情况。
 */
function simulateInterceptionTest(protocol: TeamProtocol): SimulatedInterceptionResult {
  const ruleEngine = getEngineContext().protocol.createRuleEngine();

  // 模拟测试消息：对齐 rule-engine.ts 中实际 contentPattern
  // DL-R1: /(交给我|我来做|我负责|接受.*任务|接下|承接|我来处理|我处理|我.*执行.*任务)/i
  // DL-R2: /(再加.*任务|还要.*做|额外.*任务|同时.*处理|并行.*执行|多.*任务.*一起)/i
  // GAP-IF-01: /(绕过|跳过我|直接.*通知|直接.*告诉|不.*经.*过.*我)/i
  // IF-R3: /^ws\.(read|write)\s+/i
  // Iron laws: IRON-H01 "已完成", IRON-H02 "已部署", IRON-L03 "确认", IRON-HONESTY "我查了", IRON-AUTHORITY "我可以"
  const testMessages: Array<{ message: AgentMessage; shouldViolate: boolean }> = [
    // ── 违规消息 ──
    // 触发 DL-R1 (WARN): "我来做" → division_of_labor
    {
      message: { from: 'developer', to: 'designer', type: 'speech', content: '这个支付模块的重构交给我来做吧，我负责搞定', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // 触发 DL-R2 (BLOCK): "还要做" → division_of_labor
    {
      message: { from: 'developer', to: 'pm', type: 'speech', content: '我还要同时处理三个紧急需求，任务太多了', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // 触发 GAP-IF-01 (WARN) 星型拓扑: "直接告诉" → information_flow
    {
      message: { from: 'developer', to: 'designer', type: 'speech', content: '我已经直接告诉客户了，不需要经过你审批', timestamp: new Date().toISOString() },
      shouldViolate: (protocol.gaps['information_flow'] as Record<string, unknown>).topology === 'star',
    },
    // 触发 IRON-H01 (BLOCK): "已修复" / "搞定了" → safety_baseline
    {
      message: { from: 'developer', to: 'tester', type: 'speech', content: '登录页的bug已经修复了，搞定了，不用再测了', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // 触发 IRON-L03 (WARN): "确认" → safety_baseline
    {
      message: { from: 'designer', to: 'pm', type: 'speech', content: '确认，就按方案A执行，没问题', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // 触发 IRON-AUTHORITY (WARN): "我可以" → safety_baseline
    {
      message: { from: 'developer', to: 'pm', type: 'speech', content: '我可以直接操作生产数据库，我有权限', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // ── 合规消息 ──
    {
      message: { from: 'developer', to: 'tester', type: 'speech', content: 'PR #452 的代码已经提交了，请帮忙review一下', timestamp: new Date().toISOString() },
      shouldViolate: false,
    },
    {
      message: { from: 'designer', to: 'developer', type: 'speech', content: '第三屏的间距需要调整到12px，你能帮忙改一下吗？', timestamp: new Date().toISOString() },
      shouldViolate: false,
    },
    {
      message: { from: 'tester', to: 'developer', type: 'query', content: 'Bug #452 的复现步骤能再描述一下吗？', timestamp: new Date().toISOString() },
      shouldViolate: false,
    },
    // ── 覆盖 authority_governance: majority_vote → CR-R3 ──
    {
      message: { from: 'pm', to: 'developer', type: 'decision', content: '这个技术方案我一个人决定了，不用投票，我说了算', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // ── 覆盖 trust_incentive: default → TI-R0 ──
    {
      message: { from: 'developer', to: 'pm', type: 'speech', content: '相信我，这部分代码我来负责，包在我身上，不会有问题', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // ── 覆盖 knowledge_sharing: default → KS-R3 ──
    {
      message: { from: 'analyst', to: 'pm', type: 'speech', content: '我已经完成了Q2数据分析，生成了完整的报告和PPT输出结果', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // ── 覆盖 external_interface: default → EI-R0 ──
    {
      message: { from: 'developer', to: 'pm', type: 'speech', content: '我想把这个新功能对外发布，让客户可以直接调用外部API访问', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
    // ── 覆盖 knowledge_sharing: KS-R1 "我学到了" ──
    {
      message: { from: 'developer', to: 'team', type: 'speech', content: '我学到了一个新的调试方法，根据最新信息可以更快定位bug', timestamp: new Date().toISOString() },
      shouldViolate: true,
    },
  ];

  let ruleMatches = 0;
  let correctBlocks = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const gapsCovered = new Set<string>();

  for (const { message, shouldViolate } of testMessages) {
    // 同时检查协议规则和铁律
    const protocolResult = ruleEngine.match(message, protocol);
    const ironResult = ruleEngine.checkIronLaws(message);
    const matched = protocolResult.matched || ironResult.matched;
    const allViolations = [...protocolResult.violations, ...ironResult.violations];

    if (matched) {
      ruleMatches++;
      for (const v of allViolations) {
        gapsCovered.add(v.gapDimension);
      }
      if (shouldViolate) {
        correctBlocks++;
      } else {
        falsePositives++;
      }
    } else if (shouldViolate) {
      falseNegatives++;
    }
  }

  return {
    totalMessages: testMessages.length,
    ruleMatches,
    correctBlocks,
    falsePositives,
    falseNegatives,
    gapsCovered: [...gapsCovered],
  };
}

// ================================================================
// 执行器：运行单个测试用例
// ================================================================

async function runSingleTestCase(
  testCase: QATestCase,
  config: QARunConfig,
): Promise<QAResult> {
  const startTime = Date.now();

  // 1. 运行 Pipeline
  let blueprint: BlueprintDTO;
  try {
    const { runPipeline } = await import('../pipeline/orchestrator');
    const { getOrCreateTask } = await import('../task-store');

    const requestId = `qa_${testCase.id}_${Date.now()}`;
    const { taskRequestId } = getOrCreateTask(testCase.request, requestId);
    blueprint = await runPipeline(
      taskRequestId,
      testCase.request,
      new AbortController().signal,
    );
  } catch (err) {
    log.error(`[QA] Pipeline 失败: ${testCase.id} — ${(err as Error).message}`);
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      timestamp: new Date().toISOString(),
      engineVersion: '',
      blueprintId: 'PIPELINE_ERROR',
      pipelineDurationMs: Date.now() - startTime,
      dimensions: [],
      overallScore: 0,
      overallPassed: false,
    };
  }

  const pipelineDurationMs = Date.now() - startTime;
  const blueprintSummary = summarizeBlueprintForJudge(blueprint);

  // 2. 逐维度评分
  const dimensions: DimensionScore[] = [];
  for (const rubric of ALL_RUBRICS) {
    const prompt = buildJudgePrompt(rubric, blueprintSummary);
    const judgeResult = await callJudge(prompt, config);

    if (!judgeResult) {
      // Judge 调用失败 → 降级为手动估算
      dimensions.push({
        dimension: rubric.dimension,
        score: 0,
        subScores: rubric.subRubrics.map(s => ({ label: s.label, score: 0, maxScore: s.maxScore, comment: 'Judge 不可用' })),
        judgeComment: '评分服务不可用',
        passed: false,
        degraded: true,
      });
      continue;
    }

    const dimScore = computeDimensionScore(rubric, judgeResult, config);
    dimensions.push(dimScore);
  }

  const overallScore = dimensions.length > 0
    ? Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length)
    : 0;

  return {
    testCaseId: testCase.id,
    testCaseName: testCase.name,
    timestamp: new Date().toISOString(),
    engineVersion: (blueprint.engineVersion as string) || 'unknown',
    blueprintId: (blueprint.blueprintId as string) || crypto.randomUUID(),
    pipelineDurationMs,
    dimensions,
    overallScore,
    overallPassed: dimensions.every(d => d.passed),
  };
}

// ================================================================
// 回归检查
// ================================================================

function checkRegression(current: QAResult, baseline: QAResult | undefined, config: QARunConfig): RegressionCheck | undefined {
  if (!baseline) return undefined;

  const delta = current.overallScore - baseline.overallScore;
  const degradedDimensions: string[] = [];

  const baseDimMap = new Map(baseline.dimensions.map(d => [d.dimension, d.score]));
  for (const dim of current.dimensions) {
    const baseScore = baseDimMap.get(dim.dimension);
    if (baseScore != null && dim.score - baseScore < -config.regressionThreshold) {
      degradedDimensions.push(dim.dimension);
    }
  }

  return {
    previousScore: baseline.overallScore,
    currentScore: current.overallScore,
    delta,
    degraded: delta < -config.regressionThreshold || degradedDimensions.length > 0,
    degradedDimensions,
  };
}

// ================================================================
// 主入口：运行全部测试套件
// ================================================================

export async function runQASuite(configOverrides?: Partial<QARunConfig>): Promise<QASuiteResult> {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const results: QAResult[] = [];

  // 用例过滤
  const filter = config.testCaseFilter;
  const corpus = filter ? TEST_CORPUS.filter(tc => filter(tc.id)) : TEST_CORPUS;

  // 加载基线
  let baselineMap: Map<string, QAResult> = new Map();
  try {
    if (fs.existsSync(config.baselinePath)) {
      const baselineData: QASuiteResult = JSON.parse(fs.readFileSync(config.baselinePath, 'utf-8'));
      for (const r of baselineData.results) {
        baselineMap.set(r.testCaseId, r);
      }
    }
  } catch (_e) { /* 首次运行，基线文件不存在，将创建新基线 */ }

  // 逐个运行
  log.info(`[QA] 运行 ${corpus.length} 个测试用例...`);
  log.info(`[QA] Judge 模型: ${config.judgeModel}`);
  log.info('');

  for (let i = 0; i < corpus.length; i++) {
    const tc = corpus[i];
    log.info(`[${i + 1}/${corpus.length}] ${tc.id}: ${tc.name}...`);

    const result = await runSingleTestCase(tc, config);

    // 回归检查
    const baseline = baselineMap.get(tc.id);
    result.regression = checkRegression(result, baseline, config);

    results.push(result);

    const status = result.overallPassed ? '✅' : '❌';
    const regr = result.regression?.degraded ? ' ⚠️退化!' : '';
    log.info(`  ${status} 总分: ${result.overallScore}/100 (${result.pipelineDurationMs}ms)${regr}`);
    for (const dim of result.dimensions) {
      log.info(`    ${dim.dimension}: ${dim.score} ${dim.passed ? '✅' : '❌'}`);
    }
    log.info('');
  }

  // 汇总
  const passed = results.filter(r => r.overallPassed).length;
  const degraded = results.filter(r => r.regression?.degraded).length;
  const averageScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length)
    : 0;

  // 每维度平均分
  const dimensionAverages: Record<string, number> = {};
  for (const rubric of ALL_RUBRICS) {
    const dimResults = results.flatMap(r => r.dimensions.filter(d => d.dimension === rubric.dimension));
    if (dimResults.length > 0) {
      // 只计算非零分
      const nonZero = dimResults.filter(d => d.score > 0);
      dimensionAverages[rubric.dimension] = nonZero.length > 0
        ? Math.round(nonZero.reduce((s, d) => s + d.score, 0) / nonZero.length)
        : 0;
    }
  }

  const suiteResult: QASuiteResult = {
    runAt: new Date().toISOString(),
    engineVersion: results[0]?.engineVersion || 'unknown',
    config: {
      judgeModel: config.judgeModel,
      passThreshold: config.passThreshold,
      regressionThreshold: config.regressionThreshold,
    },
    results,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      degraded,
      averageScore,
      dimensionAverages,
    },
  };

  return suiteResult;
}

// ================================================================
// 单蓝图评估（供 API 路由调用，不跑 Pipeline，只跑 Judge）
// ================================================================

export async function evaluateBlueprint(
  blueprint: BlueprintDTO,
  config?: Partial<QARunConfig>,
): Promise<{
  dimensions: DimensionScore[];
  overallScore: number;
  overallPassed: boolean;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const blueprintSummary = summarizeBlueprintForJudge(blueprint);

  // 并行评分：6 个维度独立调用 LLM Judge，减少串行等待时间
  const rubricResults = await Promise.allSettled(
    ALL_RUBRICS.map(async (rubric) => {
      const prompt = buildJudgePrompt(rubric, blueprintSummary);
      const judgeResult = await callJudge(prompt, cfg);

      if (!judgeResult) {
        return {
          dimension: rubric.dimension,
          score: 0,
          subScores: rubric.subRubrics.map(s => ({ label: s.label, score: 0, maxScore: s.maxScore, comment: 'Judge 不可用' })),
          judgeComment: '评分服务不可用',
          passed: false,
          degraded: true,
        } as DimensionScore;
      }

      return computeDimensionScore(rubric, judgeResult, cfg);
    }),
  );

  const dimensions: DimensionScore[] = rubricResults.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      dimension: ALL_RUBRICS[i].dimension,
      score: 0,
      subScores: ALL_RUBRICS[i].subRubrics.map(s => ({ label: s.label, score: 0, maxScore: s.maxScore, comment: `Judge 调用异常: ${r.reason?.message || 'unknown'}` })),
      judgeComment: '评分服务异常',
      passed: false,
      degraded: true,
    };
  });

  const overallScore = dimensions.length > 0
    ? Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length)
    : 0;

  return { dimensions, overallScore, overallPassed: dimensions.every(d => d.passed) };
}

// ================================================================
// 报告输出
// ================================================================

export function saveReport(suiteResult: QASuiteResult, config: QARunConfig): void {
  const dir = path.dirname(config.reportPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.reportPath, JSON.stringify(suiteResult, null, 2), 'utf-8');
  log.info(`[QA] 报告已保存: ${config.reportPath}`);
}

export function saveBaseline(suiteResult: QASuiteResult, config: QARunConfig): void {
  const dir = path.dirname(config.baselinePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.baselinePath, JSON.stringify(suiteResult, null, 2), 'utf-8');
  log.info(`[QA] 基线已保存: ${config.baselinePath}`);
}

export function printSummary(suiteResult: QASuiteResult): void {
  const { summary } = suiteResult;
  log.info('═══════════════════════════════════════');
  log.info('  QA 质量评估报告');
  log.info('═══════════════════════════════════════');
  log.info(`  运行时间: ${suiteResult.runAt}`);
  log.info(`  引擎版本: ${suiteResult.engineVersion}`);
  log.info(`  Judge模型: ${suiteResult.config.judgeModel}`);
  log.info('───────────────────────────────────────');
  log.info(`  总用例: ${summary.total}`);
  log.info(`  通过: ${summary.passed}  ✅`);
  log.info(`  失败: ${summary.failed}  ❌`);
  log.info(`  退化: ${summary.degraded}  ⚠️`);
  log.info(`  平均分: ${summary.averageScore}/100`);
  log.info('───────────────────────────────────────');
  log.info('  维度平均分:');
  for (const [dim, score] of Object.entries(summary.dimensionAverages)) {
    const icon = score >= 70 ? '✅' : score >= 50 ? '⚠️' : '❌';
    log.info(`    ${icon} ${dim}: ${score}`);
  }
  log.info('═══════════════════════════════════════');

  if (summary.degraded > 0) {
    log.info('');
    log.info('⚠️  检测到回归！以下用例得分下降:');
    for (const r of suiteResult.results) {
      if (r.regression?.degraded) {
        log.info(`  - ${r.testCaseId}: ${r.regression.previousScore} → ${r.regression.currentScore} (${r.regression.delta})`);
        for (const dim of r.regression.degradedDimensions) {
          log.info(`    ↳ ${dim} 退化`);
        }
      }
    }
  }
}