/**
 * evolution/index.ts — Evolution Engine module exports
 */
export {
  analyzeAndGenerateSuggestions,
  getSuggestions,
  getSuggestion,
  markSuggestionApplied,
  markSuggestionDismissed,
  getEvolutionHistory,
  runEvolutionCycle,
  detectKnowledgeDeviations,
  getOutcomeStats,
  recordEvolutionEvent,
  evaluateOutcomes,
} from './evolution-engine';
export type {
  KnowledgeDeviationInput,
} from './evolution-engine';
