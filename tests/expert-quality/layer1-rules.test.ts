/**
 * tests/expert-quality/layer1-rules.test.ts — L1 规则检查
 *
 * 验证专家产出的内容质量底线（不依赖 LLM）。
 * 全自动，<50ms per test。
 *
 * 铁律 33: 测试命名 *.test.ts
 */
import { describe, it, expect } from 'vitest';

// ═══ Types ═══

interface Finding {
  id?: string;
  statement?: string;
  description?: string;
  severity?: string;
  evidence?: string[];
  evidenceRefs?: string[];
  suggestion?: string;
  suggestedActions?: string[];
  title?: string;
}

interface ExpertOutput {
  expertType?: string;
  findings?: Finding[];
  overallAssessment?: string;
  conclusion?: string;
  score?: number;
  confidence?: string;
}

// ═══ Constants ═══

const INTERNAL_TERMS = [
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7',
  '测量器', 'GapDimension', 'DimensionNode',
  '本体层', 'EvidenceRef', 'GraphBridge',
  'L1', 'L2', 'L3', 'L4', 'L5', 'L1交互', 'L2编排', 'L3洞察', 'L4本体', 'L5存储',
  'PKB', 'SOG', 'FDE',
];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  strategy: ['战略', '方向', '竞争', '壁垒', '赛道', '市场', '定位'],
  org: ['团队', '组织', '人', '结构', '能力', '管理', '协作', '激励'],
  finance: ['财务', '收入', '成本', '利润', '现金', '风险', '预算', '税'],
  tech: ['技术', '系统', '数字化', '数据', '自动化', 'AI', '工具', '架构'],
  marketing: ['客户', '营销', '销售', '品牌', '渠道', '获客', '转化', '市场'],
  action: ['执行', '行动', '计划', '项目', '进度', '交付', '任务', '优先级'],
  business_model: ['商业模式', '收入', '成本结构', '价值主张', '定价', '客户细分', '利益', '复购', '护城河', '现金流', '体质'],
};

// ═══ Test helpers ═══

function countFindings(output: ExpertOutput): number {
  return output.findings?.length || 0;
}

function hasHighSeverity(output: ExpertOutput): boolean {
  return output.findings?.some(
    f => f.severity === 'critical' || f.severity === 'warning'
  ) || false;
}

function hasInternalTerms(text: string): string[] {
  return INTERNAL_TERMS.filter(term => text.includes(term));
}

function hasDomainKeywords(text: string, expertType: string): boolean {
  const keywords = DOMAIN_KEYWORDS[expertType] || [];
  return keywords.some(kw => text.includes(kw));
}

function countEmptyEvidence(output: ExpertOutput): number {
  return output.findings?.filter(f => {
    const refs = f.evidenceRefs || f.evidence || [];
    return refs.length === 0;
  }).length || 0;
}

function hasActionableSuggestions(output: ExpertOutput): boolean {
  const vaguePhrases = ['提高效率', '加强管理', '优化流程', '改善', '提升', '改进'];
  return output.findings?.some(f => {
    const suggestion = f.suggestion || f.suggestedActions?.join(' ') || '';
    return suggestion.length > 10 && !vaguePhrases.some(v => suggestion === v);
  }) || false;
}

// ═══ L1 Tests ═══

