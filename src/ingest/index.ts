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
    const { getDatabase, initEngineContext } = await import('../init/engine-context');
    // 懒初始化——服务端可能还没启动, ingest 也能独立工作
    let db: ReturnType<typeof getDatabase>;
    try { db = getDatabase(); } catch { initEngineContext(); db = getDatabase(); }
    const store = await EngineCoreVendorAdapter.createGraphStore(db) as Record<string, unknown>;

    // 1. 创建文档节点
    const { ingestDocument } = await import('@synova/diagnosis-engine');
    const docId = `doc_${Date.now().toString(36)}`;
    await ingestDocument({
      id: docId, name: filePath.split(/[\\/]/).pop() || filePath, type: fileType,
      content: content.slice(0, 10000), source: 'user_upload' as const,
    }, store as unknown as Parameters<typeof ingestDocument>[1], orgId);

    // 2. 将提取的实体写入 GraphStore
    // 使用 Document 类型 (vendor sog-core 旧版无 KnowledgeChunk)，docType 区分
    const typedStore = store as {
      createNode(type: string, props: Record<string, unknown>, graph: string): string;
      createEdge(type: string, from: string, to: string, weight: number, graph: string): string;
    };
    for (const ent of entities) {
      const nodeId = typedStore.createNode('Document', {
        name: ent,
        docType: 'other',  // SOG schema: 'prd'|'meeting_notes'|'report'|'contract'|'other'
        entityType: 'extracted_entity',
        source: filePath,
        sourceType: 'document_entity',
        language: 'zh',
      }, orgId);
      typedStore.createEdge('CORRESPONDS_TO', nodeId, docId, 1, orgId);
    }

    sogCreated = true;
    log.info({ filePath, orgId, entities: entities.length, docId }, '文件已录入本体');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg, filePath }, '高级解析不可用，使用基本提取');
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
