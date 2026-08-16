/**
 * extensions/sentinels/path-dependency/computes/detect.ts — 路径依赖检测 (Path Dependency Detection)
 *
 * SYNOVA-IMPL-DSH-D379 — path-dependency 哨兵空壳补实现（strategy 专家下唯一空壳，D378 审计核实）。
 * manifest 契约冻结（manifest.json）: entryPoint "./computes/detect.ts"、exportKey "pathDependencySentinel"、
 * thresholds.dependency_score { warning: 0.4, critical: 0.7 }、computes ["detect-path-dependency"]（文档性声明）。
 *
 * 理论依据: 检测组织对特定技术栈、流程或合作模式的依赖程度。
 * 高路径依赖 = 切换成本高、灵活性低、锁定风险大。
 * 算法（历史实现 docs/archive/sentinels/path-dependency/computes/detect.ts 适配同步接口）:
 *   入度集中度 HHI（60%）+ 单一来源依赖占比（40%）→ dependency_score ∈ [0,1]
 *
 * 契约（铁律 47，JSDoc 输入/输出/降级）:
 *   detectPathDependency(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal)
 *     输入: store — 同步图接口（queryNodes/queryEdges，graph-traversal.ts L13-15 契约）
 *     输出: { value: number; degraded: boolean; evidence: string[] }
 *           value ∈ [0,1] — 依赖程度（越高越依赖/锁定）
 *     降级: 空图（0 节点或 0 边）→ { value: 0, degraded: true, evidence: [] }
 *           单节点零边 → HHI 分母 guard，不除零（返回 degraded，value 有限）
 *     阈值: 不在此函数内判定（纯 compute），哨兵对象 check 读 manifest.thresholds（0.4/0.7），
 *           历史算法内部 0.3/0.6 弃用（dev doc §4.5 决策 A）
 */

import type { SentinelFinding } from '../../../../src/sentinel/types';
import type { GraphTraversal, GraphStoreReader } from '../../../../src/l4/graph-traversal';
import type { SentinelManifest } from '../../../../src/sentinel/sentinel-loader';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/path-dependency');

/** 路径依赖检测结果（compute 契约，铁律 47） */
export interface PathDependencyComputeResult {
  /** 依赖程度评分 [0,1]，越高越依赖 */
  value: number;
  /** 降级标记：空图/数据不足时为 true（铁律 31） */
  degraded: boolean;
  /** 证据列表（入度集中度 HHI、单一来源占比、边数） */
  evidence: string[];
}

/**
 * 路径依赖检测 compute — 入度集中度 HHI（60%）+ 单一来源依赖占比（40%）。
 *
 * @param store  同步图接口（GraphStoreReader，graph-traversal.ts 契约）
 * @param _teamId 团队 ID（当前算法不按团队过滤，全图统计）
 * @param _traversal 图遍历实例（预留，当前算法直接使用 queryNodes/queryEdges）
 * @returns { value, degraded, evidence } — value ∈ [0,1]；空图 degraded: true, value: 0
 */
export async function detectPathDependency(
  store: GraphStoreReader,
  _teamId: string,
  _traversal?: GraphTraversal,
): Promise<PathDependencyComputeResult> {
  try {
    const nodes = store.queryNodes('', undefined, undefined);
    const edges = store.queryEdges(undefined, undefined, undefined, undefined);

    // 空图（0 节点或 0 边）→ degraded（铁律 31：数据不足不产出 finding）
    // 单节点零边同样走此分支 → HHI 分母 guard（不除零）
    if (!Array.isArray(nodes) || nodes.length === 0 || !Array.isArray(edges) || edges.length === 0) {
      return { value: 0, degraded: true, evidence: [] };
    }

    // 入度集中度: 依赖边汇聚到少数目标 = 高锁定风险
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    for (const e of edges) {
      const target = e.to;
      if (target) inDegree.set(target, (inDegree.get(target) || 0) + 1);
      const source = e.from;
      if (source) outDegree.set(source, (outDegree.get(source) || 0) + 1);
    }

    const totalInDegrees = Array.from(inDegree.values()).reduce((s, c) => s + c, 0);
    let hhiDependency = 0;
    if (totalInDegrees > 0) {
      for (const count of inDegree.values()) {
        const share = count / totalInDegrees;
        hhiDependency += share * share;
      }
      // 归一化: 对 N 个目标，max HHI = 1, min = 1/N
      const n = inDegree.size;
      const minHHI = n > 0 ? 1 / n : 0;
      hhiDependency = n > 1 ? (hhiDependency - minHHI) / (1 - minHHI) : 1;
    }

    // 单一来源依赖: 边过度集中于单一来源 = 对特定合作/技术栈依赖
    const maxOut = Math.max(0, ...outDegree.values());
    const singleSourceRatio = totalInDegrees > 0 ? maxOut / totalInDegrees : 0;

    // 复合评分: 60% HHI 集中度 + 40% 单一来源依赖（沿用历史算法权重）
    const dependencyScore = 0.6 * hhiDependency + 0.4 * singleSourceRatio;
    const value = Math.round(dependencyScore * 100) / 100;

    return {
      value,
      degraded: false,
      evidence: [
        `入度集中度 HHI: ${Math.round(hhiDependency * 100) / 100}`,
        `单一来源占比: ${Math.round(singleSourceRatio * 100) / 100}`,
        `边数: ${edges.length}`,
      ],
    };
  } catch (err: unknown) {
    // 铁律 24: catch 必须 log + 降级标记（不空吞）
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'path-dependency compute 失败 — degraded');
    return { value: 0, degraded: true, evidence: [] };
  }
}

