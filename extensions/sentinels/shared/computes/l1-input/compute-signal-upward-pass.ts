/**
 * compute-signal-upward-pass.ts — 被动信号向上传递 (0.2)
 *
 * @contract COMPUTE-SIGNAL-UPWARD-PASS-v1 SignalUpwardPassInput {value,confidence,evidence,degraded,warnings} nLayers<=0
 * 模块: l1-input/signal_upward_pass
 * 消费边: SIGNAL_UPWARD_PASS
 * 输入: upwardFilterLoss(0-1), nLayers(正整数)
 * 输出(正常): { value: 信号保真度, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['层级数为0'] }
 *
 * 算法: signal_fidelity = 1 - upward_filter_loss^n_layers
 */
export interface SignalUpwardPassInput {
  upwardFilterLoss: number;  // 每层过滤损失(0-1)
  nLayers: number;           // 组织层级数
}

export function computeSignalUpwardPass(input: SignalUpwardPassInput) {
  const warnings: string[] = [];
  const { upwardFilterLoss, nLayers } = input;

  if (nLayers <= 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['层级数nLayers<=0 — 无法计算信号传递'],
    };
  }

  const clampedLoss = Math.max(0, Math.min(1, upwardFilterLoss));

  // 信号保真度: 经过n层后的剩余信号比例
  const signalFidelity = 1 - Math.pow(clampedLoss, nLayers);
  const value = Math.round(signalFidelity * 1000) / 1000;
  const confidence = nLayers <= 3 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`upwardFilterLoss: ${clampedLoss}`, `nLayers: ${nLayers}`, `fidelity: ${value}`],
    degraded: false,
    warnings,
  };
}
