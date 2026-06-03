/**
 * information-flow/routing-engine.ts — 自适应路由引擎 (GAP-2: InformationFlow Phase 1)
 *
 * Decision algorithm (Level 1: keyword Jaccard + load-aware):
 *
 *   decision(M, R) =
 *     if relevance(M, R) >= mandatoryThreshold     → MANDATORY
 *     if relevance(M, R) >= conditionalThreshold
 *        AND load(R) < loadThreshold               → CONDITIONAL
 *     if relevance(M, R) >= conditionalThreshold
 *        AND load(R) >= loadThreshold              → DELEGATED
 *     if relevance(M, R) < suppressThreshold       → SUPPRESS
 *     else                                         → CONDITIONAL (fallback)
 */

import type { AgentMessage } from '../protocol/types';
import type { TeamProtocol } from '../protocol/types';
import type { RoutingResult, RouteDecision, RoutingConfig } from './types';
import { getLoadSnapshot, isOverloaded } from './load-monitor';
import { generateAugmentationCard } from './task-augmenter';

const DEFAULT_CONFIG: RoutingConfig = {
  mandatoryThreshold: 0.8,
  conditionalThreshold: 0.5,
  suppressThreshold: 0.3,
  loadThreshold: 0.7,
  maxAugmentationCards: 3,
};

/** Jaccard similarity between two token sets */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

/** Tokenize text into keyword set */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^一-龥a-z0-9\s]/g, '')
      .split(/[\s,，、.。:：;；!！?？]+/)
      .filter(w => w.length >= 2)
  );
}

/**
 * Compute relevance score between a message and a potential recipient role.
 *
 * Level 1: keyword Jaccard similarity.
 * Level 2 (future): role capability tag matching + collaboration history tuning.
 */
export function computeRelevance(
  message: AgentMessage,
  roleName: string,
  roleSkills?: string[]
): number {
  const msgTokens = tokenize(`${message.type} ${message.content.slice(0, 300)}`);
  const roleTokens = tokenize(`${roleName} ${(roleSkills || []).join(' ')}`);

  // Base: keyword Jaccard
  const jaccardScore = jaccardSimilarity(msgTokens, roleTokens);

  // Boost: if message type matches common task patterns
  let boost = 0;
  if (message.type === 'task' || message.type === 'query') {
    boost += 0.05;
  }
  if (message.content.includes(roleName)) {
    boost += 0.15;
  }

  return Math.min(1.0, jaccardScore + boost);
}

/**
 * Evaluate routing for a message against a team protocol.
 *
 * For each role in the protocol's visibility matrix (or routing map),
 * computes relevance and load, then decides: MANDATORY / CONDITIONAL /
 * DELEGATED / SUPPRESS.
 */
export function evaluateRouting(
  message: AgentMessage,
  protocol: TeamProtocol,
  teamId: string,
  config?: Partial<RoutingConfig>
): RoutingResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const decisions: RouteDecision[] = [];

  // Get candidate roles from visibility matrix or routing map
  // gaps values are heterogenous runtime data — Record<string, any> for nested access
  const ifGap = protocol.gaps['information_flow'] as Record<string, any> | undefined;
  const visibilityMatrix: Record<string, string[]> = ifGap?.visibilityMatrix || {};
  const roleSkills: Record<string, string[]> = {};
  const roleNames: Record<string, string> = {};

  // Collect all roles from visibility matrix
  const allRoles = new Set<string>();
  for (const [from, targets] of Object.entries(visibilityMatrix)) {
    allRoles.add(from);
    for (const t of targets) allRoles.add(t);
  }
  // Also check routing map
  const routingMap: Record<string, string[]> = ifGap?.routingMap || {};
  for (const [from, targets] of Object.entries(routingMap)) {
    allRoles.add(from);
    for (const t of targets) allRoles.add(t);
  }
  // Remove sender from candidate list
  allRoles.delete(message.from);

  // Score each candidate role
  for (const roleId of allRoles) {
    const roleName = roleNames[roleId] || roleId;
    const skills = roleSkills[roleId] || [];
    const relevance = computeRelevance(message, roleName, skills);
    const loadSnap = getLoadSnapshot(roleId);
    const overloaded = isOverloaded(roleId);

    let action: RouteDecision['action'];
    let reason: string;

    if (relevance >= cfg.mandatoryThreshold) {
      action = 'MANDATORY';
      reason = `high relevance (${relevance.toFixed(2)})`;
    } else if (relevance >= cfg.conditionalThreshold) {
      if (!overloaded) {
        action = 'CONDITIONAL';
        reason = `moderate relevance (${relevance.toFixed(2)}), load ok (${loadSnap.activeTaskCount} tasks)`;
      } else {
        action = 'DELEGATED';
        reason = `moderate relevance but role overloaded (${loadSnap.activeTaskCount} tasks)`;
      }
    } else if (relevance < cfg.suppressThreshold) {
      action = 'SUPPRESS';
      reason = `low relevance (${relevance.toFixed(2)})`;
    } else {
      action = 'CONDITIONAL';
      reason = `default routing (relevance: ${relevance.toFixed(2)})`;
    }

    decisions.push({
      roleId,
      action,
      relevanceScore: relevance,
      loadSnapshot: loadSnap,
      reason,
    });
  }

  const mandatoryTargets = decisions.filter(d => d.action === 'MANDATORY').map(d => d.roleId);
  const conditionalTargets = decisions.filter(d => d.action === 'CONDITIONAL').map(d => d.roleId);
  const suppressTargets = decisions.filter(d => d.action === 'SUPPRESS').map(d => d.roleId);
  const delegatedTargets = decisions.filter(d => d.action === 'DELEGATED').map(d => d.roleId);

  // Build decision log
  const decisionLog = decisions
    .map(d => `[Routing] ${message.from}->${d.roleId}: ${d.action} (rel=${d.relevanceScore.toFixed(2)}, load=${d.loadSnapshot?.activeTaskCount || 0})`)
    .join('\n');

  // Generate augmentation card for cross-role tasks
  let augmentationCard;
  const taskCategory = message.type === 'task' ? message.content.slice(0, 80) : undefined;
  if (taskCategory && conditionalTargets.length > 0) {
    // Generate for the primary conditional target
    augmentationCard = generateAugmentationCard({
      taskCategory,
      targetRoleId: conditionalTargets[0],
      teamId,
      maxCards: cfg.maxAugmentationCards,
    }) || undefined;
  }

  return {
    mandatoryTargets,
    conditionalTargets,
    suppressTargets,
    delegatedTargets,
    decisions,
    decisionLog,
    augmentationCard,
  };
}