/**
 * path-dependency 哨兵对象 — exportKey "pathDependencySentinel"（manifest 契约，loader L154 命中）。
 *
 * check 签名 (store, teamId, traversal?) 与 loader L205 调用一致（非 Sentinel 接口 (context)，
 * 由 loader 包装层适配，dev doc §2.3/§4.5 决策 B）。
 * 阈值读 this.manifest.thresholds.dependency_score（0.4 warning / 0.7 critical）——
 * loader 注册时 injectSentinelManifest 注入（sentinel-loader.ts L161）；单测未注入时 fallback 契约值。
 */
export const pathDependencySentinel = {
  /**
   * 哨兵 check — 运行路径依赖检测，按 manifest 阈值产出 finding。
   *
   * @param store 同步图接口（loader 传 context.db）
   * @param teamId 团队 ID
   * @param traversal 图遍历实例（loader 构造，可为空）
   * @returns SentinelFinding[] — degraded → []（铁律 31）；value≥0.7 → critical；0.4≤value<0.7 → warning；否则 []
   */
  async check(
    store: GraphStoreReader,
    teamId: string,
    traversal?: GraphTraversal,
  ): Promise<SentinelFinding[]> {
    const now = new Date();
    const checkedAt = now.toISOString();
    try {
      const r = await detectPathDependency(store, teamId, traversal);
      // 铁律 31: 降级信号不得穿过阈值门控——数据不足不误报 critical
      if (r.degraded) return [];

      const thresholds = (this as { manifest?: SentinelManifest }).manifest?.thresholds?.dependency_score
        ?? { warning: 0.4, critical: 0.7 };

      if (r.value >= thresholds.critical) {
        return [{
          id: `pd-crit-${now.getTime()}`,
          severity: 'critical',
          title: `路径依赖锁定风险高 (${(r.value * 100).toFixed(0)}%)`,
          description: `组织对特定技术栈/流程/合作模式依赖度 ${(r.value * 100).toFixed(0)}%，超过 critical 阈值 ${(thresholds.critical * 100).toFixed(0)}%。切换成本高，锁定风险大。`,
          evidence: r.evidence,
          suggestion: '识别关键依赖来源，制定替代方案与切换预案，降低单点依赖。',
          detectedAt: checkedAt,
        }];
      }
      if (r.value >= thresholds.warning) {
        return [{
          id: `pd-warn-${now.getTime()}`,
          severity: 'warning',
          title: `路径依赖预警 (${(r.value * 100).toFixed(0)}%)`,
          description: `组织对特定技术栈/流程/合作模式依赖度 ${(r.value * 100).toFixed(0)}%，超过 warning 阈值 ${(thresholds.warning * 100).toFixed(0)}%。`,
          evidence: r.evidence,
          suggestion: '评估关键依赖的切换成本，开始引入替代方案。',
          detectedAt: checkedAt,
        }];
      }
      return [];
    } catch (err: unknown) {
      // 铁律 24: catch 必须 log + 显式错误 finding（不空吞、不静默降级）
      log.error({ err: err instanceof Error ? err.message : String(err) }, '[path-dependency] check 失败');
      return [{
        id: `pd-error-${now.getTime()}`,
        severity: 'warning',
        title: '路径依赖检测异常',
        description: `${err instanceof Error ? err.message : String(err)}`,
        evidence: [],
        suggestion: '检查图数据源完整性。',
        detectedAt: checkedAt,
      }];
    }
  },
};
