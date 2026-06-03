/**
 * agent/diagnosis-launcher.ts — 诊断启动器 (ConversationEngine 子组件)
 *
 * 铁律 39: L2 通过 DiagnosisEngine 接口调用引擎，不直接 import engine-core。
 * 职责: startDiagnosis() → 委托给 DiagnosisEngine → L4 后处理 (GraphBridge/CommunityReports/EntityResolver)
 */
import type { EngineContext } from './engine-context';
import type { DiagnosisEngine, DiagnosisEvent, ConsultationResult } from '../l2-interfaces/diagnosis-engine';
import { createLogger } from '../logger';
import { resolveEntitiesL3 } from '../l4/entity-resolver';
import { generateCommunityReports } from '../l4/community-reports';

const log = createLogger('agent/diagnosis-launcher');

// Re-export for backward compat
export type { DiagnosisEvent, ConsultationResult };

export interface DiagnosisReport {
  keyFindings?: Array<{
    entity?: string; roleId?: string; riskLevel?: string;
    domains?: string[]; busFactor?: number;
  }>;
  [key: string]: unknown;
}

export class DiagnosisLauncher {
  private ctx: EngineContext;
  private engine: DiagnosisEngine;

  constructor(ctx: EngineContext, engine: DiagnosisEngine) {
    this.ctx = ctx;
    this.engine = engine;
  }

