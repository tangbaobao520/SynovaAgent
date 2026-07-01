/**
 * l4/graph-bridge.ts — 诊断→本体自动蒸馏桥接层 (Phase 1a)
 *
 * 诊断模块输出 → 自动写入 GraphStore。6 个 upsert 方法对应 6 个诊断模块。
 *
 * 接线状态 (C6, 2026-06-04):
 *   ✅ upsertFromKeyPersonRisk — diagnosis-launcher.ts
 *   ✅ upsertFromHONA — diagnosis-launcher.ts
 *   ✅ upsertFromFinancialImpact — diagnosis-launcher.ts
 *   ✅ upsertFromCapabilityGap — diagnosis-launcher.ts
 *   ✅ upsertFromSevenPowers — diagnosis-launcher.ts
 *   ✅ upsertFromCPC — diagnosis-launcher.ts
 *
 * 接口: 匹配 engine-core GraphStore 真实接口
 *   createNode(type, props, graph) → returns auto-id
 *   createEdge(type, from, to, weight?, props?, graph?) → returns auto-id
 */
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import { createLogger } from '@synova/logger';
import { validateAndLog } from './sog-schema-validator';

const log = createLogger('l4/graph-bridge');

// ═══ GraphStore Interface ═══
// 铁律 39: 类型镜像 engine-core GraphStore (graph-store.ts:27)。
// 使用 string 类型参数 (vs engine-core 的 NodeType/EdgeType 枚举) 以保持 synova-agent 独立。
// 结构兼容性由 tests/architecture/graphstore-compatibility.test.ts 验证。
// engine-core 引用: @synova/engine-core/dist/pipeline/diagnosis/graph-store

export interface GraphStore {
  createNode(type: string, props: Record<string,unknown>, graph: string): string;
  createNodes(nodes: Array<{type:string, props:Record<string,unknown>}>, graph: string): string[];
  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string): Array<{id:string, type:string, props:Record<string,unknown>}>;
  /** V3.8: 按标签查询节点/边。标签来自 extensions/ontology/tags.json。 */
  queryByTags?(tags: string[], options?: { matchMode?: 'any'|'all'; graph?: string }): Array<{id:string, type:string, props:Record<string,unknown>}>;
  queryEdges(type?: string, from?: string, to?: string, graph?: string): Array<{id:string, type:string, from:string, to:string, weight:number, props:Record<string,unknown>}>;
  createEdge(type: string, from: string, to: string, weight?: number, props?: Record<string,unknown>, graph?: string): string;
  createEdges(edges: Array<{type:string, from:string, to:string, weight?:number, props?:Record<string,unknown>}>, graph: string): string[];
  getNode(id: string, graph: string): unknown | null;
  updateNode(id: string, props: Record<string,unknown>, graph: string): void;
  deleteNode(id: string, graph: string): void;
  deleteEdge(id: string, graph: string): void;
  traverse(startNodeId: string, edgeType?: string, maxDepth?: number, graph?: string): unknown;
  findPaths(from: string, to: string, edgeType?: string, maxDepth?: number, graph?: string): unknown[];
  queryTriples(pattern: Record<string,unknown>, graph?: string): unknown[];
  getNodeAtTime(id: string, timestamp: string, graph: string): unknown | null;
}

// ═══ Types ═══

export interface BridgeResult {
  nodesCreated: number;
  edgesCreated: number;
  degraded: boolean;
  errors: string[];
}

export interface HONAInput { personId: string; name: string; role?: string }
export interface HONAEdge { from: string; to: string; weight?: number }

export interface KeyPersonRiskInput { roleId: string; riskLevel: string; knowledgeDomains: string[]; busFactor: number }

export interface FinancialImpactInput { dimension: string; amount: number; financialType: string; summary?: string }

export interface CapabilityGapInput { name: string; category: string; severity: number; requiredBy: string[]; suggestion?: string }

export interface SevenPowersInput { power: string; score: number; recommendation?: string }

export interface CPCInput { processName: string; teamId: string; efficiency?: number }

// ═══ GraphBridge ═══

