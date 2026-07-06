import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeRoutineDiffusion } from './computes/compute-routine-diffusion';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/routine-diffusion');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const routineDiffusionSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();

    try {
    let allNodeData: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS']); if (r.nodes[0]) { allNodeData = r.nodes; usedTraversal = true; } }
    } catch (err: unknown) { log.warn({ err, teamId }, 'graph traversal failed - fallback'); }
      const processNodes = store.queryNodes('Process', { teamId });
      const teamNodes = store.queryNodes('Team', { teamId });

      const result = computeRoutineDiffusion(processNodes.length, teamNodes.length);
      log.debug({ score: result.score, assessment: result.assessment }, '惯例扩散计算完成');

      if (result.degraded) {
        return [{
          id: `o5-nodata-${now.getTime()}`, severity: 'info',
          title: '扩散数据不足',
          description: '未检测到 Process 或 Team 节点。',
          evidence: [], suggestion: '添加工序和团队数据。', detectedAt: checkedAt,
        }];
      }

      const sp = (result.score * 100).toFixed(0);

      if (result.assessment === 'slow') {
        return [{
          id: `o5-crit-${now.getTime()}`, severity: 'warning',
          title: `惯例扩散缓慢 (${sp}%)`,
          description: `${result.totalProcesses} 个流程在团队中使用率低。`,
          evidence: [`扩散: ${sp}%`, `流程/团队: ${result.processesPerTeam}`],
          suggestion: '推广最佳实践，降低跨团队协作壁垒。', detectedAt: checkedAt,
        }];
      }

      if (result.assessment === 'moderate') {
        return [{
          id: `o5-warn-${now.getTime()}`, severity: 'info',
          title: `惯例扩散中等 (${sp}%)`,
          description: '部分流程已跨团队推广。', evidence: [`扩散: ${sp}%`],
          suggestion: '识别尚未采纳关键流程的团队。', detectedAt: checkedAt,
        }];
      }

      return [{
        id: `o5-healthy-${now.getTime()}`, severity: 'info',
        title: `惯例扩散快速 (${sp}%)`,
        description: '新惯例在各团队间快速扩散。', evidence: [`扩散: ${sp}%`],
        suggestion: '维持知识共享机制。', detectedAt: checkedAt,
      }];
    } catch (err: unknown) {
      log.error({ err }, '[routine-diffusion] 失败');
      return [{ id: `o5-error-${now.getTime()}`, severity: 'warning',
        title: '检测异常', description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查数据。', detectedAt: checkedAt }];
    }
  },
};
