/**
 * graph-bridge.ts — 诊断→本体 自动蒸馏桥接层 (L4 Research Prototype)
 *
 * 在 diagnosis-assembler.ts 的每个模块计算完成后，自动将结构化输出写入 GraphStore。
 * 不是"运行完诊断再手动导入"，而是"诊断即本体构建"。
 *
 * 使用方式（在 diagnosis-assembler.ts 中）：
 *   const bridge = createGraphBridge(store, teamId);
 *   bridge.upsertFromHONA(honaResult);
 *   bridge.upsertFromCPC(cpcResult);
 *   // ... etc
 *
 * 铁律 11+31：图写入失败 → log.warn + degradedModules.push('graph-bridge')，不阻断诊断。
 */

import type { GraphStore } from '../diagnosis/graph-store';
import {
  SOGNodeType,
  SOGEdgeType,
  validateEdgeEndpoints,
} from '@synova/sog-core';

// ═══ Types ═══

export interface GraphBridgeResult {
  nodesCreated: number;
  edgesCreated: number;
  degraded: boolean;
  errors: string[];
}

interface HONAResult {
  interactions: Array<{
    fromId: string;
    toId: string;
    channel: string;
    frequency: number;  // 0-1, used as edge weight
  }>;
}

interface CPCResult {
  processes: Array<{
    name: string;
    processType: string;
    ownerRoleId: string;
    dependencies: string[];  // process names this depends on
    participants: string[];  // role IDs
  }>;
}

interface KeyPersonRiskResult {
  risks: Array<{
    personId: string;
    riskType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    affectedTeamIds: string[];
    affectedProcessNames: string[];
  }>;
}

interface CapabilitySpectrumResult {
  capabilities: Array<{
    name: string;
    category: string;
    personIds: string[];     // who provides this capability
    dependencyNames: string[]; // capability names this depends on
    coverage: number;         // 0-1 team coverage score
  }>;
}

interface FinancialImpactResult {
  financials: Array<{
    financialType: string;
    label: string;
    consumerAgentId: string;
    amount: number;
    period: string;  // ISO 8601 duration
  }>;
}

interface SevenPowersResult {
  goals: Array<{
    goalType: string;
    description: string;
    alignedTeamIds: string[];
    alignedCapabilityNames: string[];
  }>;
}

// ═══ GraphBridge ═══

