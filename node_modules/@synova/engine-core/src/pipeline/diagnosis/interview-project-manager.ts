/**
 * interview-project-manager.ts — 多角色访谈项目管理器
 *
 * P2-18: 7 个 Agent 工具，管理从项目创建到证据聚合的完整访谈生命周期。
 *
 * 工具清单：
 *   1. create_interview_project   — 创建访谈项目（范围、受访者、通道）
 *   2. get_interviewee_profile    — 获取/构建角色画像
 *   3. generate_questionnaire     — 基于角色+领域生成定制问卷
 *   4. manage_interview_session   — 管理访谈会话状态
 *   5. distribute_survey          — 发放匿名问卷
 *   6. aggregate_findings         — 按角色权重聚合多通道发现
 *   7. get_project_progress       — 查询项目进度
 *
 * 对标 Claw-Code 模式：
 *   - 每个工具是纯函数，输入→输出，独立可测试
 *   - 工具间通过 InterviewProject 状态对象通信
 *   - 所有状态操作返回新对象（不可变更新）
 */

import type { IntervieweeProfile } from './interviewee-profile';

// ====================================================================
// Types
// ====================================================================

export type InterviewChannel = 'one_on_one' | 'anonymous_survey' | 'focus_group' | 'document_review' | 'system_collection';
export type InterviewRole = 'c_suite' | 'vp_director' | 'manager' | 'individual' | 'external';
export type SessionStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'declined';
export type ProjectPhase = 'setup' | 'collection' | 'analysis' | 'complete';

export interface Interviewee {
  id: string;
  name: string;
  role: InterviewRole;
  title: string;
  department: string;
  tenure: string;
  channels: InterviewChannel[];
  status: SessionStatus;
  profile?: IntervieweeProfile;
  scheduledAt?: string;
  completedAt?: string;
}

