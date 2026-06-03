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
      // Phase 1 启动 — 发射事件
      eventBus?.emit({
        id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'phase.started', consultationId: sessionId, phase: 1,
        data: { label: '数据采集' },
        traceId: sessionId, spanId: sessionId.slice(0, 16),
        timestamp: new Date().toISOString(),
      });
      onEvent?.({ type: 'phase_started', phase: 1, label: '数据采集' });

      log.info({ teamId, initiatorRole }, '启动六阶段诊断');

      // 铁律 39: L2 → DiagnosisEngine 接口 (不直接 import engine-core)
      const result = await this.engine.runConsultation(teamId, {
        role: initiatorRole,
        name: initiatorName,
        teamId,
        concerns: this.ctx.messages.filter(m => m.role === 'user').map(m => m.content.slice(0, 200)),
      }, onEvent);

      log.info({ teamId, durationMs: result.totalDurationMs, degraded: result.degradedModules.length }, '诊断完成');

      // L4 接线: GraphBridge — 诊断结果自动同步到本体图
      if (graphBridge) {
        try {
          const report = result.report as DiagnosisReport;
          if (report.keyFindings) {
            const risks = report.keyFindings
              .filter(f => f.riskLevel)
              .map(f => ({ roleId: f.entity || f.roleId || '', riskLevel: f.riskLevel || 'medium', knowledgeDomains: f.domains || [], busFactor: f.busFactor || 1 }));
            if (risks.length > 0) graphBridge.upsertFromKeyPersonRisk(risks);
          }
        } catch (err: any) {
          log.warn({ err }, 'GraphBridge sync failed — degraded');
        }

        if (flags.enableCommunityReports && graphStore) {
          try {
            const communities = generateCommunityReports(graphStore, teamId);
            log.info({ communityCount: communities.length }, '社区报告已生成');
            onEvent?.({ type: 'community_reports', phase: 2, message: `发现 ${communities.length} 个社区` });
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
              message: `发现 ${resolution.autoMerged} 对重复实体(自动合并), ${resolution.queuedForReview} 对待审核` });
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
