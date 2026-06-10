/**
 * report-builder.ts — 金字塔诊断报告生成器 (MVP Phase 0)
 * @state: skeleton — 报告模板正确，但输入数据来自 mock 而非真实诊断引擎
 *
 * L2 模块：消费诊断结果 + 八维度提取结果 → 按金字塔结构输出 HTML 报告
 * 四层：综合摘要(L1) → 专家报告(L2) → 数据明细(L3) → 行动建议(L4)
 *
 * 编写原则（§16.3-16.6）：
 * - 结论先行，每层第一句是核心判断
 * - 内部技术术语零出现
 * - 引入概念先解释
 * - 评分配趋势
 * - 不适用标注原因
 */

import type { ExtractionResult } from './doc-extractor';

// ═══ Types ═══

export interface DiagnosisSection {
  expertName: string;
  expertLabel: string;
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  findings: DiagnosisFinding[];
  dataCoverage: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface DiagnosisFinding {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  /** 人话版本 */
  description: string;
  evidence: string[];       // 每个证据一句话
  suggestion: string;       // 可执行建议
  crossReference?: string;  // 跨专家交叉引用
}

export interface ReportData {
  /** 一句话核心结论 */
  coreConclusion: string;
  /** 怎么理解这个结论 */
  explanation: string;
  /** 组织名称 */
  orgName: string;
  /** 诊断时间 */
  diagnosedAt: string;
  /** 总体评分 */
  overallScore: number;
  /** 八维度覆盖度 */
  extraction?: ExtractionResult;
  /** 各专家诊断 */
  sections: DiagnosisSection[];
  /** 跨专家交叉验证 */
  crossValidation: string[];
  /** 数据可信度 */
  dataTrust: {
    coveredSources: string[];
    missingSources: string[];
  };
}

// ═══ Builder ═══

export class ReportBuilder {
  /**
   * 构建金字塔 HTML 报告。
   * 输入结构化诊断数据 → 输出完整的 HTML 文档。
   */
  build(data: ReportData): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Synova 组织诊断报告 — ${escapeHtml(data.orgName)}</title>
<style>
  :root { --bg:#0d1117; --surface:#161b22; --border:#30363d; --text:#c9d1d9; --muted:#8b949e; --accent:#58a6ff; --green:#3fb950; --orange:#d2991d; --red:#f85149; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--text); font-family:system-ui,sans-serif; max-width:800px; margin:0 auto; padding:2rem 1.5rem; line-height:1.7; }
  h1 { color:#f0f6fc; font-size:1.8rem; border-bottom:2px solid var(--border); padding-bottom:.5rem; margin-bottom:1.5rem; }
  h2 { color:var(--accent); font-size:1.2rem; margin:2rem 0 1rem; border-bottom:1px solid var(--border); padding-bottom:.3rem; }
  h3 { color:#f0f6fc; font-size:1rem; margin:1.5rem 0 .5rem; }
  .meta { color:var(--muted); font-size:.85rem; margin-bottom:2rem; }
  .section { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:1.2rem 1.5rem; margin:1rem 0; }
  .score-bar { background:var(--border); border-radius:4px; height:20px; margin:.5rem 0; overflow:hidden; }
  .score-fill { height:100%; border-radius:4px; transition:width .3s; }
  .score-fill.green { background:var(--green); } .score-fill.orange { background:var(--orange); } .score-fill.red { background:var(--red); }
  .finding { border-left:3px solid var(--border); padding:.6rem 1rem; margin:.8rem 0; background:rgba(255,255,255,.02); }
  .finding.critical { border-color:var(--red); } .finding.warning { border-color:var(--orange); } .finding.info { border-color:var(--accent); }
  .sev { display:inline-block; padding:.1em .5em; border-radius:3px; font-size:.75rem; font-weight:700; margin-right:.5em; }
  .sev.critical { background:#3a1a1a; color:var(--red); } .sev.warning { background:#3a2e0a; color:var(--orange); } .sev.info { background:#1a2a3a; color:var(--accent); }
  .trend-up { color:var(--green); } .trend-down { color:var(--red); } .trend-stable { color:var(--muted); }
  .badge { display:inline-block; padding:.15em .6em; border-radius:4px; font-size:.8rem; margin-right:.3em; }
  .badge-ok { background:#1a3a1a; color:var(--green); } .badge-warn { background:#3a2e0a; color:var(--orange); } .badge-miss { background:#2a1a3a; color:var(--muted); }
  .data-block { font-size:.85rem; }
  .data-block td { padding:.3rem .6rem; border-bottom:1px solid rgba(255,255,255,.05); }
  .dim-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:.5rem; margin:.5rem 0; }
  .dim-cell { background:var(--surface); border:1px solid var(--border); border-radius:4px; padding:.5rem; text-align:center; font-size:.8rem; }
  .dim-cell.ok { border-color:var(--green); } .dim-cell.warn { border-color:var(--orange); } .dim-cell.low { border-color:var(--red); opacity:.6; }
  .divider { border:none; border-top:2px solid var(--border); margin:2rem 0; }
</style>
</head>
<body>

<h1>Synova 组织诊断报告</h1>
<div class="meta">
  <strong>${escapeHtml(data.orgName)}</strong> · ${escapeHtml(data.diagnosedAt)} · 报告版本 1.0
</div>

<!-- ═══ 第一层：综合摘要 ═══ -->
<div class="section">
  <h2>核心结论</h2>
  <p style="font-size:1.1rem;font-weight:600;color:#f0f6fc;">${escapeHtml(data.coreConclusion)}</p>

  <h3>总体评分</h3>
  ${this.buildScoreBar(data.overallScore)}

  <h3>怎么看这个结论</h3>
  <p style="color:var(--muted);">${escapeHtml(data.explanation)}</p>
</div>

<!-- ═══ 八维度覆盖度 ═══ -->
${data.extraction ? this.buildCoverageGrid(data.extraction) : ''}

<!-- ═══ 跨专家交叉验证 ═══ -->
${data.crossValidation.length > 0 ? this.buildCrossValidation(data.crossValidation) : ''}

<!-- ═══ 第二层：专家报告 ═══ -->
<h2>详细诊断</h2>
${data.sections.map(s => this.buildExpertSection(s)).join('\n')}

<div class="divider"></div>

<!-- ═══ 第三层：数据可信度 ═══ -->
<div class="section">
  <h2>数据说明</h2>
  <p><strong>已覆盖数据源：</strong>${data.dataTrust.coveredSources.map(s => escapeHtml(s)).join('、') || '暂无'}</p>
  ${data.dataTrust.missingSources.length > 0
    ? `<p style="color:var(--orange);"><strong>⚠️ 数据缺口：</strong>${data.dataTrust.missingSources.map(s => escapeHtml(s)).join('、')}。相关结论可能不完整。</p>`
    : ''}
</div>

<!-- ═══ 第四层：行动建议 ═══ -->
<div class="section">
  <h2>行动建议</h2>
  <p style="color:var(--muted);">基于诊断结论，按紧急×重要排序：</p>
  ${this.buildActionList(data.sections)}
  <p style="margin-top:1rem;color:var(--muted);font-size:.85rem;">
    <strong>建议跟进节奏：</strong>2周后检查关键行动进展 · 1个月后复查关键指标 · 3个月后全维度复诊
  </p>
</div>

<p style="text-align:center;color:var(--muted);font-size:.8rem;margin-top:3rem;">
  Synova 组织诊断系统 · 报告基于可用数据生成 · 不完整数据已标注
</p>
</body>
</html>`;
  }

  // ═══ Private helpers ═══

  private buildScoreBar(score: number): string {
    const pct = Math.round(score * 10);
    const cls = score >= 7 ? 'green' : score >= 4 ? 'orange' : 'red';
    return `<div class="score-bar"><div class="score-fill ${cls}" style="width:${pct}%"></div></div>
    <p style="font-size:.85rem;color:var(--muted);">综合得分 ${score.toFixed(1)} / 10</p>`;
  }

  private buildCoverageGrid(extraction: ExtractionResult): string {
    const cells = extraction.dimensions.map(d => {
      const cls = d.sufficient ? 'ok' : (d.confidence === 'medium' ? 'warn' : 'low');
      const icon = d.sufficient ? '✅' : (d.confidence === 'medium' ? '⚠️' : '❌');
      return `<div class="dim-cell ${cls}">${icon} ${escapeHtml(d.dimensionLabel)}</div>`;
    }).join('\n');

    return `<div class="section">
      <h2>诊断信息覆盖度</h2>
      <p style="color:var(--muted);margin-bottom:.5rem;">
        以下展示了八个维度的信息采集情况。✅ 足够支撑诊断 ⚠️ 信息偏弱 ❌ 缺失
      </p>
      <div class="dim-grid">${cells}</div>
      <p style="font-size:.85rem;color:var(--muted);margin-top:.5rem;">
        已覆盖 ${extraction.coveredCount}/${extraction.totalCount} 维度
        ${extraction.insufficientDimensions.length > 0
          ? ` · 待补充：${extraction.insufficientDimensions.map(s => escapeHtml(s)).join('、')}`
          : ''}
      </p>
    </div>`;
  }

  private buildCrossValidation(items: string[]): string {
    return `<div class="section">
      <h2>交叉验证发现</h2>
      <p style="color:var(--muted);margin-bottom:.5rem;">
        多个分析角度独立得出结论后，互相印证或发现矛盾。以下是最重要的交叉发现：
      </p>
      <ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('\n')}</ul>
    </div>`;
  }

  private buildExpertSection(section: DiagnosisSection): string {
    const trendIcon = section.trend === 'improving' ? '<span class="trend-up">↗ 改善中</span>'
      : section.trend === 'declining' ? '<span class="trend-down">↘ 恶化中</span>'
      : '<span class="trend-stable">→ 稳定</span>';

    return `<div class="section">
      <h3>${escapeHtml(section.expertLabel)} ${trendIcon} 评分 ${section.score.toFixed(1)}</h3>
      ${this.buildScoreBar(section.score)}
      ${section.findings.map(f => this.buildFinding(f)).join('\n')}
      <p style="font-size:.8rem;color:var(--muted);margin-top:.5rem;">
        数据覆盖度: ${Math.round(section.dataCoverage * 100)}% · 置信度: ${section.confidence === 'high' ? '高' : section.confidence === 'medium' ? '中' : '低'}
      </p>
    </div>`;
  }

  private buildFinding(finding: DiagnosisFinding): string {
    const cls = finding.severity;
    const label = cls === 'critical' ? '🔴 紧急' : cls === 'warning' ? '🟡 需关注' : '🟢 信息';
    return `<div class="finding ${cls}">
      <p><span class="sev ${cls}">${label}</span><strong>${escapeHtml(finding.title)}</strong></p>
      <p style="color:var(--muted);margin:.3rem 0;">${escapeHtml(finding.description)}</p>
      ${finding.evidence.length > 0 ? `<p style="font-size:.85rem;"><strong>证据：</strong>${finding.evidence.map(e => escapeHtml(e)).join('；')}</p>` : ''}
      <p style="font-size:.85rem;color:var(--accent);"><strong>建议：</strong>${escapeHtml(finding.suggestion)}</p>
      ${finding.crossReference ? `<p style="font-size:.8rem;color:var(--muted);">↳ ${escapeHtml(finding.crossReference)}</p>` : ''}
    </div>`;
  }

  private buildActionList(sections: DiagnosisSection[]): string {
    const criticalFindings = sections
      .flatMap(s => s.findings.filter(f => f.severity === 'critical'))
      .slice(0, 3);

    const warningFindings = sections
      .flatMap(s => s.findings.filter(f => f.severity === 'warning'))
      .slice(0, 3);

    if (criticalFindings.length === 0 && warningFindings.length === 0) {
      return '<p>当前未发现需要紧急干预的问题。保持现有节奏，定期检查。</p>';
    }

    let html = '';
    let idx = 1;

    for (const f of criticalFindings) {
      html += `<p style="margin:.5rem 0;"><strong>${idx}. 🔴 P0</strong> ${escapeHtml(f.suggestion)}</p>`;
      idx++;
    }
    for (const f of warningFindings.slice(0, 5 - criticalFindings.length)) {
      html += `<p style="margin:.5rem 0;"><strong>${idx}. 🟡 P${idx}</strong> ${escapeHtml(f.suggestion)}</p>`;
      idx++;
    }

    return html;
  }
}

// ═══ Utils ═══

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
