/**
 * compute-sensing-calibration.ts — 感知经验的内化 (0.4 二阶)
 *
 * 契约ID: COMPUTE-SENSING-CALIBRATION-v1
 * 模块: l1-input/sensing_calibration
 * 消费边: SENSING_CALIBRATION
 * 输入: learningFromPastMisjudgments(0-1), forgettingRate(0-1)
 * 输出(正常): { value: 校准效果, confidence, evidence[], degraded:false }
 * 输出(降级): { value:0, confidence:'low', degraded:true, warnings:['无历史感知记录'] }
 *
 * 算法: learning × (1 - forgetting_rate)
 */
export interface SensingCalibrationInput {
  learningFromPastMisjudgments: number;  // 从过往误判中学习(0-1), -1=无历史
  forgettingRate: number;                // 遗忘率(0-1)
}

export function computeSensingCalibration(input: SensingCalibrationInput) {
  const warnings: string[] = [];
  const { learningFromPastMisjudgments, forgettingRate } = input;

  if (learningFromPastMisjudgments < 0) {
    return {
      value: 0, confidence: 'low' as const, evidence: [],
      degraded: true, warnings: ['无历史感知记录 — learningFromPastMisjudgments未配置'],
    };
  }

  const clampedLearning = Math.max(0, Math.min(1, learningFromPastMisjudgments));
  const clampedForgetting = Math.max(0, Math.min(1, forgettingRate));

  const calibrationEffect = clampedLearning * (1 - clampedForgetting);
  const value = Math.round(calibrationEffect * 1000) / 1000;
  const confidence = clampedForgetting < 0.3 ? 'high' as const : 'medium' as const;

  return {
    value,
    confidence,
    evidence: [`learning: ${clampedLearning}`, `forgettingRate: ${clampedForgetting}`],
    degraded: false,
    warnings,
  };
}
