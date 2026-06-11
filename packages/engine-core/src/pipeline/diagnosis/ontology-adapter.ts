/**
 * ontology-adapter.ts — 数据源适配器接口 + 文档本体建模 (ARCH-20 Phase A5)
 *
 * 对标 Claw-Code 的 event-driven architecture:
 *   原始数据 → OntologyAdapter → OntologyEvent → 标准化
 *   → EntityRegistry 解析实体 → GraphStore 更新图
 *
 * Document 本体建模 (用户确认的设计):
 *   上传文档 → Document 节点 + OWNS/CORRESPONDS_TO/TRIGGERS/BELONGS_TO/DEPENDS_ON 边
 */
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
import type { OntologyEvent, NodeType, EdgeType } from './types';
import type { GraphStore } from './graph-store';
import { resolvePersonByEmail, resolveToolByUrl, resolvePersonByFeishuId, resolvePersonByGithubUser, resolveProcessByJiraKey } from './entity-registry';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/ontology-adapter');

// ═══ OntologyAdapter Interface ═══

export interface DataSourceConfig {
  orgId: string;
  credentials?: Record<string, string>;
  options?: Record<string, unknown>;
}

export interface OntologyAdapter {
  id: string;
  name: string;
  supportedDataSources: string[];
  connect(config: DataSourceConfig): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;
  subscribe(onEvent: (event: OntologyEvent) => void, graph?: string): void;
}

// ═══ Built-in Adapters ═══

/** 飞书消息→本体事件 适配器 (Phase A 原型) */
export class FeishuOntologyAdapter implements OntologyAdapter {
  id = 'feishu-adapter';
  name = '飞书本体适配器';
  supportedDataSources = ['feishu'];

  async connect(_config: DataSourceConfig): Promise<void> { log.info('[feishu-adapter] connected'); }
  async disconnect(): Promise<void> {}
  async healthCheck(): Promise<boolean> { return true; }

  setPublisher(pub: any): void { this.publisher = pub; }
  private publisher: any = null;

  subscribe(onEvent: (event: OntologyEvent) => void, graph = 'default'): void {
    // Phase B: 生产实现 — 对接飞书 Event Subscription API
    if (this.publisher) {
      this.mockEvents((event) => {
        for (const n of event.nodes) {
          this.publisher.publishNodeCreated(n.type, n.props, event.graph).catch((err) => { log.warn({ err }, '[feishu-adapter] publishNodeCreated failed'); });
        }
        for (const e of event.edges) {
          this.publisher.publishEdgeCreated(e.type, e.from, e.to, e.weight || 1, e.props || {}, event.graph).catch((err) => { log.warn({ err }, '[feishu-adapter] publishEdgeCreated failed'); });
        }
        onEvent(event);
      }, graph);
    } else {
      this.mockEvents(onEvent, graph);
    }
  }

  private mockEvents(onEvent: (event: OntologyEvent) => void, graph: string): void {
    const event: OntologyEvent = {
      id: `feishu_${Date.now().toString(36)}`, source: 'feishu', timestamp: new Date().toISOString(), graph,
      nodes: [
        { type: SOGNodeType.PERSON, props: { name: '示例用户A', source: 'feishu', externalId: 'ou_xxx' } },
        { type: SOGNodeType.PERSON, props: { name: '示例用户B', source: 'feishu', externalId: 'ou_yyy' } },
      ],
      edges: [
        { type: SOGEdgeType.INTERACTS_WITH, from: 'placeholder_a', to: 'placeholder_b', weight: 1, props: { channel: 'feishu', messageCount: 1 } },
      ],
    };
    onEvent(event);
  }
}

/** Git 提交→本体事件 适配器 (Phase A 原型) */
export class GitOntologyAdapter implements OntologyAdapter {
  id = 'git-adapter';
  name = 'Git 本体适配器';
  supportedDataSources = ['github', 'gitlab'];

  async connect(_config: DataSourceConfig): Promise<void> { log.info('[git-adapter] connected'); }
  async disconnect(): Promise<void> {}
  async healthCheck(): Promise<boolean> { return true; }

  subscribe(onEvent: (event: OntologyEvent) => void, graph = 'default'): void {
    // Phase A: 原型, 生产环境对接 GitHub/GitLab API
    const event: OntologyEvent = {
      id: `git_${Date.now().toString(36)}`,
      source: 'github',
      timestamp: new Date().toISOString(),
      graph,
      nodes: [
        { type: SOGNodeType.PERSON, props: { name: '开发者', source: 'github', username: 'dev-user' } },
        { type: SOGNodeType.EVENT, props: { type: 'deployment', description: '代码提交', timestamp: new Date().toISOString() } },
      ],
      edges: [
        { type: SOGEdgeType.INTERACTS_WITH, from: 'placeholder_dev', to: 'placeholder_event', weight: 1, props: { type: 'commit' } },
      ],
    };
    onEvent(event);
  }
}

