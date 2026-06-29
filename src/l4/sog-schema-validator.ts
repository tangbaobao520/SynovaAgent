/**
 * l4/sog-schema-validator.ts — SOG 数据入库 Schema 校验 (v3.3 20.5)
 *
 * 在 graph-store.ts 的 createNode/createEdge 入口处校验数据格式。
 * 校验失败 → 拒绝写入 + 日志告警 + 返回错误（degraded，不崩）。
 * 和 expert output_schema 用同一套类型守卫模式。
 */
import { createLogger } from '@synova/logger';

const log = createLogger('l4/sog-schema-validator');

// ═══ Types ═══

export interface SchemaRule {
  required?: string[];
  properties?: Record<string, PropRule>;
}

export interface PropRule {
  type: 'string' | 'number' | 'boolean';
  min?: number;
  max?: number;
  maxLength?: number;
  enum?: string[];
}

export interface ValidationError {
  nodeType: string;
  field: string;
  value: unknown;
  expected: string;
}

// ═══ Schema 定义 ═══

const NODE_SCHEMAS: Record<string, SchemaRule> = {
  FINANCIAL: {
    required: [],
    properties: {
      revenue: { type: 'number', min: 0 },
      cost: { type: 'number', min: 0 },
      cash_balance: { type: 'number', min: 0 },
      operating_expenses: { type: 'number', min: 0 },
      accounts_receivable: { type: 'number', min: 0 },
    },
  },
  PERSON: {
    required: ['name'],
    properties: {
      name: { type: 'string', maxLength: 120 },
      role: { type: 'string', maxLength: 80 },
      team: { type: 'string', maxLength: 80 },
    },
  },
  CLIENT: {
    required: ['name'],
    properties: {
      name: { type: 'string', maxLength: 120 },
      revenue: { type: 'number', min: 0 },
      status: { type: 'string', enum: ['active', 'churned', 'prospect', 'inactive'] },
      nps: { type: 'number', min: -100, max: 100 },
    },
  },
  RISK: {
    required: ['severity'],
    properties: {
      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'warning', 'info'] },
      confidence: { type: 'number', min: 0, max: 1 },
    },
  },
  GOAL: {
    required: ['name'],
    properties: {
      name: { type: 'string', maxLength: 200 },
      progress: { type: 'number', min: 0, max: 100 },
    },
  },
  AGENT: {
    properties: {
      agent_id: { type: 'string', maxLength: 80 },
      status: { type: 'string', enum: ['active', 'inactive', 'degraded'] },
    },
  },
  TEAM: {
    required: ['name'],
    properties: {
      name: { type: 'string', maxLength: 120 },
      headcount: { type: 'number', min: 1, max: 100000 },
    },
  },
  DOCUMENT: {
    required: ['name'],
    properties: {
      name: { type: 'string', maxLength: 200 },
      docType: { type: 'string', maxLength: 60 },
    },
  },
};

// ═══ 校验逻辑 ═══

function validateProp(value: unknown, rule: PropRule, nodeType: string, field: string): ValidationError | null {
  if (value === undefined || value === null) return null; // 可选字段跳过

  if (rule.type === 'number' && typeof value !== 'number') {
    return { nodeType, field, value, expected: `number (got ${typeof value})` };
  }
  if (rule.type === 'string' && typeof value !== 'string') {
    return { nodeType, field, value, expected: `string (got ${typeof value})` };
  }
  if (rule.type === 'boolean' && typeof value !== 'boolean') {
    return { nodeType, field, value, expected: `boolean (got ${typeof value})` };
  }

  if (rule.type === 'number' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      return { nodeType, field, value, expected: `number >= ${rule.min}` };
    }
    if (rule.max !== undefined && value > rule.max) {
      return { nodeType, field, value, expected: `number <= ${rule.max}` };
    }
  }

  if (rule.type === 'string' && typeof value === 'string') {
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return { nodeType, field, value, expected: `string max ${rule.maxLength} chars (got ${value.length})` };
    }
    if (rule.enum && !rule.enum.includes(value)) {
      return { nodeType, field, value, expected: `one of [${rule.enum.join(', ')}]` };
    }
  }

  return null;
}

/**
 * 校验单个节点的 props。返回错误列表（空 = 通过）。
 */
export function validateNodeProps(nodeType: string, props: Record<string, unknown>): ValidationError[] {
  const schema = NODE_SCHEMAS[nodeType];
  if (!schema) return []; // 未知类型 — 不校验（允许扩展）

  const errors: ValidationError[] = [];

  // 必填字段检查
  if (schema.required) {
    for (const field of schema.required) {
      if (props[field] === undefined || props[field] === null || props[field] === '') {
        errors.push({ nodeType, field, value: props[field], expected: 'required, non-empty' });
      }
    }
  }

  // 属性类型检查
  if (schema.properties) {
    for (const [field, rule] of Object.entries(schema.properties)) {
      const err = validateProp(props[field], rule, nodeType, field);
      if (err) errors.push(err);
    }
  }

  return errors;
}

/**
 * 校验并记录。返回 true = 通过。
 */
export function validateAndLog(nodeType: string, props: Record<string, unknown>): boolean {
  const errors = validateNodeProps(nodeType, props);
  if (errors.length === 0) return true;

  for (const e of errors) {
    log.warn({
      nodeType: e.nodeType,
      field: e.field,
      value: String(e.value).slice(0, 60),
      expected: e.expected,
    }, `[SOG-schema] ${e.nodeType}.${e.field} 校验失败: 期望 ${e.expected}`);
  }

  return false;
}
