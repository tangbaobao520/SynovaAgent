/**
 * src/loops/middle-evolution-engine.ts — 中层驱动进化引擎 (D92)
 *
 * Cycle 7: 消费 D93 中层反馈聚合信号, 生成 5 类进化动作:
 *   1. 阈值自动调整 (false alarm flagging ≥3)
 *   2. Goal目标公式调整 (same sub-cycle × same type ≥3)
 *   3. 路径排名降级 (same path rejected ≥3)
 *   4. 专家置信度降级 (same expert × breakpoint ≥3)
 *   5. 跨部门矛盾仲裁 (finance vs marketing 对立)
 *
 * 铁律 24+31: collector 不可用 → log.warn + 返回空
 * 铁律 38: 零 as any
 */
import { createLogger } from '@synova/logger';
import { getFeedbackCollector, type FeedbackCollector, type AggregatedSignal } from '../growth/feedback-collector';

const log = createLogger('loops/middle-evolution-engine');

// ═══ Types ═══

export type EvolutionActionType =
  | 'threshold_adjust'
  | 'goal_formula_tweak'
  | 'path_rank_downgrade'
  | 'expert_confidence_downgrade'
  | 'cross_dept_arbitration';

/** 进化动作 — 由 processFeedbackSignals 生成的自动调整指令 */
export interface EvolutionAction {
  type: EvolutionActionType;
  /** 触发原因 */
  reason: string;
  /** 调整参数 */
  parameter: Record<string, unknown>;
  /** 置信度 0-1 */
  confidence: number;
  /** 触发时间 */
  triggeredAt: string;
}

/** GA缺席保护计算结果 */
export interface GAProtectionResult {
  /** 自动升级阈值（天） */
  autoUpgradeThreshold: number;
  /** 是否应触发升级 */
  shouldUpgrade: boolean;
  /** GA缺席天数 */
  gaAbsenceDays: number;
  /** 中层活动率 */
  middleActivityRate: number;
}

// ═══ Core: 5 signal processors ═══

/**
 * 处理 5 类进化信号，生成进化动作列表。
 *
 * @param signals - D93 AggregatedSignal 数组
 * @returns 进化动作列表
 */
export function processFeedbackSignals(signals: AggregatedSignal[]): EvolutionAction[] {
  if (!signals || signals.length === 0) {
    return [];
  }

  const actions: EvolutionAction[] = [];

  try {
    // Signal 1: 阈值调整 — reject（false alarm）同哨兵×同分类≥3
    const thresholdSignals = signals.filter(s =>
      s.decision === 'reject' && s.targetType === 'sentinel_alert' && s.count >= 3,
    );
    for (const sig of thresholdSignals) {
      actions.push({
        type: 'threshold_adjust',
        reason: `哨兵 ${sig.key} 被标注为 false alarm ${sig.count} 次，阈值可能过高`,
        parameter: { sentinelKey: sig.key, adjustPercent: 5, direction: 'up' },
        confidence: Math.min(sig.count / 10, 0.9),
        triggeredAt: sig.latestTimestamp,
      });
    }

    // Signal 2: Goal目标调整 — modify 同sub-cycle×同type≥3
    const modifySignals = signals.filter(s =>
      s.decision === 'modify' && s.targetType === 'goal' && s.count >= 3,
    );
    for (const sig of modifySignals) {
      actions.push({
        type: 'goal_formula_tweak',
        reason: `Goal ${sig.key} 被中层修改 ${sig.count} 次，初始目标公式可能不准确`,
        parameter: { goalType: sig.key, weightAdjust: -0.1 },
        confidence: Math.min(sig.count / 10, 0.85),
        triggeredAt: sig.latestTimestamp,
      });
    }

    // Signal 3: 路径排名降级 — reject_path 同路径≥3
    const pathSignals = signals.filter(s =>
      s.decision === 'reject_path' && s.count >= 3,
    );
    for (const sig of pathSignals) {
      actions.push({
        type: 'path_rank_downgrade',
        reason: `路径 ${sig.key} 被拒绝 ${sig.count} 次，可能不适用当前场景`,
        parameter: { pathKey: sig.key, rankAdjust: -1 },
        confidence: Math.min(sig.count / 10, 0.8),
        triggeredAt: sig.latestTimestamp,
      });
    }

    // Signal 4: 专家置信度降级 — ineffective 同expert×breakpoint≥3
    const ineffectiveSignals = signals.filter(s =>
      s.decision === 'ineffective' && s.count >= 3,
    );
    for (const sig of ineffectiveSignals) {
      actions.push({
        type: 'expert_confidence_downgrade',
        reason: `专家 ${sig.key} 被标记为 ineffective ${sig.count} 次，推理链置信度需下调`,
        parameter: { expertKey: sig.key, confidenceAdjust: -0.15 },
        confidence: Math.min(sig.count / 10, 0.75),
        triggeredAt: sig.latestTimestamp,
      });
    }

    // Signal 5: 跨部门矛盾仲裁 — 同一事实两个不同决策
    const contradictionActions = detectContradictions(signals);
    actions.push(...contradictionActions);

    if (actions.length > 0) {
      log.info({ actionCount: actions.length }, '进化信号处理完成');
      // D262: GA 反馈记录 — 写入 FeedbackCollector
      try {
        const fb = getFeedbackCollector();
        for (const action of actions) {
          fb.collectFeedback({
            enterpriseId: 'synova',
            actorId: 'system:middle-evolution-engine',
            decision: 'accept',
            targetType: 'sentinel_alert',
            targetId: action.type,
            reason: action.reason,
            source: 'middle_evolution',
            eligibility: 'confirmed',
          });
        }
        log.info({ count: actions.length }, 'GA 反馈已记录');
      } catch (err) {
        log.warn({ err }, 'GA 反馈记录失败 — 降级');
      }

      // D273: 进化动作回写 — 将阈值调整写入行业阈值文件
      try {
        const result = applyEvolutionActions(actions);
        if (result.applied > 0 || result.errors.length > 0) {
          log.info({ applied: result.applied, errors: result.errors.length }, '进化动作回写');
        }
      } catch (err) {
        log.warn({ err }, '进化动作回写失败 — 降级（不阻断主流程）');
      }
    }

    return actions;
  } catch (err) {
    log.warn({ err }, 'processFeedbackSignals 异常 — 返回空');
    return [];
  }
}

