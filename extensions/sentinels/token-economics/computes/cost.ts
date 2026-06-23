/**
 * TokenEconomics — Token 成本核算
 * 纯计算函数。核算 LLM Token 消耗成本。从 engine-core/token-economics.ts 提取算法重写。
 * 零 engine-core import。通过 L4 GraphStore FINANCIAL 节点获取 Token 账户数据。
 */
import type { GraphStoreReader } from '../../../shared/baseline';

// 默认模型定价 (USD/1M tokens)
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'deepseek-v3': { input: 0.27, output: 1.10 },
  'deepseek-r1': { input: 0.55, output: 2.19 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
};

export async function computeTokenCost(store: GraphStoreReader, teamId: string): Promise<{ value: number; threshold: string; metadata: Record<string, unknown> }> {
  // 查询 FINANCIAL 节点中的 token_account 类型
  const financialNodes = store.queryNodes('Financial', { teamId });
  const tokenAccounts = financialNodes.filter(n => n.props.financialType === 'token_account');

  let totalCost = 0;
  let totalTokens = 0;
  const breakdown: Record<string, { cost: number; tokens: number }> = {};

  for (const account of tokenAccounts) {
    const model = (account.props.model as string) || 'unknown';
    const inputTokens = (account.props.inputTokens as number) || 0;
    const outputTokens = (account.props.outputTokens as number) || 0;
    const pricing = MODEL_PRICES[model] || { input: 1, output: 5 }; // default pricing

    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    totalCost += cost;
    totalTokens += inputTokens + outputTokens;
    breakdown[model] = { cost, tokens: inputTokens + outputTokens };
  }

  // 阈值：月成本 > $1000 = warning, > $5000 = critical
  return {
    value: totalCost,
    threshold: totalCost > 5000 ? 'critical' : totalCost > 1000 ? 'warning' : 'ok',
    metadata: { totalCost, totalTokens, breakdown, accountCount: tokenAccounts.length },
  };
}
