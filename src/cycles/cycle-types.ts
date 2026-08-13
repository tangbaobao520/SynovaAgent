/**
 * src/cycles/cycle-types.ts — 循环配置类型定义
 *
 * 第15份权威文档（企业循环溢出导航系统）第一章 §2.3 + §4.3。
 * 对标 sentinel-loader 的文件驱动模式。
 *
 * @wire-target — D89 (溢出计算) 消费 CycleConfig
 * @wire-target — D83 (Bootstrap) 消费 loadCycles/registerLoadedCycles
 */
import type { GraphBridgeLike, AuditStoreLike } from '../growth/goal-types';

// ═══ 循环节点 ═══

/** 循环中的一个节点（变量/状态） */
export interface CycleNode {
  /** 节点 ID（循环内唯一） */
  id: string;
  /** 节点名称 */
  label: string;
  /** 节点类型 */
  type: 'stock' | 'flow' | 'parameter' | 'goal';
  /** 初始值 */
  initialValue?: number;
  /** 当前值 */
  currentValue?: number;
  /** 单位 */
  unit?: string;
  /** 关联的 42 边 ID */
  edgeRefs?: string[];
  /** 关联的 compute 契约 ID */
  computeRef?: string;
  /** 扩展属性 */
  props?: Record<string, unknown>;
}

// ═══ 循环边 ═══

/** 循环中节点间的关系 */
export interface CycleEdge {
  /** 起点节点 ID */
  from: string;
  /** 终点节点 ID */
  to: string;
  /** 影响方向 */
  polarity: '+' | '-';
  /** 延迟（时间步数） */
  delay?: number;
  /** 权重 */
  weight?: number;
}

// ═══ 溢出规则 ═══

/** 溢出计算公式 */
export interface OverflowFormula {
  /** 触发条件表达式 */
  condition: string;
  /** 溢出目标节点 */
  targetNode: string;
  /** 溢出量计算函数 */
  formula: string;
  /** 最低数据成熟度要求 */
  minDataMaturity: 'low' | 'medium' | 'high';
}

// ═══ 跨循环传播 ═══

export interface CrossCyclePropagation {
  /** 关联到的目标循环 ID */
  targetCycleId: string;
  /** 传播边描述 */
  viaEdge: string;
  /** 传播强度 */
  strength: number;
}

// ═══ 循环配置完整结构 ═══

export interface CycleConfig {
  /** 循环唯一标识 */
  cycleId: string;
  /** 循环显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** Schema 版本 */
  version: string;
  /** 适用行业列表（空=通用） */
  applicableIndustries: string[];
  /** 循环中的节点 */
  nodes: CycleNode[];
  /** 节点间关系 */
  edges: CycleEdge[];
  /** 溢出条件与公式 */
  overflowFormula: OverflowFormula;
  /** 数据成熟度等级 */
  dataMaturity: 'low' | 'medium' | 'high';
  /** 节点→42边映射 */
  mapping: Array<{ nodeId: string; edgeId: string; weight: number }>;
  /** 跨循环传播 */
  crossCyclePropagation: CrossCyclePropagation[];
}

// ═══ ContextLoader 接口（D79） ═══

export interface ContextLoaderLike {
  getContext(key: string): unknown;
  getCycleOverrides?(cycleId: string): Record<string, unknown> | undefined;
}
