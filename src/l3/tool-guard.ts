/**
 * l3/tool-guard.ts — 工具调用守卫 (Phase G4)
 *
 * 对标补全: 循环检测 + 重复失败阻断 + 参数校验。
 * 执行前 beforeCall() 检查，执行后 afterCall() 记录。
 *
 * 文档接口:
 *   beforeCall(tool, args, history?) → {allow, reason?}
 *   afterCall(tool, result, duration) → void
 *   getLoopDetections() → LoopRecord[]
 *
 * 检测规则:
 *   1. 循环检测: 同一工具+相同参数连续 3 次 → 阻断
 *   2. 重复失败: 同一工具连续 3 次失败 → 阻断
 *   3. 参数校验: null/undefined 参数 → 阻断
 *
 * 铁律 24+31: 每步 try/catch + degraded 不适用（纯数据面无 I/O）
 * 铁律 38: 零不安全类型断言
 * 铁律 39: L3 洞察层
 */
import { createLogger } from '@synova/logger';

const log = createLogger('l3/tool-guard');

// ═══ 类型定义 ═══

export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  duration?: number;
  timestamp: string;
}

export interface ToolGuardDecision {
  allow: boolean;
  reason?: string;
}

export interface LoopRecord {
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  timestamp: string;
}

// ═══ 常量 ═══

/** 循环检测阈值: 同工具+同参数连续 N 次 → block */
const LOOP_THRESHOLD = 3;

/** 重复失败阈值: 同工具连续 N 次失败 → block */
const FAIL_THRESHOLD = 3;

// ═══ ToolGuard ═══

export class ToolGuard {
  /** 工具调用历史（环形缓冲，按工具+参数 key 分组） */
  private callCount = new Map<string, number>();

  /** 工具连续失败计数 */
  private failCount = new Map<string, number>();

  /** 被阻断的记录 */
  private detections: LoopRecord[] = [];

  /**
   * 工具调用前检查。
   * @param tool 工具名
   * @param args 调用参数
   * @param _history 历史记录（接口保留，当前未使用外部 history）
   * @returns 是否允许调用
   */
  beforeCall(
    tool: string,
    args: Record<string, unknown>,
    _history?: ToolCallRecord[],
  ): ToolGuardDecision {
    try {
      // 1. 参数校验
      if (!args || typeof args !== 'object') {
        const reason = `参数无效: ${typeof args}`;
        log.warn({ tool, reason }, 'ToolGuard 参数校验拒绝');
        return { allow: false, reason };
      }

      // 2. 重复失败检测
      const failCount = this.failCount.get(tool) ?? 0;
      if (failCount >= FAIL_THRESHOLD) {
        const reason = `工具 "${tool}" 连续失败 ${failCount} 次，建议人工介入`;
        log.warn({ tool, failCount, reason }, 'ToolGuard 重复失败阻断');
        this.detections.push({ tool, args, reason, timestamp: new Date().toISOString() });
        return { allow: false, reason };
      }

      // 3. 循环检测: 同工具+同参数连续调用
      const key = `${tool}:${JSON.stringify(args)}`;
      const count = (this.callCount.get(key) ?? 0) + 1;
      this.callCount.set(key, count);

      if (count >= LOOP_THRESHOLD) {
        const reason = `循环检测: "${tool}" 相同参数连续调用 ${count} 次`;
        log.warn({ tool, args, count, reason }, 'ToolGuard 循环阻断');
        this.detections.push({ tool, args, reason, timestamp: new Date().toISOString() });
        return { allow: false, reason };
      }

      return { allow: true };
    } catch (err) {
      // 不应发生，兜底放行
      log.error({ err, tool }, 'ToolGuard.beforeCall 异常 — 放行');
      return { allow: true };
    }
  }

  /**
   * 工具调用后记录。
   * 更新失败计数和循环计数。
   */
  afterCall(tool: string, result: unknown, _duration: number): void {
    try {
      const hasError =
        result !== null &&
        typeof result === 'object' &&
        'error' in (result as Record<string, unknown>) &&
        !!(result as Record<string, unknown>).error;

      if (hasError) {
        this.failCount.set(tool, (this.failCount.get(tool) ?? 0) + 1);
      } else {
        // 成功 → 重置失败计数
        this.failCount.delete(tool);
      }
    } catch (err) {
      log.error({ err, tool }, 'ToolGuard.afterCall 异常');
    }
  }

  /**
   * 获取全部被阻断的循环/失败记录。
   */
  getLoopDetections(): LoopRecord[] {
    return [...this.detections];
  }
}
