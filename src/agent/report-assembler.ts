/**
 * report-assembler.ts — 四层报告组装器 (L2)
 *
 * 将诊断结果按颗粒度切片:
 *   ceo: 瓶颈在哪 + 行动建议 (≤200字)
 *   flywheel: 三飞轮评分 + 瓶颈哨兵列表
 *   expert: 每位专家完整推理
 *   raw: 完整数据
 *
 * 铁律24: catch + log + degraded
 */
import { createLogger } from '@synova/logger';
import type { DiagnosisReport } from '../l3/synova-diagnosis-engine';

const log = createLogger('agent/report-assembler');

export type ReportDepth = 'ceo' | 'flywheel' | 'expert' | 'raw';

export interface AssembledReport {
  reportId: string;
  teamId: string;
  depth: ReportDepth;
  summary: string;
  data: Record<string, unknown>;
}

/** CEO 摘要: 瓶颈 + 一个行动建议 */
function assembleCeo(report: DiagnosisReport): string {
  if (report.rootCauses.length === 0) return '诊断完成，未发现显著瓶颈。';

  const top = report.rootCauses[0];
  const rec = report.recommendations[0];
  let summary = `核心瓶颈: ${top.description}`;
  if (rec) summary += `。建议: ${rec.action}`;
  if (summary.length > 200) summary = summary.slice(0, 197) + '...';
  return summary;
}

/** 飞轮仪表盘: 维度评分 + 瓶颈 */
function assembleFlywheel(report: DiagnosisReport): Record<string, unknown> {
  const byExpert = new Map<string, number>();
  for (const er of report.expertReports) {
    byExpert.set(er.expert, er.confidence);
  }
  return {
    dimensions: Object.fromEntries(byExpert),
    rootCauses: report.rootCauses.map(rc => rc.description),
    recommendations: report.recommendations.map(r => r.action),
  };
}

/** 专家完整推理 */
function assembleExpert(report: DiagnosisReport): Record<string, unknown> {
  return {
    expertReports: report.expertReports,
    rootCauses: report.rootCauses,
    recommendations: report.recommendations,
  };
}

/** 原始完整数据 */
function assembleRaw(report: DiagnosisReport): Record<string, unknown> {
  return report as unknown as Record<string, unknown>;
}

/**
 * 按指定深度组装报告。
 * T11: 新增 mode:'preliminary' 用于无数据预诊断模式。
 */
export function assembleReport(
  report: DiagnosisReport,
  depth: ReportDepth = 'flywheel',
  _layers?: string[],
  _mode?: 'standard' | 'preliminary',
): AssembledReport {
  const isPreliminary = _mode === 'preliminary';
  let summary: string;
  let data: Record<string, unknown>;

  try {
    switch (depth) {
      case 'ceo':
        summary = assembleCeo(report);
        if (isPreliminary) {
          summary = '【预诊断】此诊断为基于访谈数据的初步判断，部署后将基于真实数据进行精确诊断。\n\n' + summary;
        }
        data = { rootCause: report.rootCauses[0] || null };
        if (isPreliminary) {
          (data as Record<string, unknown>).dataSource = 'interview';
          (data as Record<string, unknown>).diagnosisType = 'preliminary';
        }
        break;
      case 'flywheel':
        summary = isPreliminary
          ? '【预诊断】此诊断为基于访谈数据的初步判断。' + (report.summary || '')
          : report.summary;
        data = assembleFlywheel(report);
        if (isPreliminary) {
          (data as Record<string, unknown>).dataSource = 'interview';
          (data as Record<string, unknown>).diagnosisType = 'preliminary';
        }
        break;
      case 'expert':
        summary = report.summary;
        data = assembleExpert(report);
        break;
      case 'raw':
      default:
        summary = report.summary;
        data = assembleRaw(report);
        break;
    }
  } catch (err: unknown) {
    log.warn({ err }, '报告组装失败 — degraded');
    summary = report.summary || '诊断完成';
    data = {};
  }

  return {
    reportId: report.reportId,
    teamId: report.teamId,
    depth,
    summary,
    data,
  };
}
