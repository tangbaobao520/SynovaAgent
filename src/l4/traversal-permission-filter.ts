/**
 * traversal-permission-filter.ts — 图遍历权限过滤器 (L4 本体层)
 *
 * 在 graph-traversal traverse() 外层包裹权限过滤层。
 * 基于 UserContext 实现节点级裁剪: department 匹配 / sensitivity 上限 / nodeType 白名单。
 *
 * 安全规范 §3.5: TraversalPermissionFilter.filterNodes(userContext, nodes[]) → nodes[]
 *
 * 约束1: 不修改 graph-traversal.ts 核心逻辑 — 外层包裹不侵入
 * 约束2: 裁剪后重建 edges — 移除引用被裁剪节点的边（无悬挂引用）
 * 约束3: 零 as any / 与 PolicyEngine 解耦（仅消费 SOI 常量）
 *
 * 铁律24: catch + log + degraded — traverse 异常已由 graph-traversal 处理
 * 铁律31: 降级信号传播 — 过滤异常降级为原始结果 + warnings
 * 铁律38: 零 as any
 */
import { createLogger } from '@synova/logger';
import type { GraphTraversal, TraversalResult } from './graph-traversal';

const log = createLogger('l4/traversal-permission-filter');

// ═══ 类型定义 ═══

export interface UserContext {
  /** 请求者角色（admin=不过滤） */
  role: string;
  /** 请求者所属部门（用于 department 匹配过滤） */
  department?: string;
  /** 请求者数据访问等级（S0 最低, S4 最高） */
  clearance: DataLevel;
}

export type DataLevel = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

/** 权限过滤选项 */
export interface TraversalFilterOptions {
  /** nodeType 白名单 — 只保留指定类型的节点 */
  nodeTypeWhitelist?: string[];
  /** 是否跳过 department 过滤（全局节点适用） */
  skipDepartmentFilter?: boolean;
}

// ═══ 辅助 ═══

/** 数据等级数值映射（S0=0, S1=1, ..., S4=4） */
const LEVEL_ORDER: Record<DataLevel, number> = { S0: 0, S1: 1, S2: 2, S3: 3, S4: 4 };

/**
 * 比较两个数据等级。
 * @returns >0 表示 a > b, 0 表示相等, <0 表示 a < b
 */
function compareLevel(a: string, b: string): number {
  const an = LEVEL_ORDER[a as DataLevel] ?? 0;
  const bn = LEVEL_ORDER[b as DataLevel] ?? 0;
  return an - bn;
}

// ═══ TraversalPermissionFilter ═══

/**
 * TraversalPermissionFilter — 图遍历权限过滤器
 *
 * 包装 GraphTraversal，在 traverse() 输出上执行后过滤。
 * 支持 department 匹配、sensitivity 上限、nodeType 白名单三层裁剪。
 *
 * 用法:
 *   const filter = new TraversalPermissionFilter(traversal);
 *   const result = filter.traverseFiltered(
 *     { role: 'manager', department: 'eng', clearance: 'S2' },
 *     ['teamId'], ['DEPLOYS'], 3
 *   );
 */
export class TraversalPermissionFilter {
  constructor(private traversal: GraphTraversal) {}

  /**
   * 带权限过滤的图遍历。
   *
   * 1. 调用原始 traverse() 获取全部节点和边
   * 2. 根据 UserContext 过滤节点
   * 3. 重建边集合（移除悬挂引用）
   * 4. 返回裁剪后的 TraversalResult
   *
   * @param userCtx - 用户上下文（角色/部门/数据等级）
   * @param startIds - 遍历起点节点 ID 列表
   * @param edgeTypes - 遍历的边类型列表
   * @param maxDepth - 最大遍历深度（默认 3）
   * @param options - 可选过滤选项（nodeType 白名单等）
   * @returns 权限裁剪后的 TraversalResult
   */
  traverseFiltered(
    userCtx: UserContext,
    startIds: string[],
    edgeTypes: string[],
    maxDepth: number = 3,
    options?: TraversalFilterOptions,
  ): TraversalResult {
    try {
      const raw = this.traversal.traverse(startIds, edgeTypes, maxDepth);

      // 并行执行过滤
      const filtered = raw.nodes.filter(n => this.isNodeAllowed(n, userCtx, options));

      // 重建边集合：只保留两端都存在的边
      const filteredNodeIds = new Set(filtered.map(n => n.id));
      // 同时保留起点 ID（遍历起点可能不在 nodes 数组中但应该保留其边）
      for (const id of startIds) filteredNodeIds.add(id);
      const filteredEdges = raw.edges.filter(e =>
        filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to),
      );

      // 裁剪计数
      const prunedCount = raw.nodes.length - filtered.length;
      const newWarnings = [...raw.warnings];
      if (prunedCount > 0) {
        newWarnings.push(`permission_filter: ${prunedCount} nodes pruned (${raw.edges.length - filteredEdges.length} edges removed)`);
      }

      log.debug({ pruned: prunedCount, remainingNodes: filtered.length, edgesRemoved: raw.edges.length - filteredEdges.length }, 'traverseFiltered 完成');
      return {
        ...raw,
        nodes: filtered,
        edges: filteredEdges,
        warnings: newWarnings,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg }, 'traverseFiltered 异常 — 降级到原始结果');
      // 异常降级：返回原始 traverse 结果，但标注 warnings
      try {
        const fallback = this.traversal.traverse(startIds, edgeTypes, maxDepth);
        return {
          ...fallback,
          degraded: true,
          warnings: [...fallback.warnings, `permission_filter_error: ${msg}`],
        };
      } catch {
        // 双重异常 — 完全降级
        return {
          nodes: [], edges: [], path: [], degraded: true,
          warnings: [`permission_filter_error: ${msg}; fallback also failed`],
        };
      }
    }
  }

  /**
   * 判断单个节点是否允许访问。
   */
  private isNodeAllowed(
    node: { id: string; type: string; props: Record<string, unknown> },
    ctx: UserContext,
    options?: TraversalFilterOptions,
  ): boolean {
    // admin 角色: 全部通过
    if (ctx.role === 'admin') return true;

    // nodeType 白名单
    if (options?.nodeTypeWhitelist && options.nodeTypeWhitelist.length > 0) {
      if (!options.nodeTypeWhitelist.includes(node.type)) return false;
    }

    // department 匹配
    if (!options?.skipDepartmentFilter && ctx.department) {
      const nodeDept = node.props.department;
      if (nodeDept !== undefined && nodeDept !== null && nodeDept !== '') {
        if (String(nodeDept) !== ctx.department) return false;
      }
    }

    // sensitivity 上限
    const nodeSensitivity = String(node.props.sensitivity || 'S0') as DataLevel;
    if (compareLevel(nodeSensitivity, ctx.clearance) > 0) return false;

    return true;
  }
}
