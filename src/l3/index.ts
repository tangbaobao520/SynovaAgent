/**
 * l3/index.ts — 洞察层统一导出 (P2: 导出规范统一)
 */
export { ExpertDispatcher } from './expert-dispatcher';
export type { ExpertReport } from './expert-dispatcher';
export { ExpertAutonomyEngine } from './expert-autonomy';
export type { QueryAPI } from './expert-autonomy';
export { QualityFirewall } from './quality-firewall';
export { ExpertRegistry, getExpertRegistry } from './expert-registry';
export { ReportTemplateRegistry } from './report-templates';
export type { ReportData } from './report-templates';
export { BriefingGenerator } from './briefing-generator';
