/**
 * src/l3/assumption-monitor.ts — 外部假设监控诊断模块 (L3)
 *
 * 通过 EXTERNAL_ASSUMPTION_BINDS 边遍历，检测经营模型对外部环境不变的赌注。
 * 不创建新哨兵目录（约束6），通过 runModules() 消费。
 *
 * 消费边: EXTERNAL_ASSUMPTION_BINDS
 *
 * Iron law #24: catch + log + degraded.
 * Iron law #38: zero unsafe casts.
 */
import { createLogger } from '@synova/logger';
import type { GraphTraversal, GraphStoreReader } from '../l4/graph-traversal';

const log = createLogger('l3/assumption-monitor');

export interface AssumptionFinding {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  evidence: string[];
  suggestion: string;
}

export interface AssumptionMonitorResult {
  findings: AssumptionFinding[];
  totalAssumptions: number;
  maxDependency: number;
  hasCounterfactualTest: boolean;
  degraded: boolean;
  warnings: string[];
}

export async function checkExternalAssumptions(
  store: GraphStoreReader,
  teamId: string,
  traversal?: GraphTraversal,
): Promise<AssumptionMonitorResult> {
  const warnings: string[] = [];
  const findings: AssumptionFinding[] = [];
  let totalAssumptions = 0;
  let maxDependency = 0;
  let hasCounterfactualTest = false;

  try {
    if (traversal) {
      try {
        const result = traversal.traverse([teamId], ['EXTERNAL_ASSUMPTION_BINDS']);
        if (result.edges.length > 0) {
          for (const edge of result.edges) {
            totalAssumptions++;
            const depCount = Number(edge.props.exogenous_dependency_count) || 0;
            if (depCount > maxDependency) maxDependency = depCount;
            const cfTest = Number(edge.props.counterfactual_test_exists) || 0;
            if (cfTest > 0) hasCounterfactualTest = true;

            const concentration = Number(edge.props.single_channel_concentration) || 0;
            if (concentration > 0.7) {
              findings.push({
                severity: 'warning',
                title: '单渠道集中度风险',
                description: `外部假设${totalAssumptions}中单渠道集中度${(concentration * 100).toFixed(0)}% > 70%`,
                evidence: [`dependency_count: ${depCount}`, `concentration: ${concentration}`],
                suggestion: '分散外部依赖渠道，降低单点故障风险。',
              });
            }
          }
        }
      } catch (err: unknown) {
        warnings.push(`EXTERNAL_ASSUMPTION_BINDS遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (totalAssumptions === 0) {
      return {
        findings: [],
        totalAssumptions: 0,
        maxDependency: 0,
        hasCounterfactualTest: false,
        degraded: true,
        warnings: ['无外部假设数据 — 无法监控假设绑架风险'],
      };
    }

    if (!hasCounterfactualTest) {
      findings.push({
        severity: 'warning',
        title: '外部假设缺乏反事实测试',
        description: `${totalAssumptions}个外部假设均未设置反事实测试机制`,
        evidence: [`假设数: ${totalAssumptions}`, `最大依赖: ${maxDependency}`],
        suggestion: '为关键外部假设建立反事实测试和预警机制。',
      });
    }

    if (maxDependency >= 5) {
      findings.push({
        severity: 'critical',
        title: '外部依赖过度集中',
        description: `最大外部依赖计数${maxDependency} >= 5，经营模型对外部环境过度依赖`,
        evidence: [`最大依赖: ${maxDependency}`, `假设总数: ${totalAssumptions}`],
        suggestion: '审查外部依赖结构，建立B计划减少关键假设绑架。',
      });
    }

    log.info({ teamId, totalAssumptions, findings: findings.length }, '外部假设监控完成');
  } catch (err: unknown) {
    log.error({ err, teamId }, '[assumption-monitor] 检查失败');
    return {
      findings: [], totalAssumptions: 0, maxDependency: 0,
      hasCounterfactualTest: false, degraded: true,
      warnings: [`检查异常: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  return { findings, totalAssumptions, maxDependency, hasCounterfactualTest, degraded: false, warnings };
}