export function createGraphBridge(store: GraphStore, graph: string, onGraphUpdated?: () => void) {
  const notify = () => onGraphUpdated?.();

  // v3.3 20.5: SOG schema 校验 — 包装 createNode/updateNode
  const _createNode = store.createNode.bind(store);
  const _updateNode = store.updateNode?.bind(store);
  store.createNode = (type: string, props: Record<string,unknown>, g: string): string => {
    validateAndLog(type, props);
    return _createNode(type, props, g);
  };
  if (_updateNode) {
    store.updateNode = (id: string, props: Record<string,unknown>, g: string): void => {
      // updateNode 不传 type — 校验跳过（无法在更新时获取节点类型）
      _updateNode(id, props, g);
    };
  }

  return {
    upsertFromHONA(people: HONAInput[], interactions: HONAEdge[]): BridgeResult {
      const result: BridgeResult = { nodesCreated: 0, edgesCreated: 0, degraded: false, errors: [] };
      if (people.length === 0) return result;

      try {
        // Batch create Person nodes
        const nodeIds = store.createNodes(
          people.map(p => ({ type: SOGNodeType.PERSON, props: { name: p.name, role: p.role || 'unknown' } })),
          graph,
        );
        result.nodesCreated = nodeIds.length;

        // Create INTERACTS_WITH edges
        for (const ia of interactions) {
          try {
            store.createEdge(SOGEdgeType.INTERACTS_WITH, ia.from, ia.to, ia.weight || 0.5, {}, graph);
            result.edgesCreated++;
          } catch (err: any) {
            result.errors.push(`HONA edge failed: ${err.message}`);
          }
        }
      } catch (err: any) {
        result.degraded = true;
        result.errors.push(`upsertFromHONA: ${err.message}`);
        log.warn({ err }, 'upsertFromHONA 失败');
      }
      return result;
    },

    upsertFromKeyPersonRisk(profiles: KeyPersonRiskInput[]): BridgeResult {
      const result: BridgeResult = { nodesCreated: 0, edgesCreated: 0, degraded: false, errors: [] };
      if (profiles.length === 0) return result;

      try {
        for (const p of profiles) {
          const riskNodeId = store.createNode(SOGNodeType.RISK, {
            name: `关键人风险: ${p.roleId}`,
            severity: p.riskLevel,
            riskType: 'key_person',
            busFactor: p.busFactor,
            knowledgeDomains: p.knowledgeDomains,
          }, graph);
          result.nodesCreated++;

          // AFFECTS edges to Person nodes matching roleId
          const persons = store.queryNodes(SOGNodeType.PERSON, { name: p.roleId }, graph);
          for (const person of persons) {
            store.createEdge(SOGEdgeType.AFFECTS, riskNodeId, person.id, 0.8, {}, graph);
            result.edgesCreated++;
          }
        }
      } catch (err: any) {
        result.degraded = true;
        result.errors.push(`upsertFromKeyPersonRisk: ${err.message}`);
        log.warn({ err }, 'upsertFromKeyPersonRisk 失败');
      }
      if (result.nodesCreated > 0) notify(); // T3.2: SOG更新→触发专家
      return result;
    },

    upsertFromFinancialImpact(items: FinancialImpactInput[]): BridgeResult {
      const result: BridgeResult = { nodesCreated: 0, edgesCreated: 0, degraded: false, errors: [] };
      if (items.length === 0) return result;

      try {
        for (const item of items) {
          store.createNode(SOGNodeType.FINANCIAL, {
            name: item.dimension,
            amount: item.amount,
            financialType: item.financialType,
            description: item.summary || '',
          }, graph);
          result.nodesCreated++;
        }
      } catch (err: any) {
        result.degraded = true;
        result.errors.push(`upsertFromFinancialImpact: ${err.message}`);
      }
      return result;
    },

    upsertFromCapabilityGap(gaps: CapabilityGapInput[]): BridgeResult {
      const result: BridgeResult = { nodesCreated: 0, edgesCreated: 0, degraded: false, errors: [] };
      if (gaps.length === 0) return result;

      try {
        for (const gap of gaps) {
          store.createNode(SOGNodeType.CAPABILITY, {
            name: gap.name,
            category: gap.category,
            proficiencyLevel: 1 - gap.severity,
            status: 'required',
            description: gap.suggestion || '',
          }, graph);
          result.nodesCreated++;
        }
      } catch (err: any) {
        result.degraded = true;
        result.errors.push(`upsertFromCapabilityGap: ${err.message}`);
      }
      return result;
    },

    upsertFromSevenPowers(powers: SevenPowersInput[]): BridgeResult {
      const result: BridgeResult = { nodesCreated: 0, edgesCreated: 0, degraded: false, errors: [] };
      if (powers.length === 0) return result;

      try {
        for (const p of powers) {
          store.createNode(SOGNodeType.GOAL, {
            name: p.power,
            goalType: 'north_star',
            description: p.recommendation || '',
            progress: p.score,
          }, graph);
          result.nodesCreated++;
        }
      } catch (err: any) {
        result.degraded = true;
        result.errors.push(`upsertFromSevenPowers: ${err.message}`);
      }
      return result;
    },

    upsertFromCPC(processes: CPCInput[]): BridgeResult {
      const result: BridgeResult = { nodesCreated: 0, edgesCreated: 0, degraded: false, errors: [] };
      if (processes.length === 0) return result;

      try {
        for (const proc of processes) {
          const nodeId = store.createNode(SOGNodeType.PROCESS, {
            name: proc.processName,
            processType: 'workflow',
          }, graph);
          result.nodesCreated++;

          // BELONGS_TO edge to team
          const teams = store.queryNodes(SOGNodeType.TEAM, { name: proc.teamId }, graph);
          for (const team of teams) {
            store.createEdge(SOGEdgeType.BELONGS_TO, nodeId, team.id, 1, {}, graph);
            result.edgesCreated++;
          }
        }
      } catch (err: any) {
        result.degraded = true;
        result.errors.push(`upsertFromCPC: ${err.message}`);
      }
      return result;
    },
  };
}
