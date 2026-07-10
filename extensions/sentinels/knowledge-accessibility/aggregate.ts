import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeKnowledgeAccessibility } from './computes/compute-knowledge-accessibility';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/knowledge-accessibility');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const knowledgeAccessibilitySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    let docNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let personNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;

    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS', 'TECH_INFRASTRUCTURE']); if (r.nodes[0]) { docNodes = r.nodes.filter(n => n.type === 'DOCUMENT'); personNodes = r.nodes.filter(n => n.type === 'PERSON'); usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { docNodes = store.queryNodes('Document', { teamId }); personNodes = store.queryNodes('Person', { teamId }); }

      // 能力广度从 Person.skills/competency_vector 计算
      const skillCount = personNodes.reduce((s, n) => {
        const skills = (n.props.skills as string) || (n.props.competencyVector as string) || '';
        return s + (skills ? skills.split(',').filter(Boolean).length : 1);
      }, 0);
      const result = computeKnowledgeAccessibility(
        docNodes.length,
        docNodes.length,
        skillCount,
        personNodes.length
      );
      log.debug({ score: result.score, assessment: result.assessment }, '知识可调用性计算完成');

      if (result.degraded) {
        return [{
          id: `o4-nodata-${now.getTime()}`, severity: 'info',
          title: '知识数据不足',
          description: '未检测到知识节点和人员节点。',
          evidence: [], suggestion: '上传关键知识文档和人员信息。',
          detectedAt: checkedAt,
        }];
      }

      const scorePct = (result.score * 100).toFixed(0);

      if (result.assessment === 'low') {
        return [{
          id: `o4-crit-${now.getTime()}`, severity: 'critical',
          title: `关键知识可调用性低 (${scorePct}%)`,
          description: `知识文档化率 ${(result.documentedRate * 100).toFixed(0)}%，${result.personNodes} 人中仅对应 ${result.knowledgeNodes} 个知识节点。Szulanski(1996)指出知识粘性高会导致组织脆弱。`,
          evidence: [`可调用性: ${scorePct}%`, `知识节点: ${result.knowledgeNodes}`, `人员: ${result.personNodes}`, `文档化率: ${(result.documentedRate * 100).toFixed(0)}%`],
          suggestion: '将关键岗位的知识进行文档化，建立知识库。',
          detectedAt: checkedAt,
        }];
      }

      if (result.assessment === 'medium') {
        return [{
          id: `o4-warn-${now.getTime()}`, severity: 'warning',
          title: `知识可调用性中等 (${scorePct}%)`,
          description: '部分知识已文档化，但覆盖率仍有提升空间。',
          evidence: [`可调用性: ${scorePct}%`, `知识节点: ${result.knowledgeNodes}`, `文档化率: ${(result.documentedRate * 100).toFixed(0)}%`],
          suggestion: '识别关键知识缺口，优先文档化高流失风险岗位的知识。',
          detectedAt: checkedAt,
        }];
      }

      return [{
        id: `o4-healthy-${now.getTime()}`, severity: 'info',
        title: `知识可调用性高 (${scorePct}%)`,
        description: '关键知识已被充分文档化且可访问。',
        evidence: [`可调用性: ${scorePct}%`, `文档化率: ${(result.documentedRate * 100).toFixed(0)}%`],
        suggestion: '维持知识管理实践。',
        detectedAt: checkedAt,
      }];
    } catch (err: unknown) {
      log.error({ err }, '[knowledge-accessibility] check 失败');
      return [{
        id: `o4-error-${now.getTime()}`, severity: 'warning',
        title: '知识可调用性检测异常', description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt,
      }];
    }
  },
};
