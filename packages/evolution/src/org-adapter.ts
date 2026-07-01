/**
 * org-adapter.ts — 组织自适应引擎 (L0 进化层｜第二层)
 *
 * 每次诊断完成后触发。执行:
 *   ① processCorrections() — 用户纠错→解析事实→写入 GraphStore + AgentMemoryStore
 *   ② adjustThresholds()   — ≥3 次纠错→该哨兵阈值自适应上调
 *   ③ closeStaleTickets()  — 事实更新后自动关闭过期 ticket
 *
 * 铁律 24+31: 每个步骤独立 try/catch, 单个失败不阻断整体。
 * 铁律 46: 不引用 engine-core。直接依赖 @synova/logger + evolution-types。
 */

import { createLogger } from '@synova/logger';
import type {
  AgentMemoryStoreLike,
  GraphStoreLike,
  L3WriteAPI,
  OrgAdaptationResult,
  ExtractedFact,
} from './evolution-types';
import { DEFAULT_EVOLUTION_CONFIG } from './evolution-types';
import { EvolutionMetrics } from './evolution-metrics';

const log = createLogger('evolution/org-adapter');

// ═══ 阈值边界 ═══
// 防止阈值无限下调或暴涨导致哨兵永不再告警或永远告警。
const MIN_THRESHOLD = 0.05;   // 硬下界: 任何阈值不低于 5%
const MAX_THRESHOLD_MULTIPLIER = 5;  // 硬上界: 不超过原始值的 5 倍

// ═══ 数值正则 (用于从用户纠错文本中提取数字) ═══
const NUMBER_RE = /(\d+[.\d]*)\s*(万|亿|千万|百万|%|元|美元|人|个)?/g;

/**
 * 从用户纠错文本中尝试提取结构化事实。
 * 当前支持: "现金流X万" / "营收Y亿" / "员工Z人" 等简单模式。
 * 后续可升级为 LLM 解析（当规则匹配不足时降级）。
 */
function extractFacts(reason: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const text = reason || '';

  // 现金流/现金模式
  const cashMatch = text.match(/(?:现金流|现金|资金)(?:实际|大约|约为?|是|大概)?\s*(\d+[.\d]*)\s*(万|亿|千万)?/);
  if (cashMatch) {
    facts.push({
      nodeType: 'Financial',
      field: 'cash',
      value: parseFloat(cashMatch[1]),
      rawText: cashMatch[0],
    });
  }

  // 营收/收入模式
  const revenueMatch = text.match(/(?:营收|收入|销售额)(?:实际|大约|约为?|是|大概)?\s*(\d+[.\d]*)\s*(万|亿|千万)?/);
  if (revenueMatch) {
    facts.push({
      nodeType: 'Financial',
      field: 'revenue',
      value: parseFloat(revenueMatch[1]),
      rawText: revenueMatch[0],
    });
  }

  // 利润模式
  const profitMatch = text.match(/(?:利润|净利润|毛利)(?:实际|大约|约为?|是|大概)?\s*(\d+[.\d]*)\s*(万|亿|千万)?/);
  if (profitMatch) {
    facts.push({
      nodeType: 'Financial',
      field: 'profit',
      value: parseFloat(profitMatch[1]),
      rawText: profitMatch[0],
    });
  }

  // 员工人数模式
  const empMatch = text.match(/(?:员工|人数|团队)[约为是]?(\d+[.\d]*)\s*人/);
  if (empMatch) {
    facts.push({
      nodeType: 'Organization',
      field: 'employeeCount',
      value: parseFloat(empMatch[1]),
      rawText: empMatch[0],
    });
  }

  return facts;
}

// ═══ OrgAdapter ═══

export class OrgAdapter {
  private l3: L3WriteAPI | null;
  private graphStore: GraphStoreLike | null;
  private memoryStore: AgentMemoryStoreLike | null;
  private metrics: EvolutionMetrics;
  private config: {
    minCorrectionsForThresholdAdjustment: number;
    thresholdAdjustmentRatio: number;
    /** 冷却期（小时）：同一哨兵被调整后，在此时间内不再调整 */
    coolingPeriodHours: number;
  };

  constructor(opts: {
    l3?: L3WriteAPI | null;
    graphStore?: GraphStoreLike | null;
    memoryStore?: AgentMemoryStoreLike | null;
    minCorrectionsForThresholdAdjustment?: number;
    thresholdAdjustmentRatio?: number;
    coolingPeriodHours?: number;
  }) {
    this.l3 = opts.l3 ?? null;
    this.graphStore = opts.graphStore ?? null;
    this.memoryStore = opts.memoryStore ?? null;
    this.metrics = EvolutionMetrics.getInstance();
    this.config = {
      minCorrectionsForThresholdAdjustment: opts.minCorrectionsForThresholdAdjustment ?? DEFAULT_EVOLUTION_CONFIG.minCorrectionsForThresholdAdjustment,
      thresholdAdjustmentRatio: opts.thresholdAdjustmentRatio ?? DEFAULT_EVOLUTION_CONFIG.thresholdAdjustmentRatio,
      coolingPeriodHours: opts.coolingPeriodHours ?? 24,
    };
  }

