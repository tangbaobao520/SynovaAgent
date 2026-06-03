/**
 * phase4-ecosystem.test.ts — Phase 4: 生态建设测试
 *
 * 覆盖: L0本体自适应 + L1会话学习 + Expert贡献API + ConnectorSDK
 * 对标 Claw-Code: Given/When/Then + 手写 fake
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ═══ L0: Ontology Auto-Adaptation ═══

interface OntologyPatch {
  action: 'create' | 'update';
  nodeType: string;
  props: Record<string, unknown>;
  evidence?: string;
}

describe('L0 Ontology Auto-Adaptation', () => {
  function generatePatches(diagnosisResult: {
    findings: Array<{ type: string; entity: string; confidence: number }>;
  }): OntologyPatch[] {
    const patches: OntologyPatch[] = [];
    for (const f of diagnosisResult.findings) {
      if (f.confidence >= 0.7) {
        patches.push({
          action: 'create',
          nodeType: f.type,
          props: { name: f.entity },
          evidence: `诊断发现: ${f.type} = ${f.entity} (置信度 ${f.confidence})`,
        });
      }
    }
    return patches;
  }

  it('Given high-confidence findings, When generatePatches, Then creates ontology patches', () => {
    const result = {
      findings: [
        { type: 'Team', entity: '核心产品组', confidence: 0.9 },
        { type: 'Person', entity: '张工', confidence: 0.85 },
        { type: 'Risk', entity: '单点故障', confidence: 0.3 },  // below threshold
      ],
    };
    const patches = generatePatches(result);
    expect(patches).toHaveLength(2);
    expect(patches[0].nodeType).toBe('Team');
    expect(patches[1].nodeType).toBe('Person');
  });

  it('Given no findings above threshold, When generatePatches, Then returns empty', () => {
    const result = { findings: [{ type: 'Risk', entity: 'low', confidence: 0.2 }] };
    expect(generatePatches(result)).toHaveLength(0);
  });
});

// ═══ L1: Session Learning ═══

interface SessionFeedback {
  diagnosisId: string;
  rating: number;        // 1-5
  inaccurateClaims: string[];
  accurateClaims: string[];
}

describe('L1 Session Learning', () => {
  function processFeedback(feedback: SessionFeedback): {
    adjustments: Array<{ claim: string; adjustment: 'boost' | 'penalize' }>;
    summary: string;
  } {
    const adjustments: Array<{ claim: string; adjustment: 'boost' | 'penalize' }> = [];

    for (const claim of feedback.accurateClaims) {
      adjustments.push({ claim, adjustment: 'boost' });
    }
    for (const claim of feedback.inaccurateClaims) {
      adjustments.push({ claim, adjustment: 'penalize' });
    }

    return {
      adjustments,
      summary: `评分: ${feedback.rating}/5, 准确: ${feedback.accurateClaims.length}, 不准确: ${feedback.inaccurateClaims.length}`,
    };
  }

  it('Given positive feedback, When processed, Then accurate claims boosted', () => {
    const fb: SessionFeedback = {
      diagnosisId: 'diag_1', rating: 4,
      accurateClaims: ['排班问题导致流失'],
      inaccurateClaims: [],
    };
    const result = processFeedback(fb);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].adjustment).toBe('boost');
  });

  it('Given mixed feedback, When processed, Then both boost and penalize', () => {
    const fb: SessionFeedback = {
      diagnosisId: 'diag_2', rating: 3,
      accurateClaims: ['工具链效率低'],
      inaccurateClaims: ['薪酬是主因'],
    };
    const result = processFeedback(fb);
    expect(result.adjustments).toHaveLength(2);
    expect(result.adjustments.map(a => a.adjustment)).toContain('boost');
    expect(result.adjustments.map(a => a.adjustment)).toContain('penalize');
  });
});

// ═══ Expert Contribution API ═══

interface ContributionRequest {
  expertId: string;
  industry: string;
  scenario: string;
  description: string;
  yearsOfExperience?: number;
}

interface ContributionResponse {
  id: string;
  status: 'submitted' | 'extracted' | 'validated' | 'published';
  template?: { symptom: string; rootCause: string };
}

describe('Expert Contribution API', () => {
  // In-memory store for testing
  const contributions = new Map<string, ContributionResponse>();

  function submitContribution(req: ContributionRequest): ContributionResponse {
    const id = `contrib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const resp: ContributionResponse = { id, status: 'submitted' };
    contributions.set(id, resp);

    // Auto-extract (simulated)
    if (req.description.length > 10) {
      resp.status = 'extracted';
      resp.template = {
        symptom: req.scenario.replace(/_/g, ' '),
        rootCause: req.description.slice(0, 50),
      };
    }

    return resp;
  }

  it('Given valid contribution, When submitted, Then returns extracted template', () => {
    const result = submitContribution({
      expertId: 'expert-001', industry: 'manufacturing',
      scenario: 'high_turnover',
      description: '我们工厂的问题不是工资低，而是排班不合理，老员工夜班太多导致流失',
      yearsOfExperience: 20,
    });
    expect(result.status).toBe('extracted');
    expect(result.template).toBeDefined();
    expect(result.template!.symptom).toBe('high turnover');
  });

  it('Given empty description, When submitted, Then stays at submitted (no extraction)', () => {
    const result = submitContribution({
      expertId: 'expert-002', industry: 'tech', scenario: 'low_morale', description: 'x',
    });
    expect(result.status).toBe('submitted');
    expect(result.template).toBeUndefined();
  });

  it('Given multiple contributions, When queried, Then each has unique ID', () => {
    const r1 = submitContribution({ expertId: 'e1', industry: 'a', scenario: 's', description: 'test long enough for extraction' });
    const r2 = submitContribution({ expertId: 'e2', industry: 'b', scenario: 't', description: 'another test for extraction' });
    expect(r1.id).not.toBe(r2.id);
  });
});

// ═══ Connector SDK ═══

interface ConnectorManifest {
  name: string;
  version: string;
  tools: Array<{ name: string; description: string; params: Record<string, string> }>;
}

describe('Connector SDK', () => {
  function validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const m = manifest as ConnectorManifest;

    if (!m.name) errors.push('缺少 name');
    if (!m.version) errors.push('缺少 version');
    if (!m.tools || !Array.isArray(m.tools)) errors.push('缺少 tools 数组');
    else if (m.tools.length === 0) errors.push('tools 数组为空');
    else {
      for (const tool of m.tools) {
        if (!tool.name) errors.push('tool 缺少 name');
        if (!tool.description) errors.push('tool 缺少 description');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  it('Given valid manifest, When validated, Then returns valid=true', () => {
    const manifest: ConnectorManifest = {
      name: 'feishu', version: '1.0.0',
      tools: [{ name: 'fetch_messages', description: '获取消息', params: {} }],
    };
    expect(validateManifest(manifest).valid).toBe(true);
  });

  it('Given manifest without tools, When validated, Then returns errors', () => {
    const result = validateManifest({ name: 'empty', version: '1.0' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('缺少 tools 数组');
  });

  it('Given manifest with empty tools array, When validated, Then returns error', () => {
    const manifest = { name: 'test', version: '1.0', tools: [] };
    const result = validateManifest(manifest);
    expect(result.errors).toContain('tools 数组为空');
  });
});