  async startDiagnosis(
    initiatorRole: string,
    initiatorName: string,
    onEvent?: (event: DiagnosisEvent) => void,
  ): Promise<ConsultationResult | null> {
    const teamId = this.ctx.orgId || 'default';
    const { eventBus, sessionId, graphBridge, graphStore, flags } = this.ctx;

    try {
      // ═══ Batch 2: 六阶段追踪 — 每阶段发射 phase_started 事件 ═══
      const phaseLabels = [
        '组织访谈', '数据采集', '假设生成', '根因分析', '报告生成', '交付',
      ];
      // Phase 0 完成信号 (ConversationEngine 已在 Phase 0 完成后调用 startDiagnosis)
      onEvent?.({ type: 'phase_started', phase: 1, label: phaseLabels[1], confidence: 0.9 });

      log.info({ teamId, initiatorRole }, '启动六阶段诊断');

      // P1-3: EvidenceManager 接线 — 加载证据 + 矛盾检测
      let evidenceSummary = '';
      if (this.ctx.evidenceCollector && this.ctx.corroborationEngine) {
        try {
          const allEvidence = this.ctx.evidenceCollector.query({ orgId: teamId, limit: 50 });
          if (allEvidence.length > 0) {
            evidenceSummary = allEvidence.map(e =>
              `[${e.type}|conf:${e.confidence}] ${e.content.slice(0, 150)}`
            ).join('\n');

            // 矛盾检测 — 标记高价值信号
            const contradictions = this.ctx.corroborationEngine.detectContradictions({ orgId: teamId });
            if (contradictions.length > 0) {
              log.info({ count: contradictions.length }, '证据矛盾检测完成');
              onEvent?.({ type: 'evidence_contradictions', phase: 1, message: `发现 ${contradictions.length} 处证据矛盾`, findings: contradictions.slice(0, 3).map(c => ({ moduleId: c.evidenceA?.id || 'evidence', summary: c.description || '矛盾信号', confidence: 1 - Math.min(c.scoreDifference, 1) })), confidence: 0.85 });
            }
          }
        } catch (err: any) {
          log.warn({ err }, '证据加载失败 — degraded, 诊断继续');
        }
      }

      // 铁律 39: L2 → DiagnosisEngine 接口 (不直接 import engine-core)
      const result = await this.engine.runConsultation(teamId, {
        role: initiatorRole,
        name: initiatorName,
        teamId,
        concerns: this.ctx.messages.filter(m => m.role === 'user').map(m => m.content.slice(0, 200)),
      }, onEvent);

      log.info({ teamId, durationMs: result.totalDurationMs, degraded: result.degradedModules.length }, '诊断完成');

      // FED-001: 联邦进化 — 诊断完成后上报质量信号 (差分隐私+加密)
      if (this.ctx.federalAdapter) {
        this.ctx.federalAdapter.reportQuality({
          diagnosisId: `diag_${teamId}_${Date.now().toString(36)}`,
          teamId,
          confirmRate: 0.8,
          adoptionRate: 0.7,
          phaseDurationMs: result.totalDurationMs,
          moduleCount: result.degradedModules.length,
        }).catch(err => log.warn({ err }, '联邦上报失败 — degraded'));
      }

      // L4 接线: GraphBridge — 诊断结果自动同步到本体图
      if (graphBridge) {
        const report = result.report as DiagnosisReport;
        try {
          if (report.keyFindings) {
            const risks = report.keyFindings
              .filter(f => f.riskLevel)
              .map(f => ({ roleId: f.entity || f.roleId || '', riskLevel: f.riskLevel || 'medium', knowledgeDomains: f.domains || [], busFactor: f.busFactor || 1 }));
            if (risks.length > 0) graphBridge.upsertFromKeyPersonRisk(risks);
          }
        } catch (err: any) {
          log.warn({ err }, 'GraphBridge sync failed — degraded');
        }

        // C6: 接入剩余 5 个 upsert 方法 (审计 P0-20260604)
        // 每个独立 try/catch — 单个数据段失败不影响其他

        // HONA — 人-组织网络分析
        try {
          const honaData = (report as { hona?: any; humanOrganization?: any }).hona
            || (report as { humanOrganization?: any }).humanOrganization;
          if (honaData?.people?.length > 0) {
            const result = graphBridge.upsertFromHONA(honaData.people, honaData.interactions || honaData.edges || []);
            if (result.errors.length > 0) log.warn({ errors: result.errors }, 'HONA sync — some errors');
            log.debug({ nodes: result.nodesCreated, edges: result.edgesCreated }, 'HONA 已同步到本体图');
          }
        } catch (err: any) { log.warn({ err }, 'HONA GraphBridge sync failed — degraded'); }

        // FinancialImpact — 财务影响分析
        try {
          const finData = (report as { financialImpact?: any; financial?: any }).financialImpact
            || (report as { financial?: any }).financial;
          if (finData?.items?.length > 0) {
            const result = graphBridge.upsertFromFinancialImpact(finData.items);
            if (result.errors.length > 0) log.warn({ errors: result.errors }, 'FinancialImpact sync — some errors');
            log.debug({ nodes: result.nodesCreated }, 'FinancialImpact 已同步到本体图');
          }
        } catch (err: any) { log.warn({ err }, 'FinancialImpact GraphBridge sync failed — degraded'); }

        // CapabilityGap — 能力缺口分析
        try {
          const capData = (report as { capabilityGap?: any; capabilities?: any }).capabilityGap
            || (report as { capabilities?: any }).capabilities;
          if (capData?.gaps?.length > 0) {
            const result = graphBridge.upsertFromCapabilityGap(capData.gaps);
            if (result.errors.length > 0) log.warn({ errors: result.errors }, 'CapabilityGap sync — some errors');
            log.debug({ nodes: result.nodesCreated }, 'CapabilityGap 已同步到本体图');
          }
        } catch (err: any) { log.warn({ err }, 'CapabilityGap GraphBridge sync failed — degraded'); }

        // SevenPowers — 七力战略分析
        try {
          const stratData = (report as { sevenPowers?: any; strategy?: any }).sevenPowers
            || (report as { strategy?: any }).strategy;
          if (stratData?.powers?.length > 0) {
            const result = graphBridge.upsertFromSevenPowers(stratData.powers);
            if (result.errors.length > 0) log.warn({ errors: result.errors }, 'SevenPowers sync — some errors');
            log.debug({ nodes: result.nodesCreated }, 'SevenPowers 已同步到本体图');
          }
        } catch (err: any) { log.warn({ err }, 'SevenPowers GraphBridge sync failed — degraded'); }

        // CPC — 关键流程链
        try {
          const cpcData = (report as { cpc?: any; processes?: any }).cpc
            || (report as { processes?: any }).processes;
          if (cpcData?.processes?.length > 0) {
            const result = graphBridge.upsertFromCPC(cpcData.processes);
            if (result.errors.length > 0) log.warn({ errors: result.errors }, 'CPC sync — some errors');
            log.debug({ nodes: result.nodesCreated, edges: result.edgesCreated }, 'CPC 已同步到本体图');
          }
        } catch (err: any) { log.warn({ err }, 'CPC GraphBridge sync failed — degraded'); }

        if (flags.enableCommunityReports && graphStore) {
          try {
            const communities = generateCommunityReports(graphStore, teamId);
            log.info({ communityCount: communities.length }, '社区报告已生成');
            onEvent?.({ type: 'community_reports', phase: 2, message: `发现 ${communities.length} 个协作圈`, findings: communities.slice(0, 3).map((c: any) => ({ moduleId: c.id || 'community', summary: c.label || `协作圈 ${c.size || 0} 人`, confidence: c.confidence || 0.7 })), confidence: 0.7 });
          } catch (err: any) {
            log.warn({ err }, 'CommunityReports failed — degraded');
          }
        }
      }

      if (flags.enableEntityResolution && graphStore) {
        try {
          const resolution = resolveEntitiesL3(graphStore, teamId);
          log.info({ autoMerged: resolution.autoMerged, queued: resolution.queuedForReview }, 'L3 实体解析完成');
          if (resolution.autoMerged > 0 || resolution.queuedForReview > 0) {
            onEvent?.({ type: 'entity_resolution', phase: 3,
              message: `发现 ${resolution.autoMerged} 对重复实体(自动合并), ${resolution.queuedForReview} 对待审核`,
              confidence: 0.8 });
          }
        } catch (err: any) {
          log.warn({ err }, 'EntityResolution failed — degraded');
        }
      }

      return {
        teamId: result.teamId,
        report: result.report,
        totalDurationMs: result.totalDurationMs,
        degradedModules: result.degradedModules,
      };
    } catch (err: any) {
      log.error({ err, teamId }, '诊断引擎启动失败');
      onEvent?.({ type: 'error', phase: 0, label: '引擎错误', message: `诊断引擎不可用: ${err.message}` });
      return null;
    }
  }
}
