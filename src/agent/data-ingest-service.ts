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

const log = createLogger('agent/data-ingest');

/** 字段映射条目 */
interface FieldMapping {
  externalField: string;
  prop: string;
  type: string;
}

/** 字段映射配置 */
interface FieldMappingConfig {
  name: string;
  label: string;
  targetNodeType: string;
  mappings: FieldMapping[];
}

/** 数据写入结果 */
export interface IngestResult {
  ok: boolean;
  nodeType: string;
  nodesCreated: number;
  errors: string[];
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
): Promise<{ nodeId: string; errors: string[] }> {
  const props: Record<string, unknown> = { financialType: mapping.name };
  const errors: string[] = [];

  for (const m of mapping.mappings) {
    const raw = row[m.externalField];
    if (raw === undefined || raw === null) {
      errors.push(`缺少字段: ${m.externalField}`);
      continue;
    }
    if (m.type === 'number') {
      const num = Number(raw);
      props[m.prop] = isNaN(num) ? raw : num;
    } else {
      props[m.prop] = String(raw);
    }
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
  let nodesCreated = 0;
  const allErrors: string[] = [];

  for (const row of rows) {
    const { nodeId, errors } = await ingestRow(store, mapping, row, graph);
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
