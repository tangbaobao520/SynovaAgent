/**
 * compute-scale-economy.ts — 规模经济 (Economies of Scale)
 *
 * 契约ID: COMPUTE-SCALE-ECONOMY-v1
 * 管理经济学(托马斯) Ch6 — 规模经济
 * @input costVolumePoints: Array<{volume:number, avgCost:number}>
 * @output { minEfficientScale, scaleEconomyIndex, returnsToScale }
 * @degraded costVolumePoints.length<2 -> degraded:true
 */
export interface ScaleEconomyInterpretation {
  scaleStatus: string;
  expansionAdvice: string;
  costElasticity: string;
}
export interface ScaleEconomyResult {
  minEfficientScale: number; scaleEconomyIndex: number; returnsToScale: string;
  economicInterpretation: ScaleEconomyInterpretation;
  degraded: boolean; warnings: string[];
}
export function computeScaleEconomy(costVolumePoints: Array<{ volume: number; avgCost: number }>): ScaleEconomyResult {
  const w: string[] = [];
  if (costVolumePoints.length < 2) {
    return { minEfficientScale: 0, scaleEconomyIndex: 0, returnsToScale: 'unknown',
      economicInterpretation: { scaleStatus: 'unknown', expansionAdvice: '数据不足', costElasticity: 'N/A' },
      degraded: true, warnings: ['Need >=2 data points'] };
  }
  const sorted = [...costVolumePoints].sort((a, b) => a.volume - b.volume);
  const minCost = Math.min(...sorted.map(p => p.avgCost));
  const mes = sorted.find(p => p.avgCost <= minCost * 1.05)?.volume ?? sorted[sorted.length - 1].volume;
  const first = sorted[0]; const last = sorted[sorted.length - 1];
  const costElasticity = first.volume > 0 ? (last.avgCost - first.avgCost) / first.avgCost / ((last.volume - first.volume) / first.volume) : 0;
  const returns = costElasticity < 0 ? 'increasing' : costElasticity < 0.5 ? 'constant' : 'decreasing';
  return {
    minEfficientScale: Math.round(mes * 100) / 100,
    scaleEconomyIndex: Math.round(costElasticity * 10000) / 10000,
    returnsToScale: returns,
    economicInterpretation: {
      scaleStatus: returns === 'increasing' ? '规模经济' : returns === 'constant' ? '规模报酬不变' : '规模不经济',
      expansionAdvice: returns === 'increasing' ? '继续扩张可降低平均成本' : returns === 'constant' ? '当前规模效率最优' : '扩张将推高平均成本',
      costElasticity: `${(costElasticity * 100).toFixed(1)}%`,
    }, degraded: false, warnings: w };
}
