/**
 * blueprint-converter.ts — BlueprintDTO → TeamTemplate 转换器
 *
 * 将引擎管道产出的 BlueprintDTO 转换为 OpenClaw Gateway 可安装的 TeamTemplate。
 * 这是引擎产物落地到 Agent 运行时的桥梁。
 *
 * V1.4 6 文件架构 — 每个 agent 产出 SOUL/IDENTITY/TOOLS/HEARTBEAT/USER，
 * 内容由 Phase E generateFiveFormats() 预生成，通过 BlueprintDTO.fiveFormats 传递。
 *
 * 生成的 OpenClaw 工作空间文件（通过 TemplateInstaller 写入）：
 *   ~/.openclaw/agents/{blueprintId}/
 *   ├── AGENTS.md          ← 团队操作规则 + 设计依据 + 证据链 + 工程纪律
 *   └── agents/{角色}/
 *       ├── SOUL.md        ← OCEAN + 认知基因 + 诚实边界 + 4铁律 + 角色准则
 *       ├── TOOLS.md       ← 技能清单 + 工具权限边界 + 引用校验
 *       ├── HEARTBEAT.md   ← 心跳配置 + 安全基线 + 运行探针
 *       ├── USER.md        ← 用户自定义模板
 *       └── agent/IDENTITY.md ← 角色定义 + 治理权限 + 约束
 */

import type { BlueprintDTO, RoleBlue, PersonaGenomeBlue, SkillSetBlue, SkillCard } from '../types';
import type { TeamTemplate, AgentTemplate } from '../types/template';

// ================================================================
// 主转换函数
// ================================================================

export function convertBlueprintToTeamTemplate(blueprint: BlueprintDTO): TeamTemplate {
  const fiveFormatsAgents = blueprint.fiveFormats?.templatePreset?.agents || [];

  const agents: AgentTemplate[] = blueprint.teamStructure.roles.map((role) => {
    const genome = blueprint.personaGenomes.find((g) => g.roleId === role.id);
    const skillSet = blueprint.skillSets.find((s) => s.roleId === role.id);
    const fiveAgent = fiveFormatsAgents.find(a => a.dirName === role.id);

    return {
      name: role.name,
      role: role.responsibilities[0] || role.name,
      description: buildAgentDescription(role, genome),
      // 优先用 Phase E 生成的 soulMd（含 OCEAN + 4铁律 + 角色准则）,
      // 降级到 buildSoulContent/buildFallbackSoul
      soul: fiveAgent?.soulMd || (genome ? buildSoulContent(role, genome) : buildFallbackSoul(role)),
      initialSkills: skillSet?.skills.map((s) => s.name) || role.skillsRequired,
      suggestedModel: 'deepseek-v4-pro',
      toolsMd: fiveAgent?.toolsMd || buildToolsMd(role, skillSet),
      heartbeatMd: fiveAgent?.heartbeatMd,
      userMd: fiveAgent?.userMd,
      bootstrapMd: buildBootstrapMd(role),
      memoryMd: buildMemoryMd(role, blueprint.blueprintId),
      skills: skillSet?.skills.map((s) => ({
        id: s.id,
        name: s.name,
        summary: s.summary,
        description: s.description,
        scenarios: s.scenarios,
        steps: s.steps,
        tags: s.tags,
        category: s.category,
        version: s.version,
        installCommand: s.installCommand,
        securityScore: s.securityScore,
        sourceFramework: s.sourceFramework,
        isMarketplaceSkill: s.isMarketplaceSkill,
        license: s.license,
        compatibility: s.compatibility,
        metadata: s.metadata,
        allowedTools: s.allowedTools,
        prerequisites: s.prerequisites,
        failureModes: s.failureModes,
        sourceTier: s.sourceTier,
        dependsOn: s.dependsOn,
        conflictsWith: s.conflictsWith,
        triggers: s.triggers,
        strategicLink: s.strategicLink,
        geneSources: s.geneSources,
        approvalRequired: s.approvalRequired,
      })),
    };
  });

  return {
    id: blueprint.blueprintId,
    name: blueprint.taskDef.job.substring(0, 40),
    description: blueprint.taskDef.job,
    version: blueprint.engineVersion || '1.0.0',
    agents,
    agentsMd: buildAgentsMd(blueprint),
    firstTask: `团队「${blueprint.taskDef.job.substring(0, 30)}」已就绪。协作模式：${blueprint.collaborationMode.label}。共 ${blueprint.teamStructure.totalRoles} 个角色，${blueprint.skillSets.reduce((sum, ss) => sum + ss.skills.length, 0)} 个技能已部署。`,
    teamWorkflow: blueprint.collaborationMode.label,
    tags: blueprint.taskDef.constraints.slice(0, 5),
    protocol: buildProtocolJson(blueprint),
  };
}

