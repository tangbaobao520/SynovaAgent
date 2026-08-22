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
  /**
   * D473: 分级阶梯等级 — 'reminder'（提醒注入，不阻断）/ 'block'（硬阻断）。
   * 无等级 = 正常放行。对照 DSH repeat-tool-reminder 的 advisory 阶梯。
   */
  level?: 'reminder' | 'block';
  /** D473: reminder 时注入模型可见的提醒消息（非空） */
  reminderMessage?: string;
}

export interface LoopRecord {
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  timestamp: string;
}

// ═══ 常量 ═══

/**
 * D473: 分级阶梯阈值（2026-08-22 修正 — DSH repeat-tool-reminder 阶梯 [3,5,8] 参考，
 * 但 Synova tool-loop MAX_TOOL_ROUNDS=3 下同工具同参数最多 3 次，BLOCK=5 永远达不到
 * → 阶梯压缩为 [2 提醒, 3 阻断]；warning 中档 descope（S-10））。
 */
const REMINDER_THRESHOLD = 2;
/** 循环检测阈值: 同工具+同参数连续 N 次 → block（保持原 LOOP_THRESHOLD=3 语义） */
const LOOP_THRESHOLD = 3;

/** 重复失败阈值: 同工具连续 N 次失败 → block */
const FAIL_THRESHOLD = 3;

/** D473: reminder 提醒消息（注入模型可见上下文，DSH advisory 范式） */
const REMINDER_MESSAGE =
  'You are repeating the exact same tool call with identical arguments. ' +
  'Carefully analyze the previous result before calling again: if the task is not complete, ' +
  'try a different approach or different arguments instead of repeating the call.';

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

      // 3. 循环检测: 同工具+同参数连续调用（D473 分级阶梯: 2 次提醒 / 3 次阻断）
      const key = `${tool}:${JSON.stringify(args)}`;
      const count = (this.callCount.get(key) ?? 0) + 1;
      this.callCount.set(key, count);

      if (count >= LOOP_THRESHOLD) {
        const reason = `循环检测: "${tool}" 相同参数连续调用 ${count} 次`;
        log.warn({ tool, args, count, reason }, 'ToolGuard 循环阻断');
        this.detections.push({ tool, args, reason, timestamp: new Date().toISOString() });
        return { allow: false, level: 'block', reason };
      }

      if (count >= REMINDER_THRESHOLD) {
        // D473: 提醒注入（模型可见，不阻断 — 决策留给模型，DSH advisory 范式）
        log.warn({ tool, args, count }, 'ToolGuard 循环提醒（advisory）');
        return { allow: true, level: 'reminder', reminderMessage: REMINDER_MESSAGE };
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
