/**
 * template-seeder.ts — 模板→引擎管线种子转换器
 *
 * 将 TeamTemplate（预设模板）转换为引擎管线的种子数据。
 * 模板安装时，引擎以种子为 strong prior 运行 L1-L5 管线，
 * 产出个性化 Blueprint，最终写入 Gateway。
 *
 * 种子注入策略：
 * - L1: 模板角色作为初始角色集（引擎可增减）
 * - L2: 模板 agent 的 role/description 作为 persona 种子（引擎蒸馏个性化）
 * - L3: 模板协作模式作为默认协议（引擎可调整）
 * - L4: 模板技能作为基础技能集（引擎可补充）
 * - L5: 模板 AGENTS.md 作为组装参考
 */

import type { TeamTemplate, AgentTemplate } from '../types/template';
import type {
  TaskDefinitionDTO,
  RoleBlue,
  TeamStructureBlue,
  DesignRationaleEntry,
} from '../types';

// ── 管线种子类型 ──

export interface PipelineSeeds {
  /** L1: 种子团队结构（角色 + 拓扑） */
  teamStructure: TeamStructureBlue;

  /** L2: 种子 persona 描述（给 LLM 作为参考） */
  personaSeeds: PersonaSeed[];

  /** L3: 种子协作模式 ID（from template manifest） */
  collaborationModeHint?: string;

  /** L4: 种子技能名称列表（按角色） */
  skillSeeds: SkillSeed[];

  /** L5: 模板已有的 AGENTS.md 内容（LLM 可参考或改写） */
  agentsMdSeed?: string;

  /** 模板一级描述 */
  templateDescription: string;

  /** V1.5 L0 诊断信息（从 L0 对话提取，注入 L1-L5 各阶段） */
  l0Diagnosis?: L0DiagnosisSeed;
}

/** L0 诊断种子 — 从 L0 对话提取的结构化信息，注入引擎管线 */
export interface L0DiagnosisSeed {
  /** 行业/领域 */
  industry: string;
  /** 团队规模（用户指定或推断） */
  teamSize: number | null;
  /** 预算范围 */
  budget: string;
  /** 技术栈偏好 */
  techStack: string[];
  /** 合规需求 */
  complianceNeeds: string[];
  /** 风险偏好 */
  riskAppetite: 'conservative' | 'balanced' | 'aggressive' | 'unstated';
  /** 目标市场/地理位置 */
  marketGeography: string;
  /** 领域关键词 */
  domainKeywords: string[];
  /** 时间紧迫性 */
  timeline: 'urgent' | 'normal' | 'relaxed' | 'unstated';
  /** 商业模式 */
  businessModel: string;
  /** 现有资产/基础设施 */
  existingAssets: string[];
}

export interface PersonaSeed {
  roleId: string;
  roleName: string;
  description: string;
  role: string;
  suggestedModel?: string;
}

export interface SkillSeed {
  roleId: string;
  roleName: string;
  skillNames: string[];
}

// ── 转换函数 ──

/** 从模板 Agent 列表推导任务定义 */
export function templateToTaskDefinition(template: TeamTemplate): TaskDefinitionDTO {
  const agentDescriptions = template.agents
    .map(a => `${a.name}(${a.role}): ${a.description}`)
    .join('; ');

  const constraints = template.tags && template.tags.length > 0
    ? template.tags
    : [`${template.name}团队协作`];

  return {
    job: template.description || `组建"${template.name}"团队`,
    constraints,
    successMetrics: ['团队安装成功', 'Agent 正常对话'],
    failureModes: ['Agent 能力不匹配业务场景'],
    stage: 'from_scratch',
    confidence: 0.7,
    sanitizationLevel: 'standard',
  };
}

/** 从模板提取管线种子数据 */
export function templateToSeeds(template: TeamTemplate): PipelineSeeds {
  return {
    teamStructure: buildSeededTeamStructure(template),
    personaSeeds: template.agents.map(a => ({
      roleId: sanitizeRoleId(a.name),
      roleName: a.name,
      description: a.description,
      role: a.role,
      suggestedModel: a.suggestedModel,
    })),
    collaborationModeHint: template.manifest?.collaborationMode as string | undefined,
    skillSeeds: template.agents
      .filter(a => a.initialSkills.length > 0)
      .map(a => ({
        roleId: sanitizeRoleId(a.name),
        roleName: a.name,
        skillNames: a.initialSkills,
      })),
    agentsMdSeed: template.agentsMd || undefined,
    templateDescription: template.description,
  };
}

// ── 辅助函数 ──

function sanitizeRoleId(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9一-鿿_-]/g, '_')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .slice(0, 32);
}

function buildSeededTeamStructure(template: TeamTemplate): TeamStructureBlue {
  const governanceLayers = ['L1_understanding', 'L2_execution', 'L3_governance'] as const;

  const roles: RoleBlue[] = template.agents.map((a, i) => ({
    id: sanitizeRoleId(a.name),
    name: a.name,
    responsibilities: [a.description],
    skillsRequired: a.initialSkills,
    collaboratesWith: template.agents
      .filter((_, j) => j !== i)
      .map(o => sanitizeRoleId(o.name)),
    governanceLayer: governanceLayers[Math.min(i, governanceLayers.length - 1)],
  }));

  // 从 manifest 或 display 推断拓扑
  const topologyType =
    template.manifest?.collaborationMode === 'iron_captain' ? 'hub_spoke' as const :
    template.manifest?.collaborationMode === 'cross_check_balance' ? 'mesh' as const :
    template.manifest?.collaborationMode === 'democratic_council' ? 'flat' as const :
    'hub_spoke' as const;

  return {
    totalRoles: roles.length,
    recommendedTeamSize: roles.length,
    derivationMethod: 'template_match',
    roles,
    designRationale: {
      dimension: '团队结构',
      choice: `从模板"${template.name}"加载 ${roles.length} 个角色`,
      reason: `模板提供预设角色，引擎以种子数据运行 L1-L5 管线进行个性化蒸馏`,
      sourceGap: '模板种子注入',
    },
  };
}
