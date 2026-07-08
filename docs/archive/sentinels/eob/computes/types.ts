/**
 * eob/computes/types.ts — GraphStoreLike 类型定义
 *
 * 图数据存储的统一查询接口。用于所有图查询型 compute 函数。
 */
export interface GraphStoreLike {
  queryNodes(filter?: Record<string, unknown>): Promise<unknown[]>;
  queryEdges(filter?: Record<string, unknown>): Promise<unknown[]>;
}
