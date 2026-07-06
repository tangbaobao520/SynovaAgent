import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeFinkelsteinPowerIndex } from './computes/compute-power-rigidity';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/power-rigidity');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const powerRigiditySentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();

    try {
    let personNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let eventNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      if (traversal) { const r = traversal.traverse([teamId], ['DEPLOYS', 'SIGNAL_TRANSMITS']); if (r.nodes[0]) { personNodes = r.nodes.filter(n => n.type === 'PERSON'); eventNodes = r.nodes.filter(n => n.type === 'EVENT'); usedTraversal = true; } }
    } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
    if (!usedTraversal) { personNodes = store.queryNodes('Person', { teamId }); eventNodes = store.queryNodes('Event', { teamId }); }

      const totalPeople = personNodes.length;

      // 结构权力: CEO/Founder决策审批占比
      const decisionApprovals = eventNodes.filter(n => {
        const type = (n.props.eventType as string || '').toLowerCase();
        return type.includes('decision_approval') || type.includes('approval') || type.includes('decision');
      });
      const ceoApprovals = decisionApprovals.filter(n => {
        const initiator = String(n.props.initiator || n.props.initiatedBy || '').toLowerCase();
        return initiator.includes('ceo') || initiator.includes('founder') || initiator.includes('owner');
      });

      // 管理人数 (用于兼容旧版 managerRatio)
      const managers = personNodes.filter(n =>
        n.props.isManager === true || n.props.role === 'manager' || n.props.role === 'director' ||
        n.props.role === 'lead' || n.props.role === 'head' || n.props.role === 'chief'
      );

      const result = computeFinkelsteinPowerIndex({
        totalPeople,
        ceoDecisionApprovals: ceoApprovals.length,
        totalDecisionApprovals: decisionApprovals.length,
        founderEquity: 0.5, // 默认0.5 — 可通过配置覆盖
        managerCount: managers.length,
      });
      log.debug({ powerIndex: result.powerIndex, signal: result.signal, stageExempt: result.stageExempt }, '权力结构指数计算完成 (Finkelstein升级版)');

      if (result.degraded) {
        return [{ id: `o9-nodata-${now.getTime()}`, severity: 'info', title: '人员数据不足',
          description: '未检测到 Person 节点。', evidence: [], suggestion: '添加组织人员数据。', detectedAt: checkedAt }];
      }

      // Stage0-1 豁免
      if (result.signal === 'stage0_exempt') {
        return [{ id: `o9-exempt-${now.getTime()}`, severity: 'info', title: `权力结构 — 阶段0-1豁免 (${totalPeople}人)`,
          description: `组织人数不足20人（当前${totalPeople}人），创业阶段权力集中属于正常现象，不适用Finkelstein权力结构评估。`,
          evidence: [`人数: ${totalPeople}`, `权力指数: ${result.powerIndex}`, `豁免: 阶段0-1`],
          suggestion: '随着组织扩张至20人以上，逐步建立分权机制。', detectedAt: checkedAt }];
      }

      if (result.signal === 'critical') {
        return [{ id: `o9-crit-${now.getTime()}`, severity: 'critical', title: `权力结构刚性 (指数 ${result.powerIndex})`,
          description: `Finkelstein四维度: 结构权力${result.structuralPower} / 所有权${result.ownershipPower} / 专家${result.expertisePower} / 声望${result.prestigePower}`,
          evidence: [`权力指数: ${result.powerIndex}`, `管理比: ${(result.managerRatio * 100).toFixed(0)}%`],
          suggestion: '建立分权机制，授权一线决策。', detectedAt: checkedAt }];
      }

      if (result.signal === 'warning') {
        return [{ id: `o9-warn-${now.getTime()}`, severity: 'warning', title: `权力结构偏集中 (指数 ${result.powerIndex})`,
          description: `Finkelstein指数 ${result.powerIndex}，在 0.5-0.8 预警区间。`,
          evidence: [`权力指数: ${result.powerIndex}`, `管理比: ${(result.managerRatio * 100).toFixed(0)}%`],
          suggestion: '评估授权机制是否充足。', detectedAt: checkedAt }];
      }

      return [{ id: `o9-healthy-${now.getTime()}`, severity: 'info', title: `权力结构平衡 (指数 ${result.powerIndex})`,
        description: `Finkelstein指数 ${result.powerIndex}，低于 0.5 健康阈值。`,
        evidence: [`权力指数: ${result.powerIndex}`, `管理比: ${(result.managerRatio * 100).toFixed(0)}%`],
        suggestion: '维持当前组织结构。', detectedAt: checkedAt }];
    } catch (err: unknown) {
      log.error({ err }, '[power-rigidity] 失败');
      return [{ id: `o9-error-${now.getTime()}`, severity: 'warning', title: '检测异常',
        description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据。', detectedAt: checkedAt }];
    }
  },
};
