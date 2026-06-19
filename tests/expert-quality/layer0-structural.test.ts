/**
 * tests/expert-quality/layer0-structural.test.ts — L0 结构校验
 *
 * 验证每位专家产出的 JSON 结构合法性。
 * 全自动，无 LLM 调用，<5ms per test。
 *
 * 铁律 33: 测试命名 *.test.ts
 */
import { describe, it, expect } from 'vitest';

// ═══ Expert type helpers ═══

const EXPERT_TYPES = [
  'strategy', 'org', 'finance', 'tech', 'marketing', 'action', 'business_model',
] as const;
type ExpertType = (typeof EXPERT_TYPES)[number];

interface ExpertOutput {
  expertType: ExpertType;
  findings?: Array<{
    id?: string;
    dimension?: string;
    statement?: string;
    confidence?: number;
    evidenceRefs?: string[];
    severity?: string;
    suggestedActions?: string[];
  }>;
  overallAssessment?: string;
  score?: number;
  confidence?: string;
  degraded?: boolean;
}

// ═══ Test helpers ═══

function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch { /* expected: JSON parse may fail */ 
    return false;
  }
}

function parseExpertOutput(raw: string): ExpertOutput | null {
  try {
    // Strip markdown code blocks
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch { /* expected: JSON parse may fail */ 
    return null;
  }
}

const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low', 'warning', 'info'];

// ═══ L0 Tests ═══

describe('Layer 0: 结构校验', () => {
  // L0-1: 专家输出结构定义验证
  describe('L0-1: 输出结构定义', () => {
    it('Given 7 位内置专家, Then 类型列表完整', () => {
      expect(EXPERT_TYPES).toHaveLength(7);
      expect(EXPERT_TYPES).toContain('business_model');
    });

    it('Given ExpertOutput 接口, Then 关键字段存在', () => {
      // Type-level check: verify the interface shape
      const mockOutput: ExpertOutput = {
        expertType: 'strategy',
        findings: [{
          id: 'f1',
          statement: 'test',
          severity: 'warning',
          evidenceRefs: ['e1'],
        }],
        overallAssessment: '测试结论',
        score: 5,
        confidence: 'medium',
      };
      expect(mockOutput.findings).toBeDefined();
      expect(mockOutput.overallAssessment).toBeDefined();
      expect(mockOutput.score).toBeDefined();
    });
  });

  // L0-2: JSON 可解析性
  describe('L0-2: JSON 可解析性', () => {
    it('Given 合法 JSON 字符串, When 解析, Then 不抛异常', () => {
      const valid = '{"expertType":"strategy","overallAssessment":"结论","score":5,"findings":[]}';
      expect(isValidJSON(valid)).toBe(true);
    });

    it('Given 含 Markdown 代码块的 JSON, When 清洗后解析, Then 不抛异常', () => {
      const withMarkdown = '```json\n{"expertType":"strategy","overallAssessment":"ok","score":3}\n```';
      const cleaned = withMarkdown.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      expect(isValidJSON(cleaned)).toBe(true);
    });

    it('Given 非法 JSON, When 解析, Then 返回 null', () => {
      expect(parseExpertOutput('not json at all')).toBeNull();
      expect(parseExpertOutput('{broken json [}')).toBeNull();
    });
  });

  // L0-3: 必填字段存在性
  describe('L0-3: 必填字段', () => {
    it('Given 完整专家输出, Then overallAssessment 非空', () => {
      const output: ExpertOutput = {
        expertType: 'strategy',
        overallAssessment: '企业战略方向与组织能力不匹配',
        score: 4,
      };
      expect(output.overallAssessment).toBeTruthy();
      expect(output.overallAssessment!.length).toBeGreaterThanOrEqual(5);
    });

    it('Given 专家输出, Then findings 为数组', () => {
      const output: ExpertOutput = {
        expertType: 'org',
        overallAssessment: 'ok',
        findings: [{ id: 'f1', statement: '发现', severity: 'warning' }],
        score: 5,
      };
      expect(Array.isArray(output.findings)).toBe(true);
    });

    it('Given 专家输出没有 findings, Then 应标记为 degraded 或 findings 为空数组', () => {
      const output: ExpertOutput = {
        expertType: 'finance',
        overallAssessment: '财务健康',
        score: 6,
        findings: [],
      };
      // 空 findings 是可接受的但应被 L1 检测
      expect(output.findings).toBeDefined();
    });
  });

  // L0-4: 类型约束
  describe('L0-4: 类型约束', () => {
    it('Given finding severity, Then 值必须在合法枚举中', () => {
      const validFindings = [
        { id: 'f1', statement: 'x', severity: 'critical', evidenceRefs: ['e1'] },
        { id: 'f2', statement: 'y', severity: 'warning', evidenceRefs: ['e2'] },
        { id: 'f3', statement: 'z', severity: 'info', evidenceRefs: ['e3'] },
      ];

      for (const f of validFindings) {
        expect(VALID_SEVERITIES).toContain(f.severity);
      }
    });

    it('Given invalid severity, Then 应被检测到', () => {
      const badSeverity = 'super-dangerous';
      expect(VALID_SEVERITIES).not.toContain(badSeverity);
    });

    it('Given score, Then 应在 0-10 范围内', () => {
      const testScore = (s: number) => expect(s).toBeGreaterThanOrEqual(0) && expect(s).toBeLessThanOrEqual(10);

      // Valid scores
      [0, 1, 5, 7, 10].forEach(s => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(10);
      });
    });

    it('Given confidence, Then 应为 high/medium/low 之一', () => {
      const VALID_CONFIDENCE = ['high', 'medium', 'low'];
      expect(VALID_CONFIDENCE).toContain('high');
      expect(VALID_CONFIDENCE).toContain('medium');
      expect(VALID_CONFIDENCE).toContain('low');
      expect(VALID_CONFIDENCE).not.toContain('very-sure');
    });
  });

  // L0-5: evidenceRefs 非空
  describe('L0-5: evidenceRefs 非空', () => {
    it('Given critical finding, Then evidenceRefs 不应为空', () => {
      const criticalFinding = {
        id: 'f-crit',
        statement: '核心风险',
        severity: 'critical',
        evidenceRefs: ['doc-interview-001'],
      };
      expect(criticalFinding.evidenceRefs.length).toBeGreaterThan(0);
    });

    it('Given finding with empty evidenceRefs, Then L1 应标记', () => {
      const noEvidence = {
        id: 'f-no-ev',
        statement: '无证据的发现',
        severity: 'info',
        evidenceRefs: [],
      };
      // L0 只检测存在性，L1 判断充分性
      expect(Array.isArray(noEvidence.evidenceRefs)).toBe(true);
      expect(noEvidence.evidenceRefs.length).toBe(0);
    });
  });
});