// ================================================================
// Agent 描述
// ================================================================

function buildAgentDescription(role: RoleBlue, genome?: PersonaGenomeBlue): string {
  const parts = [`治理层：${governanceLabel(role.governanceLayer)}`];
  if (genome?.honestBoundaries?.[0]) {
    parts.push(`边界：${genome.honestBoundaries[0]}`);
  }
  if (role.collaboratesWith?.length) {
    parts.push(`协作：${role.collaboratesWith.join('、')}`);
  }
  return `${role.name} — ${role.responsibilities.join('、')}。${parts.join('。')}`;
}

function governanceLabel(layer: string): string {
  switch (layer) {
    case 'L1_understanding': return '理解层';
    case 'L2_execution': return '执行层';
    case 'L3_governance': return '治理层';
    default: return layer;
  }
}

// ================================================================
// SOUL.md 生成
// ================================================================

function buildSoulContent(role: RoleBlue, genome: PersonaGenomeBlue): string {
  const ocean = genome.oceanScores;
  const lines: string[] = [
    `# ${role.name} · SOUL.md`,
    '',
    '## OCEAN 人格画像',
    '| 维度 | 分值 | 行为特征 |',
    '|------|:----:|----------|',
    `| 开放性 | ${ocean.openness} | ${oceanTraitDesc('openness', ocean.openness)} |`,
    `| 尽责性 | ${ocean.conscientiousness} | ${oceanTraitDesc('conscientiousness', ocean.conscientiousness)} |`,
    `| 外向性 | ${ocean.extraversion} | ${oceanTraitDesc('extraversion', ocean.extraversion)} |`,
    `| 宜人性 | ${ocean.agreeableness} | ${oceanTraitDesc('agreeableness', ocean.agreeableness)} |`,
    `| 情绪稳定性 | ${ocean.neuroticism} | ${oceanTraitDesc('neuroticism', ocean.neuroticism)} |`,
    '',
    '## 核心使命',
    role.responsibilities.map((r) => `- ${r}`).join('\n'),
    '',
    '## 角色定位',
    `${role.name} — 治理层：${governanceLabel(role.governanceLayer)}`,
  ];

  // 认知基因
  if (genome.mentalModels.length > 0) {
    lines.push('', '## 认知基因', '');
    for (const mm of genome.mentalModels) {
      lines.push(`### ${mm.name}`);
      lines.push(`> ${mm.oneLiner}`);
      lines.push('');
      lines.push(`**应用场景**：${mm.application}`);
      if (mm.limitation) lines.push(`**局限性**：${mm.limitation}`);
      if (mm.decisionScenarios?.length) {
        lines.push(`**决策场景**：${mm.decisionScenarios.join('、')}`);
      }
      lines.push('');
    }
  }

  // 诚实边界
  if (genome.honestBoundaries.length > 0) {
    lines.push(
      '## 诚实边界',
      ...genome.honestBoundaries.map((b) => `- ${b}`),
      '',
    );
  }

  // 反模式
  if (genome.antiPatterns.length > 0) {
    lines.push(
      '## 反模式',
      ...genome.antiPatterns.map((a) => `- ${a}`),
      '',
    );
  }

  // 安全锚点
  lines.push(
    '## 安全锚点（硬约束，绝对不可违反）',
    '- **禁止越权操作**：不得执行超出角色职责范围的操作',
    '- **禁止编造信息**：不确定时必须明确标注不确定性',
    '- **禁止绕过审批**：需要人工审批的操作不可自行决定',
    '',
    `**置信度**：${((genome.confidence ?? 0) * 100).toFixed(0)}%`,
  );

  return lines.join('\n');
}

