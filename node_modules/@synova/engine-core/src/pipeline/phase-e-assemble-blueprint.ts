/**
 * engine-server/pipeline/phase-e-assemble-blueprint.ts — Phase E (L5): 组装最终蓝图
 *
 * 输入：所有前置阶段结果 + TaskDefinitionDTO
 * 输出：FiveFormatsOutput + RiskCoverageEntry[] + DesignRationaleEntry[] + IncubationFrame
 *
 * 这是管道的最后一步，整合所有前置产物，生成策略性输出。
 */

import type {
  TaskDefinitionDTO,
  PhaseAResult,
  PhaseBResult,
  PhaseCResult,
  PhaseDResult,
  PhaseEResult,
  FiveFormatsOutput,
  RiskCoverageEntry,
  DesignRationaleEntry,
  IncubationFrame,
  SkillCard,
} from '../types';
import { PHASE_LABELS } from '../types';
import { chat } from '../llm-client';
import { extractJSON } from './llm-json-repair';
import { createLogger } from '../infra/logger';

const log = createLogger('engine-server/pipeline/phase-e-assemble-blueprint');

// ================================================================
// System Prompt
// ================================================================

function buildSystemPrompt(locale: string): string {
  return `你是一个组织设计方案撰写专家。你的任务是根据前面阶段的团队设计结果，生成风险覆盖表和设计依据。

你必须输出严格格式的 JSON。不要输出其他内容。

输出格式：
{
  "riskCoverage": [
    {
      "riskName": "风险名称",
      "coveredByRoles": ["角色ID1", "角色ID2"],
      "defenseMechanism": "防御机制描述",
      "coverageLevel": "full" | "partial" | "gap"
    }
  ],
  "designRationale": [
    {
      "dimension": "协作模式" | "角色数量" | "治层划分" | "技能匹配",
      "choice": "选择了什么",
      "alternatives": ["替代方案1", "替代方案2"],
      "reason": "选择理由",
      "sourceGap": "相关缝隙（如有）"
    }
  ],
  "statusLine": "一行中文状态描述",
  "detail": "更详细的描述"
}

设计原则：
1. riskCoverage 必须覆盖每个 failureMode（如果用户提供了）
2. 没有显式 failureMode 的风险也要基于约束条件推断
3. coverageLevel: full=有明确角色和机制覆盖, partial=有角色但机制不完善, gap=无角色覆盖
4. designRationale 至少 3 条，分别解释协作模式、角色数量、治层划分的选择原因
5. alternatives 列出至少 2 个被考虑但放弃的方案

当前语言：${locale}`;
}

// ================================================================
// User Prompt
// ================================================================

function buildUserPrompt(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  phaseC: PhaseCResult,
  phaseD: PhaseDResult,
): string {
  const rolesDesc = phaseA.teamStructure.roles
    .map((r) => `  - ${r.id}: ${r.name} (${r.governanceLayer}), 职责: ${r.responsibilities.join('、')}`)
    .join('\n');

  const mode = phaseC.collaborationMode;

  return `请为以下团队设计方案生成风险覆盖表和设计依据：

任务：${taskDef.job}
约束：${taskDef.constraints.join('；')}
失败模式（需要逐项覆盖）：${taskDef.failureModes.join('；') || '无明确失败模式'}

团队角色（${phaseA.teamStructure.totalRoles}人）：
${rolesDesc}

协作模式：${mode.label}（${mode.mode}）
选择原因：${mode.selectionReason}
权力分布：${mode.authorityGovernance.authority}
冲突解决：${mode.authorityGovernance.strategy}

请基于以上信息生成完整的风险覆盖表和设计依据。只输出 JSON。`;
}

// ================================================================
// 5 格式文件生成（规则驱动，不依赖 LLM）
// V1.4: 6 文件架构 — SOUL/IDENTITY/TOOLS/HEARTBEAT/USER/AGENTS
// ================================================================

