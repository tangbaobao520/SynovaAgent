/**
 * compute-learning-rate.ts — 累积学习率计算（Wright's Law）
 *
 * 契约ID: COMPUTE-LEARNING-RATE-v1
 * 模块: l2-value
 * 消费边: CUMULATIVE_LEARNING
 * 输入: unitCostT0(number), unitCostT(number), cumulativeOutput(number), routineRigidity?(number 0-1)
 * 输出(正常): { learningRate, experienceElasticity, routineRigidity, confidence, evidence, degraded:false }
 * 输出(降级): { learningRate:0, ... degraded:true, warnings:['...'] }
 *
 * 计算公式:
 *   Wright's Law（线性化）:
 *   unit_cost_t = unit_cost_t0 * cumulative_output^(-learning_rate)
 *   => learning_rate = log(unit_cost_t0 / unit_cost_t) / log(cumulative_output)
 *   => experience_elasticity = 2^(-learning_rate) — 累计产出翻倍时的成本下降比例
 *
 * 降级条件:
 *   - cumulative_output < 2 → 无法取log → degraded:true + "累计产出<2"
 *   - unitCostT0 <= 0 或 unitCostT <= 0 → degraded:true + "成本数据无效"
 *   - learning_rate < 0 → 成本上升（非学习，可能是遗忘或通胀）→ degraded:true + 警告
 */

export interface LearningRateInput {
  unitCostT0: number;          // 初始单位成本
  unitCostT: number;           // 当前单位成本
  cumulativeOutput: number;    // 累计产出量
  routineRigidity?: number;    // 惯例刚性参数(0-1)
}

export interface LearningRateResult {
  learningRate: number;              // Wright's Law学习率
  experienceElasticity: number;     // 累计产出翻倍时的成本下降比例
  routineRigidity: number;           // 惯例刚性参数
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
}

export function computeLearningRate(input: LearningRateInput): LearningRateResult {
  const warnings: string[] = [];
  const { unitCostT0, unitCostT, cumulativeOutput } = input;
  const routineRigidity = input.routineRigidity ?? 0.5;

  // 降级：无效输入
  if (cumulativeOutput < 2) {
    return {
      learningRate: 0, experienceElasticity: 0, routineRigidity,
      confidence: 'low', evidence: [], degraded: true,
      warnings: [`累计产出${cumulativeOutput}<2，无法计算学习率`],
    };
  }
  if (unitCostT0 <= 0 || unitCostT <= 0) {
    return {
      learningRate: 0, experienceElasticity: 0, routineRigidity,
      confidence: 'low', evidence: [], degraded: true,
      warnings: [`成本数据无效: unitCostT0=${unitCostT0}, unitCostT=${unitCostT}`],
    };
  }

  // Wright's Law: learning_rate = log(unitCostT0/unitCostT) / log(cumulativeOutput)
  const learningRate = Math.log(unitCostT0 / unitCostT) / Math.log(cumulativeOutput);

  // experience_elasticity: 累计产出翻倍时的成本下降比例
  // 如果 cumulative_output 翻倍：unit_cost_doubled = unit_cost_t0 * (2*cumulative_output)^(-lr)
  // => 下降比例 = 1 - 2^(-lr)
  const experienceElasticity = 1 - Math.pow(2, -learningRate);

  const evidence: string[] = [
    `unitCostT0=${unitCostT0}, unitCostT=${unitCostT}`,
    `cumulativeOutput=${cumulativeOutput}`,
    `learningRate=${learningRate.toFixed(4)}`,
    `experienceElasticity=${experienceElasticity.toFixed(4)}`,
  ];

  // 检测惯例刚性阻碍学习
  if (routineRigidity > 0.8 && learningRate < 0.05) {
    warnings.push('惯例刚性高(>0.8)且学习率低(<0.05)——惯例刚性可能阻碍了学习');
  }

  // 负学习率 = 成本上升
  const degraded = learningRate < 0;
  if (degraded) {
    warnings.push(`学习率为负(${learningRate.toFixed(4)})——成本在上升，非学习效应`);
  }

  const confidence = cumulativeOutput >= 10000 ? 'high' : cumulativeOutput >= 100 ? 'medium' : 'low';

  return {
    learningRate: Math.round(learningRate * 10000) / 10000,
    experienceElasticity: Math.round(experienceElasticity * 10000) / 10000,
    routineRigidity,
    confidence,
    evidence,
    degraded,
    warnings,
  };
}
