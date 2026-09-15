/**
 * D751 E2E 夹具哨兵 — aggregate 入口
 *
 * 契约（对齐 sentinel-loader.ts registerLoadedSentinels 的加载约定）:
 *   - exportKey = 'e2eFixtureSentinel'（manifest.exportKey 声明）
 *   - check(store, teamId, traversal?, thresholds?) → SentinelFinding[] | { findings, degraded }
 *   - 声明 manifest 字段（loader 注册时注入 manifest —— P0-1 K3 20260813 约定）
 *   - 正常路径: store 可用（queryNodes 为函数）→ 产出 1 条 critical finding
 *     （端到端断言需要真实 finding 流过 聚合→派发 管线）
 *   - 降级路径: store 不可用 → { findings: [], degraded: true }，不静默（铁律 24/31）
 */
import type { SentinelManifest } from '../../../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../../../src/sentinel/types';

export const e2eFixtureSentinel = {
  manifest: null as SentinelManifest | null,

  async check(
    store: unknown,
    _teamId: string,
    _traversal?: unknown,
    _thresholds?: Record<string, { warning: number; critical: number }>,
  ): Promise<SentinelFinding[] | { findings: SentinelFinding[]; degraded: boolean }> {
    // 夹具不做真实业务计算：finding 是固定构造，验证「被加载 → 被调用 → 进管线」链路本身
    const storeOk = typeof (store as { queryNodes?: unknown } | null)?.queryNodes === 'function';
    if (!storeOk) {
      return { findings: [], degraded: true };
    }
    const finding: SentinelFinding = {
      id: 'f_d751_fixture_01', // 稳定 id（D354 去时间戳约定）
      severity: 'critical',
      title: 'E2E夹具信号: 新增哨兵生效检查',
      description: 'D751 端到端断言夹具 finding —— 该哨兵被真实管线加载并调用',
      evidence: ['source=D751_FIXTURE'],
      suggestion: 'n/a（断言夹具，非真实业务告警）',
      detectedAt: new Date().toISOString(),
    };
    return [finding];
  },
};