type AgentRole = PhaseAResult['teamStructure']['roles'][0];

/** 角色分类 —— 用于按治理层 + 职责关键词匹配合适的铁律 */
function classifyRole(role: AgentRole): {
  isPM: boolean;
  isTech: boolean;
  isFrontend: boolean;
  isGovernance: boolean;
} {
  const text = `${role.name} ${role.responsibilities.join(' ')}`.toLowerCase();
  return {
    isPM: /产品|策略|市场|运营|品牌|增长|项目经理|pm\b|product/i.test(text),
    isTech: /安全|审计|合规|审查|架构|后端|运维|devops|security|cto|技术负责人/i.test(text),
    isFrontend: /前端|react|vue|ui\b|组件|界面|css|animate|交互/i.test(text),
    isGovernance: role.governanceLayer === 'L3_governance',
  };
}

/** 按角色分类生成专属铁律（注入 SOUL.md） */
function buildRoleSpecificRules(cls: ReturnType<typeof classifyRole>): string {
  const rules: string[] = [];
  if (cls.isPM) {
    rules.push('**价值三问（张良 L-02）**：任何产品需求在进入设计前必须回答：谁用？解决什么痛点？有没有更简单的方案？三问不过不落代码。');
    rules.push('**功能不膨胀（张良 L-04）**：用户没有为未请求的功能付费。上线前新增功能必须伴随等价功能削减。不削减不添加。');
  }
  if (cls.isTech) {
    rules.push('**安全审查覆盖清单（墨子 M-01）**：安全审查必须附带覆盖清单和豁免清单。没有清单的"全量审查"默认为部分审查。');
  }
  if (cls.isFrontend) {
    rules.push('**前端路径明确入口（鲁班 L-01）**：lazy import 路径必须指向明确的文件入口。运行时路径解析和编译时路径解析不是同一个东西。');
    rules.push('**状态清除统一枚举（鲁班 L-02）**：状态管理的清除逻辑必须在一个位置统一定义。跨组件状态同步不能依赖执行顺序。');
  }
  if (cls.isGovernance) {
    rules.push('**窗口期优先（张良 L-05）**：85 分的架构不优先于 60 分的可用性。当窗口期与"技术完美"冲突时，接受降级方案。');
  }
  if (rules.length === 0) return '';
  return '\n' + rules.map(r => `- ${r}`).join('\n');
}

/** 生成 SOUL.md — OCEAN + 认知基因 + 诚实边界 + 通用铁律 + 角色专属准则 */
function buildSoulMd(
  role: AgentRole,
  genome: PhaseBResult['personaGenomes'][0] | undefined,
  cls: ReturnType<typeof classifyRole>,
): string {
  const boundaries = genome?.honestBoundaries?.join('\n') || '需要持续学习和适应';
  const roleRules = buildRoleSpecificRules(cls);

  // OCEAN 人格画像
  const oceanBlock = genome ? [
    '## OCEAN 人格画像',
    '| 维度 | 分值 |',
    '|------|:----:|',
    `| 开放性 | ${genome.oceanScores.openness} |`,
    `| 尽责性 | ${genome.oceanScores.conscientiousness} |`,
    `| 外向性 | ${genome.oceanScores.extraversion} |`,
    `| 宜人性 | ${genome.oceanScores.agreeableness} |`,
    `| 情绪稳定性 | ${genome.oceanScores.neuroticism} |`,
    '',
  ].join('\n') : '';

  // 认知基因（心智模型）
  const mmBlock = genome?.mentalModels?.length ? [
    '## 认知基因',
    ...genome.mentalModels.map(mm => `- **${mm.name}**：${mm.oneLiner}（来源: ${mm.source}）`),
    '',
  ].join('\n') : '';

  // 反模式
  const antiBlock = genome?.antiPatterns?.length ? [
    '## 反模式',
    ...genome.antiPatterns.map(a => `- ${a}`),
    '',
  ].join('\n') : '';

  return `# ${role.name} · 角色基因

职责：${role.responsibilities.join('、')}
治理层：${role.governanceLayer}

${oceanBlock}${mmBlock}## 诚实边界
${boundaries}
${antiBlock}
## Synova 信息诚实铁律

作为 Synova 生成的 Agent，你必须遵守以下信息诚实原则：

1. **区分已知和推断**：当你给出一个判断时，必须区分——
   - "基于数据的事实"：可引用具体来源
   - "基于框架的推理"：标注推理框架和假设
   - "基于直觉的判断"：标注置信度低

2. **不确定时坦然承认**："我不确定"、"我需要更多信息"、"这超出了我的能力范围"是合法的、有尊严的回答。不假装知道。

3. **摘要不可决策**：不基于标题、摘要、片段信息或单指标做关键决策。如果只能接触到不完整信息，标注你的局限性并追问完整上下文。不编造缺失的部分。

4. **不编造来源**：不虚构数据、不伪造引用、不把LLM训练数据中的记忆包装成"我查过了"。${roleRules ? '\n\n## 角色专属准则' + roleRules : ''}`;
}

