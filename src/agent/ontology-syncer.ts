/**
 * agent/ontology-syncer.ts — 本体同步器 (ConversationEngine 子组件)
 *
 * 从 ConversationEngine (915 行) 中提取的第 3 个子组件。
 * 职责: syncToSOG() 启发式抽取 + GraphStore 写入 (~90 行)
 *
 * Iron law #31: engine-core 不可用时静默降级——返回空结果，不阻断对话。
 */
import type { EngineContext } from './engine-context';
import { createLogger } from '../logger';

const log = createLogger('agent/ontology-syncer');

export interface OntologySyncResult {
  persons: number;
  teams: number;
  personsDetail?: string[];
  teamCount: number;
  created: boolean;
}

export class OntologySyncer {
  private ctx: EngineContext;

  constructor(ctx: EngineContext) {
    this.ctx = ctx;
  }

  /**
   * Extract organization info from Phase 0 messages and sync to SOG graph.
   *
   * Uses simple heuristics (keyword extraction) to identify:
   *   - Organization name → creates Team node
   *   - Role/title mentions → creates Person nodes
   *   - Team count mentions → creates Team nodes
   */
  async syncToSOG(): Promise<OntologySyncResult> {
    const userMessages = this.ctx.messages.filter(m => m.role === 'user');
    const allText = userMessages.map(m => m.content).join(' ');
    const personNames = new Set<string>();

    // Heuristic: quoted names are likely persons or teams
    const quotedPattern = /「([^」]{1,10})」/g;
    let match: RegExpExecArray | null;
    while ((match = quotedPattern.exec(allText)) !== null) {
      personNames.add(match[1]);
    }

    // Heuristic: "X人" / "X个团队" / "X部门"
    const teamCountMatch = allText.match(/(\d+)\s*(个|名|位).*(团队|部门|组)/);
    const teamCount = teamCountMatch ? parseInt(teamCountMatch[1]) : 0;

    // Heuristic: "CEO/CTO/经理" patterns
    const rolePattern = /([一-鿿]{2,4})(?:是|担任?|负责?)(?:我们的?)?(CEO|CTO|经理|主管|总监|负责人)/g;
    while ((match = rolePattern.exec(allText)) !== null) {
      personNames.add(match[1]);
    }

    const result: OntologySyncResult = {
      persons: personNames.size,
      teams: teamCount > 0 ? teamCount : 1,
      personsDetail: [...personNames],
      teamCount,
      created: false,
    };

    // 铁律 39: 通过 adapter 获取 GraphStore, 不直接 import vendor
    try {
      const { SOGNodeType } = await import('@synova/sog-core');
      const { getDatabase } = await import('../init/engine-context');
      const db = getDatabase();
      if (!this.ctx.createGraphStore) {
        log.warn('createGraphStore 未注入 — 跳过 SOG 同步');
        return result;
      }
      const store = await this.ctx.createGraphStore(db) as Record<string, unknown>;

      // Create Team node
      store.createNode(SOGNodeType.TEAM, {
        name: this.ctx.orgId || '默认组织',
        teamType: 'permanent',
      }, this.ctx.orgId || 'default');

      // Create Person nodes from extracted names
      for (const name of personNames) {
        store.createNode(SOGNodeType.PERSON, { name }, this.ctx.orgId || 'default');
      }

      result.created = true;
      log.info({
        persons: personNames.size,
        team: this.ctx.orgId,
      }, 'SOG 本体节点已创建');
    } catch (err: any) {
      log.warn({ err: err.message }, 'SOG 同步失败（engine-core 不可用），继续非本体模式');
    }

    return result;
  }
}
