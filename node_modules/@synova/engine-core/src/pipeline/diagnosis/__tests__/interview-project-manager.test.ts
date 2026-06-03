/**
 * interview-project-manager.test.ts — 多角色访谈项目管理器测试
 *
 * P2-18: 7 个 Agent 工具，每个含独立测试。
 * 对标 Claw-Code Given/When/Then 模式。
 */

import {
  createInterviewProject,
  addInterviewee,
  getIntervieweeProfile,
  generateQuestionnaire,
  updateInterviewSession,
  distributeSurvey,
  aggregateFindings,
  getProjectProgress,
  recommendChannels,
  clearProjectStore,
  getProject,
  type InterviewProject,
  type InterviewRole,
} from '../interview-project-manager';

// ====================================================================
// Setup / Teardown
// ====================================================================

/** 创建含 4 位不同角色受访者的标准测试项目 */
function createFullProject(): InterviewProject {
  clearProjectStore();
  const { project } = createInterviewProject({
    teamId: 'test-team-001',
    name: 'Q2 组织健康诊断',
    depth: 'standard',
    maxInterviewees: 10,
    channels: ['one_on_one', 'anonymous_survey', 'document_review'],
  });

  const roles: Array<{ name: string; role: InterviewRole; title: string; dept: string }> = [
    { name: '张总', role: 'c_suite', title: 'CEO', dept: 'Executive' },
    { name: '李副总', role: 'vp_director', title: 'VP Engineering', dept: 'Engineering' },
    { name: '王经理', role: 'manager', title: 'Engineering Manager', dept: 'Engineering' },
    { name: '赵工', role: 'individual', title: 'Senior Engineer', dept: 'Engineering' },
  ];

  for (const r of roles) {
    addInterviewee(project.id, {
      projectId: project.id,
      name: r.name,
      role: r.role,
      title: r.title,
      department: r.dept,
    });
  }

  return getProject(project.id)!;
}

// ====================================================================
// Tool 1: create_interview_project
// ====================================================================