/** OCEAN 各维度的行为特征描述 */
export function oceanTraitDesc(dimension: string, score: number): string {
  const high = score >= 70;
  const low = score <= 30;
  const mid = !high && !low;

  switch (dimension) {
    case 'openness':
      return high ? '高度创新，拥抱变化，对模糊性容忍度高' :
             low ? '偏好稳定和可预测性，依赖已验证的方法' :
             '在创新与稳定之间保持平衡';
    case 'conscientiousness':
      return high ? '高度自律，重视细节和规范，追求卓越' :
             low ? '灵活应变，不拘泥于流程，适应快速变化' :
             '兼顾规范性与灵活性';
    case 'extraversion':
      return high ? '主动沟通，善于协作，积极表达观点' :
             low ? '深度专注，独立思考，偏好异步沟通' :
             '适度参与协作，保持个人工作节奏';
    case 'agreeableness':
      return high ? '重视团队和谐，善于调解冲突，包容多元观点' :
             low ? '直言不讳，坚持原则，不回避艰难对话' :
             '在合作与原则之间寻求平衡';
    case 'neuroticism':
      return high ? '对风险高度敏感，能提前识别潜在问题' :
             low ? '情绪稳定，在压力下保持冷静，抗干扰能力强' :
             mid ? '适度的压力感知，能有效应对不确定情况' : '中性';
    default:
      return '—';
  }
}

/** 无 PersonaGenome 时的最小兜底 SOUL.md */
function buildFallbackSoul(role: RoleBlue): string {
  return [
    `# ${role.name} · SOUL.md`,
    '',
    '## 核心使命',
    ...role.responsibilities.map((r) => `- ${r}`),
    '',
    '## 角色定位',
    `${role.name} — 治理层：${governanceLabel(role.governanceLayer)}`,
    '',
    '## 诚实边界',
    `- 我知道：${role.responsibilities.join('、')}`,
    '- 我不知道：超出我职责范围的具体实现细节',
    '- 我不确定时会：明确标注不确定性，建议咨询相关人员',
    '',
    '## 安全锚点',
    '- **禁止越权操作**：不得执行超出角色职责范围的操作',
    '- **禁止编造信息**：不确定时必须明确标注不确定性',
    '',
    '> 此 SOUL.md 由 Synova 引擎自动生成（降级模式）。',
    '> 用户可在 Gateway 中自定义此文件。',
  ].join('\n');
}

// ================================================================
// BOOTSTRAP.md 生成（一次性初始化仪式）
// ================================================================

function buildBootstrapMd(role: RoleBlue): string {
  const now = new Date().toISOString();
  return [
    `# ${role.name} · BOOTSTRAP.md`,
    '',
    '> 这是一次性初始化仪式文件。Agent 首次启动时读取并执行，执行后 Gateway 标记 `bootstrapped: true`。',
    '',
    '## 初始化清单',
    '',
    '1. **确认身份**：读取 SOUL.md，理解自己的 OCEAN 人格、核心使命和诚实边界',
    '2. **确认团队**：读取 AGENTS.md，了解团队组成、协作协议和队友职责',
    '3. **确认工具**：读取 TOOLS.md，了解自己能执行的操作和权限边界',
    '4. **确认心跳**：读取 HEARTBEAT.md，了解巡检频率和报告目标',
    '5. **确认记忆**：读取 MEMORY.md，了解团队历史和已有知识',
    '',
    '## 首次启动行为',
    '',
    `- 向团队 Leader 发送就绪消息："${role.name} 已就绪，职责：${role.responsibilities.slice(0, 2).join('、')}"`,
    '- 确认协作协议和通信规则已加载',
    `- 初始化日期：${now.split('T')[0]}`,
    '',
    '## 元数据',
    '',
    `- created: ${now}`,
    `- role: ${role.name}`,
    `- governance: ${role.governanceLayer}`,
    `- bootstrapped: false`,
    '',
  ].join('\n');
}

