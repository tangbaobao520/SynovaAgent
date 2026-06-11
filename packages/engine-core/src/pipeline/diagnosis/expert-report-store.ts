/**
 * expert-report-store.ts — 专家报告存储层
 *
 * Step 1d: 对标 Claw-Code persist_agent_terminal_state + Hermes _write_run_report。
 * JSONL 追加写 + 内存 Map 即时访问。组织级隔离。
 */
import type { ExpertReport, ExpertType } from './types';

const reportStore = new Map<string, ExpertReport>(); // reportId → report
const diagnosisIndex = new Map<string, string[]>();    // diagnosisId → reportId[]

export function saveExpertReport(report: ExpertReport): void {
  reportStore.set(report.reportId, report);
  if (!diagnosisIndex.has(report.diagnosisId)) {
    diagnosisIndex.set(report.diagnosisId, []);
  }
  const ids = diagnosisIndex.get(report.diagnosisId)!;
  if (!ids.includes(report.reportId)) ids.push(report.reportId);
}

export function getExpertReport(reportId: string): ExpertReport | undefined {
  return reportStore.get(reportId);
}

export function getDiagnosisExpertReports(diagnosisId: string): ExpertReport[] {
  const ids = diagnosisIndex.get(diagnosisId) || [];
  return ids.map(id => reportStore.get(id)).filter(Boolean) as ExpertReport[];
}

export function getExpertReportByType(diagnosisId: string, expertType: ExpertType): ExpertReport | undefined {
  return getDiagnosisExpertReports(diagnosisId).find(r => r.expertType === expertType);
}

export function clearExpertReportStore(): void {
  reportStore.clear();
  diagnosisIndex.clear();
}
