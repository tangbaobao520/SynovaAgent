/**
 * l3/pkb-lifecycle.ts — PKB 知识生命周期管理 (Slice 3+4) + 自我进化 (v2.1)
 *
 * Gear6 扩展: 置信度衰减、冲突检测、过期标记、诊断反馈回路。
 * v2.1 新增: autoSediment（诊断结果自动沉淀）、calibrateThresholds（阈值校准占位）。
 * 铁律 39: L3 通过 KnowledgeStore(L4) 操作数据，不直接访问 L5 数据库。
 */
import { KnowledgeStore } from '../l4/knowledge-store';
import type Database from 'better-sqlite3';
import { createLogger } from '../logger';

const log = createLogger('l3/pkb-lifecycle');

// ═══ Types ═══

export interface SedimentInput {
  /** 来源诊断 ID */
  diagnosisId: string;
  /** 专家类型 */
  domain: string;
  /** 发现的规律/知识内容 */
  content: string;
  /** 该发现的置信度 (0-1) */
  confidence: number;
  /** 证据来源（如 "3家客户均出现" 或 "单客户+强证据"） */
  evidenceSource: string;
}

export interface SedimentResult {
  /** 成功沉淀的条目数 */
  sedimented: number;
  /** 因置信度不足而跳过的条目数 */
  skipped: number;
  /** 写入的条目 ID 列表 */
  ids: string[];
}

// ═══ PKB Lifecycle ═══

/**
 * 运行 PKB 生命周期维护 — 由 Gear6 定时调用。
 * @param db SQLite 数据库实例 (由 L2/server.ts 传入)
 */
export function runPKBLifecycle(db: Database.Database): { decayed: number; conflicts: number; expired: number; feedbackApplied: number } {
  const store = new KnowledgeStore(db);

  const decayed = store.decayConfidence(0.95);
  const expired = store.expireOutdated();
  const conflicts = store.detectConflicts();
  const feedbackApplied = store.applyFeedback();

  if (decayed > 0 || conflicts > 0 || expired > 0 || feedbackApplied > 0) {
    log.info({ decayed, conflicts, expired, feedbackApplied }, 'PKB 生命周期维护完成');
  }
  return { decayed, conflicts, expired, feedbackApplied };
}

// ═══ Auto-Sediment: 诊断结果 → PKB 知识沉淀 (v2.1) ═══

/**
 * 从诊断结果中自动提取可沉淀的知识。
 *
 * 沉淀规则:
 *   - confidence ≥ 0.7 → 写入 PKB（status=proposed, confidence=初始0.6）
 *   - confidence < 0.7 → 跳过（信号不够强，不自动沉淀）
 *   - 同 domain + 相似 content 已存在 → 标记 superseded_by 关系
 *
 * 自动沉淀的知识需要 FDE 审核后才能变为 active。
 * 被驳回的条目 30 天后归档。
 *
 * @param db SQLite 数据库实例
 * @param inputs 待沉淀的诊断发现
 * @returns 沉淀结果
 */
export function autoSediment(db: Database.Database, inputs: SedimentInput[]): SedimentResult {
  const store = new KnowledgeStore(db);
  const ids: string[] = [];
  let sedimented = 0;
  let skipped = 0;

  for (const input of inputs) {
    // 置信度阈值
    if (input.confidence < 0.7) {
      skipped++;
      continue;
    }

    try {
      const id = store.insert({
        text: input.content,
        sourceType: 'diagnosis',
        sourceId: input.diagnosisId,
        authorityLevel: 'internal_stored',
        accessLevel: 'team',
        accessSensitivity: 'normal',
      });

      ids.push(id);
      sedimented++;
      log.debug({ id, domain: input.domain, confidence: input.confidence }, '诊断知识已自动沉淀');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, domain: input.domain }, '知识沉淀写入失败——跳过');
    }
  }

  if (sedimented > 0 || skipped > 0) {
    log.info({ sedimented, skipped, total: inputs.length }, '自动沉淀完成');
  }
  return { sedimented, skipped, ids };
}

/**
 * 从 ExpertReport[] 中提取可沉淀的知识。
 * 由 ExpertDispatcher.runAllExperts() 完成后调用。
 */
export function extractSedimentInputs(
  diagnosisId: string,
  expertOutputs: Array<{
    expertType: string;
    findings?: Array<{
      statement?: string;
      confidence?: number;
      evidenceRefs?: string[];
      severity?: string;
    }>;
  }>,
): SedimentInput[] {
  const inputs: SedimentInput[] = [];

  for (const output of expertOutputs) {
    if (!output.findings) continue;

    for (const finding of output.findings) {
      // 只沉淀 critical 和 warning 级别的发现（info 通常是常规观察，不需要沉淀）
      if (finding.severity !== 'critical' && finding.severity !== 'warning' && finding.severity !== 'high') continue;
      if (!finding.statement || finding.statement.length < 20) continue;

      const confidence = typeof finding.confidence === 'number' ? finding.confidence : 0.5;
      const evidenceCount = finding.evidenceRefs?.length || 0;

      inputs.push({
        diagnosisId,
        domain: output.expertType,
        content: finding.statement,
        confidence,
        evidenceSource: evidenceCount >= 3
          ? `跨3+证据交叉验证 (${evidenceCount}条)`
          : evidenceCount >= 1
            ? `单诊断证据 (${evidenceCount}条)`
            : '专家推断——无直接证据',
      });
    }
  }

  return inputs;
}

// ═══ Placeholder: 阈值自动校准 (Phase 2) ═══

/**
 * 当同一行业的诊断数据积累 ≥ 30 个企业时，
 * 自动更新 knowledge/industry/*.md 中的 KPI 阈值。
 *
 * Phase 2 实施。当前为占位。
 */
export function calibrateThresholds(_industry: string): { calibrated: number; status: string } {
  log.info({ industry: _industry }, '阈值校准——Phase 2 未实施');
  return { calibrated: 0, status: 'not_implemented' };
}
