/**
 * pdf-export.test.ts — PDF 导出测试
 */
import { exportToPDF, exportSummaryToPDF, wrapHTMLForPDF } from '../pdf-export';

describe('wrapHTMLForPDF', () => {
  it('wraps HTML body with print CSS and cover page', () => {
    const html = wrapHTMLForPDF('<h1>诊断结果</h1><p>测试内容</p>', {
      title: '测试报告',
      organization: '星辰科技',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@page');
    expect(html).toContain('测试报告');
    expect(html).toContain('星辰科技');
    expect(html).toContain('cover');
  });

  it('includes TOC placeholder', () => {
    const html = wrapHTMLForPDF('<p>test</p>', { includeTOC: true });
    expect(html).toContain('目录');
  });

  it('can disable cover and TOC', () => {
    const html = wrapHTMLForPDF('<p>test</p>', { includeCover: false, includeTOC: false });
    expect(html).not.toContain('class="cover"');
    expect(html).not.toContain('目录');
  });
});

describe('exportToPDF', () => {
  it('generates base64 PDF-ready HTML', () => {
    const result = exportToPDF('<h1>报告</h1><p>内容</p>', { title: 'Q2诊断' });
    expect(result.base64).toBeTruthy();
    expect(result.sizeBytes).toBeGreaterThan(500);
    expect(result.estimatedPages).toBeGreaterThanOrEqual(1);
    expect(result.title).toBe('Q2诊断');
  });

  it('generates summary PDF', () => {
    const result = exportSummaryToPDF('核心发现：信息流得分偏低', '快速摘要');
    expect(result.title).toContain('执行摘要');
    expect(result.estimatedPages).toBeGreaterThanOrEqual(1);
  });
});
