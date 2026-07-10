/**
 * shared/computes/index.ts — 共享计算模块统一导出 (I2-3d)
 *
 * 42边体系每边≥1个compute函数 → I2阶段3完成。
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

// l2-internal — I2-3c: 环节2 内部转化 新边compute
export { computeCapitalAllocation } from './l2-internal/compute-capital-allocation';
export { computeDecisionAuthority } from './l2-internal/compute-decision-authority';
export { computeTalentDeployment } from './l2-internal/compute-talent-deployment';
export { computeInformationFlow } from './l2-internal/compute-information-flow';
export { computeIncentiveAlignment } from './l2-internal/compute-incentive-alignment';
export { computeRuleConstraint } from './l2-internal/compute-rule-constraint';
export { computeOrganizationalLearning } from './l2-internal/compute-organizational-learning';
export { computeKnowledgeSharing } from './l2-internal/compute-knowledge-sharing';
export { computeTrustFrictionReduction } from './l2-internal/compute-trust-friction-reduction';
export { computeRoutineRigidity } from './l2-internal/compute-routine-rigidity';

// l3-output — I2-3c: 环节3 价值输出 新边compute
export { computeOperationalExecution } from './l3-output/compute-operational-execution';
export { computeInnovationOutput } from './l3-output/compute-innovation-output';
export { computeBrandBuilding } from './l3-output/compute-brand-building';
export { computeDemandToSpec } from './l3-output/compute-demand-to-spec';
export { computeServiceSupport } from './l3-output/compute-service-support';
export { computeCrossFunctionalSynergy } from './l3-output/compute-cross-functional-synergy';
export { computeTechInfrastructure } from './l3-output/compute-tech-infrastructure';

// l4-capture — I2-3d: 环节4 价值捕获 新边compute
export { computeValuePricing } from './l4-capture/compute-value-pricing';
export { computeCustomerLockin } from './l4-capture/compute-customer-lockin';
export { computeChannelDelivery } from './l4-capture/compute-channel-delivery';
export { computeCompetitivePositioning } from './l4-capture/compute-competitive-positioning';
export { computeProcurementBargaining } from './l4-capture/compute-procurement-bargaining';
export { computeCustomerDataLoop } from './l4-capture/compute-customer-data-loop';
export { computeMarketShareCapture } from './l4-capture/compute-market-share-capture';

// l5-reinput — I2-3d: 环节5 再输入 新边compute
export { computeProfitReinvestment } from './l5-reinput/compute-profit-reinvestment';
export { computeTalentRetention } from './l5-reinput/compute-talent-retention';
export { computeKnowledgeReuse } from './l5-reinput/compute-knowledge-reuse';
export { computeReputationFlywheel } from './l5-reinput/compute-reputation-flywheel';
export { computeRetentionProtectsKnowledge } from './l5-reinput/compute-retention-protects-knowledge';

// cross-cycle — I2-3d: 跨环节联动 新边compute
export { computeAssumptionTriggeredReallocation } from './cross-cycle/compute-assumption-triggered-reallocation';
