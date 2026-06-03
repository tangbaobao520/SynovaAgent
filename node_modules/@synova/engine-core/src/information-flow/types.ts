/**
 * information-flow/types.ts — 自适应路由引擎类型 (GAP-2: InformationFlow Phase 1)
 */

import type { TaskAugmentationCard } from '../protocol/types';

// ====================================================================
// 路由决策
// ====================================================================

export type RouteAction = 'MANDATORY' | 'CONDITIONAL' | 'DELEGATED' | 'SUPPRESS';

export interface RouteDecision {
  roleId: string;
  action: RouteAction;
  relevanceScore: number;
  loadSnapshot?: LoadSnapshot;
  reason: string;
}

export interface RoutingResult {
  mandatoryTargets: string[];
  conditionalTargets: string[];
  suppressTargets: string[];
  delegatedTargets: string[];
  augmentationCard?: TaskAugmentationCard;
  decisions: RouteDecision[];
  decisionLog: string;
}

// ====================================================================
// 负载快照
// ====================================================================

export interface LoadSnapshot {
  roleId: string;
  activeTaskCount: number;
  tokenBudgetUsed: number;
  queueDepth: number;
  timestamp: string;
}

// ====================================================================
// 增强卡生成参数
// ====================================================================

export interface AugmentationParams {
  taskCategory: string;
  targetRoleId: string;
  teamId: string;
  maxCards?: number;
}

// ====================================================================
// 路由引擎配置
// ====================================================================

export interface RoutingConfig {
  mandatoryThreshold: number;
  conditionalThreshold: number;
  suppressThreshold: number;
  loadThreshold: number;
  maxAugmentationCards: number;
}
