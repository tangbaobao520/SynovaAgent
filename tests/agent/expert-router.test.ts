/**
 * tests/agent/expert-router.test.ts — D8c 专家路由算法测试
 * D491: 对齐 expert-registry.yaml v2.0 的 7 位专家（D282 删除 finance/strategy/org/marketing 等旧名）
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

describe('ExpertRouter — dispatch', () => {
  it('finance-structure expert → 返回非空分析', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = await router.dispatch({
      subTaskId: 'st-1', expertType: 'finance-structure',
      inputFindings: [{ id: 'F1', severity: 'critical', title: '利润偏低', description: '净利润率5%' }],
      context: { enterpriseId: 'test', diagnosisId: 'd1' },
    });
    expect(result.expertType).toBe('finance-structure');
    expect(result.analysis.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.degraded).toBe(false);
    expect(Array.isArray(result.edgeIds)).toBe(true);
  });

  it('competitive-strategy expert → 返回非空分析', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = await router.dispatch({
      subTaskId: 'st-2', expertType: 'competitive-strategy',
      inputFindings: [{ id: 'F1', severity: 'warning', title: '竞争加剧', description: '市场份额下降' }],
      context: { enterpriseId: 'test', diagnosisId: 'd2' },
    });
    expect(result.analysis.length).toBeGreaterThan(0);
    expect(result.degraded).toBe(false);
  });

  it('unknown expertType → degrade + error', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = await router.dispatch({
      subTaskId: 'st-3', expertType: 'nonexistent',
      inputFindings: [],
      context: { enterpriseId: 'test', diagnosisId: 'd3' },
    });
    expect(result.degraded).toBe(true);
    expect(result.error).toBeTruthy();
  });
});

describe('ExpertRouter — selectExpert', () => {
  it('financial finding → finance-structure', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = router.selectExpert([
      { id: 'F1', severity: 'critical', title: 'margin', sentinel: 'margin-health' },
    ]);
    expect(result).toBe('finance-structure');
  });

  it('capital finding → capital-cycle', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = router.selectExpert([
      { id: 'F1', severity: 'warning', title: 'capital', sentinel: 'capital-efficiency' },
    ]);
    expect(result).toBe('capital-cycle');
  });

  it('strategy finding → competitive-strategy', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = router.selectExpert([
      { id: 'F1', severity: 'warning', title: 'strategy', sentinel: 'strategy-review' },
    ]);
    expect(result).toBe('competitive-strategy');
  });

  it('market finding → customer-cycle', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = router.selectExpert([
      { id: 'F1', severity: 'warning', title: 'market', sentinel: 'market-share' },
    ]);
    expect(result).toBe('customer-cycle');
  });

  it('talent finding → talent-cycle', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = router.selectExpert([
      { id: 'F1', severity: 'warning', title: 'talent', sentinel: 'talent-density' },
    ]);
    expect(result).toBe('talent-cycle');
  });

  it('empty findings → fallback host', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = router.selectExpert([]);
    expect(result).toBe('host');
  });
});

describe('ExpertRouter — loadExpertManifest', () => {
  it('finance-structure manifest → 含必需字段', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const manifest = router.loadExpertManifest('finance-structure');
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe('finance-structure');
    expect(manifest!.displayName).toBeTruthy();
    expect(Array.isArray(manifest!.edges)).toBe(true);
    expect(Array.isArray(manifest!.frameworks)).toBe(true);
  });

  it('nonexistent expert → null + degrade', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const manifest = router.loadExpertManifest('nonexistent');
    expect(manifest).toBeNull();
  });
});

describe('ExpertResponse — 结构验证', () => {
  it('所有必需字段存在', async () => {
    const { ExpertRouter } = await import('../../src/agent/expert-router');
    const router = new ExpertRouter();
    const result = await router.dispatch({
      subTaskId: 'st-test', expertType: 'finance-structure',
      inputFindings: [{ id: 'F1', severity: 'info', title: 'test', description: 'test' }],
      context: { enterpriseId: 'test', diagnosisId: 'd-test' },
    });
    expect(result).toHaveProperty('subTaskId');
    expect(result).toHaveProperty('expertType');
    expect(result).toHaveProperty('analysis');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('evidence');
    expect(result).toHaveProperty('edgeIds');
    expect(result).toHaveProperty('degraded');
    expect(result).toHaveProperty('durationMs');
    expect(typeof result.analysis).toBe('string');
    expect(typeof result.confidence).toBe('number');
    expect(Array.isArray(result.evidence)).toBe(true);
  });
});

describe('TaskDecomposer — ExpertRouter 集成', () => {
  it('executeSubTask 通过 ExpertRouter 路由到在册专家', async () => {
    // D491 注: executeSubTask 按 subTask.dimension 经 DIMENSION_EXPERT_MAP 路由, 不读 subTask.expertType。
    // 选 dimension 'technology' 因其映射值 'tech' 是 7 位在册专家; 'financial' 映射值 'finance' 已被 D282
    // 删除, 该映射修属 task-decomposer.ts 写集（本任务写集外, 见交付报告越界发现）。
    const { TaskDecomposer } = await import('../../src/agent/task-decomposer');
    const td = new TaskDecomposer();
    const result = await td.executeSubTask({
      id: 'st-int', dimension: 'technology', priority: 0, expertType: 'tech',
      inputFindings: [{ id: 'F1', severity: 'critical', title: '系统可用性', description: '' }],
      status: 'pending',
    });
    expect(result.status).toBe('completed');
    expect(result.confidence).toBeGreaterThan(0);
  });
});
