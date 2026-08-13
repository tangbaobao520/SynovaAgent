/**
 * workspace-context-bridge.ts — 工作区上下文桥接 (L2, v3.3)
 *
 * 给定 workspaceId → 返回该工作区的已确认判断 + 关联工作区事实
 *
 * @deprecated — D74 工作台数据聚合 (workspace-builder.ts) 已替代此桥接。
 *   旧代码保留不动，D77b 时统一删除。不修改此文件。
 *
 * 架构例外(铁律39): L2→L4 直接访问 AgentMemoryStore。
 * 理由: ContextBridge 是轻量数据查询适配器——只读不写，不操作本体图，
 * 不绕过 L3 推理层。它只做"从这个 store 查几条事实"，等价于 L2 调用
 * L4 的 list()/search() 方法。无业务逻辑、无写操作、无跨层副作用。
 */
import type { AgentMemoryStore, MemoryQuery } from '../l4/agent-memory-store';

export class WorkspaceContextBridge {
  constructor(private memoryStore: AgentMemoryStore) {}

  async loadContextForWorkspace(workspaceId: string, tags?: string[]): Promise<{
    ownFacts: string[];
    relatedFacts: string[];
  }> {
    // Step 1: 加载本工作区事实
    const query: MemoryQuery = {
      orgId: workspaceId,
      type: 'enterprise_fact',
    };
    const ownEntries = this.memoryStore.list(query);
    const ownFacts = ownEntries.map(f => `${f.key}: ${f.value}`);

    // Step 2: 跨工作区搜索相关事实
    let relatedFacts: string[] = [];
    if (tags && tags.length > 0) {
      const searchResults = this.memoryStore.search(workspaceId, tags.join(' '), 5);
      relatedFacts = searchResults
        .filter(f => f.orgId !== workspaceId)
        .map(f => `[来自 ${f.orgId} 工作区] ${f.key}: ${f.value}`);
    }

    return { ownFacts, relatedFacts };
  }
}