/** 生成 IDENTITY.md — 角色定义 + 治理权限 + 协作关系 + 角色约束 */
function buildIdentityMd(
  role: AgentRole,
  cls: ReturnType<typeof classifyRole>,
  authorityGovernance: PhaseCResult['collaborationMode']['authorityGovernance'],
  safetyBaseline: PhaseCResult['collaborationMode']['safetyBaseline'],
): string {
  const constraints: string[] = [];
  if (cls.isPM) constraints.push('- 任何产品需求在进入设计前必须通过价值三问');
  if (cls.isTech) constraints.push('- 安全审查必须附带覆盖清单和豁免清单');
  if (cls.isGovernance) constraints.push('- 窗口期判断优先于技术完美追求');

  return `# IDENTITY

- **Name:** ${role.name}
- **Role:** ${role.id}
- **Governance:** ${role.governanceLayer}

## 治理与权限
- 决策权威模式：${authorityGovernance.authority}${authorityGovernance.hasVeto ? ' · 有否决权' : ''}
- 最大自主权级别：${safetyBaseline.maxAutonomyLevel}
- 需人工审批的操作：${safetyBaseline.requireHumanApproval.length > 0 ? safetyBaseline.requireHumanApproval.join('、') : '无特殊限制'}
- 协作对象：${role.collaboratesWith?.join('、') || '全部角色'}${constraints.length > 0 ? '\n\n## 角色专属约束\n' + constraints.join('\n') : ''}`;
}

/** 生成 TOOLS.md — 技能清单 + 工具权限边界 + 引用校验 */
function buildToolsMd(
  role: AgentRole,
  skillSet: PhaseDResult['skillSets'][0] | undefined,
): string {
  const skillList = skillSet?.skills?.length
    ? skillSet.skills.map(s => `- **${s.name}**：${s.summary}（\`${s.installCommand}\`）`).join('\n')
    : role.skillsRequired.map(s => `- ${s}`).join('\n') || '- 待补充';

  return `# ${role.name} · 工具与权限

## 可用技能
${skillList}

## 消息发送协议（必须遵守）
- 向团队其他 Agent 发送消息时，必须通过 \`POST /api/v1/agent-message\`
- 请求体：\`{ from, to, type, content, blueprintId }\`
- 消息会被协议中间件拦截检查（L3 运行时裁决），违规消息自动阻断
- 不得绕过此端点直接通信——中间件是团队协作协议的运行时保障

## 工具权限边界
- 可调用：文件读写、API 调用（限定职责范围内）、通知推送
- 禁止调用：支付接口、用户数据删除、系统级配置修改
- 超出边界时：标注不确定并上报治理层

## 引用链校验
- 工具调用返回的信息必须标注来源层级（Tier-1 一手 / Tier-2 权威二手 / Tier-3 推断）
- 两跳以上引用自动标记"未验证"，不视为已验证信息（诸葛 Z-03）
- 禁止将 LLM 训练数据中的记忆包装成"已查证"`;
}

