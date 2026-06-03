/**
 * knowledge-ingest/index.ts — Knowledge Injection module exports
 *
 * Knowledge ingestion pipeline types.
 * Full implementations (LLM-based refinement, database-backed collectors) live in ClawOrg-BOX.
 */
export type { KnowledgeAmmoEntry } from './refiner';
export type { AgentKnowledgeAssignment, KnowledgeDistributionResult } from './mapper';
export { distributeKnowledge } from './mapper';
export { parseDocument, parsePdf, parseDocx, parseExcel, parseText } from './parsers';
export type { TextChunk, ParseResult } from './parsers';
