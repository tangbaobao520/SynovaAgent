/**
 * ingest/index.ts — 知识摄取入口 (engine-core 集成层)
 *
 * 使用 @synova/knowledge-ingest 做文件读取 + 实体提取。
 * engine-core 集成 (GraphStore/ontology-adapter) 在此处理。
 */
import { readFileContent, extractEntities } from '@synova/knowledge-ingest';
import type { IngestResult } from '@synova/knowledge-ingest';
import { createLogger } from '../logger';

export type { IngestResult };

const log = createLogger('ingest');

export async function ingestFile(filePath: string, orgId: string): Promise<IngestResult> {
  const { content, fileType, error } = readFileContent(filePath);
  if (error) {
    return { filePath, fileType, entityCount: 0, relationCount: 0, summary: '', sogCreated: false, error, degraded: true };
  }

  const entities = extractEntities(content);
  let sogCreated = false;

  // 铁律 39: 通过 adapter 获取 GraphStore; ontology-adapter 保留 (L5 数据层直接调用)
  try {
    const { EngineCoreVendorAdapter } = await import('../adapters/engine-core-adapter');
    const { getDatabase } = await import('../init/engine-context');
    const db = getDatabase();
    const store = await EngineCoreVendorAdapter.createGraphStore(db) as Record<string, unknown>;

    const { ingestDocument } = await import(
      '../../../../server/vendor/@synova/engine-core/src/pipeline/diagnosis/ontology-adapter'
    );
    await ingestDocument({
      orgId, name: filePath.split('/').pop() || filePath, type: fileType,
      content: content.slice(0, 10000),
    }, store, orgId);

    sogCreated = true;
    log.info({ filePath, orgId, entities: entities.length }, '文件已录入本体');
  } catch (err: any) {
    log.warn({ err: err.message, filePath }, '高级解析不可用，使用基本提取');
  }

  return {
    filePath, fileType,
    entityCount: entities.length,
    relationCount: Math.min(entities.length, 10),
    summary: content.slice(0, 500),
    sogCreated,
    degraded: !sogCreated,
  };
}