/** 生成 HEARTBEAT.md — 心跳配置 + 安全基线 + 运行探针 */
function buildHeartbeatMd(
  role: AgentRole,
  cls: ReturnType<typeof classifyRole>,
  safetyBaseline: PhaseCResult['collaborationMode']['safetyBaseline'],
): string {
  const techProbes = cls.isTech
    ? '\n- **安全审查覆盖清单检查**：每次心跳确认安全审查清单完整性（墨子 M-01）'
    : '';

  return `# ${role.name} · 心跳与健康检查

## 心跳配置
- 间隔：300s
- 超时：30s
- 健康探针：Gateway 可达性

## 安全基线
- 最大自主权：${safetyBaseline.maxAutonomyLevel}
- 需审批操作：${safetyBaseline.requireHumanApproval.length > 0 ? safetyBaseline.requireHumanApproval.join('、') : '无特殊限制'}
- 审计日志：已启用
- 熔断条件：连续 5 次失败触发熔断（S3）

## 运行探针
- **表面完成检测**：Agent 声称"已部署/已完成"但目标系统无响应 → 标记 uncirculated（Hermes H-02）
- **交叉验证**：不基于单一信息源做关键判断。每次关键决策需至少 2 个独立验证点（Hermes H-01）${techProbes}`;
}

/** 生成 USER.md — 用户自定义模板，预填引擎已知的用户上下文 */
function buildUserMd(role: AgentRole, taskDef: TaskDefinitionDTO): string {
  return `# 用户自定义配置

> 此文件由 Synova 引擎和用户共同维护。
> 引擎只追加新节，不覆盖已有内容（包括之前写入的引擎节和用户编辑的内容）。
> 你可以随时修改任何部分——你的修改不会被引擎覆盖。

<!-- section: user-preferences -->
## 偏好设置
- 沟通风格：（直接 / 结构化 / 自由讨论）
- 决策偏好：（数据驱动 / 直觉驱动 / 共识驱动）
- 工作节奏：（快速迭代 / 稳健推进 / 看情况）

<!-- section: engine-user-goal -->
## 用户目标（引擎提取 · ${new Date().toISOString().split('T')[0]}）
${taskDef.job ? `- 当前任务：${taskDef.job}` : '- （待填写）'}
${taskDef.constraints.length > 0 ? taskDef.constraints.map(c => `- 约束：${c}`).join('\n') : '- （无特殊约束）'}

<!-- section: engine-success-criteria -->
## 成功标准（引擎提取）
${taskDef.successMetrics.length > 0 ? taskDef.successMetrics.map(m => `- ${m}`).join('\n') : '- （待填写）'}

<!-- section: role-specific-notes -->
## ${role.name} 角色备忘
- 此角色的核心职责：${role.responsibilities.slice(0, 3).join('、')}
- 建议补充：（你的个人偏好、已有资源、特别注意事项等）
`;
}

