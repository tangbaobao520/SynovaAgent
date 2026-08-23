/**
 * src/l3/ga-collaboration.ts — GA 人机协作反馈闭环 (D19)
 *
 * D18 推送交互卡片给 GA，D19 让 GA 可以纠正/标记/重新诊断。
 *
 * 流程:
 *   GA 收到 D18 卡片 → 点击 [Flag]/[Correct]/[Re-diagnose]
 *   → processFeedback() → 触发 D75 轻量级再诊断 / 写入 D93 反馈
 *
 * 契约:
 *   @input  — GAFeedbackAction
 *   @output — GAFeedbackResult（含 before/after 对比）
 *   @degraded — 再诊断失败 → log.warn + 返回失败标记，原始报告不变
 */
import { createLogger } from '@synova/logger';
import { loadConfig } from '../config';

const log = createLogger('l3/ga-collaboration');

// D476 O8: orgId 是启动期常量（SYNOVA_ORG_ID 只在进程启动时读取）。
// 反馈写入在请求热路径上，模块级一次加载避免每请求文件 I/O + 日志；
// 与仓内 per-call loadConfig() 惯例不同，属有意例外（dev doc §3.2 回填）。
const config = loadConfig();

// ═══ Types ═══

export type GAFeedbackActionType = 'correct' | 'flag' | 'rediagnose';

export interface GAFeedbackAction {
  findingId: string;
  action: GAFeedbackActionType;
  correction?: string;
  gaUserId: string;
  enterpriseId: string;
  timestamp?: string;
}

export interface GAFeedbackResult {
  findingId: string;
  action: GAFeedbackActionType;
  status: 'success' | 'failed' | 'degraded';
  correctionId?: string;
  reDiagnosisId?: string;
  message: string;
  beforeAfterComparison?: {
    originalFindingSummary: string;
    correctedSummary?: string;
    reDiagnosisSummary?: string;
  };
  timestamp: string;
  error?: string;
}

// ═══ GAFeedbackHandler ═══

export class GAFeedbackHandler {
  private feedbackCollector: { collectFeedback(data: Record<string, unknown>): { id: string } | Promise<{ id: string }> } | null = null;
  private reDiagnosisEngine: { triggerReDiagnosis(findingId: string, requestedBy: string): Promise<string> } | null = null;
  private auditStore: { write(entry: Record<string, unknown>): Promise<string> } | null = null;

  /** 注入 D93 feedbackCollector */
  setFeedbackCollector(collector: { collectFeedback(data: Record<string, unknown>): { id: string } | Promise<{ id: string }> }): void {
    this.feedbackCollector = collector;
  }

  /** 注入 D75 lightweight re-diagnosis */
  setReDiagnosisEngine(engine: { triggerReDiagnosis(findingId: string, requestedBy: string): Promise<string> }): void {
    this.reDiagnosisEngine = engine;
  }

  /** 注入审计存储 */
  setAuditStore(store: { write(entry: Record<string, unknown>): Promise<string> }): void {
    this.auditStore = store;
  }

