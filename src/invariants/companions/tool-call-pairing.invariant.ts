/**
 * src/invariants/companions/tool-call-pairing.invariant.ts — INV-TOOL-CALL-PAIRING（D831 首批 ②）
 *
 * 断言: role=tool 消息（及 tool_result 事件）的 tool_call_id 必须与**前置**
 * assistant.tool_calls 逐条配对——id 未在待配对集合中 = 工具对话结构断裂
 * （D819：tool_call_id 与 assistant.tool_calls 失配 → 模型收到非法对话）。
 *
 * 检查点（队长裁决）: wrap SessionStore.prototype.appendEvent——同
 * src/store/session-projection.ts:384-410 的原型级订阅缝范式（import 即接线，
 * 生产全部 SessionStore 构造点零修改自动获得检查）。
 *
 * 本不变量不检查什么（总纲 §9.4 硬要求，显式清单）:
 *   1. 不检查出站 HTTP 消息数组的配对（那是 INV-TOOL-SCHEMA-SENT 的 fetch 缝；
 *      本不变量只守事件流写入缝）
 *   2. 不检查 tool_call_id 对应的工具是否真的被执行/结果内容正确性
 *   3. 不检查 tool_calls[].function.arguments 的 JSON 合法性（executor 职责）
 *   4. 不检查历史遗留事件（进程启动前已落盘的日志不在本进程内存配对集中，
 *      只守本进程新增写入）
 *   5. 不检查"assistant.tool_calls 后必有 tool 消息"的完备方向（执行循环的
 *      deny/guard 路径保证；本断言只守 tool 消息的 id 必须**有出处**）
 *
 * 契约（铁律 47）:
 *   @input  — ctx: InvariantContext
 *   @output — void；appendEvent wrap 在写前校验（fail-closed：违约数据不落盘）
 *   @degraded — 无（配对状态纯内存，无 IO）
 *   @error  — tool 消息 tool_call_id 无前置配对 / assistant.tool_calls 含空 id
 *             → fail()（InvariantError，写前抛出，违约事件不落盘）
 */

import { createLogger } from '@synova/logger';
import { SessionStore, type SessionEventType, type AppendEventResult } from '../../store/session-store';
import type { InvariantCompanion } from '../registry';

const log = createLogger('invariants/tool-call-pairing');

/** payload 最小形状探测（unknown → 守卫式读取，铁律 38 零 as any） */
function readStringField(payload: unknown, field: string): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** 从 assistant payload 提取 tool_calls 的 id 列表；非数组/形状不符 → undefined */
function readToolCallIds(payload: unknown): string[] | undefined {
  if (payload === null || typeof payload !== 'object') return undefined;
  const calls = (payload as Record<string, unknown>)['tool_calls'];
  if (!Array.isArray(calls)) return undefined;
  const ids: string[] = [];
  for (const tc of calls) {
    if (tc === null || typeof tc !== 'object') continue;
    const id = (tc as Record<string, unknown>)['id'];
    if (typeof id !== 'string' || id.length === 0) continue; // 空 id 在下方 install 中显式 fail
    ids.push(id);
  }
  return ids;
}

export const onToolCallPairing: InvariantCompanion = {
  code: 'INV-TOOL-CALL-PAIRING',
  owner: 'squad-b/coding',
  packageName: '@synova/agent',
  notChecked: [
    '出站 HTTP 消息数组的配对（INV-TOOL-SCHEMA-SENT 的 fetch 缝）',
    'tool_call_id 对应工具是否真的执行 / 结果内容正确性',
    'tool_calls[].function.arguments 的 JSON 合法性',
    '进程启动前的历史遗留事件（只守本进程新增写入）',
    '"assistant.tool_calls 后必有 tool 消息"的完备方向',
  ],
  install({ fail, hit, onRollback }): void {
    /** sessionId → 待配对 tool_call_id 集合（本进程内存态） */
    const pending = new Map<string, Set<string>>();
    const originalAppendEvent = SessionStore.prototype.appendEvent;

    SessionStore.prototype.appendEvent = function (
      this: SessionStore,
      sessionId: string,
      eventType: SessionEventType,
      payload: unknown,
    ): AppendEventResult {
      // ── 写前校验（fail-closed：违约数据不落盘） ──
      if (eventType === 'message' && payload !== null && typeof payload === 'object') {
        const role = (payload as Record<string, unknown>)['role'];
        if (role === 'assistant') {
          const rawCalls = (payload as Record<string, unknown>)['tool_calls'];
          if (Array.isArray(rawCalls) && rawCalls.length > 0) {
            hit();
            for (const tc of rawCalls) {
              const id = tc !== null && typeof tc === 'object' ? (tc as Record<string, unknown>)['id'] : undefined;
              if (typeof id !== 'string' || id.length === 0) {
                fail('assistant.tool_calls 含空 id — 配对锚缺失（D819：id 必须先经 provider/executor 边界兜底归一化）');
              }
            }
            let set = pending.get(sessionId);
            if (set === undefined) {
              set = new Set<string>();
              pending.set(sessionId, set);
            }
            for (const id of readToolCallIds(payload) ?? []) set.add(id);
          }
        } else if (role === 'tool') {
          const toolCallId = readStringField(payload, 'tool_call_id');
          if (toolCallId !== undefined) {
            hit();
            const set = pending.get(sessionId);
            if (set === undefined || !set.has(toolCallId)) {
              fail(`tool 消息 tool_call_id="${toolCallId}"（session=${sessionId}）无前置 assistant.tool_calls 配对 — 工具对话结构断裂（D819）`);
            }
            set?.delete(toolCallId);
          }
        }
      } else if (eventType === 'tool_result') {
        const toolCallId = readStringField(payload, 'tool_call_id');
        if (toolCallId !== undefined) {
          hit();
          const set = pending.get(sessionId);
          if (set === undefined || !set.has(toolCallId)) {
            fail(`tool_result 事件 tool_call_id="${toolCallId}"（session=${sessionId}）无前置 assistant.tool_calls 配对 — 工具对话结构断裂（D819）`);
          }
          set?.delete(toolCallId);
        }
      }
      return originalAppendEvent.call(this, sessionId, eventType, payload);
    };

    onRollback(() => {
      if (SessionStore.prototype.appendEvent === originalAppendEvent) return; // 已被恢复
      SessionStore.prototype.appendEvent = originalAppendEvent;
      pending.clear();
      log.info('INV-TOOL-CALL-PAIRING wrap 已撤销');
    });
  },
};
