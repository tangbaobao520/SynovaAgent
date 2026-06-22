/**
 * tests/l3/report-template-loader.test.ts
 * v3.6 Batch 1 — report template loader 单元测试
 */
import { describe, it, expect } from 'vitest';
import { loadTemplate, listTemplates } from '../../src/l3/report-template-loader';

describe('loadTemplate', () => {
  it('加载 default 模板', () => {
    const { template, degraded } = loadTemplate('default');
    expect(degraded).toBe(false);
    expect(template).not.toBeNull();
    expect(template!.name).toBe('default');
  });

  it('default 模板可以渲染数据', () => {
    const { template } = loadTemplate('default');
    expect(template).not.toBeNull();
    const html = template!.render({
      lang: 'zh-CN',
      org_name: '测试企业',
      report: { title: '测试报告', generated_at: '生成时间', core_conclusion: '核心结论', score: { overall: '综合得分' } },
      generated_at: '2026-06-22',
      duration: '1.2s',
      overall_score: 85,
      score_color: '#3fb950',
      ceo_summary_text: '企业整体健康。',
      findings: [],
    });
    expect(html).toContain('测试企业');
    expect(html).toContain('测试报告');
  });

  it('不存在的模板返回 degraded', () => {
    const { template, degraded } = loadTemplate('nonexistent');
    expect(degraded).toBe(true);
    expect(template).toBeNull();
  });

  it('第二次调用返回缓存', () => {
    const r1 = loadTemplate('default');
    const r2 = loadTemplate('default');
    expect(r1.template).toBe(r2.template);
  });
});

describe('listTemplates', () => {
  it('返回包含 default 的模板列表', () => {
    const list = listTemplates();
    expect(list).toContain('default');
  });
});
