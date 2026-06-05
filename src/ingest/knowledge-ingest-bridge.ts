/**
 * ingest/knowledge-ingest-bridge.ts — 知识摄取管线
 *
 * Day 4 T4.4: PDF/DOCX/Excel 上传 → 自动解析 → SOG本体构建。
 * 诊断基于事实而非记忆。
 */
import { createLogger } from '../logger';
import type { GraphStore } from '../l4/graph-bridge';

const log = createLogger('ingest/knowledge-bridge');

export interface IngestResult {
  nodesCreated: number;
  edgesCreated: number;
  errors: string[];
}

/**
 * Ingest raw text content into SOG ontology.
 * Extracts entities (Person, Team) and relationships from document content.
 *
 * Simple heuristic extraction: quoted names → Person, department keywords → Team.
 * Full NLP pipeline (sentence-transformers) comes in Phase B via Python bridge.
 */
export async function ingestDocumentText(
  text: string, fileName: string, orgId: string, store: GraphStore,
): Promise<IngestResult> {
  const result: IngestResult = { nodesCreated: 0, edgesCreated: 0, errors: [] };

  try {
    // Heuristic: quoted names → Person nodes
    const namePattern = /[""""]([^""""]{1,20})[""""]/g;
    let match: RegExpExecArray | null;
    const personIds: string[] = [];
    while ((match = namePattern.exec(text)) !== null) {
      const nodeId = store.createNode('Person', {
        name: match[1], source: 'document', sourceFile: fileName,
      }, orgId);
      personIds.push(nodeId);
      result.nodesCreated++;
    }

    // Heuristic: department keywords → Team nodes
    const deptPattern = /(部门|团队|组|中心|事业部)[：:\s]*([一-鿿a-zA-Z0-9]+)/g;
    const teamIds: string[] = [];
    while ((match = deptPattern.exec(text)) !== null) {
      const nodeId = store.createNode('Team', {
        name: `${match[1]}${match[2]}`, source: 'document', sourceFile: fileName,
      }, orgId);
      teamIds.push(nodeId);
      result.nodesCreated++;
    }

    // Create document node
    store.createNode('Document', {
      name: fileName, content: text.slice(0, 5000), source: 'upload',
    }, orgId);
    result.nodesCreated++;

    // Link persons to document
    for (const pid of personIds) {
      try {
        store.createEdge('MENTIONS', pid, `doc_${fileName}`, 0.5, {}, orgId);
        result.edgesCreated++;
      } catch (err) { log.debug({ err }, '边可能已存在 — 跳过'); }
    }

    log.info({ fileName, nodes: result.nodesCreated, edges: result.edgesCreated }, '文档知识摄取完成');
  } catch (err: any) {
    result.errors.push(err.message);
    log.warn({ err, fileName }, '文档知识摄取失败');
  }

  return result;
}
