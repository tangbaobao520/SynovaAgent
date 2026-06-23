/**
 * sentinel-runner.ts — 哨兵按需运行适配器 (L3)
 *
 * 编排者在 Phase 2 调用此模块。注册委托给 SentinelRegistry (单例),
 * 本模块只做 context 适配 (GraphStore → SentinelContext) 和 LLM 格式化。
 *
 * 与 registry.ts 分工: registry 管哨兵生命周期, runner 做按需执行适配。
 *
 * Iron law #24: catch + log + degraded.
 * Iron law #38: zero unsafe type casts.
 */
import { createLogger } from '../logger';
import { getSentinelRegistry, formatFindingsForLLM } from './registry';
import type { SentinelFinding, SentinelContext } from './types';

const log = createLogger('sentinel/runner');

// ═══ 类型 ═══

interface GraphStoreReader {
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{
    id: string; type: string; props: Record<string, unknown>;
  }>;
}

// ═══ 主入口 ═══

/** 为指定团队运行所有已注册哨兵, 返回 Finding[] */
export async function runSentinelForTeam(
  teamId: string,
  store: GraphStoreReader,
): Promise<SentinelFinding[]> {
  const registry = getSentinelRegistry();
  // 构造 SentinelContext — db 字段携带 GraphStore
  const context: SentinelContext = {
    db: store,
    now: new Date(),
    registry,
  };
  return registry.runAll(context);
}

// Re-export formatFindingsForLLM for backward compatibility
export { formatFindingsForLLM };
