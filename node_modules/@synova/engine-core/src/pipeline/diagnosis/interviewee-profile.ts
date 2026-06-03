/**
 * interviewee-profile.ts — 角色画像
 *
 * 为诊断 Phase 0 提供结构化角色定义：
 *   - 职责范围 → 确定哪些缝隙维度与该角色相关
 *   - 决策权等级 → 影响置信度权重
 *   - 信息需求 → 确定需要采集的数据类型
 *   - 沟通偏好 → 定制访谈方式和报告格式
 *
 * 角色画像在 Phase 0 用于：
 *   1. 生成针对性问卷
 *   2. 确定证据置信度权重
 *   3. 选择报告呈现方式
 */

// ====================================================================
// 类型定义
// ====================================================================

/** 角色类型（扩展现有角色分类） */
export type IntervieweeRoleType =
  | 'founder'
  | 'executive'
  | 'engineering-manager'
  | 'product-manager'
  | 'senior-engineer'
  | 'junior-engineer'
  | 'designer'
  | 'data-scientist'
  | 'devops'
  | 'hr'
  | 'operations'
  | 'sales'
  | 'marketing';

/** 决策权等级 */
export type DecisionAuthority = 'strategic' | 'tactical' | 'operational' | 'none';

/** 沟通偏好 */
export interface CommunicationPreference {
  /** 正式度 0-1 */
  formality: number;
  /** 细节度 0-1 */
  detailLevel: number;
  /** 数据驱动 vs 直觉驱动 0-1（0=纯直觉，1=纯数据） */
  dataDriven: number;
  /** 团队导向 vs 个人导向 0-1（0=纯个人，1=纯团队） */
  teamOriented: number;
}

/** 角色画像 */
export interface IntervieweeProfile {
  roleType: IntervieweeRoleType;
  /** 自定义角色名称（如 "技术 VP"） */
  customTitle?: string;
  /** 职责范围 */
  responsibilities: string[];
  /** 决策权等级 */
  decisionAuthority: DecisionAuthority;
  /** 关心的缝隙维度（按优先级排序） */
  concernedDimensions: string[];
  /** 可提供的证据类型 */
  evidenceSources: ('interview' | 'observation' | 'document' | 'metrics' | 'log')[];
  /** 沟通偏好 */
  communication: CommunicationPreference;
  /** 在诊断中的置信度权重 0-1 */
  evidenceWeight: number;
}

/** 角色画像构建参数（Phase 0 输入） */
export interface ProfileBuildInput {
  roleType: IntervieweeRoleType;
  customTitle?: string;
  /** 覆盖默认维度优先级 */
  overrideDimensions?: string[];
  /** 覆盖默认证据权重 */
  overrideWeight?: number;
}

// ====================================================================
// 内置角色画像库
// ====================================================================

