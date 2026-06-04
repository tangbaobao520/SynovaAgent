/**
 * sog-schema-registry.ts — SOG 运行时软类型注册 (Task 2)
 *
 * 与 TypeScript 枚举 SOGNodeType/SOGEdgeType 共存。
 * 校验时先查枚举，再查本注册表。运行时注册的新类型不影响枚举编译。
 *
 * 使用场景:
 *   - 行业专家注册行业特定节点类型 (如 医疗:Patient, 金融:Portfolio)
 *   - 连接器注册自定义边类型
 */
import {
  SOGNodeType, SOGEdgeType,
  EDGE_ENDPOINT_MAP,
  NODE_VALIDATORS, EDGE_VALIDATORS,
} from './sog-core-schema';

export interface NodeTypeSchema {
  type: string;
  description: string;
  properties: Record<string, { type: string; required?: boolean; description?: string }>;
}

export interface EdgeTypeSchema {
  type: string;
  description: string;
  properties: Record<string, { type: string; required?: boolean; description?: string }>;
}

export interface EdgeEndpointRule {
  from: string[];
  to: string[];
}

export class SOGSchemaRegistry {
  private nodeTypes = new Map<string, NodeTypeSchema>();
  private edgeTypes = new Map<string, EdgeTypeSchema>();
  private edgeRules = new Map<string, EdgeEndpointRule>();

  constructor() {
    // Initialize with v1.0 enum types (14 nodes + 10 edges)
    for (const t of Object.values(SOGNodeType)) {
      this.nodeTypes.set(t, { type: t, description: `SOG v1.0: ${t}`, properties: {} });
    }
    for (const t of Object.values(SOGEdgeType)) {
      this.edgeTypes.set(t, { type: t, description: `SOG v1.0: ${t}`, properties: {} });
      const rule = EDGE_ENDPOINT_MAP[t];
      if (rule) {
        this.edgeRules.set(t, { from: rule.from, to: rule.to });
      }
    }
  }

  /** Register a runtime node type */
  registerNodeType(name: string, schema: NodeTypeSchema): void {
    if (this.nodeTypes.has(name)) {
      // v1.0 enum types are immutable — skip overwrite
      if (Object.values(SOGNodeType).includes(name as any)) return;
    }
    this.nodeTypes.set(name, schema);
    // Register a no-op validator
    if (!NODE_VALIDATORS[name as any]) {
      (NODE_VALIDATORS as any)[name] = () => null;
    }
  }

  /** Register a runtime edge type */
  registerEdgeType(name: string, schema: EdgeTypeSchema, rules?: EdgeEndpointRule): void {
    if (this.edgeTypes.has(name)) {
      if (Object.values(SOGEdgeType).includes(name as any)) return;
    }
    this.edgeTypes.set(name, schema);
    if (rules) this.edgeRules.set(name, rules);
    if (!EDGE_VALIDATORS[name as any]) {
      (EDGE_VALIDATORS as any)[name] = () => null;
    }
  }

  /** Validate a node type exists (enum or registry) */
  validateNodeType(type: string): boolean {
    return this.nodeTypes.has(type);
  }

  /** Validate edge endpoints against registered rules */
  validateEdgeEndpoints(type: string, from: string, to: string): boolean {
    const rule = this.edgeRules.get(type);
    if (!rule) return true; // No rule = allow all
    return rule.from.includes(from) && rule.to.includes(to);
  }

  /** Get all registered node types (enum + runtime) */
  getNodeTypes(): string[] {
    return [...this.nodeTypes.keys()];
  }

  /** Get all registered edge types */
  getEdgeTypes(): string[] {
    return [...this.edgeTypes.keys()];
  }

  /** Get runtime-only types (excluding v1.0 enum) */
  getRuntimeTypes(): { nodes: string[]; edges: string[] } {
    const enumNodes = new Set(Object.values(SOGNodeType));
    const enumEdges = new Set(Object.values(SOGEdgeType));
    return {
      nodes: this.getNodeTypes().filter(t => !enumNodes.has(t as any)),
      edges: this.getEdgeTypes().filter(t => !enumEdges.has(t as any)),
    };
  }
}

// ═══ Singleton ═══

let _instance: SOGSchemaRegistry | null = null;
export function getSOGSchemaRegistry(): SOGSchemaRegistry {
  if (!_instance) _instance = new SOGSchemaRegistry();
  return _instance;
}
