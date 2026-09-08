/**
 * llm/token-meter.ts — token 四桶计量 + 成本护栏（D598，DSH 借鉴卡 B-03）
 *
 * 借鉴 DSH token-meter（读源码自研，零 DSH 包依赖——不引包不拷码，G1/G4）:
 *   - 四桶 disjoint 口径（projection.ts）: uncachedInput / output / cacheRead / cacheWrite，
 *     reasoning 已含在 output，不重复计。
 *   - DeepSeek 归一（llm-deepseek translate.js mapUsage）: prompt_tokens 含 cache 命中
 *     （prompt_tokens = prompt_cache_hit_tokens + miss），四桶拆分时须从 promptTokens 减出 cacheRead。
 *   - 固定密度启发式估算（estimate.ts）: CHARS_PER_TOKEN=4 + 块/角色结构开销，码点计数
 *     （中文/emoji 代理对不拆）。
 *
 * 成本治理对象 = 推理层（问题域专家 LLM）+ 主持层（host LLM）；计算层（哨兵 compute）不跑
 * LLM，不入四桶（专家架构权威第六章 §6.1/§6.2）。
 *
 * 契约（铁律 47）:
 *   @input  — ProviderUsageLike（providers/types.ts ChatResult.usage 同形）或 undefined
 *   @output — TokenUsageBuckets 四桶（全为非负整数）/ TokenMeterSnapshot 报表 /
 *             BudgetCheckResult（warn/exceed 双阈值）/ CostSignalPayload（告警载荷）
 *   @degraded — 非法数值（NaN/负数/undefined）→ 按桶清零或 missingUsageCount 计数，不抛；
 *             预算配置非法（≤0/非有限）→ degraded:true 且不判超限（铁律 24/31 显式传播）
 *
 * 导出面说明（spec §3.2 回填）: 生产消费导出仅 TokenMeter/bucketsFrom/checkBudget/
 * buildCostFinding/estimateMessageTokens（src/routes/diagnosis.ts 逐个真实调用，组 4 接线）；
 * estimateTextTokens/sumBuckets/usageTokens 与密度常量为模块内部函数（经导出函数的行为
 * 断言锁定取值），不设测试专用导出（D587 组 4 收窄先例）。
 */

// ═══ 四桶词汇（disjoint） ═══

/** 一次（或聚合的）LLM 用量四桶。四桶互斥：uncachedInput 不含 cache 流量，reasoning 已含在 output。 */
export interface TokenUsageBuckets {
  /** 未命中缓存的输入 token（DeepSeek promptTokens 减出 cacheRead 后的差值） */
  uncachedInputTokens: number;
  /** 输出 token（含 reasoning，不重复计） */
  outputTokens: number;
  /** 缓存读取命中（DeepSeek prompt_tokens_details.cached_tokens ?? prompt_cache_hit_tokens） */
  cacheReadTokens: number;
  /** 缓存写入（DeepSeek 不上报；供显式断点缓存的 provider 使用） */
  cacheWriteTokens: number;
}

