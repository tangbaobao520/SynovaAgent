/**
 * src/agent/task-decomposer.ts — 任务分解协议 (D8b)
 *
 * Auth Doc #4 Agent Engineering Benchmark — Gap #2.
 * MainAgent 将复杂诊断请求分解为独立可执行的子任务。
 *
 * MVP 分解策略: 一个哨兵 finding = 一个子任务。
 * 通过 sentinel 维度映射到专家类型。
 *
 * 契约:
 *   @input  — DiagnosisScope { enterpriseId, sentinelFindings, triggeredBy }
 *   @output — DecompositionResult { subTasks, totalEstimatedMs }
 *   @degraded — 空 findings → 空 sub-tasks + degraded:true
 */
import { createLogger } from '@synova/logger';
import { randomUUID } from 'crypto';

const log = createLogger('agent/task-decomposer');

// ═══ 类型定义 ═══

/** 哨兵 finding 最小接口 */
export interface SentinelFindingLike {
  id: string;
  severity: string;
  title: string;
  description: string;
  /** 哨兵 ID */
  sentinel?: string;
  /** 关联维度（可选，由调用方补充） */
  dimension?: string;
}

/** 诊断范围 */
export interface DiagnosisScope {
  enterpriseId: string;
  sentinelFindings: SentinelFindingLike[];
  triggeredBy: string;
}

/** 子任务 */
export interface SubTask {
  id: string;
  dimension: string;
  priority: 0 | 1 | 2;
  expertType: string;
  inputFindings: SentinelFindingLike[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  dependsOn?: string[];
}

/** 子任务执行结果 */
export interface SubTaskResult {
  subTaskId: string;
  status: 'completed' | 'failed';
  /** 路由到的专家类型（D8c ExpertRouter 设置） */
  expertType?: string;
  output?: string;
  error?: string;
  durationMs: number;
  confidence: number;
}

/** 分解结果 */
export interface DecompositionResult {
  subTasks: SubTask[];
  totalEstimatedMs: number;
  degraded: boolean;
}

/** 聚合结果 */
export interface AggregatedResult {
  status: 'completed' | 'failed' | 'partial';
  results: SubTaskResult[];
  degraded: boolean;
  totalDurationMs: number;
}

// ═══ 维度→专家映射 ═══

/** sentinel 维度到专家类型的映射表 */
const DIMENSION_EXPERT_MAP: Record<string, string> = {
  financial: 'finance-structure',
  market: 'customer-cycle',
  organizational: 'talent-cycle',
  technology: 'tech',
  strategic: 'competitive-strategy',
  operational: 'host',
  talent: 'talent-cycle',
  customer: 'customer-cycle',
  product: 'tech',
  risk: 'competitive-strategy',
};

/** sentinel ID 到维度的推断映射（基于命名惯例） */
function inferDimensionFromSentinel(sentinelId: string, fallback: string): string {
  const s = sentinelId.toLowerCase();
  if (s.includes('finance') || s.includes('capital') || s.includes('cash') || s.includes('margin') || s.includes('cost') || s.includes('revenue')) return 'financial';
  if (s.includes('market') || s.includes('customer') || s.includes('churn') || s.includes('brand') || s.includes('channel') || s.includes('competition')) return 'market';
  if (s.includes('talent') || s.includes('hr') || s.includes('people') || s.includes('org') || s.includes('culture') || s.includes('knowledge')) return 'organizational';
  if (s.includes('tech') || s.includes('product') || s.includes('innovation') || s.includes('data') || s.includes('system') || s.includes('software')) return 'technology';
  if (s.includes('strategy') || s.includes('executive') || s.includes('governance') || s.includes('risk')) return 'strategic';
  return fallback;
}

/** 哨兵严重度到子任务优先级映射 */
function severityToPriority(severity: string): 0 | 1 | 2 {
  if (severity === 'emergency' || severity === 'critical') return 0;
  if (severity === 'warning' || severity === 'high') return 1;
  return 2;
}

// ═══ TaskDecomposer ═══

/**
 * 任务分解器。
 * 将哨兵发现映射为独立子任务，支持执行和结果聚合。
 */
export class TaskDecomposer {
  /**
   * 将诊断范围分解为子任务列表。
   * MVP 策略: 一个哨兵 finding = 一个子任务。
   */
  decompose(scope: DiagnosisScope): DecompositionResult {
    try {
      const { sentinelFindings } = scope;

      if (!sentinelFindings || sentinelFindings.length === 0) {
        log.warn({ enterpriseId: scope.enterpriseId }, '诊断范围无哨兵发现 — 返回空任务');
        return {
          subTasks: [],
          totalEstimatedMs: 0,
          degraded: true,
        };
      }

      const subTasks: SubTask[] = sentinelFindings.map((finding, index) => {
        const dimension = finding.dimension || inferDimensionFromSentinel(finding.sentinel || finding.id, 'organizational');
        const expertType = DIMENSION_EXPERT_MAP[dimension] || 'host';
        const priority = severityToPriority(finding.severity);

        return {
          id: `subtask-${index}-${randomUUID().slice(0, 8)}`,
          dimension,
          priority,
          expertType,
          inputFindings: [finding],
          status: 'pending' as const,
        };
      });

      // 按优先级排序
      subTasks.sort((a, b) => a.priority - b.priority);

      const totalEstimatedMs = subTasks.reduce((sum, st) => {
        // 每子任务估算: P0=30s, P1=20s, P2=10s
        const estimates = { 0: 30000, 1: 20000, 2: 10000 };
        return sum + (estimates[st.priority] || 20000);
      }, 0);

      log.info({ count: subTasks.length, totalEstimatedMs }, '诊断任务分解完成');
      return { subTasks, totalEstimatedMs, degraded: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg }, '任务分解异常 — 降级');
      return { subTasks: [], totalEstimatedMs: 0, degraded: true };
    }
  }

