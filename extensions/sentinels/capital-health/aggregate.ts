/**
 * capital-health/aggregate.ts — 资本健康哨兵(合并)
 *
 * 合并自 capital-efficiency(F3) + capital-structure(F2) + capital-turnover(F5)。
 * 整合源哨兵 check() 结果，合并为统一 Finding[]。
 * 源文件保留在 _extinct/ 作为审计参考。
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/capital-health');

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

export const capitalHealthSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date();
    const findings: SentinelFinding[] = [];

    try {
      // P1-3 (K3 20260813): 入口字段完整性校验 — _extinct 子哨兵对缺失字段
      // `Number(x)||0` 兜底成 0 产出假 critical（T3-a: 注入 {revenue:100} 单节点 → 2 critical）。
      // 调用子哨兵前校验 Financial 节点必填字段组，缺失即返回 degraded finding 并跳过子哨兵
      // （dev doc §4.5 决策: 入口校验，不重写 _extinct 子哨兵 — 重写是 D358）。
      // 字段组按 K3 T3-a 假 critical 机制推演: ICR(operatingIncome+interestExpense)、
      // 资产周转率(totalAssets)、资本结构(totalDebt+equity)、资本周转率(revenue+totalDebt+equity)。
      const REQUIRED_FIELD_GROUPS: Array<{ name: string; fields: string[] }> = [
        { name: 'revenue', fields: ['revenue', 'totalRevenue'] },
        { name: 'totalAssets', fields: ['totalAssets'] },
        { name: 'totalDebt', fields: ['totalDebt'] },
        { name: 'equity', fields: ['equity'] },
        { name: 'operatingIncome', fields: ['operatingIncome', 'operatingCashFlow'] },
        { name: 'interestExpense', fields: ['interestExpense'] },
      ];
      // 存在性判定: 显式 0 是合法数据（无收入/无负债企业），只有 undefined/null/'' 视为缺失
      const hasValue = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

      const finNodes = store.queryNodes('Financial', { teamId });
      if (finNodes.length === 0) {
        // 维持 K3 T2-b 空库基线行为: 无 Financial 节点 = 正常空态，非降级
        log.info({ teamId }, '无 Financial 节点 — 空库基线');
        return [];
      }

      const props = finNodes[0]?.props || {};
      const missingGroups = REQUIRED_FIELD_GROUPS.filter(
        g => !g.fields.some(f => hasValue(props[f])),
      );
      if (missingGroups.length > 0) {
        const names = missingGroups.map(g => g.name).join('、');
        log.warn({ teamId, missing: names }, 'Financial 节点缺必填字段组 — 跳过子哨兵（防缺失字段默认 0 假 critical）');
        return [{
          id: `ch-degraded-${now.getTime()}`,
          severity: 'warning',
          title: '资本健康数据不完整',
          description: `Financial 节点缺失必填字段组: ${names}。已跳过资本健康子检查，避免缺失字段被默认为 0 产生误报。`,
          evidence: [`缺失字段组: ${names}`],
          suggestion: '请补全财务数据字段后重试。',
          detectedAt: now.toISOString(),
        }];
      }

      // 动态 import 源哨兵 aggregate（保留在 _extinct/）
      const { capitalEfficiencySentinel } = await import('../_extinct/capital-efficiency/aggregate');
      const { capitalStructureSentinel } = await import('../_extinct/capital-structure/aggregate');
      const { capitalTurnoverSentinel } = await import('../_extinct/capital-turnover/aggregate');

      const [r1, r2, r3] = await Promise.all([
        capitalEfficiencySentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[capital-health] capital-efficiency 子检查失败');
          return [] as SentinelFinding[];
        }),
        capitalStructureSentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[capital-health] capital-structure 子检查失败');
          return [] as SentinelFinding[];
        }),
        capitalTurnoverSentinel.check(store, teamId, traversal).catch((err: unknown) => {
          log.warn({ err }, '[capital-health] capital-turnover 子检查失败');
          return [] as SentinelFinding[];
        }),
      ]);

      findings.push(...r1, ...r2, ...r3);
      log.debug({ totalFindings: findings.length }, '资本健康合并检查完成');
      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[capital-health] check 失败');
      return [{
        id: `ch-error-${now.getTime()}`, severity: 'warning' as const,
        title: '资本健康检测异常',
        description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查源哨兵 aggregate.ts 和 Financial 数据源。',
        detectedAt: now.toISOString(),
      }];
    }
  },
};
