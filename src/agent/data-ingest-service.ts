/**
 * data-ingest-service.ts — 数据接入编排服务 (L2)
 *
 * 接收结构化数据(JSON/CSV) + 字段映射配置名 → 写入 L4 GraphStore。
 * 铁律39: L2→L4 通过 GraphStore 接口调用。
 * 铁律24: catch + log + degraded。
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@synova/logger';
import { getPIIScrubber } from '../security/pii-scrubber';
import { deriveValidFrom } from '../l3/period-utils';

const log = createLogger('agent/data-ingest');

/** 字段映射条目 */
export interface FieldMapping {
  externalField: string;
  prop: string;
  type: string;
}

/** 字段映射配置 */
export interface FieldMappingConfig {
  name: string;
  label: string;
  targetNodeType: string;
  mappings: FieldMapping[];
}

/** Financial JSON Schema 结构 */
interface FinancialSchema {
  requiredProps: string[];
  optionalProps: Record<string, string>;
}

/** 节点类型 JSON Schema 结构（resource/ 或 outcome/；optionalProps 值形态不校验，仅消费 keys） */
interface NodeTypeSchema {
  requiredProps: string[];
  optionalProps: Record<string, unknown>;
}

/** 数据写入结果 */
export interface IngestResult {
  ok: boolean;
  nodeType: string;
  nodesCreated: number;
  errors: string[];
  /** D470: 跳过/降级信号（铁律 31 信号传播，非静默） */
  warnings: string[];
}

/**
 * 获取所有可用适配器名称列表。
 */
export function getAvailableAdapters(): string[] {
  try {
    const { AdapterRegistry } = require('./adapter-registry');
    const registry = AdapterRegistry.getInstance();
    return registry.list().map((a: { name: string }) => a.name);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, '获取适配器列表失败 — degraded');
    return [];
  }
}

/**
 * 重新扫描 field-mappings/ 目录并刷新注册表。
 */
export function reloadAdapters(): { updated: number; errors: string[] } {
  try {
    const { scanFieldMappings } = require('./adapter-scanner');
    const { AdapterRegistry } = require('./adapter-registry');

    const scanResult = scanFieldMappings();
    const registry = AdapterRegistry.getInstance();
    registry.clear();

    const result = registry.registerFromScan(scanResult.adapters);
    log.info({ updated: result.registered, errors: result.errors.length }, '适配器重新加载完成');
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, '适配器重新加载失败');
    return { updated: 0, errors: [msg] };
  }
}

/** 加载字段映射配置 */
export function loadFieldMapping(name: string): FieldMappingConfig | null {
  const path = join(process.cwd(), 'extensions', 'ontology', 'field-mappings', `${name}.json`);
  if (!existsSync(path)) {
    log.warn({ name }, '字段映射配置不存在');
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as FieldMappingConfig;
  } catch (err: unknown) {
    log.warn({ err, name }, '字段映射配置解析失败');
    return null;
  }
}

/**
 * 加载 financial.json Schema，用于校验写入字段。
 */
export function loadFinancialSchema(): FinancialSchema {
  const path = join(process.cwd(), 'extensions', 'ontology', 'outcome', 'financial.json');
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as FinancialSchema;
  } catch (err: unknown) {
    log.warn({ err }, 'financial.json Schema 加载失败');
    return { requiredProps: [], optionalProps: {} };
  }
}

/**
 * 按目标节点类型加载 JSON Schema 用于字段白名单校验（D470: 契约对齐）。
 *
 * 契约:
 *   输入: targetNodeType（mapping.targetNodeType，单词 PascalCase，如 Client/Person/Operational）
 *   输出: { requiredProps, optionalProps } 或 null
 *   降级: Financial 显式回退 loadFinancialSchema()（向后兼容 legacy 空白名单语义）；
 *         schema 文件缺失/解析失败 → log.warn + null，调用方 fail-open 并记录 warnings 信号。
 *
 * 搜索顺序: resource/{lower(targetNodeType)}.json → outcome/ 同名文件
 * （约定: 文件名全小写 ↔ targetNodeType 单词 PascalCase，当前 8 个映射类型均成立）。
 */
export function loadNodeTypeSchema(targetNodeType: string): NodeTypeSchema | null {
  // D470: Financial 回退 financial.json（向后兼容 legacy 空白名单语义）
  if (targetNodeType === 'Financial') {
    return loadFinancialSchema();
  }
  const fileName = `${targetNodeType.toLowerCase()}.json`;
  for (const dir of ['resource', 'outcome']) {
    const path = join(process.cwd(), 'extensions', 'ontology', dir, fileName);
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as NodeTypeSchema;
    } catch (err: unknown) {
      log.warn({ err, targetNodeType, dir }, '节点类型 Schema 解析失败');
      return null;
    }
  }
  log.warn({ targetNodeType }, '节点类型 Schema 不存在 — 跳过字段校验（fail-open）');
  return null;
}