// ═══ Document Ontology Modeling ═══

export interface DocumentUpload {
  id: string;
  name: string;
  type: 'prd' | 'meeting_notes' | 'report' | 'contract' | 'training' | string;
  content: string;
  source: 'user_upload' | 'system_generated' | 'feishu' | 'github';
  author?: string;
  authorEmail?: string;
  teamId?: string;
  version?: number;
  sensitivity?: 'public' | 'internal' | 'confidential';
  relatedProcessId?: string;
  relatedEventId?: string;
}

/** 文档上传→本体图节点+边 (用户确认的 Document 建模设计) */
export function ingestDocument(
  doc: DocumentUpload,
  graphStore: GraphStore,
  orgGraph: string,
): { nodeId: string; edges: string[] } {
  const now = new Date().toISOString();
  const edgeIds: string[] = [];

  // 1. Create Document node
  const nodeId = graphStore.createNode(SOGNodeType.DOCUMENT, {
    name: doc.name,
    docType: (['prd', 'meeting_notes', 'report', 'contract'].includes(doc.type) ? doc.type : 'other') as 'prd' | 'meeting_notes' | 'report' | 'contract' | 'other',
    type: doc.type,
    source: doc.source,
    version: doc.version || 1,
    sensitivity: doc.sensitivity || 'internal',
    createdAt: now,
  }, orgGraph);

  // 2. OWNS: Person → Document (if author is known)
  if (doc.authorEmail) {
    const personId = resolvePersonByEmail(graphStore, doc.authorEmail, orgGraph);
    if (personId) {
      const eid = graphStore.createEdge(SOGEdgeType.OWNS, personId, nodeId, 1, { ownershipType: 'manages', role: 'author' }, orgGraph);
      edgeIds.push(eid);
    } else if (doc.author) {
      const authorNodeId = graphStore.createNode(SOGNodeType.PERSON, { name: doc.author, email: doc.authorEmail, source: doc.source }, orgGraph);
      const eid = graphStore.createEdge(SOGEdgeType.OWNS, authorNodeId, nodeId, 1, { ownershipType: 'manages', role: 'author' }, orgGraph);
      edgeIds.push(eid);
    }
  }

  // 3. CORRESPONDS_TO: Document → Process (if related)
  if (doc.relatedProcessId) {
    const eid = graphStore.createEdge(SOGEdgeType.CORRESPONDS_TO, nodeId, doc.relatedProcessId, 0.9, { type: 'describes' }, orgGraph);
    edgeIds.push(eid);
  }

  // 4. CORRESPONDS_TO: Document → Event (if related)
  if (doc.relatedEventId) {
    const eid = graphStore.createEdge(SOGEdgeType.CORRESPONDS_TO, nodeId, doc.relatedEventId, 0.9, { type: 'references' }, orgGraph);
    edgeIds.push(eid);
  }

  // 5. BELONGS_TO: Document → Team
  if (doc.teamId) {
    const eid = graphStore.createEdge(SOGEdgeType.BELONGS_TO, nodeId, doc.teamId, 1, {}, orgGraph);
    edgeIds.push(eid);
  }

  log.info({ nodeId, edges: edgeIds.length, docType: doc.type }, '[ontology-adapter] Document ingested');
  return { nodeId, edges: edgeIds };
}

/** 文档版本更新: 旧版本标记 superseded, 新版本创建节点+版本边 */
export function updateDocumentVersion(
  docId: string,
  newDoc: DocumentUpload,
  graphStore: GraphStore,
  orgGraph: string,
): { newNodeId: string; oldNodeId: string } {
  // Mark old version as superseded (don't delete — edges would break)
  graphStore.updateNode(docId, { deprecated: true, supersededAt: new Date().toISOString() }, orgGraph);
  // Create new version
  const { nodeId } = ingestDocument({ ...newDoc, version: (newDoc.version || 1) + 1 }, graphStore, orgGraph);
  // DEPENDS_ON: new_version → old_version (safe: old node still exists)
  graphStore.createEdge(SOGEdgeType.CORRESPONDS_TO, nodeId, docId, 1, { correspondenceType: 'supersedes', confidence: 0.9, type: 'new_version' }, orgGraph);
  return { newNodeId: nodeId, oldNodeId: docId };
}

// ═══ Adapter Registry ═══

const adapterRegistry = new Map<string, OntologyAdapter>();

export function registerAdapter(adapter: OntologyAdapter): void {
  adapterRegistry.set(adapter.id, adapter);
}

export function getAdapter(id: string): OntologyAdapter | undefined {
  return adapterRegistry.get(id);
}

export function listAdapters(): OntologyAdapter[] {
  return [...adapterRegistry.values()];
}

// Register built-in adapters
registerAdapter(new FeishuOntologyAdapter());
registerAdapter(new GitOntologyAdapter());