  /**
   * 诊断完成后调用 — 主入口。
   * 按顺序执行: 纠错处理 → 阈值自适应 → 关票。
   * 每步独立 try/catch, 累计 errors 但继续执行后续步骤。
   */
  async afterDiagnosis(orgId: string): Promise<OrgAdaptationResult> {
    const result: OrgAdaptationResult = {
      correctionsProcessed: 0,
      factsWritten: 0,
      ticketsClosed: 0,
      thresholdsAdjusted: [],
      errors: [],
      degraded: false,
    };

    // ① 处理用户纠错
    try {
      const cr = await this.processCorrections(orgId);
      result.correctionsProcessed = cr.correctionsProcessed;
      result.factsWritten = cr.factsWritten;
      if (cr.errors.length > 0) {
        result.errors.push(...cr.errors);
        result.degraded = true;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`processCorrections: ${msg}`);
      result.degraded = true;
      log.warn({ err: msg, orgId }, 'processCorrections 失败 — 降级继续');
    }

    // ② 阈值自适应 (依赖步骤①的纠错数据)
    try {
      const adj = await this.adjustThresholds(orgId);
      result.thresholdsAdjusted = adj;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`adjustThresholds: ${msg}`);
      result.degraded = true;
      log.warn({ err: msg, orgId }, 'adjustThresholds 失败 — 降级继续');
    }

