/**
 * services/llm-cost.ts — LLM Token 成本追踪
 *
 * 累计每次 LLM 调用的 token 用量，计算费用。
 * 侧边栏和状态栏读取当前值。
 */

interface CostRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
}

// 价格表 (¥ / 1M tokens) — 2026-06 DeepSeek 官方定价
const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-v4-flash':   { input: 1.0,  output: 2.0 },
  'deepseek-v4-pro':     { input: 3.1,  output: 6.2 },
  'deepseek-chat':       { input: 1.0,  output: 2.0 },  // alias
  'deepseek-reasoner':   { input: 1.0,  output: 2.0 },  // alias
  default:               { input: 1.0,  output: 2.0 },
};

class LLMCostTracker {
  private records: CostRecord[] = [];
  private sessionTotal = 0;
  private monthlyTotal = 0;

  /** 记录一次 LLM 调用 */
  record(model: string, inputTokens: number, outputTokens: number): void {
    const rec: CostRecord = { model, inputTokens, outputTokens, timestamp: Date.now() };
    this.records.push(rec);
    this.sessionTotal += this.calcCost(rec);
    this.monthlyTotal = this.calcMonthly();
  }

  /** 本次会话费用 */
  get sessionCost(): number {
    return Math.round(this.sessionTotal * 10000) / 10000;
  }

  /** 本月累计费用 (滚动 30 天) */
  get monthlyCost(): number {
    return Math.round(this.monthlyTotal * 10000) / 10000;
  }

  /** 总 token 数 */
  get totalTokens(): { input: number; output: number } {
    return {
      input: this.records.reduce((s, r) => s + r.inputTokens, 0),
      output: this.records.reduce((s, r) => s + r.outputTokens, 0),
    };
  }

  /** 当前模型 */
  get currentModel(): string {
    return process.env.LLM_MODEL || 'deepseek-v4-flash';
  }

  private calcCost(r: CostRecord): number {
    const p = PRICING[r.model] || PRICING.default;
    return (r.inputTokens / 1_000_000) * p.input + (r.outputTokens / 1_000_000) * p.output;
  }

  private calcMonthly(): number {
    const cutoff = Date.now() - 30 * 86400000;
    return this.records
      .filter(r => r.timestamp >= cutoff)
      .reduce((sum, r) => sum + this.calcCost(r), 0);
  }
}

// 全局单例
let _tracker: LLMCostTracker | null = null;
export function getCostTracker(): LLMCostTracker {
  if (!_tracker) _tracker = new LLMCostTracker();
  return _tracker;
}

/** 格式化费用显示 */
export function formatCost(cost: number): string {
  if (cost === 0) return '¥0';
  if (cost < 0.01) return `<¥0.01`;
  if (cost < 1) return `¥${cost.toFixed(2)}`;
  return `¥${cost.toFixed(2)}`;
}