describe('createInterviewProject — Tool 1', () => {
  beforeEach(() => clearProjectStore());

  it('creates a project with default dimensions and channels', () => {
    // Given: 最小输入
    const input = { teamId: 't1', name: '测试项目' };
    // When: 创建项目
    const { project, recommendations } = createInterviewProject(input);
    // Then: 项目含默认配置
    expect(project.id).toMatch(/^ivp_/);
    expect(project.phase).toBe('setup');
    expect(project.scope.dimensions).toHaveLength(6);
    expect(project.scope.depth).toBe('standard');
    expect(project.channels).toHaveLength(3);
    expect(project.interviewees).toHaveLength(0);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  it('respects custom depth and max interviewees', () => {
    const { project } = createInterviewProject({ teamId: 't2', name: '深度调研', depth: 'deep', maxInterviewees: 5 });
    expect(project.scope.depth).toBe('deep');
    expect(project.scope.maxInterviewees).toBe(5);
  });

  it('generates idempotent unique IDs', () => {
    const a = createInterviewProject({ teamId: 't1', name: 'A' });
    const b = createInterviewProject({ teamId: 't1', name: 'B' });
    expect(a.project.id).not.toBe(b.project.id);
  });

  it('sets anonymity rules with aggregation threshold', () => {
    const { project } = createInterviewProject({ teamId: 't3', name: '匿名测试' });
    expect(project.scope.anonymityRules.surveyResponses).toBe(true);
    expect(project.scope.anonymityRules.aggregationThreshold).toBe(3);
  });
});

// ====================================================================
// addInterviewee
// ====================================================================

describe('addInterviewee', () => {
  beforeEach(() => clearProjectStore());

  it('adds interviewee with role-appropriate channels', () => {
    const { project } = createInterviewProject({ teamId: 't1', name: 'P' });
    const person = addInterviewee(project.id, {
      projectId: project.id, name: 'CEO', role: 'c_suite', title: 'CEO', department: 'Exec',
    });
    expect(person).not.toBeNull();
    expect(person!.role).toBe('c_suite');
    expect(person!.channels).toContain('one_on_one');
    expect(person!.status).toBe('pending');
  });

  it('returns null when project not found', () => {
    expect(addInterviewee('nonexistent', {
      projectId: 'nonexistent', name: 'X', role: 'individual', title: 'X', department: 'X',
    })).toBeNull();
  });

  it('returns null when max interviewees reached', () => {
    const { project } = createInterviewProject({ teamId: 't1', name: 'P', maxInterviewees: 1 });
    addInterviewee(project.id, { projectId: project.id, name: 'A', role: 'c_suite', title: 'CEO', department: 'E' });
    const second = addInterviewee(project.id, { projectId: project.id, name: 'B', role: 'manager', title: 'M', department: 'E' });
    expect(second).toBeNull();
  });
});

// ====================================================================
// Tool 2: get_interviewee_profile
// ====================================================================

describe('getIntervieweeProfile — Tool 2', () => {
  it('builds profile with role-specific dimensions on first call', () => {
    const project = createFullProject();
    const ceo = project.interviewees.find(i => i.role === 'c_suite')!;
    const profile = getIntervieweeProfile(project.id, ceo.id);
    expect(profile).not.toBeNull();
    expect(profile!.roleType).toBe('executive'); // c_suite → executive in IntervieweeRoleType
    expect(profile!.evidenceWeight).toBe(1.5);
    expect(profile!.concernedDimensions).toContain('decision_making');
  });

  it('caches profile on second call', () => {
    const project = createFullProject();
    const engineer = project.interviewees.find(i => i.role === 'individual')!;
    const p1 = getIntervieweeProfile(project.id, engineer.id);
    const p2 = getIntervieweeProfile(project.id, engineer.id);
    expect(p1).toBe(p2); // Same object reference
  });

  it('returns null for nonexistent project or interviewee', () => {
    expect(getIntervieweeProfile('no', 'no')).toBeNull();
    const project = createFullProject();
    expect(getIntervieweeProfile(project.id, 'nonexistent')).toBeNull();
  });
});

// ====================================================================
// Tool 3: generate_questionnaire
// ====================================================================

describe('generateQuestionnaire — Tool 3', () => {
  it('generates role-specific questionnaire', () => {
    const project = createFullProject();
    const ceo = project.interviewees.find(i => i.role === 'c_suite')!;
    const result = generateQuestionnaire({
      projectId: project.id,
      intervieweeId: ceo.id,
      questionCount: 6,
    });
    expect(result.role).toBe('c_suite');
    expect(result.questions.length).toBeGreaterThanOrEqual(3);
    expect(result.estimatedMinutes).toBeGreaterThan(0);
  });

  it('generates generic questionnaire when no interviewee specified', () => {
    const project = createFullProject();
    const result = generateQuestionnaire({ projectId: project.id, questionCount: 4 });
    expect(result.questions).toHaveLength(4);
    expect(result.role).toBeUndefined();
  });

  it('respects domain filtering', () => {
    const project = createFullProject();
    const result = generateQuestionnaire({
      projectId: project.id,
      domains: ['decision_making'],
      questionCount: 2,
    });
    expect(result.questions.every(q => q.domain === 'decision_making')).toBe(true);
  });

  it('each question has sensitivity level and suggested channel', () => {
    const project = createFullProject();
    const result = generateQuestionnaire({ projectId: project.id, questionCount: 8 });
    for (const q of result.questions) {
      expect(q.sensitivity).toBeDefined();
      expect(q.suggestedChannel).toBeDefined();
    }
  });

  it('throws on nonexistent project', () => {
    expect(() => generateQuestionnaire({ projectId: 'no', questionCount: 3 })).toThrow();
  });
});

// ====================================================================
// Tool 4: manage_interview_session
// ====================================================================

describe('updateInterviewSession — Tool 4', () => {
  it('updates session status and tracks completion', () => {
    const project = createFullProject();
    const ceo = project.interviewees.find(i => i.role === 'c_suite')!;
    const result = updateInterviewSession({
      projectId: project.id,
      intervieweeId: ceo.id,
      status: 'completed',
    });
    expect(result).not.toBeNull();
    expect(result!.interviewee.status).toBe('completed');
    expect(result!.interviewee.completedAt).toBeDefined();
  });

  it('transitions phase from setup to collection on first completion', () => {
    const project = createFullProject();
    const ceo = project.interviewees.find(i => i.role === 'c_suite')!;
    const result = updateInterviewSession({ projectId: project.id, intervieweeId: ceo.id, status: 'completed' });
    expect(result!.projectPhase).toBe('collection');
  });

  it('transitions to analysis when all completed', () => {
    const project = createFullProject();
    for (const p of project.interviewees) {
      updateInterviewSession({ projectId: project.id, intervieweeId: p.id, status: 'completed' });
    }
    const fresh = getProjectProgress(project.id)!;
    expect(fresh.phase).toBe('analysis');
  });

  it('handles skipped and declined statuses', () => {
    const project = createFullProject();
    const ceo = project.interviewees.find(i => i.role === 'c_suite')!;
    updateInterviewSession({ projectId: project.id, intervieweeId: ceo.id, status: 'declined' });
    const fresh = getProjectProgress(project.id)!;
    expect(fresh.declinedSessions).toBe(1);
  });

  it('returns null for nonexistent project or interviewee', () => {
    expect(updateInterviewSession({ projectId: 'no', intervieweeId: 'no', status: 'completed' })).toBeNull();
  });
});

// ====================================================================
// Tool 5: distribute_survey
// ====================================================================

describe('distributeSurvey — Tool 5', () => {
  it('distributes surveys to interviewees with anonymous_survey channel', () => {
    const project = createFullProject();
    const manager = project.interviewees.find(i => i.role === 'manager')!;
    // Manager gets one_on_one + anonymous_survey by default
    const result = distributeSurvey(project.id);
    expect(result).not.toBeNull();
    expect(result!.surveyIds.length).toBeGreaterThan(0);
    expect(result!.targetRoles).toContain('manager'); // has anonymous_survey channel
    expect(result!.message).toContain('聚合阈值');
  });

  it('returns empty distribution when no candidates', () => {
    clearProjectStore();
    const { project } = createInterviewProject({ teamId: 't1', name: 'P', channels: ['one_on_one'] });
    addInterviewee(project.id, { projectId: project.id, name: 'CEO', role: 'c_suite', title: 'CEO', department: 'E', channels: ['one_on_one'] });
    const result = distributeSurvey(project.id);
    expect(result!.surveyIds).toHaveLength(0);
    expect(result!.message).toContain('没有需要问卷的受访者');
  });

  it('returns null for nonexistent project', () => {
    expect(distributeSurvey('no')).toBeNull();
  });
});

// ====================================================================
// Tool 6: aggregate_findings
// ====================================================================

describe('aggregateFindings — Tool 6', () => {
  it('aggregates findings weighted by role', () => {
    const project = createFullProject();
    // Complete all
    for (const p of project.interviewees) {
      updateInterviewSession({ projectId: project.id, intervieweeId: p.id, status: 'completed' });
    }
    const findings = aggregateFindings({ projectId: project.id });
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.score).toBeGreaterThan(0);
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.sourceCount).toBe(4); // All 4 interviewees
    }
  });

  it('returns empty array when no completed interviewees', () => {
    const project = createFullProject();
    const findings = aggregateFindings({ projectId: project.id });
    expect(findings).toHaveLength(0);
  });

  it('respects custom role weights', () => {
    const project = createFullProject();
    for (const p of project.interviewees) {
      updateInterviewSession({ projectId: project.id, intervieweeId: p.id, status: 'completed' });
    }
    const flatWeights: Record<InterviewRole, number> = {
      c_suite: 1.0, vp_director: 1.0, manager: 1.0, individual: 1.0, external: 1.0,
    };
    const weighted = aggregateFindings({ projectId: project.id });
    const flat = aggregateFindings({ projectId: project.id, roleWeights: flatWeights });
    // Weighted should differ from flat for at least one dimension
    const anyDiff = weighted.some((w, i) => w.score !== flat[i].score);
    expect(anyDiff).toBe(true);
  });

  it('filters by dimensions', () => {
    const project = createFullProject();
    for (const p of project.interviewees) {
      updateInterviewSession({ projectId: project.id, intervieweeId: p.id, status: 'completed' });
    }
    const findings = aggregateFindings({ projectId: project.id, dimensions: ['decision_making'] });
    expect(findings).toHaveLength(1);
    expect(findings[0].dimension).toBe('decision_making');
  });
});