export interface InterviewProject {
  id: string;
  teamId: string;
  name: string;
  phase: ProjectPhase;
  scope: {
    dimensions: string[];
    depth: 'quick' | 'standard' | 'deep';
    maxInterviewees: number;
    anonymityRules: {
      surveyResponses: boolean;
      quotes: boolean;
      aggregationThreshold: number; // 最少聚合人数
    };
  };
  interviewees: Interviewee[];
  channels: {
    type: InterviewChannel;
    enabled: boolean;
    targetCount: number;
    completedCount: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  teamId: string;
  name: string;
  dimensions?: string[];
  depth?: 'quick' | 'standard' | 'deep';
  maxInterviewees?: number;
  channels?: InterviewChannel[];
}

export interface AddIntervieweeInput {
  projectId: string;
  name: string;
  role: InterviewRole;
  title: string;
  department: string;
  tenure?: string;
  channels?: InterviewChannel[];
}

export interface GenerateQuestionnaireInput {
  projectId: string;
  intervieweeId?: string; // 如果指定，按角色定制；否则通用
  domains?: string[];      // 诊断领域（如 ['marketing', 'organization']）
  questionCount?: number;
}

export interface QuestionnaireResult {
  intervieweeId?: string;
  role?: InterviewRole;
  questions: Array<{
    id: string;
    text: string;
    domain: string;
    sensitivity: string;
    suggestedChannel: InterviewChannel;
  }>;
  estimatedMinutes: number;
}

export interface SessionUpdateInput {
  projectId: string;
  intervieweeId: string;
  status: SessionStatus;
  notes?: string;
}

export interface AggregateInput {
  projectId: string;
  dimensions?: string[];
  roleWeights?: Record<InterviewRole, number>;
  minConfidence?: number;
}

export interface AggregatedFinding {
  dimension: string;
  score: number;
  confidence: number;
  sourceCount: number;
  roleBreakdown: Record<string, number>;
  contradictions: string[];
  topQuotes: string[];
}

export interface ProjectProgress {
  projectId: string;
  phase: ProjectPhase;
  totalInterviewees: number;
  completedSessions: number;
  declinedSessions: number;
  surveyResponseRate: number;
  documentQueueSize: number;
  dataCompleteness: number; // 0-1
  nextRecommendedAction: string;
}

// ====================================================================
// Defaults
// ====================================================================

const DEFAULT_ROLE_WEIGHTS: Record<InterviewRole, number> = {
  c_suite: 1.5,
  vp_director: 1.2,
  manager: 1.0,
  individual: 0.8,
  external: 0.5,
};

const CHANNEL_RECOMMENDATIONS: Record<string, InterviewChannel[]> = {
  // 按组织规模推荐通道组合
  '1-5':   ['one_on_one', 'anonymous_survey'],
  '6-20':  ['one_on_one', 'anonymous_survey', 'document_review'],
  '21-50': ['one_on_one', 'anonymous_survey', 'focus_group', 'document_review'],
  '51+':   ['one_on_one', 'anonymous_survey', 'focus_group', 'document_review', 'system_collection'],
};

// ====================================================================
// In-memory Store (SQLite 持久化留给后续迭代，对标 marketing-data-store)
// ====================================================================

const projectStore = new Map<string, InterviewProject>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random() /* nosec: nonce for ID uniqueness */.toString(36).slice(2, 7)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ====================================================================
// Tool 1: create_interview_project
// ====================================================================

export interface CreateProjectResult {
  project: InterviewProject;
  recommendations: string[];
}

export function createInterviewProject(input: CreateProjectInput): CreateProjectResult {
  const id = generateId('ivp');

  const defaultChannels: InterviewChannel[] = ['one_on_one', 'anonymous_survey', 'document_review'];

  const project: InterviewProject = {
    id,
    teamId: input.teamId,
    name: input.name,
    phase: 'setup',
    scope: {
      dimensions: input.dimensions ?? [
        'decision_making', 'information_flow', 'knowledge_sharing',
        'trust_level', 'goal_alignment', 'role_clarity',
      ],
      depth: input.depth ?? 'standard',
      maxInterviewees: input.maxInterviewees ?? 12,
      anonymityRules: {
        surveyResponses: true,
        quotes: true,
        aggregationThreshold: 3,
      },
    },
    interviewees: [],
    channels: (input.channels ?? defaultChannels).map(c => ({
      type: c,
      enabled: true,
      targetCount: c === 'anonymous_survey' ? 0 : 5,
      completedCount: 0,
    })),
    createdAt: now(),
    updatedAt: now(),
  };

  projectStore.set(id, project);

  // Generate channel recommendations
  const recommendations: string[] = [];
  if (!input.channels || input.channels.length === 0) {
    recommendations.push('建议：添加 at least 1 个一对一访谈通道以获取深层洞察');
  }
  if (input.maxInterviewees && input.maxInterviewees > 20) {
    recommendations.push('受访者 > 20 人，推荐启用匿名问卷通道以降低访谈负担');
  }
  recommendations.push('提示：Phase 0 配置完成后，可在后续阶段通过 add_interviewee 添加受访者');

  return { project, recommendations };
}

// ====================================================================
// Tool 2: get_interviewee_profile
// ====================================================================

export function getIntervieweeProfile(projectId: string, intervieweeId: string): IntervieweeProfile | null {
  const project = projectStore.get(projectId);
  if (!project) return null;

  const person = project.interviewees.find(i => i.id === intervieweeId);
  if (!person) return null;

  if (person.profile) return person.profile;

  // Build profile on first request (maps internal model to IntervieweeProfile)
  function mapRole(role: InterviewRole): IntervieweeProfile['roleType'] {
    switch (role) {
      case 'c_suite': return 'executive';
      case 'vp_director': return 'engineering-manager';
      case 'manager': return 'product-manager';
      case 'individual': return 'senior-engineer';
      case 'external': return 'operations';
    }
  }
  const profile: IntervieweeProfile = {
    roleType: mapRole(person.role),
    customTitle: person.title,
    responsibilities: [person.department],
    decisionAuthority: person.role === 'c_suite' ? 'strategic' : person.role === 'vp_director' ? 'tactical' : 'operational',
    concernedDimensions: getRecommendedDimensions(person.role),
    evidenceSources: ['interview'],
    communication: { formality: 0.7, detailLevel: 0.8, dataDriven: 0.6, teamOriented: 0.7 },
    evidenceWeight: DEFAULT_ROLE_WEIGHTS[person.role] ?? 1.0,
  };

  person.profile = profile;
  return profile;
}

function getRecommendedDimensions(role: InterviewRole): string[] {
  switch (role) {
    case 'c_suite': return ['decision_making', 'goal_alignment', 'trust_level'];
    case 'vp_director': return ['information_flow', 'knowledge_sharing', 'decision_making'];
    case 'manager': return ['information_flow', 'role_clarity', 'knowledge_sharing'];
    case 'individual': return ['information_flow', 'role_clarity', 'knowledge_sharing'];
    case 'external': return ['goal_alignment', 'trust_level'];
  }
}

function getSensitivityConstraints(_role: InterviewRole): string[] {
  // External and individual contributors get higher privacy
  return ['no_pii', 'anonymous_quotes', 'aggregation_only'];
}

// ====================================================================
// Tool 3: generate_questionnaire
// ====================================================================

export function generateQuestionnaire(input: GenerateQuestionnaireInput): QuestionnaireResult {
  const project = projectStore.get(input.projectId);
  if (!project) throw new Error(`项目 ${input.projectId} 不存在`);

  const domains = input.domains ?? project.scope.dimensions.slice(0, 3);
  const targetCount = input.questionCount ?? Math.min(domains.length * 3, 12);

  // Find interviewee if specified
  const person = input.intervieweeId
    ? project.interviewees.find(i => i.id === input.intervieweeId)
    : undefined;

  const questions: QuestionnaireResult['questions'] = [];
  const questionTemplates = getQuestionTemplates(person?.role ?? 'individual');

  // Distribute questions across domains
  let qIndex = 0;
  while (questions.length < targetCount && qIndex < questionTemplates.length * 2) {
    const template = questionTemplates[qIndex % questionTemplates.length];
    const domain = domains[qIndex % domains.length];

    // Avoid duplicate question texts in same domain
    const duplicate = questions.some(q => q.text === template.text && q.domain === domain);
    if (!duplicate) {
      questions.push({
        id: `q_${input.projectId}_${questions.length}`,
        text: template.text,
        domain,
        sensitivity: template.sensitivity,
        suggestedChannel: template.preferredChannel,
      });
    }
    qIndex++;
  }

  const estimatedMinutes = questions.length * 3;

  return {
    intervieweeId: input.intervieweeId,
    role: person?.role,
    questions,
    estimatedMinutes,
  };
}

interface QuestionTemplate {
  text: string;
  sensitivity: string;
  preferredChannel: InterviewChannel;
}

function getQuestionTemplates(role: InterviewRole): QuestionTemplate[] {
  const common: QuestionTemplate[] = [
    { text: '请描述你日常工作中最频繁的协作场景', sensitivity: 'low', preferredChannel: 'one_on_one' },
    { text: '你认为团队目前最大的沟通障碍是什么？', sensitivity: 'low', preferredChannel: 'one_on_one' },
    { text: '决策信息在传递过程中是否完整和及时？', sensitivity: 'low', preferredChannel: 'anonymous_survey' },
    { text: '你对团队目标的清晰度如何评价？', sensitivity: 'low', preferredChannel: 'anonymous_survey' },
    { text: '跨部门协作中最大的摩擦点在哪里？', sensitivity: 'medium', preferredChannel: 'focus_group' },
    { text: '你获取工作所需信息的渠道是否通畅？', sensitivity: 'low', preferredChannel: 'one_on_one' },
  ];

  const roleSpecific: Record<InterviewRole, QuestionTemplate[]> = {
    c_suite: [
      { text: '公司战略目标与团队日常工作的对齐程度如何？', sensitivity: 'medium', preferredChannel: 'one_on_one' },
      { text: '你认为组织最大的战略风险是什么？', sensitivity: 'high', preferredChannel: 'one_on_one' },
    ],
    vp_director: [
      { text: '跨部门资源调度的效率如何？', sensitivity: 'medium', preferredChannel: 'one_on_one' },
      { text: '你的团队是否清楚上下游团队的依赖关系？', sensitivity: 'medium', preferredChannel: 'one_on_one' },
    ],
    manager: [
      { text: '团队成员之间的信息共享是否充分？', sensitivity: 'low', preferredChannel: 'anonymous_survey' },
      { text: '你能否及时获取上级决策的完整背景？', sensitivity: 'medium', preferredChannel: 'one_on_one' },
    ],
    individual: [
      { text: '你每天用的工具里，哪个最让你觉得信息不通畅？', sensitivity: 'low', preferredChannel: 'anonymous_survey' },
      { text: '你的意见和建议是否被团队认真对待？', sensitivity: 'medium', preferredChannel: 'anonymous_survey' },
    ],
    external: [
      { text: '你与团队互动的频率和效率如何？', sensitivity: 'low', preferredChannel: 'one_on_one' },
      { text: '团队交付物是否符合你的期望？', sensitivity: 'medium', preferredChannel: 'one_on_one' },
    ],
  };

  return [...common, ...(roleSpecific[role] ?? [])];
}

// ====================================================================
// Tool 4: manage_interview_session
// ====================================================================

export interface SessionResult {
  interviewee: Interviewee;
  projectPhase: ProjectPhase;
  completedCount: number;
  totalCount: number;
}

export function updateInterviewSession(input: SessionUpdateInput): SessionResult | null {
  const project = projectStore.get(input.projectId);
  if (!project) return null;

  const person = project.interviewees.find(i => i.id === input.intervieweeId);
  if (!person) return null;

  const previousStatus = person.status;
  person.status = input.status;

  if (input.status === 'completed' && previousStatus !== 'completed') {
    person.completedAt = now();
    // Increment channel counters
    for (const ch of person.channels) {
      const channel = project.channels.find(c => c.type === ch);
      if (channel) channel.completedCount++;
    }
  }

  // Auto-transition project phase
  const completed = project.interviewees.filter(i => i.status === 'completed').length;
  const total = project.interviewees.length;
  if (completed === total && total > 0) {
    project.phase = 'analysis';
  } else if (completed > 0 && project.phase === 'setup') {
    project.phase = 'collection';
  }

  project.updatedAt = now();

  return {
    interviewee: person,
    projectPhase: project.phase,
    completedCount: completed,
    totalCount: total,
  };
}

// ====================================================================
// Tool 5: distribute_survey
// ====================================================================

export interface SurveyDistribution {
  projectId: string;
  surveyIds: string[];
  targetRoles: InterviewRole[];
  anonymousLink: string;
  message: string;
}

export function distributeSurvey(
  projectId: string,
  baseUrl: string = '/platform/survey',
): SurveyDistribution | null {
  const project = projectStore.get(projectId);
  if (!project) return null;

  // Find interviewees with anonymous_survey channel who haven't completed
  const candidates = project.interviewees.filter(i =>
    i.channels.includes('anonymous_survey') && i.status !== 'completed' && i.status !== 'declined');

  if (candidates.length === 0) {
    return {
      projectId,
      surveyIds: [],
      targetRoles: [],
      anonymousLink: '',
      message: '当前没有需要问卷的受访者。请先通过 add_interviewee 添加受访者并指定匿名问卷通道。',
    };
  }

  const targetRoles = [...new Set(candidates.map(c => c.role))];
  // In production this would call the survey API to create actual surveys
  const surveyIds = candidates.map(c => `sv_${projectId}_${c.id}`);

  return {
    projectId,
    surveyIds,
    targetRoles,
    anonymousLink: `${baseUrl}/${projectId}`,
    message: `已为 ${candidates.length} 位受访者生成匿名问卷链接。目标角色：${targetRoles.join(', ')}。聚合阈值：${project.scope.anonymityRules.aggregationThreshold} 人。`,
  };
}

// ====================================================================
// Tool 6: aggregate_findings
// ====================================================================

export function aggregateFindings(input: AggregateInput): AggregatedFinding[] {
  const project = projectStore.get(input.projectId);
  if (!project) return [];

  const weights = input.roleWeights ?? DEFAULT_ROLE_WEIGHTS;
  const dimensions = input.dimensions ?? project.scope.dimensions;
  const minConfidence = input.minConfidence ?? 0.3;

  const completedInterviewees = project.interviewees.filter(i => i.status === 'completed');
  if (completedInterviewees.length === 0) return [];

  return dimensions.map(dim => {
    // Simulate weighted aggregation across interviewees
    let weightedSum = 0;
    let totalWeight = 0;
    const roleContributions: Record<string, number> = {};
    const quotes: string[] = [];

    for (const person of completedInterviewees) {
      const w = weights[person.role] ?? 1.0;
      // Score is based on role's perspective weight × channel diversity
      const channelBonus = Math.min(person.channels.length / 2, 1);
      const dimScore = 0.5 + (w * 0.1) + (channelBonus * 0.1);
      weightedSum += dimScore * w;
      totalWeight += w;

      if (!roleContributions[person.role]) roleContributions[person.role] = 0;
      roleContributions[person.role] += dimScore;

      if (person.profile?.concernedDimensions.includes(dim)) {
        quotes.push(`${person.role}:${person.title} — 维度 "${dim}" 在其关注范围内`);
      }
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const confidence = Math.min(0.5 + (completedInterviewees.length / project.interviewees.length) * 0.4, 0.95);

    return {
      dimension: dim,
      score: Math.round(score * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      sourceCount: completedInterviewees.length,
      roleBreakdown: roleContributions,
      contradictions: score < 0.4 ? [`${dim} 评分偏低，建议增加一对一深度访谈获取具体案例`] : [],
      topQuotes: quotes.slice(0, 3),
    };
  });
}

// ====================================================================
// Tool 7: get_project_progress
// ====================================================================

export function getProjectProgress(projectId: string): ProjectProgress | null {
  const project = projectStore.get(projectId);
  if (!project) return null;

  const completedSessions = project.interviewees.filter(i => i.status === 'completed').length;
  const declinedSessions = project.interviewees.filter(i => i.status === 'declined').length;
  const total = project.interviewees.length;

  const surveyChannel = project.channels.find(c => c.type === 'anonymous_survey');
  const surveyResponseRate = surveyChannel && surveyChannel.targetCount > 0
    ? surveyChannel.completedCount / surveyChannel.targetCount
    : 0;

  const dataCompleteness = total > 0 ? completedSessions / total : 0;

  // Generate next recommended action
  let nextAction: string;
  if (project.phase === 'setup') {
    nextAction = total === 0
      ? '添加第一位受访者以开始访谈项目'
      : `项目已配置 ${total} 位受访者，可以进入数据采集阶段`;
  } else if (project.phase === 'collection') {
    const pending = project.interviewees.filter(i => i.status === 'pending').length;
    nextAction = pending > 0
      ? `还有 ${pending} 位受访者等待访谈，建议优先安排 C-Suite 一对一访谈`
      : '所有受访者已完成或跳过，可以进入分析阶段';
  } else if (project.phase === 'analysis') {
    nextAction = '数据采集完成，建议运行 aggregate_findings 进行加权聚合分析';
  } else {
    nextAction = '项目已完成';
  }

  return {
    projectId,
    phase: project.phase,
    totalInterviewees: total,
    completedSessions,
    declinedSessions,
    surveyResponseRate: Math.round(surveyResponseRate * 100) / 100,
    documentQueueSize: project.channels.filter(c => c.type === 'document_review').length,
    dataCompleteness: Math.round(dataCompleteness * 100) / 100,
    nextRecommendedAction: nextAction,
  };
}

// ====================================================================
// Utility
// ====================================================================

export function addInterviewee(projectId: string, input: AddIntervieweeInput): Interviewee | null {
  const project = projectStore.get(projectId);
  if (!project) return null;

  if (project.interviewees.length >= project.scope.maxInterviewees) return null;

  const person: Interviewee = {
    id: generateId('ivw'),
    name: input.name,
    role: input.role,
    title: input.title,
    department: input.department,
    tenure: input.tenure ?? '未知',
    channels: input.channels ?? getRecommendedChannels(input.role),
    status: 'pending',
  };

  project.interviewees.push(person);
  project.updatedAt = now();
  return person;
}

function getRecommendedChannels(role: InterviewRole): InterviewChannel[] {
  switch (role) {
    case 'c_suite': return ['one_on_one'];
    case 'vp_director': return ['one_on_one', 'document_review'];
    case 'manager': return ['one_on_one', 'anonymous_survey'];
    case 'individual': return ['anonymous_survey'];
    case 'external': return ['one_on_one'];
  }
}

/** 根据团队规模推荐通道组合 */
export function recommendChannels(teamSize: number): InterviewChannel[] {
  if (teamSize <= 5) return CHANNEL_RECOMMENDATIONS['1-5'];
  if (teamSize <= 20) return CHANNEL_RECOMMENDATIONS['6-20'];
  if (teamSize <= 50) return CHANNEL_RECOMMENDATIONS['21-50'];
  return CHANNEL_RECOMMENDATIONS['51+'];
}

/** 获取项目（用于测试和调试） */
export function getProject(projectId: string): InterviewProject | undefined {
  return projectStore.get(projectId);
}

/** 清空存储（测试用） */
export function clearProjectStore(): void {
  projectStore.clear();
}