/** provider 上报的用量（providers/types.ts ChatResult.usage 同形，结构化内联不跨模块 import） */
export interface ProviderUsageLike {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// ═══ 固定密度启发式（模块内部 —— 取值经导出函数的行为断言锁定） ═══

/** 固定文本密度估算，直到需要精确分词为止。 */
const CHARS_PER_TOKEN = 4;

/** 每内容块的结构开销（JSON 框架 + 类型标签）。 */
const BLOCK_OVERHEAD = 4;

/** 每条消息的 role 字段框架开销。 */
const ROLE_OVERHEAD = 4;

/** 预算默认值（对齐 src/agent/cost-budget.ts cumulativeBudget 500K，spec §4.5 决策点 3） */
const DEFAULT_BUDGET_TOKENS = 500_000;
const DEFAULT_WARN_RATIO = 0.8;
const DEFAULT_EXCEED_RATIO = 1.0;

/**
 * 固定密度启发式估算一段文本：码点计数（中文/emoji 代理对不拆，非 UTF-16 length），
 * 每块附加 BLOCK_OVERHEAD 结构开销。空串仍计结构开销（框架本身占位）。
 */
function estimateTextTokens(text: string): number {
  const codePoints = [...text].length;
  return Math.ceil(codePoints / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
}

/**
 * 固定密度启发式估算一条模型可见消息：内容密度 + ROLE_OVERHEAD。
 * @param message — 仅需 role/content 形状（LLMMessage 结构化内联）
 */
export function estimateMessageTokens(message: { role: string; content: string }): number {
  return estimateTextTokens(message.content) + ROLE_OVERHEAD;
}

// ═══ 四桶归一 / 求和（模块内部纯函数） ═══

/** 非法数值（非 number/NaN/负数）→ 0（降级语义，不抛）。 */
function finiteNonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * provider 用量 → 四桶 disjoint 归一。DeepSeek 口径: promptTokens 含 cacheRead，
 * 故 uncachedInput = promptTokens − cacheRead（cacheRead 截断到 [0, promptTokens]，
 * 敌意入参不越界）。非法字段按桶清零，不抛（铁律 24）。
 */
export function bucketsFrom(usage: ProviderUsageLike | undefined | null): TokenUsageBuckets {
  const prompt = finiteNonNegative(usage?.promptTokens);
  const output = finiteNonNegative(usage?.completionTokens);
  const cacheRead = Math.min(finiteNonNegative(usage?.cacheReadTokens), prompt);
  const cacheWrite = finiteNonNegative(usage?.cacheWriteTokens);
  return {
    uncachedInputTokens: prompt - cacheRead,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  };
}

/** 逐桶相加（disjoint 求和不双计）。 */
function sumBuckets(list: TokenUsageBuckets[]): TokenUsageBuckets {
  const total: TokenUsageBuckets = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const b of list) {
    total.uncachedInputTokens += b.uncachedInputTokens;
    total.outputTokens += b.outputTokens;
    total.cacheReadTokens += b.cacheReadTokens;
    total.cacheWriteTokens += b.cacheWriteTokens;
  }
  return total;
}

/** 四桶总和（本卡预算判定的消耗口径：读+写+输入+输出全计）。 */
function usageTokens(buckets: TokenUsageBuckets): number {
  return buckets.uncachedInputTokens + buckets.outputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens;
}

// ═══ TokenMeter —— consult 管线聚合器 ═══

/** 计量配置（预算可经构造参数覆盖；不改全局 config，spec §4.5 决策点 3） */
export interface TokenMeterConfig {
  budgetTokens?: number;
  warnRatio?: number;
  exceedRatio?: number;
}

/** 四桶报表快照（诊断报告 tokenUsage 字段的数据源） */
export interface TokenMeterSnapshot {
  totals: TokenUsageBuckets;
  /** 四桶总和 */
  totalTokens: number;
  /** record 调用次数（= LLM 请求数） */
  requestCount: number;
  /** 其中 provider 未上报可用 usage 的次数 */
  missingUsageCount: number;
  /**  true = 没有任何一次请求提供可用 usage（铁律 31 显式降级标记） */
  degraded: boolean;
  /** 按模型分桶的四桶报表 */
  byModel: Record<string, TokenUsageBuckets>;
}

/**
 * consult 管线的四桶计量器。每次 LLM 调用 record 一次，结束 snapshot 出四桶报表。
 * 用量经 bucketsFrom 归一（DeepSeek cache 命中从 promptTokens 减出，保持 disjoint）。
 */
export class TokenMeter {
  private totals: TokenUsageBuckets = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  private byModel = new Map<string, TokenUsageBuckets>();
  private requestCount = 0;
  private missingUsageCount = 0;
  readonly budgetTokens: number;
  readonly warnRatio: number;
  readonly exceedRatio: number;