function generateFiveFormats(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  phaseC: PhaseCResult,
  phaseD: PhaseDResult,
): FiveFormatsOutput {
  const roles = phaseA.teamStructure.roles;
  const proto = phaseC.collaborationMode;

  // geneYaml: 角色认知基因的 YAML 表示
  const geneYaml = generateGeneYaml(roles, phaseB);

  // capPacks: 每个角色的能力包
  const capPacks: Record<string, { manifest: string; skills: Array<{ fileName: string; content: string }> }> = {};
  for (const role of roles) {
    const skillSet = phaseD.skillSets.find(ss => ss.roleId === role.id);
    capPacks[role.id] = {
      manifest: JSON.stringify({
        name: role.name,
        role: role.id,
        version: '1.0.0',
        skills: skillSet?.skills.map(s => s.name) || role.skillsRequired,
      }, null, 2),
      skills: skillSet
        ? skillSet.skills.map((s, i) => ({
            fileName: `${role.id}-skill-${i + 1}.md`,
            content: buildSkillMarkdown(s, role),
          }))
        : role.skillsRequired.map((s, i) => ({
            fileName: `${role.id}-skill-${i + 1}.md`,
            content: `# ${s}\n\n为角色「${role.name}」的核心技能。`,
          })),
    };
  }

  // templatePreset: 模板预设（每个 agent 6 文件内容）
  // V1.5: 生成完整 AGENTS.md（团队组成表格 + 协作模式 + 工程纪律）
  const roleTable = roles.map(r =>
    `| ${r.name} | ${r.governanceLayer || 'L2_execution'} | ${r.responsibilities.slice(0, 2).join('；')} |`
  ).join('\n');

  const skillSummary = roles.map(r => {
    const skillSet = phaseD.skillSets.find(ss => ss.roleId === r.id);
    const skillNames = skillSet?.skills.map(s => s.name) || r.skillsRequired || [];
    return `- **${r.name}**: ${skillNames.slice(0, 4).join('、')}`;
  }).join('\n');

  const agentsMdContent = `# ${phaseA.teamStructure.totalRoles}人团队 · ${proto.label}

## 团队概述
- **协作模式**: ${proto.label} — ${proto.description || '引擎选定模式'}
- **团队规模**: ${phaseA.teamStructure.recommendedTeamSize}人
- **任务**: ${taskDef.job}
- **选择原因**: ${proto.selectionReason || '基于约束和角色特征自动匹配'}

## 团队组成
| 角色 | 治理层 | 主要职责 |
|------|--------|----------|
${roleTable}

## 协作规则
- **信息流**: ${proto.informationFlow?.topology || 'star'} 拓扑, ${proto.informationFlow?.syncMode || 'round_robin'} 同步
- **冲突解决**: ${proto.authorityGovernance?.strategy || 'single_decider'}, 死锁超时 ${proto.authorityGovernance?.deadlockTimeoutSeconds || 300}s
- **权力分布**: ${proto.authorityGovernance?.authority || 'hierarchical'}${proto.authorityGovernance?.hasVeto ? ', 含否决权' : ''}
- **外部接口**: ${proto.externalInterface?.strategy || 'gatekeeper'} 策略

## 安全基线
- **最大自主级别**: ${proto.safetyBaseline?.maxAutonomyLevel || 'medium'}
- **需人工审批**: ${Array.isArray(proto.safetyBaseline?.requireHumanApproval) ? proto.safetyBaseline!.requireHumanApproval.join('、') : '关键决策'}
- **审计日志**: ${proto.safetyBaseline?.auditLogEnabled !== false ? '已启用' : '已禁用'}

## 技能分配
${skillSummary}

## 工程纪律
1. **先想后写** — 明确假设，暴露权衡，先问再动手
2. **简洁优先** — 用最少代码解决问题，不写推测性代码
3. **精准修改** — 只触碰必须改的，匹配已有风格
4. **目标驱动** — 定义成功标准，循环验证直到达标
5. **数据说话** — 所有结论必须有数据或推理链支撑
6. **安全第一** — 涉及资金/数据/部署的操作必须经过审批`;

  const templatePreset = {
    agentsMd: agentsMdContent,
    agents: roles.map((r) => {
      const genome = phaseB.personaGenomes.find(g => g.roleId === r.id);
      const skillSet = phaseD.skillSets.find(ss => ss.roleId === r.id);
      const cls = classifyRole(r);

      return {
        dirName: r.id,
        soulMd: buildSoulMd(r, genome, cls),
        identityMd: buildIdentityMd(r, cls, proto.authorityGovernance, proto.safetyBaseline),
        toolsMd: buildToolsMd(r, skillSet),
        heartbeatMd: buildHeartbeatMd(r, cls, proto.safetyBaseline),
        userMd: buildUserMd(r, taskDef),
      };
    }),
  };

  // teamYaml: 团队结构 YAML
  const teamYaml = [
    `team:`,
    `  size: ${phaseA.teamStructure.totalRoles}`,
    `  recommended: ${phaseA.teamStructure.recommendedTeamSize}`,
    `  mode: ${proto.mode}`,
    `  roles:`,
    ...roles.map((r) => `    - id: ${r.id}\n      name: ${r.name}\n      governance: ${r.governanceLayer}`),
  ].join('\n');

  // protocolYaml: 协作协议 YAML
  const protocolYaml = [
    `protocol:`,
    `  mode: ${proto.mode}`,
    `  label: ${proto.label}`,
    `  division_of_labor:`,
    `    mode: ${proto.divisionOfLabor.mode}`,
    `    substitutable: ${proto.divisionOfLabor.substitutable}`,
    `  information_flow:`,
    `    topology: ${proto.informationFlow.topology}`,
    `    sync_mode: ${proto.informationFlow.syncMode}`,
    `  authority_governance:`,
    `    strategy: ${proto.authorityGovernance.strategy}`,
    `    deadlock_timeout: ${proto.authorityGovernance.deadlockTimeoutSeconds}s`,
    `    authority: ${proto.authorityGovernance.authority}`,
    `    has_veto: ${proto.authorityGovernance.hasVeto}`,
    `  trust_incentive:`,
    `    alignment: ${proto.trustIncentive.alignment}`,
    `    initial_trust: ${proto.trustIncentive.initialTrust}`,
    `    update: ${proto.trustIncentive.updateMechanism}`,
    `  knowledge_sharing:`,
    `    strategy: ${proto.knowledgeSharing.strategy}`,
    `  external_interface:`,
    `    strategy: ${proto.externalInterface.strategy}`,
    `  safety:`,
    `    require_approval: [${proto.safetyBaseline.requireHumanApproval.join(', ')}]`,
    `    max_autonomy: ${proto.safetyBaseline.maxAutonomyLevel}`,
  ].join('\n');

  return { geneYaml, capPacks, templatePreset, teamYaml, protocolYaml };
}

