/**
 * information-flow/index.ts — Barrel export (GAP-2: InformationFlow Phase 1)
 */

export { evaluateRouting, computeRelevance } from './routing-engine';
export {
  getLoadSnapshot,
  updateLoad,
  isOverloaded,
  resetLoad,
  resetAllLoad,
  getAllLoadSnapshots,
} from './load-monitor';
export { generateAugmentationCard } from './task-augmenter';
export type {
  RoutingResult,
  RouteDecision,
  RouteAction,
  LoadSnapshot,
  AugmentationParams,
  RoutingConfig,
} from './types';