  /**
   * 执行单个子任务。
   * MVP: 调用对应维度的默认 handler。
   */
  async executeSubTask(subTask: SubTask): Promise<SubTaskResult> {
    const startTime = Date.now();
    try {
      subTask.status = 'running';

      // MVP: 通过 dimension 调用默认 handler
      const result = await this.runHandlerForDimension(subTask.dimension);
      const durationMs = Date.now() - startTime;

      subTask.status = result.success ? 'completed' : 'failed';

      return {
        subTaskId: subTask.id,
        status: result.success ? 'completed' : 'failed',
        expertType: subTask.expertType,
        output: result.output,
        error: result.error,
        durationMs,
        confidence: result.success ? 0.8 : 0,
      };
    } catch (err: unknown) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "子任务执行失败");
      const msg = err instanceof Error ? err.message : String(err);
      subTask.status = 'failed';
      log.warn({ err: msg, subTaskId: subTask.id }, '子任务执行失败 — 降级');
      return {
        subTaskId: subTask.id,
        status: 'failed',
        error: msg,
        durationMs: Date.now() - startTime,
        confidence: 0,
      };
    }
  }

  /**
   * 聚合多个子任务结果。
   * 返回整体状态、降级标记和耗时。
   */
  aggregate(subResults: SubTaskResult[]): AggregatedResult {
    if (subResults.length === 0) {
      return { status: 'completed', results: [], degraded: false, totalDurationMs: 0 };
    }

    const completed = subResults.filter((r) => r.status === 'completed').length;
    const failed = subResults.filter((r) => r.status === 'failed').length;
    const totalDurationMs = subResults.reduce((sum, r) => sum + r.durationMs, 0);

    let status: 'completed' | 'failed' | 'partial';
    if (failed === 0) {
      status = 'completed';
    } else if (completed > 0 && failed > 0) {
      status = 'partial';
    } else {
      status = 'failed';
    }

    return {
      status,
      results: subResults,
      degraded: failed > 0,
      totalDurationMs,
    };
  }

  // ─── 内部方法 ───

  /**
   * 按维度执行默认 handler。
   * D8c: 使用 ExpertRouter 路由到对应专家。
   */
  private async runHandlerForDimension(dimension: string): Promise<{ success: boolean; output?: string; error?: string; degraded?: boolean }> {
    try {
      const { ExpertRouter } = await import('./expert-router');
      const router = new ExpertRouter();
      const response = await router.dispatch({
        subTaskId: `dim-${dimension}-${Date.now()}`,
        expertType: DIMENSION_EXPERT_MAP[dimension] || 'host',
        inputFindings: [],
        context: { enterpriseId: 'default', diagnosisId: 'auto' },
      });
      return { success: !response.degraded, output: response.analysis, error: response.error };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ err: msg, dimension }, '专家维度 handler 执行失败 — 降级');
      return { success: false, error: msg, degraded: true };
    }
  }
}
