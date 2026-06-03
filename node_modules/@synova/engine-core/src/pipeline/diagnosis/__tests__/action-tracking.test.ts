/**
 * action-tracking.test.ts — 行动追踪 + 反馈闭环测试
 * P2-20a: Given/When/Then 模式
 */
import {
  createActionsFromDiagnosis,
  updateAdoption,
  addProgress,
  linkExternalTask,
  autoInferProgress,
  getOrgActions,
  getDueFollowUps,
  submitFeedback,
  getOrgAdoptionRate,
  generateEvolutionSignal,
  getUnsubmittedSignals,
  markSubmittedToFederation,
  autoInferAllProgress,
  getAdvisorWorkload,
  clearActionTrackingStore,
} from '../action-tracking';

beforeEach(() => clearActionTrackingStore());

// ====================================================================
// Action Creation
// ====================================================================

describe('createActionsFromDiagnosis', () => {
  it('creates action items from diagnosis output', () => {
    const actions = createActionsFromDiagnosis('diag-1', 'org-1', 'team-1', [
      { description: '引入异步站会', priority: 'high', dimension: 'information_flow', estimatedHours: 8 },
      { description: '统一文档平台', priority: 'critical', dimension: 'knowledge_sharing', estimatedHours: 24 },
    ]);
    expect(actions).toHaveLength(2);
    expect(actions[0].adoption.status).toBe('deferred');
    expect(actions[0].priority).toBe('high');
  });

  it('assigns unique IDs', () => {
    const actions = createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'A', priority: 'medium', dimension: 'trust', estimatedHours: 1 },
      { description: 'B', priority: 'low', dimension: 'trust', estimatedHours: 1 },
    ]);
    expect(actions[0].actionId).not.toBe(actions[1].actionId);
  });
});

// ====================================================================
// Adoption
// ====================================================================

describe('updateAdoption', () => {
  it('updates adoption status', () => {
    const [act] = createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'Test', priority: 'medium', dimension: 'trust', estimatedHours: 1 },
    ]);
    const updated = updateAdoption(act.actionId, {
      status: 'adopted', decidedBy: 'sponsor', decidedAt: new Date().toISOString(), reason: '合理',
    });
    expect(updated!.adoption.status).toBe('adopted');
    expect(updated!.adoption.decidedBy).toBe('sponsor');
  });

  it('returns null for nonexistent action', () => {
    expect(updateAdoption('no', { status: 'adopted', decidedBy: 'sponsor', decidedAt: '' })).toBeNull();
  });
});

// ====================================================================
// Progress
// ====================================================================

describe('addProgress', () => {
  it('prepends progress entries', () => {
    const [act] = createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'Test', priority: 'medium', dimension: 'trust', estimatedHours: 1 },
    ]);
    addProgress(act.actionId, { reportedBy: 'sponsor', reportedAt: new Date().toISOString(), percentage: 50, discountLevel: 'partial' });
    addProgress(act.actionId, { reportedBy: 'sponsor', reportedAt: new Date().toISOString(), percentage: 100, discountLevel: 'full' });
    const actions = getOrgActions('o1');
    expect(actions[0].progress).toHaveLength(2);
    expect(actions[0].progress[0].percentage).toBe(100); // latest first
  });
});

// ====================================================================
// External Tasks
// ====================================================================

describe('linkExternalTask', () => {
  it('links Jira task and deduplicates', () => {
    const [act] = createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'Test', priority: 'medium', dimension: 'trust', estimatedHours: 1 },
    ]);
    linkExternalTask(act.actionId, { system: 'jira', taskId: 'PROJ-123', url: 'https://jira/PROJ-123', status: 'done' });
    linkExternalTask(act.actionId, { system: 'jira', taskId: 'PROJ-123', url: 'https://jira/PROJ-123', status: 'done' }); // duplicate
    const actions = getOrgActions('o1');
    expect(actions[0].externalTasks).toHaveLength(1);
    expect(actions[0].externalTasks[0].system).toBe('jira');
  });
});

// ====================================================================
// Auto-Inference
// ====================================================================

describe('autoInferProgress', () => {
  it('infers full progress when task completed', () => {
    const [act] = createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'Test', priority: 'medium', dimension: 'trust', estimatedHours: 1 },
    ]);
    const result = autoInferProgress(act.actionId, { taskCompleted: true });
    expect(result!.percentage).toBe(100);
    expect(result!.discountLevel).toBe('full');
  });

  it('infers partial when 2+ signals positive', () => {
    const [act] = createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'Test', priority: 'medium', dimension: 'trust', estimatedHours: 1 },
    ]);
    const result = autoInferProgress(act.actionId, { gitActivity: true, softwareChange: true });
    expect(result!.percentage).toBe(70);
  });

  it('returns 0% with no signals', () => {
    const [act] = createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'Test', priority: 'medium', dimension: 'trust', estimatedHours: 1 },
    ]);
    const result = autoInferProgress(act.actionId, {});
    expect(result!.percentage).toBe(0);
  });
});

