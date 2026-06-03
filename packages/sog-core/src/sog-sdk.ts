/**
 * sog-sdk.ts — SOG 开发者 SDK (Task 5)
 *
 * 公共 API，质量等同于对外 SDK。所有函数有完整 JSDoc。
 * 校验失败 → 抛出 SOGValidationError，不吞错。
 */
import {
  SOGNodeType, SOGEdgeType, SOG_CORE_VERSION,
  NODE_VALIDATORS, EDGE_VALIDATORS,
  validateEdgeEndpoints, SOGValidationError,
} from './sog-core-schema';
import type { SOGNodeProps, SOGEdgeProps } from './sog-core-schema';

export { SOGNodeType, SOGEdgeType, SOG_CORE_VERSION, SOGValidationError };
export type { SOGNodeProps, SOGEdgeProps };

/**
 * 创建 SOG 节点——自动完成类型和属性校验。
 * @param type - 节点类型 (SOGNodeType 枚举)
 * @param props - 节点属性 (对应类型的 Props 接口)
 * @param _id - 可选节点 ID（如不提供则自动生成）
 * @returns 创建后的 GraphNode 数据
 * @throws {SOGValidationError} 如果类型非法或属性不符合 Schema
 */
export function validateSOGNode(
  type: SOGNodeType,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const validator = NODE_VALIDATORS[type];
  if (!validator) {
    throw new SOGValidationError(`未知节点类型: ${type}`);
  }
  if (!validator(props)) {
    throw new SOGValidationError(`节点 ${type} 属性校验失败: ${JSON.stringify(props).slice(0, 200)}`);
  }
  return { type, props };
}

/**
 * 创建 SOG 边——自动完成类型、端点、属性校验。
 * @param type - 边类型 (SOGEdgeType 枚举)
 * @param fromType - 源节点类型
 * @param toType - 目标节点类型
 * @param props - 边属性 (对应类型的 EdgeProps 接口)
 * @throws {SOGValidationError} 如果类型非法、端点组合非法或属性不符合 Schema
 */
export function validateSOGEdge(
  type: SOGEdgeType,
  fromType: SOGNodeType,
  toType: SOGNodeType,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const validator = EDGE_VALIDATORS[type];
  if (!validator) {
    throw new SOGValidationError(`未知边类型: ${type}`);
  }
  if (!validateEdgeEndpoints(type, fromType, toType)) {
    throw new SOGValidationError(`非法边端点组合: ${type} ${fromType}→${toType}`);
  }
  if (!validator(props)) {
    throw new SOGValidationError(`边 ${type} 属性校验失败: ${JSON.stringify(props).slice(0, 200)}`);
  }
  return { type, fromType, toType, props };
}

/**
 * 批量校验子图——检查所有节点和边的 SOG 符合性。
 * @returns 校验结果列表（每个元素对应一个节点或边）
 */
export function validateSOGSubgraph(
  nodes: Array<{ type: SOGNodeType; props: Record<string, unknown> }>,
  edges: Array<{ type: SOGEdgeType; fromType: SOGNodeType; toType: SOGNodeType; props: Record<string, unknown> }>,
): Array<{ valid: boolean; error?: string }> {
  const results: Array<{ valid: boolean; error?: string }> = [];

  for (const node of nodes) {
    try {
      validateSOGNode(node.type, node.props);
      results.push({ valid: true });
    } catch (err: any) {
      results.push({ valid: false, error: err.message });
    }
  }

  for (const edge of edges) {
    try {
      validateSOGEdge(edge.type, edge.fromType, edge.toType, edge.props);
      results.push({ valid: true });
    } catch (err: any) {
      results.push({ valid: false, error: err.message });
    }
  }

  return results;
}