const DEFAULT_PROFILES: Record<IntervieweeRoleType, Omit<IntervieweeProfile, 'customTitle'>> = {
  founder: {
    roleType: 'founder',
    responsibilities: ['战略方向', '融资与资源', '核心团队组建', '公司文化'],
    decisionAuthority: 'strategic',
    concernedDimensions: ['信任与心理安全', '决策权分配', '信息透明度', '冲突解决模式', '目标对齐', '角色清晰度'],
    evidenceSources: ['interview', 'observation'],
    communication: { formality: 0.6, detailLevel: 0.3, dataDriven: 0.5, teamOriented: 0.9 },
    evidenceWeight: 0.9,
  },
  executive: {
    roleType: 'executive',
    responsibilities: ['跨部门协调', '资源分配', '绩效管理', '战略执行'],
    decisionAuthority: 'strategic',
    concernedDimensions: ['决策权分配', '目标对齐', '信息透明度', '分工合理性', '信任与心理安全'],
    evidenceSources: ['interview', 'metrics', 'document'],
    communication: { formality: 0.7, detailLevel: 0.5, dataDriven: 0.7, teamOriented: 0.7 },
    evidenceWeight: 0.85,
  },
  'engineering-manager': {
    roleType: 'engineering-manager',
    responsibilities: ['技术架构决策', '工程团队管理', '交付质量', '技术债务管理'],
    decisionAuthority: 'tactical',
    concernedDimensions: ['分工合理性', '信息透明度', '角色清晰度', '决策权分配', '冲突解决模式', '工具与自动化'],
    evidenceSources: ['interview', 'metrics', 'log', 'observation'],
    communication: { formality: 0.5, detailLevel: 0.8, dataDriven: 0.8, teamOriented: 0.6 },
    evidenceWeight: 0.8,
  },
  'product-manager': {
    roleType: 'product-manager',
    responsibilities: ['产品方向', '需求优先级', '跨职能协调', '用户洞察'],
    decisionAuthority: 'tactical',
    concernedDimensions: ['目标对齐', '信息透明度', '决策权分配', '角色清晰度', '冲突解决模式'],
    evidenceSources: ['interview', 'document', 'observation'],
    communication: { formality: 0.5, detailLevel: 0.6, dataDriven: 0.7, teamOriented: 0.8 },
    evidenceWeight: 0.75,
  },
  'senior-engineer': {
    roleType: 'senior-engineer',
    responsibilities: ['技术方案设计', '代码质量', '新人指导', '技术评审'],
    decisionAuthority: 'operational',
    concernedDimensions: ['分工合理性', '工具与自动化', '信息透明度', '角色清晰度', '信任与心理安全'],
    evidenceSources: ['interview', 'log', 'observation'],
    communication: { formality: 0.3, detailLevel: 0.9, dataDriven: 0.9, teamOriented: 0.4 },
    evidenceWeight: 0.7,
  },
  'junior-engineer': {
    roleType: 'junior-engineer',
    responsibilities: ['功能开发', 'Bug 修复', '学习成长', '文档编写'],
    decisionAuthority: 'operational',
    concernedDimensions: ['角色清晰度', '信息透明度', '信任与心理安全', '工具与自动化', '分工合理性'],
    evidenceSources: ['interview', 'observation'],
    communication: { formality: 0.2, detailLevel: 0.7, dataDriven: 0.5, teamOriented: 0.3 },
    evidenceWeight: 0.5,
  },
  designer: {
    roleType: 'designer',
    responsibilities: ['用户体验设计', '设计系统维护', '用户研究', '原型验证'],
    decisionAuthority: 'operational',
    concernedDimensions: ['角色清晰度', '信息透明度', '信任与心理安全', '目标对齐', '决策权分配'],
    evidenceSources: ['interview', 'observation', 'document'],
    communication: { formality: 0.3, detailLevel: 0.7, dataDriven: 0.5, teamOriented: 0.6 },
    evidenceWeight: 0.6,
  },
  'data-scientist': {
    roleType: 'data-scientist',
    responsibilities: ['数据建模', '实验设计', '指标定义', '洞察生成'],
    decisionAuthority: 'operational',
    concernedDimensions: ['信息透明度', '目标对齐', '角色清晰度', '工具与自动化', '分工合理性'],
    evidenceSources: ['interview', 'metrics', 'log'],
    communication: { formality: 0.4, detailLevel: 0.9, dataDriven: 0.95, teamOriented: 0.4 },
    evidenceWeight: 0.65,
  },
  devops: {
    roleType: 'devops',
    responsibilities: ['CI/CD 管线', '基础设施', '监控告警', '安全合规'],
    decisionAuthority: 'operational',
    concernedDimensions: ['工具与自动化', '信息透明度', '分工合理性', '角色清晰度', '决策权分配'],
    evidenceSources: ['interview', 'metrics', 'log'],
    communication: { formality: 0.3, detailLevel: 0.9, dataDriven: 0.9, teamOriented: 0.4 },
    evidenceWeight: 0.65,
  },
  hr: {
    roleType: 'hr',
    responsibilities: ['招聘与入职', '绩效管理', '员工关系', '文化建设'],
    decisionAuthority: 'tactical',
    concernedDimensions: ['信任与心理安全', '角色清晰度', '冲突解决模式', '目标对齐', '决策权分配'],
    evidenceSources: ['interview', 'document'],
    communication: { formality: 0.8, detailLevel: 0.5, dataDriven: 0.5, teamOriented: 0.9 },
    evidenceWeight: 0.7,
  },
  operations: {
    roleType: 'operations',
    responsibilities: ['流程优化', '资源调度', '供应商管理', '合规'],
    decisionAuthority: 'tactical',
    concernedDimensions: ['分工合理性', '信息透明度', '角色清晰度', '决策权分配', '工具与自动化'],
    evidenceSources: ['interview', 'document', 'metrics'],
    communication: { formality: 0.6, detailLevel: 0.6, dataDriven: 0.6, teamOriented: 0.5 },
    evidenceWeight: 0.6,
  },
  sales: {
    roleType: 'sales',
    responsibilities: ['客户关系', '收入目标', '市场拓展', '竞争情报'],
    decisionAuthority: 'operational',
    concernedDimensions: ['目标对齐', '信息透明度', '决策权分配', '角色清晰度', '信任与心理安全'],
    evidenceSources: ['interview', 'metrics'],
    communication: { formality: 0.5, detailLevel: 0.5, dataDriven: 0.8, teamOriented: 0.3 },
    evidenceWeight: 0.55,
  },
  marketing: {
    roleType: 'marketing',
    responsibilities: ['品牌策略', '内容营销', '用户获取', '市场分析'],
    decisionAuthority: 'operational',
    concernedDimensions: ['目标对齐', '信息透明度', '角色清晰度', '决策权分配', '分工合理性'],
    evidenceSources: ['interview', 'metrics', 'document'],
    communication: { formality: 0.4, detailLevel: 0.5, dataDriven: 0.8, teamOriented: 0.5 },
    evidenceWeight: 0.55,
  },
};

