/**
 * diagnosis/token-economics.ts — Token 经济学 (ARCH-07 补充)
 *
 * Token 是人+Agent 组织的第四成本维度（非人力、非设备、非软件）。
 * 本模块独立核算 Token 消耗，并将浪费归因到诊断维度。
 *
 * 当前版本：基于 collaboration-collector 统计数据估算。
 * 后续版本：从 Gateway LLM API 日志精确计量。
 *
 * 数据源融合（ARCH-23）：
 * - 估算层：collaboration-collector 事件统计 + FinancialBaseline 模型定价
 * - 图层：SOG 图 Financial 节点（仅 token_account 类型）
 *   Token 经济学只关注 LLM Token 成本——revenue、cost、cost_center
 *   类型的 Financial 节点交付给 financial-impact 模块处理，此处忽略。
 */

import type {
  TokenEconomicsReport,
  TokenSourceBreakdown,
  TokenWasteBreakdown,
  FinancialBaseline,
} from './types';
import { getAllStats, getRecentEvents } from '../collaboration-collector';
import { computeIPU } from './ipu-overload';

// ====================================================================
// Types
// ====================================================================

/** Minimal SOG graph Financial node shape — avoids full import from graph-store. */
export interface FinancialNodeInput {
  type: string;
  props: Record<string, unknown>;
}

// ====================================================================
// Default pricing for common models (USD per 1M tokens, May 2026)
// ====================================================================

const DEFAULT_MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4.1': { input: 1.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.10, output: 0.40 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-opus-4-7': { input: 15.00, output: 75.00 },
  'deepseek-v3': { input: 0.27, output: 1.10 },
  'deepseek-r1': { input: 0.55, output: 2.19 },
};

// ====================================================================
// Token estimation (per collaboration event → approximate Token consumption)
// ====================================================================

const AVG_TOKENS_PER_EVENT = 2000;   // ~2K tokens per collaboration event
const AVG_TOKENS_PER_RETRY = 1500;  // ~1.5K tokens per retry/rewrite

// ====================================================================
// Public API
// ====================================================================

/**
 * Compute Token economics report for a team.
 *
 * Two-tier data sourcing (ARCH-23):
 * - Tier 1 (estimation): collaboration event statistics + model pricing
 * - Tier 2 (graph): SOG graph Financial nodes with financialType = 'token_account'
 *   Provides actual tracked costs from the organization's knowledge graph.
 *   Revenue, cost, and cost_center Financial nodes are explicitly excluded —
 *   those belong to the financial-impact module, not token economics.
 *
 * @param teamId - Team identifier
 * @param baseline - Financial baseline with model pricing
 * @param financialNodes - Optional SOG graph Financial nodes (only token_account type is processed)
 * @returns Token economics report or null if no data
 */
