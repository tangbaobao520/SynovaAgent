/**
 * layer2-org-adapter.ts — Layer 2 组织自适应 (Phase 2.2)
 *
 * 对标设计文档 §2.1-2.2:
 *   每次诊断后自动校准阈值、术语、角色画像。
 *   仅基于历史已完成的诊断反馈，不涉及本次诊断的即时数据。
 */
import { createLogger } from '../../infra/logger';
import type { DiagnosticRule } from './rule-registry';
import { FeedbackStore } from './feedback-persistence';

const log = createLogger('diagnosis/layer2-org-adapter');

// ═══ Types ═══

export interface TerminologyEntry {
  userTerm: string;
  engineTerm: string;
  contextType?: string;
  contextId?: string;
}

export interface OrgRuntimeConfig {
  thresholds: Record<string, number>;
  enabledModules: string[];
  disabledModules: string[];
}

interface CalibrationMeta {
  confidenceAdjusted: number;
  recorded: boolean;
  reason: string;
}

// ═══ Default thresholds (posture-weights baseline) ═══

const DEFAULT_THRESHOLDS: Record<string, number> = {
  collaboration: 0.3,
  information_flow: 0.35,
  authority_governance: 0.3,
  trust_incentive: 0.3,
  division_of_labor: 0.25,
  conflict_resolution: 0.3,
};

// ═══ OrgAdapter ═══

export class OrgAdapter {
  private teamId: string;
  private db: any;
  private feedbackStore: FeedbackStore;