// ================================================================
// MEMORY.md 生成（跨 session 记忆索引种子）
// ================================================================

function buildMemoryMd(role: RoleBlue, blueprintId: string): string {
  const now = new Date().toISOString().split('T')[0];
  return [
    `# ${role.name} · MEMORY.md`,
    '',
    '> 跨 session 记忆索引。Agent 每次对话结束时，将关键决策和学到的新知追加到此文件。',
    '',
    '## 团队信息',
    '',
    `- 团队 ID：${blueprintId}`,
    `- 创建日期：${now}`,
    `- 角色：${role.name}`,
    '',
    '## 关键决策记录',
    '',
    '（Agent 在对话中做出的重要决策会自动追加到此处）',
    '',
    '## 学到的知识',
    '',
    '（Agent 从对话中提取的新知识会自动追加到此处）',
    '',
    '## 记忆索引',
    '',
    '| 日期 | 类型 | 摘要 |',
    '|------|------|------|',
    `| ${now} | 初始化 | 团队创建，角色 ${role.name} 就绪 |`,
    '',
  ].join('\n');
}

// ================================================================
// TOOLS.md 生成（Agent 能做什么 — 过程描述，非工具定义表）
// ================================================================

function buildToolsMd(role: RoleBlue, skillSet?: SkillSetBlue): string {
  const lines: string[] = [
    `# ${role.name} · TOOLS.md`,
    '',
    `> ${role.name} 能做什么。这不是工具定义表（工具定义在 plugin manifest 中），而是用户视角的能力说明。`,
    '',
    '## 核心能力',
    '',
    ...role.responsibilities.map((r) => `- ${r}`),
  ];

  if (skillSet?.skills.length) {
    lines.push('', '## 支持的技能', '');
    for (const skill of skillSet.skills) {
      lines.push(`### ${skill.name}`);
      lines.push(`> ${skill.summary}`);
      if (skill.scenarios?.length) {
        lines.push('', '**适用场景**：');
        lines.push(...skill.scenarios.map((s) => `- ${s}`));
      }
      if (skill.steps?.length) {
        lines.push('', '**执行步骤**：');
        lines.push(...skill.steps.map((s, i) => `${i + 1}. ${s}`));
      }
      lines.push('');
    }
  }

  lines.push(
    '## 权限边界',
    `- 治理层：${governanceLabel(role.governanceLayer)}`,
    '- 不可越权操作超出职责范围的任务',
    ...(role.specialPrivileges || []).map((p) => `- **特权**：${p}`),
    '',
  );

  if (role.collaboratesWith?.length) {
    lines.push('## 协作对象', '', ...role.collaboratesWith.map((c) => `- ${c}`), '');
  }

  return lines.join('\n');
}

