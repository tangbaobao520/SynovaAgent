import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeTalentDensity } from './computes/compute-talent-density';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/talent-density');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const talentDensitySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();

    try {
    let allNodeData: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS', 'AUGMENTS']); if (r.nodes[0]) { allNodeData = r.nodes; usedTraversal = true; } }
    } catch (err: unknown) { log.warn({ err, teamId }, 'graph traversal failed - fallback'); }
      const personNodes = store.queryNodes('Person', { teamId });

      // 高技能人才: 有技能数组或 proficiencyLevel >= 3
      const highSkill = personNodes.filter(n => {
        const skills = n.props.skills;
        const profLevel = n.props.proficiencyLevel !== undefined ? Number(n.props.proficiencyLevel) : 0;
        return (Array.isArray(skills) && skills.length > 0) || profLevel >= 3;
      });

      const result = computeTalentDensity(personNodes.length, highSkill.length);
      log.debug({ density: result.density, assessment: result.assessment }, '人才密度计算完成');

      if (result.degraded) {
        return [{ id: `o10-nodata-${now.getTime()}`, severity: 'info', title: '人员数据不足',
          description: '未检测到 Person 节点。', evidence: [], suggestion: '添加人员技能数据。', detectedAt: checkedAt }];
      }

      const dPct = (result.density * 100).toFixed(0);

      if (result.assessment === 'low') {
        return [{ id: `o10-crit-${now.getTime()}`, severity: 'warning', title: `人才密度低 (${dPct}%)`,
          description: `高技能人才仅占 ${(result.highSkillRatio * 100).toFixed(0)}%（${result.highSkillCount}/${result.totalPeople}），低于 20%。`,
          evidence: [`人才密度: ${dPct}%`, `高技能: ${result.highSkillCount}/${result.totalPeople}`],
          suggestion: '加强招聘和培训，提升团队技能水平。', detectedAt: checkedAt }];
      }

      if (result.assessment === 'moderate') {
        return [{ id: `o10-warn-${now.getTime()}`, severity: 'info', title: `人才密度中等 (${dPct}%)`,
          description: `高技能人才占 ${(result.highSkillRatio * 100).toFixed(0)}%。`,
          evidence: [`人才密度: ${dPct}%`],
          suggestion: '持续投资人才培养。', detectedAt: checkedAt }];
      }

      return [{ id: `o10-healthy-${now.getTime()}`, severity: 'info', title: `人才密度高 (${dPct}%)`,
        description: `高技能人才占 ${(result.highSkillRatio * 100).toFixed(0)}%，组织竞争力强。`,
        evidence: [`人才密度: ${dPct}%`, `高技能: ${result.highSkillCount}/${result.totalPeople}`],
        suggestion: '维持人才优势。', detectedAt: checkedAt }];
    } catch (err: unknown) {
      log.error({ err }, '[talent-density] 失败');
      return [{ id: `o10-error-${now.getTime()}`, severity: 'warning', title: '检测异常',
        description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据。', detectedAt: checkedAt }];
    }
  },
};