export function createGraphBridge(store: GraphStore, graph: string) {
  const errors: string[] = [];
  let nodesCreated = 0;
  let edgesCreated = 0;

  function logError(module: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`[${module}] ${msg}`);
    console.warn(`[GraphBridge] ${module} 写入失败: ${msg}`);
  }

  /** 安全创建节点——不抛异常，失败返回 null */
  function safeCreateNode(type: SOGNodeType, id: string, props: Record<string, unknown>): void {
    try {
      store.createNode({ id, type, graph, props });
      nodesCreated++;
    } catch (err) {
      logError(`createNode(${type})`, err);
    }
  }

  /** 安全创建边——前置 endpoint 校验 */
  function safeCreateEdge(
    type: SOGEdgeType,
    fromId: string,
    fromType: SOGNodeType,
    toId: string,
    toType: SOGNodeType,
    props: Record<string, unknown>,
  ): void {
    try {
      if (!validateEdgeEndpoints(type, fromType, toType)) {
        errors.push(`[edge] 非法端点组合: ${type} ${fromType}→${toType}`);
        return;
      }
      store.createEdge({
        id: `${fromId}--${type}-->${toId}`,
        type,
        graph,
        fromId,
        toId,
        props,
      });
      edgesCreated++;
    } catch (err) {
      logError(`createEdge(${type})`, err);
    }
  }

  // ═══ 模块 Upsert 方法 ═══

  function upsertFromHONA(result: HONAResult): void {
    for (const ix of result.interactions) {
      safeCreateEdge(
        SOGEdgeType.INTERACTS_WITH,
        ix.fromId, SOGNodeType.PERSON,
        ix.toId, SOGNodeType.PERSON,
        { channel: ix.channel, frequency: ix.frequency },
      );
    }
  }

  function upsertFromCPC(result: CPCResult): void {
    for (const proc of result.processes) {
      const nodeId = `process:${proc.name}`;
      safeCreateNode(SOGNodeType.PROCESS, nodeId, {
        name: proc.name,
        processType: proc.processType,
      });

      // 拥有者属于该流程
      if (proc.ownerRoleId) {
        safeCreateEdge(
          SOGEdgeType.BELONGS_TO,
          proc.ownerRoleId, SOGNodeType.PERSON,
          nodeId, SOGNodeType.PROCESS,
          {},
        );
      }

      // 参与者 → 流程
      for (const pid of proc.participants) {
        safeCreateEdge(
          SOGEdgeType.BELONGS_TO,
          pid, SOGNodeType.PERSON,
          nodeId, SOGNodeType.PROCESS,
          {},
        );
      }

      // 流程依赖
      for (const depName of proc.dependencies) {
        safeCreateEdge(
          SOGEdgeType.DEPENDS_ON,
          nodeId, SOGNodeType.PROCESS,
          `process:${depName}`, SOGNodeType.PROCESS,
          {},
        );
      }
    }
  }

  function upsertFromKeyPersonRisk(result: KeyPersonRiskResult): void {
    for (const risk of result.risks) {
      const riskId = `risk:key-person:${risk.personId}`;
      safeCreateNode(SOGNodeType.RISK, riskId, {
        riskType: risk.riskType,
        severity: risk.severity,
        status: 'active',
      });

      // 风险关联到人
      safeCreateEdge(
        SOGEdgeType.AFFECTS,
        riskId, SOGNodeType.RISK,
        risk.personId, SOGNodeType.PERSON,
        { severity: risk.severity },
      );

      // 风险影响到团队
      for (const teamId of risk.affectedTeamIds) {
        safeCreateEdge(
          SOGEdgeType.AFFECTS,
          riskId, SOGNodeType.RISK,
          teamId, SOGNodeType.TEAM,
          { severity: risk.severity },
        );
      }
    }
  }

  function upsertFromCapabilitySpectrum(result: CapabilitySpectrumResult): void {
    for (const cap of result.capabilities) {
      const capId = `capability:${cap.name}`;
      safeCreateNode(SOGNodeType.CAPABILITY, capId, {
        name: cap.name,
        category: cap.category,
      });

      // 人提供能力
      for (const pid of cap.personIds) {
        safeCreateEdge(
          SOGEdgeType.PROVIDES,
          pid, SOGNodeType.PERSON,
          capId, SOGNodeType.CAPABILITY,
          { coverage: cap.coverage },
        );
      }

      // 能力依赖
      for (const depName of cap.dependencyNames) {
        safeCreateEdge(
          SOGEdgeType.DEPENDS_ON,
          capId, SOGNodeType.CAPABILITY,
          `capability:${depName}`, SOGNodeType.CAPABILITY,
          {},
        );
      }
    }
  }

  function upsertFromFinancialImpact(result: FinancialImpactResult): void {
    for (const fin of result.financials) {
      const finId = `financial:${fin.label}`;
      safeCreateNode(SOGNodeType.FINANCIAL, finId, {
        financialType: fin.financialType,
      });

      safeCreateEdge(
        SOGEdgeType.CONSUMES,
        fin.consumerAgentId, SOGNodeType.AGENT,
        finId, SOGNodeType.FINANCIAL,
        { amount: fin.amount, period: fin.period },
      );
    }
  }

  function upsertFromSevenPowers(result: SevenPowersResult): void {
    for (const goal of result.goals) {
      const goalId = `goal:${goal.description.slice(0, 40)}`;
      safeCreateNode(SOGNodeType.GOAL, goalId, {
        goalType: goal.goalType,
        description: goal.description,
      });

      for (const teamId of goal.alignedTeamIds) {
        safeCreateEdge(
          SOGEdgeType.ALIGNS_WITH,
          goalId, SOGNodeType.GOAL,
          teamId, SOGNodeType.TEAM,
          { alignmentStrength: 0.8, alignmentType: 'direct' },
        );
      }
    }
  }

  /** 返回汇总结果，用于 degradedModules 传播 */
  function getResult(): GraphBridgeResult {
    return {
      nodesCreated,
      edgesCreated,
      degraded: errors.length > 0,
      errors,
    };
  }

  return {
    upsertFromHONA,
    upsertFromCPC,
    upsertFromKeyPersonRisk,
    upsertFromCapabilitySpectrum,
    upsertFromFinancialImpact,
    upsertFromSevenPowers,
    getResult,
  };
}
