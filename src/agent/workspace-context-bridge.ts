/**
 * workspace-context-bridge.ts — 工作区上下文桥接 (L2, v3.3)
 *
 * 给定 workspaceId → 返回该工作区的已确认判断 + 关联工作区事实
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