export function computeTokenEconomics(
  teamId: string,
  baseline?: Partial<FinancialBaseline>,
  financialNodes?: ReadonlyArray<FinancialNodeInput>,
): TokenEconomicsReport | null {
  // ── 0. Filter Financial nodes: token_account only ──
  // Token economics is specifically for LLM token cost tracking.
  // Revenue, cost, and cost_center Financial nodes are for financial-impact,
  // not token economics — they are explicitly excluded here.
  const tokenAccountNodes = (financialNodes ?? []).filter(
    (n) => n.type === 'Financial' && n.props?.financialType === 'token_account',
  );

  const stats = getAllStats();
  const allDimensions = Object.values(stats);
  if (allDimensions.length === 0) return null;

  const now = new Date();
  const period = {
    start: new Date(now.getTime() - 30 * 86400000).toISOString(),
    end: now.toISOString(),
  };

  // ── 1. Total Token estimation ──
  let totalEvents = 0;
  let totalInterventions = 0;
  let totalEscalated = 0;
  let totalDeadlocked = 0;
  let totalResolved = 0;
  for (const dim of allDimensions) {
    totalEvents += dim.totalEvents;
    totalInterventions += dim.humanInterventions;
    totalEscalated += dim.outcomes.escalated;
    totalDeadlocked += dim.outcomes.deadlocked;
    totalResolved += dim.outcomes.resolved;
  }

  // Estimate: each event consumes ~2K tokens on average
  const estimatedInputTokens = Math.round(totalEvents * AVG_TOKENS_PER_EVENT * 0.3); // 30% input
  const estimatedOutputTokens = Math.round(totalEvents * AVG_TOKENS_PER_EVENT * 0.7); // 70% output
  const totalTokens = estimatedInputTokens + estimatedOutputTokens;

  // ── 2. Cost calculation ──
  const defaultPrice = baseline?.defaultTokenPricePer1M ?? 15; // ¥15/M default
  const estimatedCost = (totalTokens / 1_000_000) * defaultPrice;

  // ── 3. Source breakdown ──
  const reworkEvents = totalInterventions + totalEscalated;
  const a2aEvents = Math.round(totalEvents * 0.1); // estimate 10% agent-to-agent
  const sourceBreakdown: TokenSourceBreakdown = {
    agentReasoning: Math.round(estimatedCost * 0.6),
    hitlRework: Math.round(estimatedCost * (reworkEvents / Math.max(totalEvents, 1))),
    agentToAgent: Math.round(estimatedCost * 0.1),
    uncategorized: Math.round(estimatedCost * 0.1),
  };

  // ── 4. Waste attribution ──
  const ipuData = computeIPU(teamId);
  const overloadFactor = ipuData?.overloadScore ?? 0;
  const errorRate = totalDeadlocked / Math.max(totalEvents, 1);
  const reworkRate = reworkEvents / Math.max(totalEvents, 1);

  const wasteBreakdown: TokenWasteBreakdown = {
    trustMiscalibrationCost: Math.round(estimatedCost * reworkRate * 0.4),
    protocolMissingCost: Math.round(estimatedCost * reworkRate * 0.3),
    noCircuitBreakerCost: Math.round(estimatedCost * errorRate * 0.5),
    ipuOverloadCost: Math.round(estimatedCost * overloadFactor * 0.15),
    routingErrorCost: Math.round(estimatedCost * 0.05),
  };

  // ── 5. Efficiency metrics ──
  const avgTokensPerTask = totalEvents > 0
    ? Math.round(totalTokens / totalEvents)
    : 0;
  const reworkTokenRatio = reworkEvents / Math.max(totalEvents, 1);

  // Trend: check recent vs overall rework ratio
  const recentEvents = getRecentEvents(50);
  const recentReworks = recentEvents.filter(e =>
    e.data.humanIntervention || e.data.outcome === 'escalated' || e.data.outcome === 'deadlocked',
  ).length;
  const recentReworkRatio = recentEvents.length > 0
    ? recentReworks / recentEvents.length
    : reworkRate;
  const trend: TokenEconomicsReport['efficiency']['trend'] =
    Math.abs(reworkRate - recentReworkRatio) < 0.05 ? 'stable'
    : reworkRate > recentReworkRatio ? 'improving'
    : 'degrading';

  const decisionEvents = totalResolved + totalEscalated;
  const costPerDecision = decisionEvents > 0
    ? Math.round(estimatedCost / decisionEvents * 100) / 100
    : 0;

  // ── 6. By-model breakdown (estimated — single model for now) ──
  const resolvedModel = resolveModelPrices(baseline);

  return {
    period,
    totalTokens,
    totalCost: Math.round(estimatedCost * 100) / 100,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    byModel: [{
      modelId: resolvedModel.modelId,
      tokens: totalTokens,
      cost: Math.round(estimatedCost * 100) / 100,
      percentage: 1,
    }],
    bySource: sourceBreakdown,
    wasteBreakdown,
    efficiency: {
      avgTokensPerTask,
      reworkTokenRatio: Math.round(reworkTokenRatio * 100) / 100,
      costPerDecision,
      trend,
    },
    blindSpots: {
      shadowAIEstimated: true,
      unparsableModels: [],
    },
  };
}

// ====================================================================
// Helpers
// ====================================================================

function resolveModelPrices(baseline?: Partial<FinancialBaseline>): {
  modelId: string;
  inputPrice: number;
  outputPrice: number;
} {
  if (baseline?.modelPricing?.length) {
    const p = baseline.modelPricing[0];
    return {
      modelId: p.modelId,
      inputPrice: p.inputPricePer1M,
      outputPrice: p.outputPricePer1M,
    };
  }
  return { modelId: 'unknown', inputPrice: 2.50, outputPrice: 10.00 };
}

/** Get the approximate model pricing for a model ID. */
export function getModelPricing(modelId: string): { input: number; output: number } | null {
  // Fuzzy match
  for (const [pattern, prices] of Object.entries(DEFAULT_MODEL_PRICES)) {
    if (modelId.toLowerCase().includes(pattern.toLowerCase())) {
      return prices;
    }
  }
  return null;
}

/** Export the default model price table for configuration UI. */
export function getDefaultModelPriceTable(): Array<{
  modelId: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
}> {
  return Object.entries(DEFAULT_MODEL_PRICES).map(([modelId, prices]) => ({
    modelId,
    inputPricePer1M: prices.input,
    outputPricePer1M: prices.output,
  }));
}