function buildAgentsMd(blueprint: BlueprintDTO): string {
  const ts = blueprint.teamStructure;
  const mode = blueprint.collaborationMode;
  const lines: string[] = [
    `# ${blueprint.taskDef.job.substring(0, 40)} — AI 团队协作规则`,
    '',
    '## 团队理念',
    '',
    `> 协作模式：${mode.label}（${mode.mode}）`,
    `> ${mode.selectionReason}`,
    `> 引擎版本：${blueprint.engineVersion}  ·  管道版本：${blueprint.pipelineVersion}`,
    `> 生成时间：${blueprint.generatedAt}`,
    '',
    '## 团队组成',
    '',
    '| 角色 | 治理层 | 职责 | 协作对象 |',
    '|------|--------|------|---------|',
    ...ts.roles.map((r) =>
      `| **${r.name}** | ${governanceLabel(r.governanceLayer)} | ${r.responsibilities.slice(0, 2).join('、')} | ${(r.collaboratesWith || []).join('、') || '全部角色'} |`,
    ),
    '',
    '## 协作协议',
    '',
    `**分工模式**：${mode.divisionOfLabor.mode}（${mode.divisionOfLabor.substitutable ? '可替代' : '不可替代'}）`,
    `**信息流**：${mode.informationFlow.topology} · ${mode.informationFlow.syncMode}`,
    `**权限治理**：${mode.authorityGovernance.strategy} / ${mode.authorityGovernance.authority} · 死锁超时 ${mode.authorityGovernance.deadlockTimeoutSeconds}s${mode.authorityGovernance.hasVeto ? ' · 有否决权' : ''}`,
    `**信任与激励**：${mode.trustIncentive.alignment} / 初始信任 ${mode.trustIncentive.initialTrust} · 更新=${mode.trustIncentive.updateMechanism}`,
    `**知识共享**：${mode.knowledgeSharing.strategy} · 同步间隔 ${mode.knowledgeSharing.syncIntervalHours}h`,
    `**对外接口**：${mode.externalInterface.strategy}${mode.externalInterface.canBypassProtocol ? ' · 可绕过协议' : ''}`,
    '',
  ];

  // 安全基线
  const safety = mode.safetyBaseline;
  lines.push(
    '## 安全基线',
    '',
    `**最大自主权**：${safety.maxAutonomyLevel}`,
    `**审计日志**：${safety.auditLogEnabled ? '已启用' : '未启用'}`,
    `**需人工审批的操作**：${safety.requireHumanApproval.length > 0 ? safety.requireHumanApproval.join('、') : '无特殊限制'}`,
    '',
  );

  // 设计依据
  if (blueprint.designRationale.length > 0) {
    lines.push('## 设计依据', '');
    for (const dr of blueprint.designRationale.slice(0, 6)) {
      lines.push(`- **${dr.dimension}**：${dr.choice} — ${dr.reason}`);
      if (dr.alternatives?.length) {
        lines.push(`  - 备选方案：${dr.alternatives.join('、')}`);
      }
    }
    lines.push('');
  }

  // 风险覆盖
  if (blueprint.riskCoverage.length > 0) {
    lines.push('## 风险覆盖', '');
    for (const rc of blueprint.riskCoverage) {
      const icon = rc.coverageLevel === 'full' ? '✅' : rc.coverageLevel === 'partial' ? '⚠️' : '❌';
      lines.push(`- ${icon} **${rc.riskName}**：${rc.defenseMechanism}（${rc.coveredByRoles.join('、') || '无角色覆盖'}）`);
    }
    lines.push('');
  }

  // 证据链
  if (blueprint.evidenceChain?.length) {
    lines.push('## 证据链', '');
    for (const ev of blueprint.evidenceChain) {
      const linkSummary = ev.links?.slice(0, 3).map((l) => l.mentalModel).join('、') || '—';
      lines.push(`- **${ev.roleName || ev.roleId}**：${linkSummary}`);
    }
    lines.push('');
  }

  // 工程纪律
  lines.push(
    '## 工程纪律',
    '',
    '1. **角色边界不可逾越**：每个 Agent 严格在自身职责范围内行动',
    '2. **不确定即上报**：遇到超出认知边界的问题，标记为不确定而非猜测',
    '3. **安全基线刚性**：需人工审批的操作不可自行绕过',
    '4. **证据可追溯**：关键决策必须引用设计依据或证据链',
    '5. **Agent 之间直接协作**：无需经过人类中转，但敏感操作需人类审批',
    '6. **窗口期优先（张良 L-05）**：85 分的架构不优先于 60 分的可用性。当窗口期与"技术完美"冲突时，接受降级方案',
    '7. **单文件锁（墨子 M-04）**：多人并行改同一段代码前，先锁文件（公告或标记），改完解锁通知所有人',
    '8. **消息必须走中间件**：Agent 间通信必须通过 POST /api/v1/agent-message。L3 协议中间件对每条消息做运行时裁决（LOCK/BLOCK/WARN），违规消息自动阻断——这是团队协议的运行时保障，不可绕过',
    '',
    '> **USER.md delta-merge 已实装**：引擎以追加方式更新 USER.md（新 section 追加到末尾，已有 section 不覆盖）。用户通过 L0 对话或后续配置输入的个人信息，引擎有权写入新增 section。用户已编辑的内容（包括之前引擎写入的 section）不受影响。',
    '',
    `> 此 AGENTS.md 由 Synova 引擎（${blueprint.engineVersion}）自动生成。`,
    `> 覆盖等级：${blueprint.coverageLevel}`,
  );

  return lines.join('\n');
}