// ====================================================================
// 构建函数
// ====================================================================

/** 根据输入构建角色画像 */
export function buildIntervieweeProfile(input: ProfileBuildInput): IntervieweeProfile {
  const base = DEFAULT_PROFILES[input.roleType];
  if (!base) {
    throw new Error(`未知角色类型: ${input.roleType}`);
  }

  return {
    ...base,
    customTitle: input.customTitle,
    concernedDimensions: input.overrideDimensions ?? base.concernedDimensions,
    evidenceWeight: input.overrideWeight ?? base.evidenceWeight,
  };
}

/** 获取内置角色类型列表 */
export function listRoleTypes(): IntervieweeRoleType[] {
  return Object.keys(DEFAULT_PROFILES) as IntervieweeRoleType[];
}

/** 根据职责关键词推荐角色类型 */
export function suggestRoleType(responsibilities: string[]): IntervieweeRoleType[] {
  const scored = Object.entries(DEFAULT_PROFILES).map(([type, profile]) => {
    const overlap = responsibilities.filter(r =>
      profile.responsibilities.some(pr => pr.includes(r) || r.includes(pr)),
    ).length;
    return { type: type as IntervieweeRoleType, score: overlap };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.type);
}

/** 为角色生成推荐的诊断维度优先级 */
export function getDimensionPriority(
  profile: IntervieweeProfile,
  allDimensions: string[],
): string[] {
  // 先排角色关心的维度，后排其余维度
  const remaining = allDimensions.filter(d => !profile.concernedDimensions.includes(d));
  return [...profile.concernedDimensions, ...remaining];
}

/** 多角色聚合：计算团队级别的维度优先级 */
export function aggregateTeamPriorities(
  profiles: IntervieweeProfile[],
  allDimensions: string[],
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const dim of allDimensions) {
    let score = 0;
    for (const p of profiles) {
      const idx = p.concernedDimensions.indexOf(dim);
      if (idx >= 0) {
        // 排名越靠前权重越高 + 角色权重加成
        score += (p.concernedDimensions.length - idx) * p.evidenceWeight;
      }
    }
    scores.set(dim, Math.round(score * 100) / 100);
  }

  return scores;
}