// ====================================================================
// Tool 7: get_project_progress
// ====================================================================

describe('getProjectProgress — Tool 7', () => {
  it('reports setup phase correctly', () => {
    const project = createFullProject();
    const progress = getProjectProgress(project.id)!;
    expect(progress.phase).toBe('setup');
    expect(progress.totalInterviewees).toBe(4);
    expect(progress.completedSessions).toBe(0);
    expect(progress.dataCompleteness).toBe(0);
    expect(progress.nextRecommendedAction).toContain('进入数据采集阶段');
  });

  it('reports collection phase with partial completion', () => {
    const project = createFullProject();
    const ceo = project.interviewees.find(i => i.role === 'c_suite')!;
    updateInterviewSession({ projectId: project.id, intervieweeId: ceo.id, status: 'completed' });
    const progress = getProjectProgress(project.id)!;
    expect(progress.phase).toBe('collection');
    expect(progress.completedSessions).toBe(1);
    expect(progress.dataCompleteness).toBe(0.25);
  });

  it('reports analysis phase when all done', () => {
    const project = createFullProject();
    for (const p of project.interviewees) {
      updateInterviewSession({ projectId: project.id, intervieweeId: p.id, status: 'completed' });
    }
    const progress = getProjectProgress(project.id)!;
    expect(progress.phase).toBe('analysis');
    expect(progress.dataCompleteness).toBe(1);
    expect(progress.nextRecommendedAction).toContain('aggregate_findings');
  });

  it('returns null for nonexistent project', () => {
    expect(getProjectProgress('no')).toBeNull();
  });
});

// ====================================================================
// recommendChannels
// ====================================================================

describe('recommendChannels', () => {
  it('recommends 1-on-1 + survey for small teams', () => {
    const channels = recommendChannels(3);
    expect(channels).toContain('one_on_one');
    expect(channels).toContain('anonymous_survey');
  });

  it('recommends full suite for large teams', () => {
    const channels = recommendChannels(100);
    expect(channels).toContain('focus_group');
    expect(channels).toContain('system_collection');
  });
});