// ═══ Contradiction arbitration ═══

interface ContradictionPair {
  finance: AggregatedSignal;
  marketing: AggregatedSignal;
  type: 'factual' | 'causal' | 'mixed';
}

/**
 * 检测并仲裁跨部门矛盾。
 */
function detectContradictions(signals: AggregatedSignal[]): EvolutionAction[] {
  const actions: EvolutionAction[] = [];

  // 查找 finance 和 marketing 对同一目标的对立反馈
  for (const a of signals) {
    for (const b of signals) {
      if (a === b) continue;
      const sharedTargets = a.targetIds.filter((id: string) => b.targetIds.includes(id));
      if (sharedTargets.length > 0 && a.decision !== b.decision) {
        const pair: ContradictionPair = {
          finance: a.key.includes('finance') ? a : b,
          marketing: a.key.includes('marketing') || b.key.includes('marketing') ? (a.key.includes('marketing') ? a : b) : a,
          type: classifyDispute(a, b),
        };

        const arbitration = arbitratePair(pair);
        if (arbitration) actions.push(arbitration);
      }
    }
  }

  return actions;
}

/**
 * 分类矛盾类型：
 * - factual: 数据层面的矛盾（可仲裁）
 * - causal: 因果判断层面的矛盾（不可仲裁）
 * - mixed: 两者兼有
 */
function classifyDispute(a: AggregatedSignal, b: AggregatedSignal): 'factual' | 'causal' | 'mixed' {
  // 如果双方引用同一指标但解读不同 → factual
  if (a.key.includes('metric') || b.key.includes('metric')) return 'factual';
  // 如果双方引用同一因果关系但结论相反 → causal
  if (a.key.includes('causal') || b.key.includes('causal')) return 'causal';
  // 默认 mixed
  return 'mixed';
}

/**
 * 对矛盾对进行仲裁评分。
 * 评分: dataConsistency(0.6) + historicalAccuracy(0.4)
 * Gap > 0.3 → 采纳高分
 * Gap ≤ 0.3 → pending_cross_validation
 */
