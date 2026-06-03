/**
 * report-renderer.test.ts — HTML 报告渲染器测试
 */

import { renderDiagnosisReport } from '../report-renderer';
import { StructuredDiagnosisReport } from '../types';

const makeReport = (overrides: Partial<StructuredDiagnosisReport> = {}): StructuredDiagnosisReport => ({
  ceoSummary: '团队知识共享维度存在显著断裂。',
  gapRadar: { knowledge_sharing: 0.32, decision_making: 0.68 },
  keyFindings: [
    { moduleId: 'knowledge-flow', severity: 'critical', detail: '跨部门知识传递成功率仅 12%', evidenceRefs: ['ev-001'] },
  ],
  evidenceChain: [
    { id: 'ev-001', source: 'interviewee', content: '我不知道其他组在做什么', confidence: 0.92, timestamp: '2026-05-30T10:00:00Z', phase: 1, dimension: 'knowledge_sharing', isPrivate: false },
  ],
  rootCauseTree: {
    rootCauses: [
      {
        id: 'rc-001', dimension: 'knowledge_sharing', confidence: 0.87,
        supportingEvidence: ['ev-001'],
        causalChain: {
          nodes: [
            { id: 'n1', label: '无统一文档平台', type: 'root_cause', dimension: 'knowledge_sharing', severity: 0.9 },
            { id: 'n2', label: '知识散落个人设备', type: 'symptom', dimension: 'knowledge_sharing', severity: 0.7 },
          ],
          edges: [{ from: 'n1', to: 'n2', label: '导致', strength: 0.85 }],
        },
        description: '缺少统一的团队知识库',
      },
    ],
    contradictions: [
      { evidenceA: 'ev-001', evidenceB: 'ev-002', dimension: 'knowledge_sharing', severity: 0.4, description: '模块与访谈认知差异' },
    ],
    generatedAt: '2026-05-30T10:05:00Z',
  },
  actionRecommendations: ['部署团队 Wiki', '设立知识共享 OKR'],
  generatedAt: '2026-05-30T10:05:00Z',
  durationMs: 4200,
  degradedModules: [],
  posture: 'steady_operator',
  postureLabel: '稳健经营型',
  ...overrides,
});

describe('renderDiagnosisReport', () => {
  it('renders pyramid structure: CEO summary → gaps → evidence', () => {
    // Given: a complete report
    const report = makeReport();

    // When: rendering to HTML
    const html = renderDiagnosisReport(report);

    // Then: pyramid structure present in order
    const ceoIdx = html.indexOf('CEO 摘要');
    const gapIdx = html.indexOf('诊断维度得分');
    const findingIdx = html.indexOf('关键发现');
    const rootCauseIdx = html.indexOf('根因分析');
    const evidenceIdx = html.indexOf('证据链');
    const actionIdx = html.indexOf('行动建议');

    expect(ceoIdx).toBeLessThan(gapIdx);
    expect(gapIdx).toBeLessThan(findingIdx);
    expect(findingIdx).toBeLessThan(rootCauseIdx);
    expect(rootCauseIdx).toBeLessThan(evidenceIdx);
    expect(evidenceIdx).toBeLessThan(actionIdx);
  });

  it('CSS is self-contained (no external references)', () => {
    // Given: a report
    const report = makeReport();

    // When: rendering
    const html = renderDiagnosisReport(report);

    // Then: no external URLs, no CDN links
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
    expect(html).not.toContain('cdn.');
    expect(html).not.toContain('@import');
    // All CSS is inline in <style> tag
    expect(html).toContain('<style>');
    expect(html).toContain('</style>');
  });

  it('Chinese characters render correctly (UTF-8)', () => {
    // Given: a report with Chinese content
    const report = makeReport({ ceoSummary: '团队协作存在系统性问题，根源在于信息流通机制缺失。' });

    // When: rendering
    const html = renderDiagnosisReport(report);

    // Then: Chinese characters preserved
    expect(html).toContain('系统性问题');
    expect(html).toContain('信息流通机制');
    // UTF-8 charset declared
    expect(html).toContain('charset="UTF-8"');
    expect(html).toContain('lang="zh-CN"');
  });

  it('handles empty evidence sections gracefully', () => {
    // Given: a report with no evidence and no findings
    const report = makeReport({ evidenceChain: [], keyFindings: [], actionRecommendations: [], rootCauseTree: {
      rootCauses: [], contradictions: [], generatedAt: '2026-05-30T10:00:00Z',
    } });

    // When: rendering
    const html = renderDiagnosisReport(report);

    // Then: doesn't crash, shows empty state text
    expect(html).toContain('无关键发现');
    expect(html).toContain('无证据');
    expect(html).toContain('无根因');
    expect(html).toContain('无建议');
  });

  it('HTML escapes special characters to prevent XSS', () => {
    // Given: a report with HTML-like content
    const report = makeReport({
      ceoSummary: '<script>alert("xss")</script>',
    });

    // When: rendering
    const html = renderDiagnosisReport(report);

    // Then: special chars are escaped
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders degraded banner when modules failed', () => {
    // Given: a report with degraded modules
    const report = makeReport({ degradedModules: ['attention-allocator', 'identity-extractor'] });

    // When: rendering
    const html = renderDiagnosisReport(report);

    // Then: banner displayed
    expect(html).toContain('attention-allocator');
    expect(html).toContain('identity-extractor');
    expect(html).toContain('降级运行');
  });

  it('does not render degraded banner when no modules failed', () => {
    // Given: a report with empty degradedModules
    const report = makeReport({ degradedModules: [] });

    // When: rendering
    const html = renderDiagnosisReport(report);

    // Then: no degraded banner
    expect(html).not.toContain('降级运行');
  });

  it('renders causal chain nodes and edges', () => {
    // Given: a report with causal chain
    const report = makeReport();

    // When: rendering
    const html = renderDiagnosisReport(report);

    // Then: causal chain rendered
    expect(html).toContain('无统一文档平台');
    expect(html).toContain('知识散落个人设备');
    expect(html).toContain('root_cause');
    expect(html).toContain('symptom');
  });
});
