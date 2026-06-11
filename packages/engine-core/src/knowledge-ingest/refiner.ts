/**
 * knowledge-ingest/refiner.ts — Phase K2: Text -> AmmoEntry types
 *
 * Type definitions only. LLM-based refinement lives in ClawOrg-BOX.
 */
import type { TextChunk } from './parsers';

export interface KnowledgeAmmoEntry {
  id: string;
  factText: string;
  keywords: string[];
  teamId: string;
  sourceFileName: string;
  confidence: 'verified' | 'public_source' | 'llm_generated';
  orgDesignImplication?: {
    impactedGaps: string[];
    deviationFromL0: number;
    description: string;
  };
  estimatedTokens: number;
  createdAt: string;
}