describe('Layer 1: 规则检查', () => {
  // L1-1: findings 数量
  describe('L1-1: findings 数量', () => {
    it('Given 正常专家输出, Then findings ≥ 2', () => {
      const output: ExpertOutput = {
        expertType: 'strategy',
        findings: [
          { severity: 'critical', statement: '发现1', evidenceRefs: ['e1'] },
          { severity: 'warning', statement: '发现2', evidenceRefs: ['e2'] },
        ],
        overallAssessment: '综合评估',
      };
      expect(countFindings(output)).toBeGreaterThanOrEqual(2);
    });

    it('Given 仅 1 条 finding, Then 可能过于简略', () => {
      const output: ExpertOutput = {
        findings: [{ severity: 'info', statement: '一切正常' }],
        overallAssessment: 'ok',
      };
      // 不阻断但记录——1 条 finding 基本等于没诊断
      expect(countFindings(output)).toBeLessThan(2);
    });

    it('Given zero findings, Then 诊断不完整', () => {
      const output: ExpertOutput = {
        findings: [],
        overallAssessment: '没有发现任何问题',
      };
      expect(countFindings(output)).toBe(0);
    });
  });

  // L1-2: 严重度分布
  describe('L1-2: 严重度分布', () => {
    it('Given 正常诊断, Then 至少 1 条 critical 或 warning', () => {
      const output: ExpertOutput = {
        findings: [
          { severity: 'critical', statement: '严重问题' },
          { severity: 'info', statement: '一般信息' },
        ],
        overallAssessment: '有问题',
      };
      expect(hasHighSeverity(output)).toBe(true);
    });

    it('Given 全 info 输出, Then 可能过于乐观或缺乏深度', () => {
      const output: ExpertOutput = {
        findings: [
          { severity: 'info', statement: '指标正常' },
          { severity: 'info', statement: '状态良好' },
        ],
        overallAssessment: '一切正常',
      };
      expect(hasHighSeverity(output)).toBe(false);
    });
  });

  // L1-3: overallAssessment 充分性
  describe('L1-3: overallAssessment 充分性', () => {
    it('Given 正常诊断, Then overallAssessment ≥ 30 字符', () => {
      const good = '企业当前战略方向与组织执行能力之间存在显著缺口，核心风险集中在关键人员依赖';
      expect(good.length).toBeGreaterThanOrEqual(30);
    });

    it('Given 过短评估, Then 可能敷衍', () => {
      const tooShort = '一切正常';
      expect(tooShort.length).toBeLessThan(30);
    });

    it('Given 空评估, Then 不可接受', () => {
      const empty = '';
      expect(empty.length).toBe(0);
    });
  });

  // L1-4: 内部术语泄漏
  describe('L1-4: 内部术语泄漏', () => {
    it('Given 正常诊断, Then 不含内部术语', () => {
      const cleanText = '企业面临核心人员流失风险，张老师承担60%课程量无可替代';
      const terms = hasInternalTerms(cleanText);
      expect(terms).toHaveLength(0);
    });

    it('Given 含内部术语的诊断, Then 应被检测', () => {
      const dirtyText = 'D2组织能力维度显示GapDimension值偏高，需结合D1数据由测量器重新计算';
      const terms = hasInternalTerms(dirtyText);
      expect(terms.length).toBeGreaterThan(0);
    });

    it('Given 含 L1/L2/L3 层级引用, Then 应被检测', () => {
      expect(hasInternalTerms('此问题应在L3洞察层解决').length).toBeGreaterThan(0);
      expect(hasInternalTerms('L2编排层需要协调各专家').length).toBeGreaterThan(0);
    });

    it('Given 诊断含 "本体层" "EvidenceRef" 等, Then 应被检测', () => {
      expect(hasInternalTerms('通过本体层查询确认').length).toBeGreaterThan(0);
      expect(hasInternalTerms('详见EvidenceRef: e001').length).toBeGreaterThan(0);
    });
  });

  // L1-5: 领域关键词检查
  describe('L1-5: 领域关键词', () => {
    it('Given strategy 专家, Then 应包含战略相关术语', () => {
      const text = '企业战略方向是成为区域头部，但竞争壁垒薄弱，需要重新评估市场定位';
      expect(hasDomainKeywords(text, 'strategy')).toBe(true);
    });

    it('Given finance 专家, Then 应包含财务相关术语', () => {
      const text = '现金流压力明显，毛利率45%但净利率仅15%，成本结构需优化';
      expect(hasDomainKeywords(text, 'finance')).toBe(true);
    });

    it('Given business_model 专家, Then 应包含商业模式相关术语', () => {
      const text = '这家公司的商业模式本质是个人生意——核心收入依赖单一讲师，缺乏结构性护城河';
      expect(hasDomainKeywords(text, 'business_model')).toBe(true);
    });

    it('Given business_model 专家输出完全不含域关键词, Then 可能偏离域', () => {
      const offDomain = '建议优化服务器配置，使用微服务架构，引入Kubernetes';
      expect(hasDomainKeywords(offDomain, 'business_model')).toBe(false);
    });
  });

  // L1-6: 证据引用
  describe('L1-6: 证据引用', () => {
    it('Given critical/warning finding, Then 应有证据引用', () => {
      const output: ExpertOutput = {
        findings: [
          { severity: 'critical', statement: '严重风险', evidenceRefs: ['int-001'] },
          { severity: 'warning', statement: '需关注', evidenceRefs: ['int-002'] },
          { severity: 'info', statement: '一般信息', evidenceRefs: [] },
        ],
        overallAssessment: 'ok',
      };
      expect(countEmptyEvidence(output)).toBe(1); // Only the info one
    });

    it('Given all findings without evidence, Then 质量堪忧', () => {
      const output: ExpertOutput = {
        findings: [
          { severity: 'critical', statement: '严重问题' },
          { severity: 'warning', statement: '需要关注' },
        ],
        overallAssessment: 'ok',
      };
      expect(countEmptyEvidence(output)).toBe(2);
    });
  });

  // L1-7: 可执行性基本检查
  describe('L1-7: 可执行性基本检查', () => {
    it('Given 正常诊断, Then 至少部分 finding 有具体建议', () => {
      const output: ExpertOutput = {
        findings: [
          {
            severity: 'critical',
            statement: '核心人员风险',
            suggestion: '在90天内完成张老师知识体系文档化，将40%课程转移给其他讲师',
          },
        ],
        overallAssessment: 'ok',
      };
      expect(hasActionableSuggestions(output)).toBe(true);
    });

    it('Given 空话建议, Then 不可执行', () => {
      const output: ExpertOutput = {
        findings: [{
          severity: 'warning',
          statement: '效率问题',
          suggestion: '提高效率',
        }],
        overallAssessment: 'ok',
      };
      expect(hasActionableSuggestions(output)).toBe(false);
    });
  });
});
