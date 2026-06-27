import type { SentinelFinding } from '../../../src/sentinel/types';
import { computePowerRigidity } from './computes/compute-power-rigidity';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/power-rigidity');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const powerRigiditySentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();

    try {
      const personNodes = store.queryNodes('Person', { teamId });
      // 有管理职责的人员（含有 manager/reportsTo 字段或 isManager 标记）
      const managers = personNodes.filter(n =>
        n.props.isManager === true || n.props.role === 'manager' || n.props.role === 'director' ||
        n.props.role === 'lead' || n.props.role === 'head' || n.props.role === 'chief'
      );

      const result = computePowerRigidity(personNodes.length, managers.length);
      log.debug({ rigidityIndex: result.rigidityIndex, assessment: result.assessment }, '权力刚性计算完成');

      if (result.degraded) {
        return [{ id: `o9-nodata-${now.getTime()}`, severity: 'info', title: '人员数据不足',
          description: '未检测到 Person 节点。', evidence: [], suggestion: '添加组织人员数据。', detectedAt: checkedAt }];
      }

      const riPct = (result.rigidityIndex * 100).toFixed(0);

      if (result.assessment === 'rigid') {
        return [{ id: `o9-crit-${now.getTime()}`, severity: 'critical', title: `权力结构刚性 (${riPct}%)`,
          description: `管理比 ${(result.managerRatio * 100).toFixed(0)}%（${result.managerCount}/${result.totalPeople}），超过 20% 警戒线。权力过度集中可能导致一线问题无法上达。`,
          evidence: [`刚性指数: ${riPct}%`, `管理比: ${(result.managerRatio * 100).toFixed(0)}%`],
          suggestion: '减少管理层级，授权一线决策。', detectedAt: checkedAt }];
      }

      if (result.assessment === 'loose') {
        return [{ id: `o9-warn-${now.getTime()}`, severity: 'info', title: `权力结构松散 (${riPct}%)`,
          description: `管理比仅 ${(result.managerRatio * 100).toFixed(0)}%，可能缺乏足够的协调和方向指引。`,
          evidence: [`刚性指数: ${riPct}%`, `管理比: ${(result.managerRatio * 100).toFixed(0)}%`],
          suggestion: '评估是否需要加强管理协调能力。', detectedAt: checkedAt }];
      }

      return [{ id: `o9-healthy-${now.getTime()}`, severity: 'info', title: `权力结构平衡 (${riPct}%)`,
        description: `管理比 ${(result.managerRatio * 100).toFixed(0)}%，在 10%-20% 健康区间。`,
        evidence: [`刚性指数: ${riPct}%`, `管理比: ${(result.managerRatio * 100).toFixed(0)}%`],
        suggestion: '维持当前组织结构。', detectedAt: checkedAt }];
    } catch (err: unknown) {
      log.error({ err }, '[power-rigidity] 失败');
      return [{ id: `o9-error-${now.getTime()}`, severity: 'warning', title: '检测异常',
        description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据。', detectedAt: checkedAt }];
    }
  },
};
