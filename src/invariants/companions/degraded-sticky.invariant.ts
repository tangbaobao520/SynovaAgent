/**
 * src/invariants/companions/degraded-sticky.invariant.ts — INV-DEGRADED-STICKY（D831 首批 ③）
 *
 * 断言: 同一会话的聚合降级标记**一旦出现，不得被后续"成功"事件抹掉**，且
 * 降级写入不得被静默吞掉（铁律 31 降级信号传播的运行期防线）。
 * D819 复发形态: 事件写入降级后，下一次成功写入把可见降级标记重置为 false，
 * 或降级根本不可见 → 上游以为一切正常（静默降级禁止，铁律 11/24）。
 *
 * 检查点（不改 src/store/session-store.ts 的唯一缝）: wrap
 * SessionStore.prototype.appendEvent（观察每次写入结果）+ 
 * SessionStore.prototype.addMessage（成功路径的"抹掉"发生地，
 * session-store.ts:376-388 成功时重置 lastDegraded=false）。
 *
 * 执行语义（两条）:
 *   A. fail-closed: 本会话事件写入刚降级（writeDegraded=true）但 store 可见
 *      标记 lastDegraded=false → 静默吞掉 → fail()
 *   B. 粘滞恢复（enforcement，不抛）: 会话已粘滞降级、本次写入成功 →
 *      恢复 lastDegraded=true（聚合真相不被单次成功抹掉，D831 卡 ③ 原文语义）
 *
 * 本不变量不检查什么（总纲 §9.4 硬要求，显式清单）:
 *   1. 不检查 lastDegraded 的"本次写入"per-op 语义本身——session-store
 *      2026-08-22 设计决定（transient 恢复不误报）由本伴生 B 分支在聚合口径
 *      上叠加粘滞，不推翻原语义
 *   2. 不检查其他 store 类型（sentinel_events / EventStore）的降级传播——
 *      只守 SessionStore 会话事件流
 *   3. 不检查降级的**原因**分类（错误 taxonomy 是 DiagnosticAgentError 职责）
 *   4. 不检查跨进程的降级持久化（粘滞集是进程内存态；kill -9 后靠 I1 事件重放）
 *   5. 不检查 HTTP 响应体的 degraded 字段（路由层职责）
 *
 * 契约（铁律 47）:
 *   @input  — ctx: InvariantContext
 *   @output — void；导出 getStickyDegradedSessions() 供健康探针读聚合视图
 *   @degraded — 粘滞集只增不减（进程生命周期）；回滚钩子清空
 *   @error  — 降级写入被静默吞掉 → fail()（InvariantError）
 */

import { createLogger } from '@synova/logger';
import { SessionStore, type SessionEventType, type AppendEventResult, type MessageRow } from '../../store/session-store';
import type { InvariantCompanion } from '../registry';

const log = createLogger('invariants/degraded-sticky');

/** 会话事件流可见降级标记的最小读写面（session-store 实例字段） */
interface DegradedFlagSurface {
  lastDegraded?: boolean;
}

/** 粘滞降级会话集（模块级，健康探针可读；install 时重置） */
const stickyDegradedSessions = new Set<string>();

/** 聚合降级视图（健康探针 / 测试用）——粘滞：一旦降级，本进程内恒 true */
export function getStickyDegradedSessions(): string[] {
  return [...stickyDegradedSessions];
}

export const onDegradedSticky: InvariantCompanion = {
  code: 'INV-DEGRADED-STICKY',
  owner: 'squad-b/coding',
  packageName: '@synova/agent',
  notChecked: [
    'lastDegraded 的 per-op 重置语义本身（2026-08-22 设计决定，本伴生只叠加聚合粘滞）',
    '其他存储（sentinel_events / EventStore）的降级传播',
    '降级原因分类（DiagnosticAgentError taxonomy 职责）',
    '跨进程降级持久化（粘滞集为进程内存态，崩溃后靠 I1 事件重放）',
    'HTTP 响应体的 degraded 字段（路由层职责）',
  ],
  install({ fail, hit, onRollback }): void {
    stickyDegradedSessions.clear();
    /** sessionId → 最近一次 appendEvent 写入是否降级 */
    const lastWriteDegraded = new Map<string, boolean>();
    const originalAppendEvent = SessionStore.prototype.appendEvent;
    const originalAddMessage = SessionStore.prototype.addMessage;

    SessionStore.prototype.appendEvent = function (
      this: SessionStore,
      sessionId: string,
      eventType: SessionEventType,
      payload: unknown,
    ): AppendEventResult {
      const res = originalAppendEvent.call(this, sessionId, eventType, payload);
      lastWriteDegraded.set(sessionId, !res.ok);
      if (!res.ok) {
        stickyDegradedSessions.add(sessionId);
        log.warn({ sessionId, eventType, error: res.error }, 'INV-DEGRADED-STICKY: 会话事件写入降级 — 粘滞标记已记录');
      }
      return res;
    };

    SessionStore.prototype.addMessage = function (
      this: SessionStore,
      sessionId: string,
      role: MessageRow['role'],
      content: string,
    ): void {
      originalAddMessage.call(this, sessionId, role, content);
      hit();
      const surface = this as DegradedFlagSurface;
      const writeDegraded = lastWriteDegraded.get(sessionId) === true;
      const visibleDegraded = surface.lastDegraded === true;
      if (writeDegraded && !visibleDegraded) {
        fail(`会话 ${sessionId} 事件写入降级但降级标记被抹掉（静默吞掉）— 铁律 11/31 降级信号断裂`);
      }
      if (!writeDegraded && stickyDegradedSessions.has(sessionId) && !visibleDegraded) {
        // B. 粘滞恢复：聚合真相不被单次成功抹掉（D831 卡 ③ 原文语义）
        surface.lastDegraded = true;
        log.warn({ sessionId }, 'INV-DEGRADED-STICKY: 成功写入不抹掉聚合降级 — 已恢复粘滞标记');
      }
    };

    onRollback(() => {
      if (SessionStore.prototype.appendEvent !== originalAppendEvent) {
        SessionStore.prototype.appendEvent = originalAppendEvent;
      }
      if (SessionStore.prototype.addMessage !== originalAddMessage) {
        SessionStore.prototype.addMessage = originalAddMessage;
      }
      lastWriteDegraded.clear();
      stickyDegradedSessions.clear();
      log.info('INV-DEGRADED-STICKY wrap 已撤销');
    });
  },
};
