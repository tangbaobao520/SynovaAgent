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

/** 数据写入结果 */
export interface IngestResult {
  ok: boolean;
  nodeType: string;
  nodesCreated: number;
  errors: string[];
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
 * 将一行数据写入 GraphStore。
 * @param store - GraphStore 实例（需有 createNode 方法）
 * @param mapping - 字段映射配置
 * @param row - 一行数据 (externalField → value)
 * @param graph - 图命名空间
 * @returns nodeId
 */
export async function ingestRow(
  store: { createNode(type: string, props: Record<string, unknown>, graph: string): string },
  mapping: FieldMappingConfig,
  row: Record<string, unknown>,
  graph = 'default',
  validProps?: Set<string>,
): Promise<{ nodeId: string; errors: string[] }> {
  const props: Record<string, unknown> = { financialType: mapping.name };
  const errors: string[] = [];

  for (const m of mapping.mappings) {
    // D4: 字段名校验 — 不在 financial Schema 中则跳过
    if (validProps && !validProps.has(m.prop)) {
      log.warn({ prop: m.prop }, '字段不在financial Schema中→跳过');
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
  const period = row['period'];
  if (period !== undefined && period !== null) {
    props.standardKey = `${graph}:${mapping.targetNodeType}:${String(period)}`;
  }

  try {
    const nodeId = store.createNode(mapping.targetNodeType, props, graph);
    return { nodeId, errors };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { nodeId: '', errors: [msg] };
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
  // D4: 加载 financial.json Schema 做字段校验
  const schema = loadFinancialSchema();
  const validPropNames = new Set([...Object.keys(schema.optionalProps), ...schema.requiredProps]);

  let nodesCreated = 0;
  const allErrors: string[] = [];

  for (const row of rows) {
    const { nodeId, errors } = await ingestRow(store, mapping, row, graph, validPropNames);
    if (nodeId) nodesCreated++;
    allErrors.push(...errors);
  }

  log.info({ mapping: mapping.name, nodesCreated, errors: allErrors.length }, '数据接入完成');
  return {
    ok: allErrors.length === 0 || nodesCreated > 0,
    nodeType: mapping.targetNodeType,
    nodesCreated,
    errors: allErrors.slice(0, 20), // 前20条错误
  };
}