// ================================================================
// protocol.json 生成（L3 中间件数据）
// ================================================================

function buildProtocolJson(blueprint: BlueprintDTO): Record<string, unknown> {
  const cm = blueprint.collaborationMode;

  const visibilityByStrategy: Record<string, string> = {
    central_repo: 'internal',
    pair_sharing: 'internal',
    downward_pour: 'internal',
    free_for_all: 'internal',
  };

  const sandboxByStrategy: Record<string, string> = {
    gatekeeper: 'full',
    ambassador: 'semi',
    buffer: 'semi',
    open_door: 'none',
  };

  return {
    version: 1,
    blueprintId: blueprint.blueprintId,
    mode: cm.mode,
    generatedAt: blueprint.generatedAt,
    roles: blueprint.teamStructure.roles.map((r) => r.id),
    gaps: {
      division_of_labor: {
        mode: cm.divisionOfLabor.mode,
        substitutable: cm.divisionOfLabor.substitutable,
      },
      information_flow: {
        topology: cm.informationFlow.topology,
        syncMode: cm.informationFlow.syncMode,
        routingMap: cm.informationFlow.routingMap || {},
        visibilityMatrix: cm.informationFlow.visibilityMatrix || {},
      },
      authority_governance: {
        strategy: cm.authorityGovernance.strategy,
        deadlockTimeoutSeconds: cm.authorityGovernance.deadlockTimeoutSeconds,
        deciderRoleId: cm.authorityGovernance.deciderRoleId,
        authority: cm.authorityGovernance.authority,
        hasVeto: cm.authorityGovernance.hasVeto,
        vetoRoles: cm.authorityGovernance.vetoRoles,
      },
      trust_incentive: {
        alignment: cm.trustIncentive.alignment,
        successSignal: cm.trustIncentive.successSignal,
        failureSignal: cm.trustIncentive.failureSignal,
        initialTrust: cm.trustIncentive.initialTrust,
        updateMechanism: cm.trustIncentive.updateMechanism,
      },
      knowledge_sharing: {
        defaultVisibility: visibilityByStrategy[cm.knowledgeSharing.strategy] || 'internal',
        strategy: cm.knowledgeSharing.strategy,
        syncIntervalHours: cm.knowledgeSharing.syncIntervalHours,
      },
      external_interface: {
        isolation: {
          sandboxLevel: sandboxByStrategy[cm.externalInterface.strategy] || 'full',
        },
        strategy: cm.externalInterface.strategy,
        canBypassProtocol: cm.externalInterface.canBypassProtocol,
      },
    },
    safetyBaseline: {
      requireHumanApproval: cm.safetyBaseline.requireHumanApproval,
      auditLogEnabled: cm.safetyBaseline.auditLogEnabled,
      maxAutonomyLevel: cm.safetyBaseline.maxAutonomyLevel,
    },
  };
}
