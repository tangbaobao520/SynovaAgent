/**
 * compute-innovation-output.ts — 研发投入变为新产品/技术 (3.2)
 *
 * @contract COMPUTE-INNOVATION-OUTPUT-v1 InnovationOutputInput {value,confidence,evidence,degraded,warnings} throughputRate<0||successProbability<0
 * 模块: l3-output/innovation_output
 * 消费边: INNOVATION_OUTPUT
 * 输入: throughputRate(0-1), successProbability(0-1)
 * 输出(正常): { value: throughput_rate × success_probability, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无研发数据'] }
 *
 * 算法: throughput_rate × success_probability
 */
export interface InnovationOutputInput {
  throughputRate: number;     // 研发吞吐率(0-1), -1=未配置
  successProbability: number; // 成功概率(0-1), -1=未配置
}

export function computeInnovationOutput(input: InnovationOutputInput) {
  const warnings: string[] = [];
  const { throughputRate, successProbability } = input;

  if (throughputRate < 0 || successProbability < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无研发数据 — throughputRate或successProbability未配置'],
    };
  }

  const clampedThroughput = Math.max(0, Math.min(1, throughputRate));
  const clampedSuccess = Math.max(0, Math.min(1, successProbability));

  const value = Math.round(clampedThroughput * clampedSuccess * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`throughputRate: ${clampedThroughput}`, `successProbability: ${clampedSuccess}`],
    degraded: false,
    warnings,
  };
}