    // ③ 关闭过期 ticket (依赖 L3WriteAPI)
    if (this.l3) {
      try {
        const closed = await this.closeStaleTickets(orgId);
        result.ticketsClosed = closed;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`closeStaleTickets: ${msg}`);
        result.degraded = true;
        log.warn({ err: msg, orgId }, 'closeStaleTickets 失败 — 降级继续');
      }
    }

    log.info({ orgId, corrections: result.correctionsProcessed, facts: result.factsWritten, tickets: result.ticketsClosed, thresholds: result.thresholdsAdjusted.length }, '组织自适应完成');
    return result;
  }

  // ═══ ① 纠错处理 ═══

  /**
   * 从 AgentMemoryStore 读取 user_correction 类型的反馈，
   * 解析事实 → 写入 GraphStore。
   */
  async processCorrections(orgId: string): Promise<{ correctionsProcessed: number; factsWritten: number; errors: string[] }> {
    const errors: string[] = [];
    let correctionsProcessed = 0;
    let factsWritten = 0;

    if (!this.memoryStore) {
      errors.push('memoryStore 未注入');
      return { correctionsProcessed: 0, factsWritten: 0, errors };
    }

    // 读取该组织未处理的 user_correction 记忆
    const corrections = this.memoryStore.list({
      orgId,
      type: 'enterprise_fact',
      tags: ['user_correction'],
      limit: 50,
    });

    for (const entry of corrections) {
      try {
        const record = JSON.parse(entry.value) as { reason?: string; actionId: string; sentinelId?: string };
        const facts = extractFacts(record.reason || '');

        if (facts.length > 0 && this.graphStore) {
          // 写入 GraphStore
          const nodeId = `${orgId}_${facts[0].nodeType}`;
          const props: Record<string, unknown> = {};
          for (const fact of facts) {
            props[fact.field] = fact.value;
          }
          props._lastCorrectedAt = new Date().toISOString();
          props._correctionSource = 'user_feedback';

          try {
            this.graphStore.updateNode(nodeId, props, orgId);
            factsWritten += facts.length;
          } catch {
            // 节点可能不存在, 尝试创建
            try {
              this.graphStore.createNode(facts[0].nodeType as string, props, orgId);
              factsWritten += facts.length;
            } catch (createErr: unknown) {
              errors.push(`GraphStore createNode: ${createErr instanceof Error ? createErr.message : String(createErr)}`);
            }
          }
        }

        correctionsProcessed++;
        this.metrics.recordCorrection();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`解析纠错记录失败: ${msg}`);
        log.warn({ err: msg, orgId }, '解析 user_correction 记录失败');
      }
    }

    return { correctionsProcessed, factsWritten, errors };
  }

  // ═══ ② 阈值自适应 ═══

  /**
   * 统计该组织各哨兵的 user_correction 数量。
   * 对 ≥minCorrections 的哨兵, 自适应上调阈值的 20%。
   */
  async adjustThresholds(orgId: string): Promise<Array<{ sentinelId: string; old: number; new: number }>> {
    const adjusted: Array<{ sentinelId: string; old: number; new: number }> = [];

    if (!this.memoryStore) return adjusted;

    // 读取所有 user_correction (实际存储为 enterprise_fact + tag)
    const allCorrections = this.memoryStore.list({
      orgId,
      type: 'enterprise_fact',
      tags: ['user_correction'],
      limit: 100,
    });

    // 按 sentinelId 分组计数
    const sentinelCount = new Map<string, number>();
    for (const entry of allCorrections) {
      const tags = entry.tags || [];
      const sentinelTag = tags.find(t => t !== 'user_correction' && t !== 'correction' && t !== 'confirm' && t !== 'reject' && t !== 'modify');
      if (sentinelTag) {
        sentinelCount.set(sentinelTag, (sentinelCount.get(sentinelTag) || 0) + 1);
      }
    }

    // 对触发阈值的哨兵上调
    for (const [sentinelId, count] of sentinelCount) {
      if (count >= this.config.minCorrectionsForThresholdAdjustment) {
        // 读取已有阈值调整记录
        const existing = this.memoryStore.recall(orgId, `threshold_${sentinelId}`);
        let oldCritical = 1.0;
        let lastAdjustedAt = 0;

        if (existing) {
          try {
            const parsed = JSON.parse(existing.value) as {
              newThreshold?: { critical: number };
              adjustedAt?: string;
            };
            if (parsed.newThreshold?.critical) oldCritical = parsed.newThreshold.critical;
            if (parsed.adjustedAt) lastAdjustedAt = new Date(parsed.adjustedAt).getTime();
          } catch { /* 使用默认值 */ }
        }

        // ═══ 冷却期检查（ARCH-13 §6.5）═══
        if (lastAdjustedAt > 0) {
          const hoursSinceAdjust = (Date.now() - lastAdjustedAt) / (1000 * 60 * 60);
          if (hoursSinceAdjust < this.config.coolingPeriodHours) {
            log.info({ sentinelId, hoursSinceAdjust: hoursSinceAdjust.toFixed(1), coolingPeriod: this.config.coolingPeriodHours }, '冷却期 — 跳过阈值调整');
            this.metrics.recordCoolingSkip(sentinelId, hoursSinceAdjust);
            continue;
          }
        }

        // ═══ 计算新阈值 ═══
        let newCritical = Math.round(oldCritical * (1 - this.config.thresholdAdjustmentRatio) * 100) / 100;

        // ═══ 阈值边界保护 ═══
        const rawNew = newCritical;
        // 下界: 不低于 MIN_THRESHOLD
        newCritical = Math.max(MIN_THRESHOLD, newCritical);
        // 上界: 不超过 original * MAX_THRESHOLD_MULTIPLIER
        const originalCritical = 1.0;
        const upperBound = Math.round(originalCritical * MAX_THRESHOLD_MULTIPLIER * 100) / 100;
        newCritical = Math.min(upperBound, newCritical);

        if (rawNew !== newCritical) {
          log.info({ sentinelId, attempted: rawNew, clamped: newCritical }, '阈值边界保护 — 调整值被钳制');
          this.metrics.recordBoundProtection(sentinelId, rawNew, newCritical);
        }

        // 写入阈值调整记忆
        this.memoryStore.remember({
          orgId,
          key: `threshold_${sentinelId}`,
          value: JSON.stringify({
            sentinelId,
            oldThreshold: { warning: 0.5, critical: oldCritical },
            newThreshold: { warning: 0.4, critical: newCritical },
            correctionCount: count,
            reason: `${count} 次用户纠错触发阈值自适应`,
            adjustedAt: new Date().toISOString(),
          }),
          type: 'enterprise_fact',
          confidence: 0.8,
          source: 'org_adapter',
          tags: ['threshold_adjustment', sentinelId],
          expiresAt: null,
        });

        // 同步到 L3 (如果可用)
        if (this.l3) {
          try {
            await this.l3.updateThreshold(orgId, sentinelId, { critical: newCritical });
          } catch (err: unknown) {
            log.warn({ err, sentinelId, orgId }, 'L3 阈值同步失败 — 降级');
          }
        }

        adjusted.push({ sentinelId, old: oldCritical, new: newCritical });
        this.metrics.recordThresholdAdjustment(sentinelId, oldCritical, newCritical);
        log.info({ orgId, sentinelId, old: oldCritical, new: newCritical, count }, '阈值自适应 — 上调');
      }
    }

    return adjusted;
  }

  // ═══ ③ 关闭过期 ticket ═══

  /**
   * 关闭与已处理纠错相关的哨兵 ticket。
   * 依赖 L3WriteAPI.closeTicket()。
   */
  async closeStaleTickets(orgId: string): Promise<number> {
    if (!this.l3) {
      log.debug({ orgId }, 'L3WriteAPI 未注入 — 跳过关票');
      return 0;
    }

    if (!this.memoryStore) return 0;

    const corrections = this.memoryStore.list({
      orgId,
      type: 'enterprise_fact',
      tags: ['user_correction'],
      limit: 50,
    });

    const sentinelIds = new Set<string>();
    for (const entry of corrections) {
      try {
        const record = JSON.parse(entry.value) as { sentinelId?: string };
        if (record.sentinelId) sentinelIds.add(record.sentinelId);
      } catch { /* 跳过损坏数据 */ }
    }

    let totalClosed = 0;
    for (const sentinelId of sentinelIds) {
      try {
        const closed = await this.l3.closeTicket(orgId, sentinelId);
        totalClosed += closed;
      } catch (err: unknown) {
        log.warn({ err, orgId, sentinelId }, '关票失败 — 降级');
      }
    }

    return totalClosed;
  }
}