  constructor(teamId: string, db: any) {
    this.teamId = teamId;
    this.db = db;
    this.feedbackStore = new FeedbackStore(db);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS org_config (
        team_id TEXT PRIMARY KEY,
        thresholds_json TEXT DEFAULT '{}',
        modules_json TEXT DEFAULT '{}',
        terminology_json TEXT DEFAULT '[]',
        baseline_json TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  // ═══ Threshold Calibration (IQR method) ═══

  /**
   * 仅基于历史已完成的诊断反馈进行校准。
   * 本次诊断的行动项尚未执行，其反馈数据将在下次诊断时纳入。
   */
  async calibrateAfterDiagnosis(): Promise<{ thresholdsUpdated: boolean; confidenceChanges: Array<{ ruleId: string; oldConf: number; newConf: number }> }> {
    const stats = this.feedbackStore.getClosedLoopStats(this.teamId);
    if (stats.totalDiagnoses < 2) {
      log.info({ teamId: this.teamId }, '历史诊断不足，跳过校准');
      return { thresholdsUpdated: false, confidenceChanges: [] };
    }

    // 阈值校准
    const newThresholds: Record<string, number> = {};
    for (const [dim, globalDefault] of Object.entries(DEFAULT_THRESHOLDS)) {
      const values = this.getHistoricalValues(dim);
      newThresholds[dim] = this.calibrateThreshold(values, globalDefault);
    }

    this.saveOrgConfig({ thresholds: newThresholds });
    log.info({ teamId: this.teamId, thresholds: newThresholds }, '阈值已校准');

    return { thresholdsUpdated: true, confidenceChanges: [] };
  }

  /** IQR-based threshold: median - 1.5*IQR. < 10 points → global default. */
  private calibrateThreshold(values: number[], globalDefault: number): number {
    if (values.length < 10) return globalDefault;

    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    if (iqr === 0) return median;

    return Math.max(0, median - 1.5 * iqr);
  }

  // ═══ Confidence Adjustment ═══

  /**
   * 反事实梯度公式:
   *   newConf = oldConf + (adoptionRate - 0.5) × 0.1 + (improvementRate - 0.5) × 0.1
   */
  private adjustConfidence(rule: DiagnosticRule, adoptionRate: number, improvementRate: number): number {
    const delta = (adoptionRate - 0.5) * 0.1 + (improvementRate - 0.5) * 0.1;
    const newConf = Math.max(0, Math.min(1, rule.confidence + delta));
    return Math.round(newConf * 1000) / 1000; // round to 3 decimal places
  }

  /**
   * 反事实检查:
   *   - 未执行 + 指标恶化 → 记录但不调整（规则可能有价值）
   *   - 未执行 + 指标不变 → 降低 0.02（规则可能无效）
   */
  private checkCounterfactual(rule: DiagnosticRule, wasExecuted: boolean, isWorsened: boolean): CalibrationMeta {
    if (wasExecuted) {
      return { confidenceAdjusted: 0, recorded: false, reason: '规则已执行，走正常反馈' };
    }
    if (isWorsened) {
      return { confidenceAdjusted: 0, recorded: true, reason: '未执行+指标恶化——规则可能有价值，记录但不调整' };
    }
    return { confidenceAdjusted: -0.02, recorded: false, reason: '未执行+指标不变——规则可能无效' };
  }

  // ═══ Deterioration Detection ═══

  /**
   * 指标恶化判定:
   *   A. 最新得分 < 基线值 × 0.95（下降超过 5%）
   *   B. 最新得分 < Q1 - 1.5×IQR
   */
  private isDeteriorated(score: number, baseline: number): boolean {
    return score < baseline * 0.95;
  }

  private isDeterioratedByIQR(score: number, q1: number, iqr: number): boolean {
    return score < q1 - 1.5 * iqr;
  }

  // ═══ Terminology ═══

  updateTerminology(entries: TerminologyEntry[]): void {
    const existing = this.loadTerminology();
    for (const entry of entries) {
      const idx = existing.findIndex(e => e.userTerm === entry.userTerm);
      if (idx >= 0) {
        existing[idx] = entry; // update
      } else {
        existing.push(entry); // insert
      }
    }
    this.db.prepare('INSERT OR REPLACE INTO org_config (team_id, terminology_json) VALUES (?,?)')
      .run(this.teamId, JSON.stringify(existing));
    log.info({ teamId: this.teamId, count: entries.length }, '术语已更新');
  }

  private loadTerminology(): TerminologyEntry[] {
    const row = this.db.prepare('SELECT terminology_json FROM org_config WHERE team_id=?').get(this.teamId) as any;
    if (!row?.terminology_json) return [];
    try { return JSON.parse(row.terminology_json); } catch { return []; }
  }

  // ═══ Runtime Config ═══

  /**
   * 加载顺序: 组织覆盖 → posture-weights 默认值。
   * 组织覆盖的 key 优先，未覆盖的 key 使用默认。
   */
  getRuntimeConfig(): OrgRuntimeConfig {
    const row = this.db.prepare('SELECT thresholds_json, modules_json FROM org_config WHERE team_id=?').get(this.teamId) as any;
    const orgThresholds: Record<string, number> = row?.thresholds_json ? JSON.parse(row.thresholds_json) : {};
    const orgModules: { enabled?: string[]; disabled?: string[] } = row?.modules_json ? JSON.parse(row.modules_json) : {};

    // 合并：组织覆盖优先，默认 fallback
    const thresholds = { ...DEFAULT_THRESHOLDS, ...orgThresholds };
    return {
      thresholds,
      enabledModules: orgModules.enabled || [],
      disabledModules: orgModules.disabled || [],
    };
  }

  // ═══ Helpers ═══

  private getHistoricalValues(dimension: string): number[] {
    // Read feedback data for this team + dimension
    const feedbacks = this.feedbackStore.getTeamFeedback(this.teamId, 50);
    const values: number[] = [];
    for (const fb of feedbacks) {
      if (fb.dimensionRatings && fb.dimensionRatings[dimension] !== undefined) {
        values.push(fb.dimensionRatings[dimension]);
      }
    }
    return values;
  }

  private saveOrgConfig(config: { thresholds?: Record<string, number>; modules?: string[] }): void {
    const existing = this.db.prepare('SELECT * FROM org_config WHERE team_id=?').get(this.teamId);
    const thresholds = config.thresholds
      ? JSON.stringify({ ...JSON.parse((existing as any)?.thresholds_json || '{}'), ...config.thresholds })
      : (existing as any)?.thresholds_json || '{}';
    const modules = config.modules
      ? JSON.stringify({ enabled: config.modules })
      : (existing as any)?.modules_json || '{}';

    this.db.prepare(`
      INSERT OR REPLACE INTO org_config (team_id, thresholds_json, modules_json)
      VALUES (?,?,?)
    `).run(this.teamId, thresholds, modules);
  }
}
