/**
 * calibration-loop.test.ts — P3-03 校准闭环测试
 */
import {
  runCalibrationCheck,
  recordDiagnosisSnapshot,
  submitFeedbackReplay,
  getFeedbackReplay,
  clearCalibrationStore,
} from '../calibration-loop';
import { clearActionTrackingStore, createActionsFromDiagnosis, updateAdoption } from '../action-tracking';
import { clearLearnerStore, generateSessionLearning } from '../session-learner';

beforeEach(() => {
  clearCalibrationStore();
  clearActionTrackingStore();
  clearLearnerStore();
});

describe('runCalibrationCheck', () => {
  it('runs calibration and returns report', () => {
    const report = runCalibrationCheck('org-1', 'team-1', ['d1', 'd2', 'd3'], {
      information_flow: 0.6,
      trust_level: 0.5,
    });
    expect(report.reportId).toMatch(/^calrep_/);
    expect(report.overallStatus).toBeDefined();
    expect(report.checks.length).toBeGreaterThanOrEqual(0);
  });

  it('detects adoption feedback when high-priority actions rejected', () => {
    const actions = createActionsFromDiagnosis('d1', 'org-1', 'team-1', [
      { description: '引入异步站会', priority: 'critical', dimension: 'information_flow', estimatedHours: 8 },
      { description: '统一文档平台', priority: 'high', dimension: 'knowledge_sharing', estimatedHours: 24 },
    ]);
    // Reject both high-priority actions
    updateAdoption(actions[0].actionId, { status: 'rejected', decidedBy: 'sponsor', decidedAt: '' });
    updateAdoption(actions[1].actionId, { status: 'rejected', decidedBy: 'sponsor', decidedAt: '' });

    const report = runCalibrationCheck('org-1', 'team-1', ['d1'], {
      information_flow: 0.6,
    });
    const adoptionCheck = report.checks.find(c => c.checkType === 'adoption_feedback');
    expect(adoptionCheck).toBeDefined();
    expect(adoptionCheck!.passed).toBe(false); // 100% rejection rate
    expect(report.autoCorrections.length).toBeGreaterThan(0);
  });

  it('reports calibrated when no issues found', () => {
    // Create actions that were adopted
    const actions = createActionsFromDiagnosis('d1', 'org-1', 'team-1', [
      { description: '已采纳建议', priority: 'medium', dimension: 'trust_level', estimatedHours: 4 },
    ]);
    updateAdoption(actions[0].actionId, { status: 'adopted', decidedBy: 'sponsor', decidedAt: '' });

    const report = runCalibrationCheck('org-1', 'team-1', ['d1', 'd2', 'd3'], {
      trust_level: 0.7,
    });
    expect(report.overallStatus).toBe('calibrated');
  });
});

describe('feedback replay', () => {
  it('records and retrieves diagnosis snapshot', () => {
    recordDiagnosisSnapshot('org-1', 'diag-001',
      { information_flow: 0.6, trust_level: 0.5 },
      ['假设1: 信息流断裂'],
      ['引入异步站会'],
      { humanHourlyCost: 100 });

    const replay = getFeedbackReplay('diag-001');
    expect(replay).toBeDefined();
    expect(replay!.snapshot.scores.information_flow).toBe(0.6);
  });

  it('submits feedback and corrects params', () => {
    recordDiagnosisSnapshot('org-1', 'diag-002',
      { information_flow: 0.4 },
      ['假设: 信息流问题'],
      ['建议: 改善沟通'],
      { humanHourlyCost: 100 });

    const replay = submitFeedbackReplay('diag-002', {
      inaccurateFindings: ['信息流问题判断不准'],
      impracticalActions: ['改善沟通太模糊'],
      corrections: ['实际是角色清晰度问题'],
    });

    expect(replay).not.toBeNull();
    expect(replay!.userFeedback.inaccurateFindings).toHaveLength(1);
    expect(replay!.replayedAt).toBeTruthy();
  });

  it('returns null for non-existent replay', () => {
    expect(submitFeedbackReplay('nonexistent', {
      inaccurateFindings: [], impracticalActions: [], corrections: [],
    })).toBeNull();
  });
});