function generateGeneYaml(
  roles: PhaseAResult['teamStructure']['roles'],
  phaseB: PhaseBResult,
): string {
  const lines = ['genes:'];
  for (const role of roles) {
    const genome = phaseB.personaGenomes.find((g) => g.roleId === role.id);
    if (!genome) continue;
    lines.push(`  - role: ${role.id}`);
    lines.push(`    name: ${role.name}`);
    lines.push(`    ocean:`);
    lines.push(`      openness: ${genome.oceanScores.openness}`);
    lines.push(`      conscientiousness: ${genome.oceanScores.conscientiousness}`);
    lines.push(`      extraversion: ${genome.oceanScores.extraversion}`);
    lines.push(`      agreeableness: ${genome.oceanScores.agreeableness}`);
    lines.push(`      neuroticism: ${genome.oceanScores.neuroticism}`);
    lines.push(`    mental_models:`);
    for (const mm of genome.mentalModels) {
      lines.push(`      - ${mm.name}: ${mm.oneLiner}`);
    }
    lines.push(`    boundaries:`);
    for (const b of genome.honestBoundaries) {
      lines.push(`      - ${b}`);
    }
  }
  return lines.join('\n');
}

/** V1.4: 将 SkillCard 展开为完整的 Markdown 技能文件内容 */
function buildSkillMarkdown(skill: SkillCard, role: PhaseAResult['teamStructure']['roles'][0]): string {
  const lines = [
    `# ${skill.name}`,
    '',
    `> ${skill.summary}`,
    '',
    skill.description ? `${skill.description}` : '',
    '',
    '## 使用场景',
    ...(skill.scenarios || []).map((s, i) => `${i + 1}. ${s}`),
    '',
    '## 执行步骤',
    ...(skill.steps || []).map((s, i) => `${i + 1}. ${s}`),
    '',
    '---',
    `**角色**: ${role.name}`,
    `**分类**: ${skill.category}`,
    `**标签**: ${skill.tags.join(', ')}`,
    `**版本**: ${skill.version}`,
    skill.securityScore !== null ? `**安全评分**: ${skill.securityScore}/100` : '',
    `**安装指令**: \`${skill.installCommand}\``,
    skill.sourceFramework ? `**来源框架**: ${skill.sourceFramework}` : '',
  ];
  return lines.filter(l => l !== '').join('\n');
}

