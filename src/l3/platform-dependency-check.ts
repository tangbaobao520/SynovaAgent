/**
 * src/l3/platform-dependency-check.ts — 平台依赖检查诊断模块 (L3)
 *
 * 通过 DEPENDS_ON_PLATFORM 边遍历，检测活动对特定平台的依赖程度。
 * 不创建新哨兵目录（约束6），通过 runModules() 消费。
 *
 * 消费边: DEPENDS_ON_PLATFORM
 *
 * Iron law #24: catch + log + degraded.
 * Iron law #38: zero unsafe casts.
 */
import { createLogger } from '@synova/logger';
import type { GraphTraversal, GraphStoreReader } from '../l4/graph-traversal';

const log = createLogger('l3/platform-dependency-check');

export interface PlatformDependencyFinding {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  evidence: string[];
  suggestion: string;
}

export interface PlatformDependencyResult {
  findings: PlatformDependencyFinding[];
  totalDependencies: number;
  avgDependencyDepth: number;
  minSubstitutability: number;
  degraded: boolean;
  warnings: string[];
}

export async function checkPlatformDependencies(
  store: GraphStoreReader,
  teamId: string,
  traversal?: GraphTraversal,
): Promise<PlatformDependencyResult> {
  const warnings: string[] = [];
  const findings: PlatformDependencyFinding[] = [];
  let totalDependencies = 0;
  let depthSum = 0;
  let minSubstitutability = 1;

  try {
    if (traversal) {
      try {
        const result = traversal.traverse([teamId], ['DEPENDS_ON_PLATFORM']);
        if (result.edges.length > 0) {
          for (const edge of result.edges) {
            totalDependencies++;
            const depth = Number(edge.props.dependency_depth) || 0;
            depthSum += depth;
            const subst = Number(edge.props.platform_substitutability) || 0;
            if (subst < minSubstitutability) minSubstitutability = subst;

            if (depth > 0.8) {
              findings.push({
                severity: 'warning',
                title: '深度平台依赖',
                description: `依赖深度${(depth * 100).toFixed(0)}% > 80%，替换成本高`,
                evidence: [`dependency_depth: ${depth}`, `substitutability: ${subst}`],
                suggestion: '评估平台替换方案，降低单平台锁定风险。',
              });
            }

            if (subst < 0.2) {
              findings.push({
                severity: 'critical',
                title: '平台不可替代',
                description: `平台可替代性${(subst * 100).toFixed(0)}% < 20%，被锁定风险极高`,
                evidence: [`substitutability: ${subst}`, `depth: ${depth}`],
                suggestion: '制定平台退出策略，寻找替代平台或构建内部能力。',
              });
            }
          }
        }
      } catch (err: unknown) {
        warnings.push(`DEPENDS_ON_PLATFORM遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (totalDependencies === 0) {
      return {
        findings: [], totalDependencies: 0, avgDependencyDepth: 0,
        minSubstitutability: 1, degraded: true,
        warnings: ['无平台依赖数据 — 无法检查平台绑定风险'],
      };
    }

    if (findings.length === 0) {
      findings.push({
        severity: 'info',
        title: '平台依赖健康',
        description: `${totalDependencies}个平台依赖，平均深度${((depthSum / totalDependencies) * 100).toFixed(0)}%，最低可替代性${(minSubstitutability * 100).toFixed(0)}%`,
        evidence: [`总数: ${totalDependencies}`, `平均深度: ${(depthSum / totalDependencies).toFixed(2)}`, `最低可替代性: ${minSubstitutability.toFixed(2)}`],
        suggestion: '持续监控平台依赖变化。',
      });
    }

    log.info({ teamId, totalDependencies, findings: findings.length }, '平台依赖检查完成');
  } catch (err: unknown) {
    log.error({ err, teamId }, '[platform-dependency-check] 检查失败');
    return {
      findings: [], totalDependencies: 0, avgDependencyDepth: 0,
      minSubstitutability: 1, degraded: true,
      warnings: [`检查异常: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const avgDepth = totalDependencies > 0 ? depthSum / totalDependencies : 0;
  return {
    findings, totalDependencies,
    avgDependencyDepth: Math.round(avgDepth * 100) / 100,
    minSubstitutability: Math.round(minSubstitutability * 100) / 100,
    degraded: false, warnings,
  };
}