// ====================================================================
// Org Queries
// ====================================================================

describe('getOrgActions', () => {
  it('filters by org', () => {
    createActionsFromDiagnosis('d1', 'org-A', 't1', [{ description: 'A1', priority: 'medium', dimension: 'trust', estimatedHours: 1 }]);
    createActionsFromDiagnosis('d2', 'org-B', 't2', [{ description: 'B1', priority: 'medium', dimension: 'trust', estimatedHours: 1 }]);
    expect(getOrgActions('org-A')).toHaveLength(1);
    expect(getOrgActions('org-B')).toHaveLength(1);
  });
});

// ====================================================================
// Feedback
// ====================================================================

describe('submitFeedback', () => {
  it('records and retrieves feedback', () => {
    submitFeedback({
      diagnosisId: 'd1', orgId: 'o1', teamId: 't1',
      overallRating: 'helpful', dimensionRatings: { decision_making: 'helpful' },
      accuracySelfReport: 0.8, adoptionRate: 0.6, improvementSuggestions: ['更具体的行动建议'],
      submittedBy: 'sponsor',
    });
    const fb = submitFeedback({
      diagnosisId: 'd1', orgId: 'o1', teamId: 't1',
      overallRating: 'very_helpful', dimensionRatings: {}, accuracySelfReport: 0.9,
      adoptionRate: 0.8, improvementSuggestions: [], submittedBy: 'advisor',
    });
    expect(fb.feedbackId).toMatch(/^fb_/);
  });
});

// ====================================================================
// Adoption Rate
// ====================================================================

describe('getOrgAdoptionRate', () => {
  it('calculates correct adoption rate', () => {
    const actions = createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'A', priority: 'high', dimension: 'd1', estimatedHours: 1 },
      { description: 'B', priority: 'high', dimension: 'd2', estimatedHours: 1 },
    ]);
    updateAdoption(actions[0].actionId, { status: 'adopted', decidedBy: 'sponsor', decidedAt: '' });
    updateAdoption(actions[1].actionId, { status: 'rejected', decidedBy: 'sponsor', decidedAt: '' });
    const stats = getOrgAdoptionRate('o1');
    expect(stats.adopted).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.rate).toBe(0.5);
  });
});

// ====================================================================
// Evolution Signals
// ====================================================================

describe('generateEvolutionSignal', () => {
  it('returns null when fewer than 3 diagnoses', () => {
    expect(generateEvolutionSignal('o1', 't1', ['d1', 'd2'])).toBeNull();
  });

  it('generates signal with 3+ diagnoses', () => {
    const signal = generateEvolutionSignal('o1', 't1', ['d1', 'd2', 'd3'], {
      baselineDrifts: [{ metricName: 'info_flow', originalBaseline: 5, currentMean: 6.5, sampleSize: 3, trendDirection: 'improving', confidence: 0.72 }],
    });
    expect(signal).not.toBeNull();
    expect(signal!.diagnosisCount).toBe(3);
    expect(signal!.submittedToFederation).toBe(false);
  });

  it('can be marked as submitted', () => {
    const signal = generateEvolutionSignal('o1', 't1', ['d1', 'd2', 'd3']);
    expect(getUnsubmittedSignals('o1')).toHaveLength(1);
    markSubmittedToFederation(signal!.signalId);
    expect(getUnsubmittedSignals('o1')).toHaveLength(0);
  });
});

// ====================================================================
// Advisor Workload
// ====================================================================

describe('getAdvisorWorkload', () => {
  it('calculates advisor workload across orgs', () => {
    createActionsFromDiagnosis('d1', 'o1', 't1', [
      { description: 'A', priority: 'high', dimension: 'd', estimatedHours: 1 },
    ]);
    createActionsFromDiagnosis('d2', 'o2', 't2', [
      { description: 'B', priority: 'medium', dimension: 'd', estimatedHours: 1 },
    ]);
    const wl = getAdvisorWorkload(['o1', 'o2']);
    expect(wl.pendingReviews).toBe(2);
    expect(wl.orgAdoptionRates['o1']).toBe(0);
  });
});