function arbitratePair(pair: ContradictionPair): EvolutionAction | null {
  // 如果是 causal 类型 → 不可仲裁
  if (pair.type === 'causal') {
    return {
      type: 'cross_dept_arbitration',
      reason: `因果层面矛盾（${pair.finance.key} vs ${pair.marketing.key}），系统无法仲裁，标记为 pending_causal_validation`,
      parameter: { financeKey: pair.finance.key, marketingKey: pair.marketing.key, status: 'pending_causal_validation' },
      confidence: 0.3,
      triggeredAt: new Date().toISOString(),
    };
  }

  // 计算双方分数
  const scoreA = scoreDataConsistency(pair.finance) * 0.6 + scoreHistoricalAccuracy(pair.finance) * 0.4;
  const scoreB = scoreDataConsistency(pair.marketing) * 0.6 + scoreHistoricalAccuracy(pair.marketing) * 0.4;
  const gap = Math.abs(scoreA - scoreB);

  if (gap > 0.3) {
    const winner = scoreA > scoreB ? pair.finance : pair.marketing;
    const loser = scoreA > scoreB ? pair.marketing : pair.finance;
    return {
      type: 'cross_dept_arbitration',
      reason: `事实层面矛盾已仲裁：采纳 ${winner.key}（评分 ${winner.key}=${scoreA.toFixed(2)}, ${loser.key}=${scoreB.toFixed(2)}, 差距=${gap.toFixed(2)}>0.3）`,
      parameter: { winnerKey: winner.key, loserKey: loser.key, winnerScore: scoreA, loserScore: scoreB },
      confidence: Math.min(gap, 0.95),
      triggeredAt: new Date().toISOString(),
    };
  }

  return {
    type: 'cross_dept_arbitration',
    reason: `矛盾差距过小（gap=${gap.toFixed(2)}≤0.3），标记为 pending_cross_validation，等待3个月或GA人工判断`,
    parameter: { financeKey: pair.finance.key, marketingKey: pair.marketing.key, status: 'pending_cross_validation', gap },
    confidence: 0.5,
    triggeredAt: new Date().toISOString(),
  };
}

/**
 * 数据一致性评分（简化模型：基于反馈次数和时效性）。
 */
function scoreDataConsistency(signal: AggregatedSignal): number {
  const recency = Date.now() - new Date(signal.latestTimestamp).getTime();
  const daysSinceUpdate = recency / (1000 * 60 * 60 * 24);
  // 越新越高分，最多 0.9
  const recencyScore = Math.max(0, 1 - daysSinceUpdate / 90);
  // 次数越多越高分
  const countScore = Math.min(signal.count / 10, 0.9);
  return recencyScore * 0.4 + countScore * 0.6;
}

/**
 * 历史准确率评分（简化模型）。
 */
function scoreHistoricalAccuracy(signal: AggregatedSignal): number {
  // 简化实现：基于反馈次数估计，count越高说明越多次被验证
  return Math.min(signal.count / 15, 0.95);
}

// ═══ GA absence protection ═══

/**
 * 计算 GA 缺席自动升级阈值。
 *
 * 公式: autoUpgradeThreshold = 60 * (1 - middleActivityRate)
 * - GA absent 60d + activity 80% → threshold = 12d
 * - GA absent 60d + activity <30% → threshold = 42d
 *
 * @param gaAbsenceDays       - GA 连续缺席天数
 * @param middleActivityRate  - 中层管理活动率 (0-1)
 * @returns GA 保护结果
 */
export function computeGAProtection(
  gaAbsenceDays: number,
  middleActivityRate: number,
): GAProtectionResult {
  const clampedRate = Math.max(0, Math.min(1, middleActivityRate));
  const autoUpgradeThreshold = Math.round(60 * (1 - clampedRate));
  const shouldUpgrade = gaAbsenceDays >= autoUpgradeThreshold;

  return {
    autoUpgradeThreshold,
    shouldUpgrade,
    gaAbsenceDays,
    middleActivityRate: clampedRate,
  };
}

// ═══ D273: GA 纠错回写 ═══

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const EXTENSIONS_DIR = join(process.cwd(), "extensions", "industries");
const MAX_CORRECTION_RATIO = 0.3; // ±30% 上限
const MIN_TRIGGER_COUNT = 3; // 至少 3 次同 key 纠错才触发

export interface ApplyActionResult {
  applied: number;
  skipped: number;
  errors: string[];
}

/**
 * D273: 将 processFeedbackSignals 生成的进化动作回写到行业阈值文件。
 *
 * 安全约束:
 *   - 同 key 纠错 ≥3 次才触发
 *   - 调整幅度 ≤ ±30%
 *   - 写前备份到 _gaCorrections 数组
 *   - manifest.json 不存在 → 跳过 (degraded)
 *
 * @param actions — 进化动作列表
 * @returns 回写统计
 */
/** 专家 manifest 目录 */
const EXPERT_DIR = join(process.cwd(), "expert");