  constructor(config?: TokenMeterConfig) {
    this.budgetTokens = config?.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
    this.warnRatio = config?.warnRatio ?? DEFAULT_WARN_RATIO;
    this.exceedRatio = config?.exceedRatio ?? DEFAULT_EXCEED_RATIO;
  }

  /**
   * 记录一次 LLM 调用的 usage。usage 缺失或 promptTokens/completionTokens 非有限数
   * → missingUsageCount 计数并跳过累计（降级不抛，铁律 24/31）。
   * @param usage — provider 返回的用量；可为 undefined/null（provider 不上报时）
   * @param model — 按 model 分桶报表；缺省落 'unknown' 桶
   */
  record(usage: ProviderUsageLike | undefined | null, model?: string): void {
    this.requestCount += 1;
    const usable = usage !== undefined && usage !== null
      && typeof usage.promptTokens === 'number' && Number.isFinite(usage.promptTokens)
      && typeof usage.completionTokens === 'number' && Number.isFinite(usage.completionTokens);
    if (!usable) {
      this.missingUsageCount += 1;
      return;
    }
    const buckets = bucketsFrom(usage);
    this.totals = sumBuckets([this.totals, buckets]);
    const key = model !== undefined && model.length > 0 ? model : 'unknown';
    const prev = this.byModel.get(key);
    this.byModel.set(key, prev === undefined ? buckets : sumBuckets([prev, buckets]));
  }

  /** 四桶报表快照。degraded = 0 次请求或全部请求均无可用 usage。 */
  snapshot(): TokenMeterSnapshot {
    const byModel: Record<string, TokenUsageBuckets> = {};
    for (const [model, buckets] of this.byModel) {
      byModel[model] = { ...buckets };
    }
    return {
      totals: { ...this.totals },
      totalTokens: usageTokens(this.totals),
      requestCount: this.requestCount,
      missingUsageCount: this.missingUsageCount,
      degraded: this.requestCount - this.missingUsageCount === 0,
      byModel,
    };
  }
}

// ═══ 预算护栏（warn/exceed 双阈值 + projectedTokens 外推） ═══

export interface BudgetCheckInput {
  /** 已消耗四桶 */
  totals: TokenUsageBuckets;
  /** 预算上限（token）；≤0 或非有限 → degraded 不判超限 */
  budgetTokens: number;
  warnRatio?: number;
  exceedRatio?: number;
  /** 外推增量（下一请求的启发式估算，如 estimateMessageTokens 产物）——projectedTokens 外推 */
  projectedAdditionalTokens?: number;
}

export interface BudgetCheckResult {
  /** 达到 warn 阈值（默认 0.8）且未超限 */
  warn: boolean;
  /** 达到超限阈值（默认 1.0，按 projectedTokens 判定） */
  exceeded: boolean;
  spentTokens: number;
  /** 消耗 + 外推增量 */
  projectedTokens: number;
  budgetTokens: number;
  /** projectedTokens / budgetTokens（预算非法时为 0） */
  usageRatio: number;
  /** true = 预算配置非法，护栏未生效（铁律 31 显式传播） */
  degraded: boolean;
}

/**
 * 预算判定（纯函数，对齐 cost-budget.ts warn 0.8 / block 1.0 语义）。
 * 判定基于 projectedTokens = 实报消耗 + 外推增量；exceeded 优先，warn 仅在未超限时为真。
 */
export function checkBudget(input: BudgetCheckInput): BudgetCheckResult {
  const spentTokens = usageTokens(input.totals);
  const additional = input.projectedAdditionalTokens !== undefined
    && Number.isFinite(input.projectedAdditionalTokens) && input.projectedAdditionalTokens > 0
    ? input.projectedAdditionalTokens
    : 0;
  const projectedTokens = spentTokens + additional;
  const budget = input.budgetTokens;
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0) {
    return { warn: false, exceeded: false, spentTokens, projectedTokens, budgetTokens: budget, usageRatio: 0, degraded: true };
  }
  const exceeded = projectedTokens >= budget * (input.exceedRatio ?? DEFAULT_EXCEED_RATIO);
  const warn = !exceeded && projectedTokens >= budget * (input.warnRatio ?? DEFAULT_WARN_RATIO);
  return { warn, exceeded, spentTokens, projectedTokens, budgetTokens: budget, usageRatio: projectedTokens / budget, degraded: false };
}