  /**
   * 处理 GA 反馈动作。
   */
  async processFeedback(action: GAFeedbackAction): Promise<GAFeedbackResult> {
    const timestamp = action.timestamp || new Date().toISOString();

    try {
      switch (action.action) {
        case 'correct':
          return await this.handleCorrect(action, timestamp);
        case 'flag':
          return await this.handleFlag(action, timestamp);
        case 'rediagnose':
          return await this.handleRediagnose(action, timestamp);
        default:
          return {
            findingId: action.findingId, action: action.action,
            status: 'failed', message: `未知操作: ${action.action}`,
            timestamp, error: `不支持的操作类型`,
          };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg, action: action.action, findingId: action.findingId }, 'GA 反馈处理失败');
      return {
        findingId: action.findingId, action: action.action,
        status: 'failed', message: 'GA 反馈处理异常',
        timestamp, error: msg,
      };
    }
  }

  /**
   * GA 纠正：写入 D93 feedbackCollector，标记为 ga_correction。
   */
  private async handleCorrect(action: GAFeedbackAction, timestamp: string): Promise<GAFeedbackResult> {
    const correctionId = await this.recordCorrection(action.findingId, action.correction || '无修正内容', action.gaUserId, action.enterpriseId);

    const result: GAFeedbackResult = {
      findingId: action.findingId, action: 'correct',
      status: 'success', correctionId,
      message: 'GA 纠正已记录',
      beforeAfterComparison: {
        originalFindingSummary: '原始发现（待 GA 审查）',
        correctedSummary: action.correction || '无修正内容',
      },
      timestamp,
    };

    log.info({ findingId: action.findingId, correctionId }, 'GA 纠正已处理');
    return result;
  }

  /**
   * GA 标记：触发 D75 轻量级再诊断。
   */
  private async handleFlag(action: GAFeedbackAction, timestamp: string): Promise<GAFeedbackResult> {
    const reDiagnosisId = await this.triggerReDiagnosis(action.findingId, action.gaUserId);

    const result: GAFeedbackResult = {
      findingId: action.findingId, action: 'flag',
      status: reDiagnosisId ? 'success' : 'degraded',
      reDiagnosisId: reDiagnosisId || undefined,
      message: reDiagnosisId ? '已触发轻量级再诊断' : '再诊断触发失败 — 降级',
      beforeAfterComparison: {
        originalFindingSummary: '原始发现',
        reDiagnosisSummary: reDiagnosisId ? '再诊断已完成，请查看更新后的卡片' : '再诊断不可用',
      },
      timestamp,
    };

    return result;
  }

  /**
   * GA 要求重新诊断：触发 D75 + 写入审计。
   */
  private async handleRediagnose(action: GAFeedbackAction, timestamp: string): Promise<GAFeedbackResult> {
    const reDiagnosisId = await this.triggerReDiagnosis(action.findingId, action.gaUserId);

    // 写入审计
    if (reDiagnosisId && this.auditStore) {
      try {
        await this.auditStore.write({
          orgId: action.enterpriseId,
          actorId: `ga:${action.gaUserId}`,
          actorRole: 'ga',
          action: 'ga.rediagnose',
          targetType: 'SENTINEL_FINDING',
          targetId: action.findingId,
          newValue: JSON.stringify({ reDiagnosisId }),
        });
      } catch { log.warn('审计日志写入失败 — 降级'); }
    }

    return {
      findingId: action.findingId, action: 'rediagnose',
      status: reDiagnosisId ? 'success' : 'degraded',
      reDiagnosisId: reDiagnosisId || undefined,
      message: reDiagnosisId ? '重新诊断已完成' : '重新诊断失败 — 已降级',
      beforeAfterComparison: {
        originalFindingSummary: '原始发现',
        reDiagnosisSummary: reDiagnosisId ? '新诊断结果已生成' : '再诊断不可用',
      },
      timestamp,
    };
  }

  /**
   * 触发 D75 轻量级再诊断。
   * 降级: 再诊断引擎未配置 → 返回空字符串 + log.warn。
   */
  async triggerReDiagnosis(findingId: string, gaUserId: string): Promise<string> {
    if (!this.reDiagnosisEngine) {
      log.warn({ findingId }, '再诊断引擎未配置 — 降级');
      return '';
    }

    try {
      const diagnosisId = await this.reDiagnosisEngine.triggerReDiagnosis(findingId, gaUserId);
      log.info({ findingId, diagnosisId }, 'D75 再诊断已触发');
      return diagnosisId;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, findingId }, 'D75 再诊断触发失败 — 降级');
      return '';
    }
  }

  /**
   * 记录 GA 纠正到 D93 feedbackCollector。
   * 契约 (D476 O8):
   *   @input  — findingId / correction / gaUserId / enterpriseId?（缺省回落实例默认 org config.orgId）
   *   @output — collector 返回的 id（无 id 字段 → 'recorded'）
   *   @degraded — collector 未配置 → 'unrecorded' + log.warn；写入抛错 → 'unrecorded' + log.warn
   * 组织上下文: 显式传入或实例 org，绝不回落全局 'default' 命名空间（D338 fail-closed）。
   */
  async recordCorrection(findingId: string, correction: string, gaUserId: string, enterpriseId?: string): Promise<string> {
    if (!this.feedbackCollector) {
      log.warn({ findingId }, 'feedbackCollector 未配置 — 降级');
      return 'unrecorded';
    }

    try {
      const result = await this.feedbackCollector.collectFeedback({
        enterpriseId: enterpriseId || config.orgId,
        actorId: gaUserId,
        actorRole: 'ga',
        decision: 'modify',
        targetType: 'sentinel_alert',
        targetId: findingId,
        reason: correction,
      });
      const id = typeof result === 'object' && result !== null && 'id' in result ? String((result as Record<string, unknown>).id) : 'recorded';
      log.info({ findingId, correctionId: id }, 'GA 纠正已写入 D93');
      return id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, findingId }, 'GA 纠正写入失败 — 降级');
      return 'unrecorded';
    }
  }
}