/**
 * 安全调整数值: ±30% 上限 + 防 NaN
 */
function safeAdjust(value: number, ratio: number): number {
  const clamped = Math.max(1 - MAX_CORRECTION_RATIO, Math.min(1 + MAX_CORRECTION_RATIO, ratio));
  const result = value * clamped;
  return isNaN(result) ? value : Math.round(result * 100) / 100;
}

/**
 * 读取 expert/{type}/manifest.json，返回解析结果或 null。
 */
function readExpertManifest(expertType: string): Record<string, unknown> | null {
  const path = join(EXPERT_DIR, expertType, "manifest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 回写 expert/{type}/manifest.json。
 */
function writeExpertManifest(expertType: string, data: Record<string, unknown>): boolean {
  try {
    const path = join(EXPERT_DIR, expertType, "manifest.json");
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * 记录纠错历史到 agent_memory（降级时跳过）。
 */
function logCorrection(key: string, actionType: string, details: Record<string, unknown>): void {
  try {
    const { getAgentMemoryStore } = require("../l4/agent-memory-store");
    const store = getAgentMemoryStore();
    store.remember({
      orgId: "synova",
      key: `ga-correction-${key}-${Date.now()}`,
      value: JSON.stringify({ actionType, ...details }),
      type: "fact",
      confidence: 0.7,
      source: "ga_correction",
      tags: ["ga_correction", actionType],
      expiresAt: null,
      status: "active",
    });
  } catch { /* 降级 — 不阻断 */ }
}

// ═══ 各类型处理函数 ═══

function applyThresholdAdjust(action: EvolutionAction, result: ApplyActionResult): void {
  const sentinelKey = action.parameter.sentinelKey as string | undefined;
  const adjustPercent = (action.parameter.adjustPercent as number) || 5;
  const direction = action.parameter.direction === "up" ? 1 : -1;

  if (!sentinelKey) { result.skipped++; return; }
  if (!existsSync(EXTENSIONS_DIR)) { result.skipped++; return; }

  const industries = readdirSync(EXTENSIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  let found = false;

  for (const industry of industries) {
    const thresholdPath = join(EXTENSIONS_DIR, industry.name, "thresholds.json");
    if (!existsSync(thresholdPath)) continue;

    let config: Record<string, unknown>;
    try { config = JSON.parse(readFileSync(thresholdPath, "utf-8")) as Record<string, unknown>; }
    catch { continue; }

    const overrides = config.thresholdOverrides as Record<string, unknown> | undefined;
    if (!overrides || !overrides[sentinelKey]) continue;

    const entry = overrides[sentinelKey] as Record<string, number>;
    if (!entry || typeof entry.warning !== "number") continue;

    const corrections = (config._gaCorrections as Array<Record<string, unknown>>) || [];
    const sameKey = corrections.filter((c) => c.key === sentinelKey && c.direction === action.parameter.direction);

    if (sameKey.length < MIN_TRIGGER_COUNT - 1) {
      corrections.push({
        key: sentinelKey, direction: action.parameter.direction, adjustPercent,
        triggeredAt: action.triggeredAt, applied: false,
        reason: `pending — ${sameKey.length + 1}/${MIN_TRIGGER_COUNT} corrections needed`,
      });
      config._gaCorrections = corrections;
      writeFileSync(thresholdPath, JSON.stringify(config, null, 2), "utf-8");
      result.skipped++; found = true;
      continue;
    }

    const count = sameKey.length + 1;
    const ratio = 1 + direction * (adjustPercent / 100) * (Math.min(count, 3) / 3);
    const oldW = entry.warning;
    const oldC = entry.critical;
    entry.warning = safeAdjust(oldW, ratio);
    entry.critical = safeAdjust(oldC, ratio);
    corrections.push({
      key: sentinelKey, direction: action.parameter.direction, adjustPercent,
      triggeredAt: action.triggeredAt, applied: true,
      previousWarning: oldW, previousCritical: oldC,
      newWarning: entry.warning, newCritical: entry.critical,
    });
    config._gaCorrections = corrections;
    writeFileSync(thresholdPath, JSON.stringify(config, null, 2), "utf-8");
    log.info({ sentinelKey, industry: industry.name, warning: `${oldW}→${entry.warning}` }, "GA 阈值调整已回写");
    result.applied++; found = true;
    break;
  }

  if (!found) result.skipped++;
}

function applyGoalFormulaTweak(action: EvolutionAction, result: ApplyActionResult): void {
  const goalType = action.parameter.goalType as string | undefined;
  const weightAdjust = action.parameter.weightAdjust as number | undefined;
  if (!goalType || weightAdjust == null) { result.skipped++; return; }

  // Goal 公式调整写入 agent_memory（当前无 Goal 配置文件）
  logCorrection(goalType, action.type, { weightAdjust, reason: action.reason, triggeredAt: action.triggeredAt });
  log.info({ goalType, weightAdjust }, "GA Goal 公式调整已记录 (agent_memory)");
  result.applied++;
}

function applyPathRankDowngrade(action: EvolutionAction, result: ApplyActionResult): void {
  const pathKey = action.parameter.pathKey as string | undefined;
  const rankAdjust = action.parameter.rankAdjust as number | undefined;
  if (!pathKey || rankAdjust == null) { result.skipped++; return; }

  // 路径排名降级写入 agent_memory（当前无路径配置文件）
  logCorrection(pathKey, action.type, { rankAdjust, reason: action.reason, triggeredAt: action.triggeredAt });
  log.info({ pathKey, rankAdjust }, "GA 路径排名降级已记录 (agent_memory)");
  result.applied++;
}

function applyExpertConfidenceDowngrade(action: EvolutionAction, result: ApplyActionResult): void {
  const expertKey = action.parameter.expertKey as string | undefined;
  const confidenceAdjust = action.parameter.confidenceAdjust as number | undefined;
  if (!expertKey || confidenceAdjust == null) { result.skipped++; return; }

  // 读取 expert manifest，调整 priority 或添加 confidencePenalty
  const manifest = readExpertManifest(expertKey);
  if (!manifest) {
    // manifest 不存在 → 回退到 agent_memory
    logCorrection(expertKey, action.type, { confidenceAdjust, reason: action.reason, triggeredAt: action.triggeredAt, degraded: true });
    log.warn({ expertKey }, "专家 manifest 不存在 — 置信度降级写入 agent_memory");
    result.applied++;
    return;
  }

  // 记录 _gaCorrections + 调整 priority
  const corrections = (manifest._gaCorrections as Array<Record<string, unknown>>) || [];
  const sameKey = corrections.filter((c) => c.key === expertKey);

  if (sameKey.length < MIN_TRIGGER_COUNT - 1) {
    corrections.push({
      key: expertKey, confidenceAdjust, triggeredAt: action.triggeredAt, applied: false,
      reason: `pending — ${sameKey.length + 1}/${MIN_TRIGGER_COUNT} corrections needed`,
    });
    manifest._gaCorrections = corrections;
    writeExpertManifest(expertKey, manifest);
    result.skipped++;
    return;
  }

  const oldPriority = manifest.priority;
  const ratio = 1 + confidenceAdjust;
  const newPriority = safeAdjust(
    typeof oldPriority === "number" ? oldPriority : 0.5,
    Math.max(1 + MAX_CORRECTION_RATIO, Math.min(1 - MAX_CORRECTION_RATIO, ratio)),
  );
  manifest.priority = newPriority;

  corrections.push({
    key: expertKey, confidenceAdjust, triggeredAt: action.triggeredAt, applied: true,
    previousPriority: oldPriority, newPriority,
  });
  manifest._gaCorrections = corrections;
  writeExpertManifest(expertKey, manifest);
  log.info({ expertKey, priority: `${oldPriority}→${newPriority}` }, "GA 专家置信度已调整");
  result.applied++;
}

// ═══ 主入口: 按类型分发 ═══

export function applyEvolutionActions(actions: EvolutionAction[]): ApplyActionResult {
  const result: ApplyActionResult = { applied: 0, skipped: 0, errors: [] };

  if (!actions || actions.length === 0) return result;

  for (const action of actions) {
    try {
      switch (action.type) {
        case "threshold_adjust":
          applyThresholdAdjust(action, result);
          break;
        case "goal_formula_tweak":
          applyGoalFormulaTweak(action, result);
          break;
        case "path_rank_downgrade":
          applyPathRankDowngrade(action, result);
          break;
        case "expert_confidence_downgrade":
          applyExpertConfidenceDowngrade(action, result);
          break;
        default:
          result.skipped++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, type: action.type }, "applyEvolutionAction 异常 — 跳过");
      result.errors.push(msg);
      result.skipped++;
    }
  }

  if (result.applied > 0) {
    log.info({ applied: result.applied, skipped: result.skipped }, "进化动作回写完成");
  }

  return result;
}