// ═══ 成本告警构造（内联 SentinelFinding 输入形状，不 import src/sentinel） ═══

export type CostSeverityLabel = 'emergency' | 'critical' | 'warning';

/** 成本告警构造输入（teamId 即 orgId；severe 度按消耗/预算比映射） */
export interface CostFindingInput {
  teamId: string;
  totals: TokenUsageBuckets;
  totalTokens: number;
  budgetTokens: number;
  consultId?: string;
  /** true = 超限判定含启发式外推成分（置信度降为 90，诚实标注估算成分） */
  projected?: boolean;
}

/**
 * 成本告警载荷 —— 结构兼容 src/agent/sentinel-service.ts injectManualSignal 的
 * GaManualSignalInput 形状（signalType/title/description/severity 1-10/confidence
 * 0-100/gaId/orgId + 关联节点），内联声明不 import src/sentinel（DSH 线地盘零耦合）。
 */
export interface CostSignalPayload {
  signalType: '成本预算超限';
  title: string;
  description: string;
  /** 严重度 1-10: ceil(消耗/预算 × 5)，下限 4（超限至少 warning）、上限 10 */
  severity: number;
  /** ≥9 emergency / ≥7 critical / 其余 warning（spec §4.5 决策点 2 映射） */
  severityLabel: CostSeverityLabel;
  confidence: number;
  /** 四桶 + 预算事实明细（key=value，供告警审计） */
  evidence: string[];
  gaId: string;
  orgId: string;
  relatedNodes: string[];
}

/**
 * 构造成本预算超限告警载荷（纯函数）。
 * severity = min(10, max(4, ceil((totalTokens/budgetTokens) × 5)))，
 * 例: ratio 1.02 → 6 warning / 1.4 → 7 critical / 1.8 → 9 emergency。
 */
export function buildCostFinding(input: CostFindingInput): CostSignalPayload {
  const divisor = input.budgetTokens > 0 ? input.budgetTokens : 1;
  const ratio = input.totalTokens / divisor;
  const severity = Math.min(10, Math.max(4, Math.ceil(ratio * 5)));
  const severityLabel: CostSeverityLabel = severity >= 9 ? 'emergency' : severity >= 7 ? 'critical' : 'warning';
  const scope = input.consultId !== undefined ? `（${input.consultId}）` : '';
  return {
    signalType: '成本预算超限',
    title: `诊断 token 预算超限${scope}`,
    description: `诊断消耗 ${input.totalTokens} tokens，超出预算 ${input.budgetTokens}（ratio ${ratio.toFixed(2)}）。`
      + ` 四桶: uncachedInput=${input.totals.uncachedInputTokens} output=${input.totals.outputTokens}`
      + ` cacheRead=${input.totals.cacheReadTokens} cacheWrite=${input.totals.cacheWriteTokens}。`,
    severity,
    severityLabel,
    confidence: input.projected === true ? 90 : 100,
    evidence: [
      `uncachedInputTokens=${input.totals.uncachedInputTokens}`,
      `outputTokens=${input.totals.outputTokens}`,
      `cacheReadTokens=${input.totals.cacheReadTokens}`,
      `cacheWriteTokens=${input.totals.cacheWriteTokens}`,
      `totalTokens=${input.totalTokens}`,
      `budgetTokens=${input.budgetTokens}`,
    ],
    gaId: 'cost-guardrail',
    orgId: input.teamId,
    relatedNodes: input.consultId !== undefined ? [input.consultId] : [],
  };
}