/**
 * 将一行数据写入 GraphStore。
 * @param store - GraphStore 实例（需有 createNode 方法）
 * @param mapping - 字段映射配置
 * @param row - 一行数据 (externalField → value)
 * @param graph - 图命名空间
 * @param validProps - 目标节点类型 schema 白名单；undefined = 跳过校验（fail-open）
 * @returns nodeId + errors + warnings（warnings 记录被白名单跳过的字段，非静默信号）
 */
export async function ingestRow(
  store: { createNode(type: string, props: Record<string, unknown>, graph: string): string },
  mapping: FieldMappingConfig,
  row: Record<string, unknown>,
  graph = 'default',
  validProps?: Set<string>,
): Promise<{ nodeId: string; errors: string[]; warnings: string[] }> {
  const props: Record<string, unknown> = { financialType: mapping.name };
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const m of mapping.mappings) {
    // D4/D470: 字段名校验 — 不在目标节点类型 Schema 中则跳过（warnings 非静默）
    if (validProps && !validProps.has(m.prop)) {
      const msg = `字段 ${m.prop} 不在 ${mapping.targetNodeType} Schema 中→跳过`;
      log.warn({ prop: m.prop, targetNodeType: mapping.targetNodeType }, msg);
      warnings.push(msg);
      continue;
    }
    const raw = row[m.externalField];
    if (raw === undefined || raw === null) {
      errors.push(`缺少字段: ${m.externalField}`);
      continue;
    }
    if (m.type === 'number') {
      const num = Number(raw);
      props[m.prop] = isNaN(num) ? raw : num;
    } else {
      // D34: PII脱敏 — 字符串字段经scrub()处理后再写入 (数据层规范§4.1)
      const rawStr = String(raw);
      try {
        const scrubResult = getPIIScrubber().scrub(rawStr);
        props[m.prop] = scrubResult.cleaned;
        if (scrubResult.matches.length > 0) {
          props['pii_scrubbed'] = true;
        }
      } catch (err: unknown) {
        log.error({ err, prop: m.prop }, 'PII脱敏失败，使用原始值（降级）');
        props[m.prop] = rawStr;
        props['pii_scrubbed'] = false;
      }
    }
  }

  // D29: 标准键冲突检测 — 用外部 period 字段生成 standardKey
  // D33: standardKey 扩展为含 validFrom 时间维度
  const period = row['period'];
  if (period !== undefined && period !== null) {
    const periodStr = String(period);
    const validFrom = deriveValidFrom(periodStr);
    props.standardKey = `${graph}:${mapping.targetNodeType}:${periodStr}:${validFrom}`;
    props.period = periodStr; // D33: 传递给 createNode 用于时间字段推导
  }

  try {
    const nodeId = store.createNode(mapping.targetNodeType, props, graph);
    return { nodeId, errors, warnings };
  } catch (err: unknown) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "写入失败");
    const msg = err instanceof Error ? err.message : String(err);
    return { nodeId: '', errors: [msg], warnings };
  }
}

/**
 * 批量写入多行数据。
 */
export async function ingestBatch(
  store: { createNode(type: string, props: Record<string, unknown>, graph: string): string },
  mapping: FieldMappingConfig,
  rows: Array<Record<string, unknown>>,
  graph = 'default',
): Promise<IngestResult> {
  // D470: 按目标节点类型加载 schema 做字段白名单校验（替代 financial-only）
  const schema = loadNodeTypeSchema(mapping.targetNodeType);
  const allWarnings: string[] = [];
  let validPropNames: Set<string> | undefined;
  if (schema) {
    validPropNames = new Set([...Object.keys(schema.optionalProps), ...schema.requiredProps]);
  } else {
    // 目标 schema 缺失 → fail-open 不阻断上传，warnings 可追溯（铁律 24/31）
    const msg = `目标 Schema 缺失: ${mapping.targetNodeType} → 跳过字段校验（fail-open）`;
    log.warn({ targetNodeType: mapping.targetNodeType }, msg);
    allWarnings.push(msg);
  }

  let nodesCreated = 0;
  const allErrors: string[] = [];

  for (const row of rows) {
    const { nodeId, errors, warnings } = await ingestRow(store, mapping, row, graph, validPropNames);
    if (nodeId) nodesCreated++;
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }

  log.info({ mapping: mapping.name, nodesCreated, errors: allErrors.length, warnings: allWarnings.length }, '数据接入完成');
  return {
    ok: allErrors.length === 0 || nodesCreated > 0,
    nodeType: mapping.targetNodeType,
    nodesCreated,
    errors: allErrors.slice(0, 20), // 前20条错误
    warnings: allWarnings.slice(0, 20), // 前20条警告
  };
}
