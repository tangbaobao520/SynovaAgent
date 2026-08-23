/**
 * report-assembler.ts — 四层报告组装器 + Tone后处理 + 一页纸渲染 (L2 → D57/D480)
 *
 * 将诊断结果按颗粒度切片:
 *   ceo: 瓶颈在哪 + 行动建议 (≤200字)
 *   flywheel: 三飞轮评分 + 瓶颈哨兵列表
 *   expert: 每位专家完整推理
 *   raw: 完整数据
 *
 * D57: return前调用 toneEnforcer.enforceReport(summary) 做散文化后处理。
 * D480: renderOnePager 消费 l3/report-templates 的 executive_summary 模板，
 *       输出老板可读的 markdown 一页纸（GS-08 报告可读）。
 *
 * 铁律24: catch + log + degraded
 */
import { createLogger } from '@synova/logger';
import type { DiagnosisReport } from '../l3/synova-diagnosis-engine';
import { getReportTemplateRegistry, type ReportData } from '../l3/report-templates';
import { enforceReport } from '../l3/tone-enforcer';

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

/** 原始完整数据 — D49: 注入系统健康审计 */
function assembleRaw(report: DiagnosisReport): Record<string, unknown> {
  const data = report as unknown as Record<string, unknown>;
  // D49: 异步注入 systemHealth (失败不阻断主报告)
  injectSystemHealth(data).catch((err: unknown) => {
    log.warn({ err }, 'systemHealth 注入失败');
  });
  return data;
}

/**
 * D49: 注入系统健康审计数据到 raw 报告。
 * 使用 SystemHealthAudit 收集 7 项指标。
 */
async function injectSystemHealth(data: Record<string, unknown>): Promise<void> {
  try {
    const { SystemHealthAudit } = await import('../monitoring/system-health');
    const auditor = new SystemHealthAudit();
    const healthReport = await auditor.audit();
    data.systemHealth = healthReport;
    log.debug({ available: !!healthReport.uptime30d }, '系统健康审计注入完成');
  } catch (err: unknown) {
    log.warn({ err }, '系统健康审计注入失败 — degraded');
    data.systemHealth = {
      error: '审计不可用',
      collectedAt: new Date().toISOString(),
    };
  }
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

  // D57: Tone后处理 — 散文化
  const enforced = enforceReport(summary);
  summary = enforced.text;
  if (data.expertReports && Array.isArray(data.expertReports)) {
    data.expertReports = data.expertReports.map((er: Record<string, unknown>) => ({
      ...er,
      report: typeof er.report === 'string' ? enforceReport(er.report).text : er.report,
    }));
  }

  return {
    reportId: report.reportId,
    teamId: report.teamId,
    depth,
    summary,
    data,
  };
}

// ═══ D480: 一页纸渲染（GS-08 报告可读） ═══

/** executive_summary 模板名（report-templates.ts L116-139，本函数是其首个消费者） */
const ONE_PAGER_TEMPLATE = 'executive_summary';

/** 根因置信度达到该阈值映射为 high 告警（驱动模板「N 个高风险项」头行） */
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

/** ceo 深度取 top2 根因（极简），flywheel 深度取 top5（全量） */
function onePagerAlertLimit(depth: 'ceo' | 'flywheel'): number {
  return depth === 'ceo' ? 2 : 5;
}

/**
 * D480: unknown 值收窄为 string[]（类型谓词，零 as 断言——铁律 38）。
 * assembleFlywheel 返回 Record<string, unknown>，recommendations 属性类型侧不保证，
 * 运行时由 assembleFlywheel 实现为 string[]（map(r => r.action)），此处防御性收窄。
 */
function toStringItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * D480: DiagnosisReport → ReportData 映射。
 *
 * 契约:
 *   @input report DiagnosisReport + depth（'ceo' | 'flywheel'）
 *   @output ReportData（executive_summary 模板入参）
 *   @degraded 无 I/O 纯映射，不降级（异常由 renderOnePager whole-body catch 兜底）
 *
 * 映射说明:
 *   - goals/obstacles 恒空数组——诊断报告无目标进度/遗留问题数据，诚实空缺不编造
 *     （模板 footer 相应显示「0 目标」）。
 *   - alerts ← rootCauses 按置信度降序（clone 后 sort，不污染调用方报告），
 *     confidence >= 0.7 → 'high'。
 *   - recommendations: ceo → [assembleCeo(report)]（≤200 字瓶颈+建议单条）；
 *     flywheel → assembleFlywheel(report).recommendations 前 3 条（全量建议）。
 */
function toOnePagerData(report: DiagnosisReport, depth: 'ceo' | 'flywheel'): ReportData {
  const sorted = [...report.rootCauses].sort((a, b) => b.confidence - a.confidence);
  const alerts = sorted.slice(0, onePagerAlertLimit(depth)).map(rc => ({
    description: rc.description,
    priority: rc.confidence >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium',
    confidence: rc.confidence,
  }));
  const recommendations = depth === 'ceo'
    ? [assembleCeo(report)]
    : toStringItems(assembleFlywheel(report).recommendations).slice(0, 3);
  return {
    orgId: report.teamId,
    date: report.generatedAt,
    goals: [],
    alerts,
    obstacles: [],
    recommendations,
  };
}

/**
 * D480: 一页纸降级文案——纯文本组装，含「降级」标记（铁律 24+31 降级信号传播）。
 */
function onePagerFallback(report: DiagnosisReport, depth: 'ceo' | 'flywheel'): string {
  const lines = [`# ${report.teamId} 诊断摘要（降级：模板渲染失败，纯文本输出）`, ''];
  lines.push(depth === 'ceo' ? assembleCeo(report) : (report.summary || '诊断完成'));
  if (depth === 'flywheel') {
    for (const r of report.recommendations.slice(0, 3)) lines.push(`- 建议: ${r.action}`);
  }
  return lines.join('\n');
}

/**
 * D480: 渲染诊断报告一页纸（markdown）——消费 executive_summary 模板（GS-08 报告可读）。
 *
 * 契约:
 *   @input report DiagnosisReport；depth 'ceo'（top2 根因 + CEO 摘要单条，默认）
 *                | 'flywheel'（top5 根因 + 全量建议 top3）
 *   @output markdown 字符串（## 头行 + Top3 + 📎 计数 footer）
 *   @degraded registry 抛错/不可用，或 registry.render 返回降级标记串
 *             （「模板渲染失败」/「未找到模板」前缀——模板文案后续修改可能引入
 *             运行时异常，registry 吞错返回标记串，此路兜底）
 *             → log.warn + onePagerFallback 纯文本（含「降级」标记）
 *   本函数永不抛出（whole-body catch——路由 GET 按需渲染路径依赖此契约）。
 *   注：不走 tone-enforcer——一页纸是结构化 markdown 非散文（D57 只作用于 assembleReport）。
 */
export function renderOnePager(report: DiagnosisReport, depth: 'ceo' | 'flywheel' = 'ceo'): string {
  try {
    const rendered = getReportTemplateRegistry().render(ONE_PAGER_TEMPLATE, toOnePagerData(report, depth));
    if (rendered.startsWith('模板渲染失败') || rendered.startsWith('未找到模板')) {
      log.warn({ template: ONE_PAGER_TEMPLATE, depth }, '一页纸模板渲染降级返回 — fallback 纯文本');
      return onePagerFallback(report, depth);
    }
    return rendered;
  } catch (err: unknown) {
    log.warn({ err, depth }, '一页纸渲染失败 — degraded（纯文本降级）');
    return onePagerFallback(report, depth);
  }
}