// ================================================================
// 主函数
// ================================================================

export async function runPhaseE(
  taskDef: TaskDefinitionDTO,
  phaseA: PhaseAResult,
  phaseB: PhaseBResult,
  phaseC: PhaseCResult,
  phaseD: PhaseDResult,
  locale: string,
  abortSignal: AbortSignal,
): Promise<PhaseEResult> {
  let parsed: any;
  let llmRaw: string;
  try {
    const result = await chat({
      systemPrompt: buildSystemPrompt(locale),
      userMessage: buildUserPrompt(taskDef, phaseA, phaseB, phaseC, phaseD),
      abortSignal,
      temperature: 0.5,
    });
    llmRaw = result.content;
    const jsonStr = extractJSON(llmRaw);
    parsed = JSON.parse(jsonStr);
  } catch (llmErr) {
    log.warn(`[phase-e] LLM 蓝图组装失败，降级到规则组装: ${(llmErr as Error).message}`);
    llmRaw = `[phase-e fallback] ${(llmErr as Error).message}`;
    parsed = { riskCoverage: [], designRationale: [] };
  }

  // 构建风险覆盖表
  const riskCoverage: RiskCoverageEntry[] = (parsed.riskCoverage || []).map((rc: any) => ({
    riskName: rc.riskName || '未知风险',
    coveredByRoles: Array.isArray(rc.coveredByRoles) ? rc.coveredByRoles : [],
    defenseMechanism: rc.defenseMechanism || '需要进一步分析',
    coverageLevel: ['full', 'partial', 'gap'].includes(rc.coverageLevel) ? rc.coverageLevel : 'partial',
  }));

  // 补充 failureModes 中未被覆盖的风险
  const coveredRisks = new Set(riskCoverage.map((r) => r.riskName));
  for (const fm of taskDef.failureModes) {
    if (!coveredRisks.has(fm)) {
      riskCoverage.push({
        riskName: fm,
        coveredByRoles: [],
        defenseMechanism: '待评估',
        coverageLevel: 'gap',
      });
    }
  }

  // 构建设计依据
  const designRationale: DesignRationaleEntry[] = (parsed.designRationale || []).map((dr: any) => ({
    dimension: dr.dimension || '未分类',
    choice: dr.choice || '未知选择',
    alternatives: Array.isArray(dr.alternatives) ? dr.alternatives : [],
    reason: dr.reason || '基于引擎分析',
    sourceGap: dr.sourceGap,
  }));

  // 生成 5 格式文件
  const fiveFormats = generateFiveFormats(taskDef, phaseA, phaseB, phaseC, phaseD);

  const incubationFrame: IncubationFrame = {
    phaseId: 'L5_assemble_blueprint',
    phaseLabel: PHASE_LABELS.L5_assemble_blueprint,
    progress: 95,
    statusLine: parsed.statusLine || '正在生成最终团队蓝图...',
    detail: parsed.detail || `风险覆盖 ${riskCoverage.length} 项，设计依据 ${designRationale.length} 条`,
  };

  return { fiveFormats, riskCoverage, designRationale, incubationFrame, llmRaw };
}
