/**
 * compute-environmental-scan.ts — 主动扫描外部环境 (0.1)
 *
 * 契约ID: COMPUTE-ENVIRONMENTAL-SCAN-v1
 * 模块: l1-input/environmental_scan
 * 消费边: ENVIRONMENTAL_SCAN
 * 输入: scanBreadth(0-1), scanDepth(0-1), filterBias(0-1)
 * 输出(正常): { value: 扫描有效性, confidence:'high'|'medium', evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无外部数据源'] }
 *
 * 算法: scan_breadth × scan_depth × (1 - filter_bias)
 */
export interface EnvironmentalScanInput {
  scanBreadth: number;    // 扫描广度(0-1), -1=未配置
  scanDepth: number;      // 扫描深度(0-1), -1=未配置
  filterBias: number;     // 过滤偏差(0-1)
}

export function computeEnvironmentalScan(input: EnvironmentalScanInput) {
  const warnings: string[] = [];
  const { scanBreadth, scanDepth, filterBias } = input;

  if (scanBreadth < 0 || scanDepth < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无外部数据源 — scanBreadth或scanDepth未配置'],
    };
  }

  const clampedBreadth = Math.max(0, Math.min(1, scanBreadth));
  const clampedDepth = Math.max(0, Math.min(1, scanDepth));
  const clampedBias = Math.max(0, Math.min(1, filterBias));

  const value = Math.round(clampedBreadth * clampedDepth * (1 - clampedBias) * 1000) / 1000;
  const confidence = value > 0.5 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`scanBreadth: ${clampedBreadth}`, `scanDepth: ${clampedDepth}`, `filterBias: ${clampedBias}`],
    degraded: false,
    warnings,
  };
}
