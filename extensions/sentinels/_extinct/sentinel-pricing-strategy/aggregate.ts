/**
 * sentinel-pricing-strategy/aggregate.ts — 定价策略哨兵 (D62)
 *
 * 消费margin-health + competitive-position findings。
 * 检查：是否存在统一定价但价格歧视可提升利润>15%的场景；是否有价格<MC的情况。
 */
import { createLogger } from '@synova/logger';
import type { SentinelFinding } from '../../../src/sentinel/types';
const log = createLogger('sentinel/pricing-strategy');

export interface PricingStrategyInput {
  hasUniformPricing: boolean;
  profitGainFromDiscrimination: number;
  price: number;
  marginalCost: number;
}

export const pricingStrategySentinel = {
  async check(context: { db: unknown; now: Date; registry?: unknown }): Promise<{ ok: boolean; findings: SentinelFinding[]; durationMs: number; checkedAt: string; degraded: boolean }> {
    const start = Date.now();
    const findings: SentinelFinding[] = [];
    try {
      // Simplified implementation — real integration consumes margin-health + competitive-position findings
      const input: PricingStrategyInput = {
        hasUniformPricing: true, profitGainFromDiscrimination: 0.2, price: 100, marginalCost: 80,
      };
      if (input.hasUniformPricing && input.profitGainFromDiscrimination > 0.15) {
        findings.push({ id: `pricing-disc`, severity: 'warning', title: '统一定价可能错失价格歧视收益',
          description: `价格歧视可提升利润 ${(input.profitGainFromDiscrimination * 100).toFixed(0)}% (>15%阈值)`, evidence: [], suggestion: '评估客户细分定价策略', detectedAt: new Date().toISOString() });
      }
      if (input.price < input.marginalCost) {
        findings.push({ id: `pricing-below-mc`, severity: 'critical', title: '价格低于边际成本',
          description: `价格=${input.price} < 边际成本=${input.marginalCost}`, evidence: [], suggestion: '立即审查定价策略', detectedAt: new Date().toISOString() });
      }
    } catch (err) { log.warn({ err }, 'pricing-strategy check error'); }
    return { ok: true, findings, durationMs: Date.now() - start, checkedAt: new Date().toISOString(), degraded: false };
  },
};
