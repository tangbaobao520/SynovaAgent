/**
 * l4/decision-capture.ts — 用户决策捕获 (Phase 3c)
 *
 * 用户确认/驳回根因节点时，记录决策到 GraphStore 决策边。
 * 这是 Palantir 对标: Action as First-Class Citizen。
 */
import { createLogger } from '../logger';

const log = createLogger('l4/decision-capture');

export interface DecisionInput {
  nodeId: string;
  userId: string;
  action: 'confirmed' | 'rejected' | 'modified';
  reason?: string;
  modifiedProps?: Record<string, unknown>;
}

export interface DecisionResult {
  recorded: boolean;
  edgeType?: string;
  error?: string;
}

// Minimal store interface
interface DecisionStore {
  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string}>;
  createEdge(type: string, from: string, to: string, weight?: number, props?: Record<string,unknown>, graph?: string): string;
}

export function captureDecision(
  store: DecisionStore, graph: string, decision: DecisionInput,
): DecisionResult {
  try {
    // Verify node exists
    const node = store.queryNodes('Risk', { id: decision.nodeId }, graph)
      .concat(store.queryNodes('Goal', { id: decision.nodeId }, graph))
      .concat(store.queryNodes('Financial', { id: decision.nodeId }, graph));

    if (node.length === 0) {
      return { recorded: false, error: `节点 ${decision.nodeId} 不存在` };
    }

    const edgeType = decision.action === 'confirmed' ? 'DECISION_CONFIRMED'
      : decision.action === 'rejected' ? 'DECISION_REJECTED'
      : 'DECISION_MODIFIED';

    // Create decision edge from user to node
    store.createEdge(edgeType, decision.userId, decision.nodeId, 1, {
      reason: decision.reason || '',
      modifiedProps: decision.modifiedProps ? JSON.stringify(decision.modifiedProps) : '',
      timestamp: new Date().toISOString(),
    }, graph);

    log.info({ nodeId: decision.nodeId, action: decision.action, userId: decision.userId }, '决策已记录');
    return { recorded: true, edgeType };
  } catch (err: any) {
    log.warn({ err, nodeId: decision.nodeId }, '决策记录失败');
    return { recorded: false, error: err.message };
  }
}
