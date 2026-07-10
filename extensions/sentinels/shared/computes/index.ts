/**
 * shared/computes/index.ts — 共享计算模块统一导出 (V4.4.3)
 *
 * 15个缺口compute函数，按层分组导出。
 * 消费边均使用代码真实边名（非JTBD边名）。
 */
// l1-production
export { computeCapacityUtilization } from './l1-production/compute-capacity-utilization';
export { computeOperationPerformance } from './l1-production/compute-operation-performance';
export { computeQualityTraceability } from './l1-production/compute-quality-traceability';
export { computeMaterialAvailability } from './l1-production/compute-material-availability';
export { computeProcessCapability } from './l1-production/compute-process-capability';
export { computeSupplierPerformance } from './l1-production/compute-supplier-performance';

// l2-value
export { computeCustomerProfitability } from './l2-value/compute-customer-profitability';
export { computeChannelROI } from './l2-value/compute-channel-roi';
export { computeCustomerValueScore } from './l2-value/compute-customer-value-score';
export { computeCustomerDemandStructure } from './l2-value/compute-customer-demand-structure';
export { computeBrandROI } from './l2-value/compute-brand-roi';
export { computeCouplingStrength } from './l2-value/compute-coupling-strength';
export { computeLearningRate } from './l2-value/compute-learning-rate';

// l3-causal
export { computeShapleyAttribution } from './l3-causal/compute-shapley-attribution';
export { computeCausalSequence } from './l3-causal/compute-causal-sequence';
export { computeInterventionEffect } from './l3-causal/compute-intervention-effect';

// l4-competition
export { computeCompetitorPricingLandscape } from './l4-competition/compute-competitor-pricing-landscape';
export { computeCompetitorFeatureThreat } from './l4-competition/compute-competitor-feature-threat';

// l1-input — I2-3b: 环节0-1 新边compute
export { computeEnvironmentalScan } from './l1-input/compute-environmental-scan';
export { computeSignalUpwardPass } from './l1-input/compute-signal-upward-pass';
export { computeExternalFeedback } from './l1-input/compute-external-feedback';
export { computeSensingCalibration } from './l1-input/compute-sensing-calibration';
export { computeCapitalAcquisition } from './l1-input/compute-capital-acquisition';
export { computeCapitalSourceMix } from './l1-input/compute-capital-source-mix';
export { computeTalentAcquisition } from './l1-input/compute-talent-acquisition';
export { computeTalentFilter } from './l1-input/compute-talent-filter';
export { computeDataCollection } from './l1-input/compute-data-collection';
export { computeEquipmentAcquisition } from './l1-input/compute-equipment-acquisition';
export { computeReputationAttraction } from './l1-input/compute-reputation-attraction';
export { computeEfficiencyAttraction } from './l1-input/compute-efficiency-attraction';
