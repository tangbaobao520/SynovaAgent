/**
 * src/invariants/companions/tool-schema-sent.invariant.ts — INV-TOOL-SCHEMA-SENT（D831 首批 ①）
 *
 * 断言: 出站 LLM 请求在**工具对话已发生**时必须携带非空 tools schema。
 * D819 复发形态: 请求体里有 assistant.tool_calls / role=tool 消息，但 body.tools
 * 缺失或为空 → 模型收到结构非法的工具对话（工具能力在 provider 边界被静默丢弃）。
 *
 * 检查点（不改 src/providers/base.ts、不改 src/agent 的唯一出站缝）:
 * wrap globalThis.fetch——providers/base.ts makeRequest 经全局 fetch 出站
 * （base.ts:154），POST 到 *chat/completions 且 body 可解析时检查。
 *
 * 违约判定（两条，均 fail-closed）:
 *   A. body.tools 为**空数组**（显式空 schema——不存在合法收尾语义）
 *   B. 消息流含工具对话（assistant.tool_calls / role=tool）且 tools 缺失，
 *      且**该对话从未成功携带过 tools**（进程内已见请求的消息前缀均无 tools）
 *      ——即"对话在推进工具调用，但 schema 从未发出"的 D819 原始形态。
 *
 * 为什么 B 要带前缀豁免: 生产收尾轮（tool-loop-executor MAX_ROUNDS 用尽后的
 * 最终调用，见 tests/agent/tool-loop-tool-pairing.integration.test.ts C2）在
 * HTTP 层与"中途丢 tools"不可区分——只有 executor 知道那是收尾。已带过
 * tools 的对话（前缀命中）放行，留给收尾轮；从未带过的对话违约。
 * 收紧路径（遗留，小队 A 裁决）: 收尾轮显式带 tools + tool_choice:'none'，
 * 之后 B 可去掉前缀豁免，全量检查。
 *
 * 本不变量不检查什么（总纲 §9.4 硬要求，显式清单）:
 *   1. 不检查 tools schema 内容的 JSON Schema 合法性（L3 ToolRegistry 职责）
 *   2. 不检查"已带过 tools 的对话后续轮次丢 tools"（与生产收尾轮在 HTTP 层
 *      不可区分——见上；待收尾轮显式声明 tool_choice 后收紧）
 *   3. 不检查首轮（对话尚未发生工具调用）是否应带 tools——首轮无从判断
 *      工具是否启用，只守"工具对话已在消息流中"这一可观察事实
 *   4. 不检查非 POST、非 chat/completions 路径、body 非 JSON 字符串的请求
 *      （Request 对象形态的 fetch 调用不在检查面内）
 *   5. 不检查 provider 响应侧 tool_calls 的 id 规范性（provider 边界兜底职责，
 *      见 base.ts D819 注释）
 *
 * 契约（铁律 47）:
 *   @input  — ctx: InvariantContext（fail/hit/onRollback）
 *   @output — void；wrap 后的 fetch 违约时 reject InvariantError（HTTP 层 5xx 语义）
 *   @degraded — 检查层自身异常（body 解析失败等）→ log.warn 放行原请求
 *             （检查器不得成为新的故障源；InvariantError 本身照常抛出）
 *   @error  — 违约 → fail()（InvariantError，fail-closed）
 */

import { createLogger } from '@synova/logger';
import { InvariantError, type InvariantCompanion } from '../registry';

const log = createLogger('invariants/tool-schema-sent');

/** 已见 tools 携带请求的消息前缀上限（防内存无限增长；超出淘汰最旧） */
const MAX_PREFIXES = 50;

/** 出站 chat 请求 body 的最小形状（只取检查所需字段） */
interface ChatRequestBody {
  messages?: Array<{
    role?: unknown;
    tool_call_id?: unknown;
    tool_calls?: unknown;
  }>;
  tools?: unknown;
}

/** 判断消息流中是否已发生工具对话（assistant.tool_calls 或 role=tool 消息） */
function hasToolConversation(messages: Array<{ role?: unknown; tool_call_id?: unknown; tool_calls?: unknown }>): boolean {
  return messages.some((m) => {
    if (m.role === 'tool' && typeof m.tool_call_id === 'string') return true;
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return true;
    return false;
  });
}

export const onToolSchemaSent: InvariantCompanion = {
  code: 'INV-TOOL-SCHEMA-SENT',
  owner: 'squad-b/coding',
  packageName: '@synova/agent',
  notChecked: [
    'tools schema 的 JSON Schema 合法性（ToolRegistry 职责）',
    '已带过 tools 的对话后续轮次丢 tools（与生产收尾轮 HTTP 层不可区分，待 tool_choice 收紧）',
    '首轮（对话尚未发生工具调用）是否应带 tools',
    '非 POST / 非 chat/completions / Request 对象形态的 fetch 调用',
    'provider 响应侧 tool_calls 的 id 规范性（provider 边界兜底）',
  ],
  install({ fail, hit, onRollback }): void {
    /** 进程内已见"携带非空 tools"请求的消息 JSON 前缀（收尾轮豁免依据） */
    const toolsCarriedPrefixes: string[] = [];
    const originalFetch = globalThis.fetch;
    const wrappedFetch: typeof globalThis.fetch = async (input, init) => {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
        const method = typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET';
        if (method === 'POST' && /\/chat\/completions\/?$/.test(url) && typeof init?.body === 'string') {
          let body: ChatRequestBody | null = null;
          try {
            body = JSON.parse(init.body) as ChatRequestBody;
          } catch {
            body = null; // 非 JSON body 不在检查面（notChecked #4）
          }
          if (body !== null && Array.isArray(body.messages)) {
            hit();
            const messagesJson = JSON.stringify(body.messages);
            if (Array.isArray(body.tools) && body.tools.length > 0 && body.messages.length > 0) {
              // 记录"该对话已成功携带 tools"（收尾轮豁免依据）。
              // 去掉结尾 ']' 存前缀：后续请求在同一数组上追加元素，其 JSON 在
              // 本前缀之后是 ",{...}]" 而非 "]"——不去括号则前缀永假（实证于 C2）。
              toolsCarriedPrefixes.push(messagesJson.slice(0, -1));
              if (toolsCarriedPrefixes.length > MAX_PREFIXES) toolsCarriedPrefixes.shift();
            } else {
              const toolsEmptyArray = Array.isArray(body.tools) && body.tools.length === 0;
              const convPresent = hasToolConversation(body.messages);
              const everCarried = toolsCarriedPrefixes.some((p) => messagesJson.startsWith(p));
              if (toolsEmptyArray) {
                fail('出站 LLM 请求 tools 为空数组 — 显式空 schema，无合法收尾语义（工具能力在 provider 边界被丢弃）');
              }
              if (convPresent && !toolsEmptyArray && !everCarried) {
                fail('出站 LLM 请求携带工具对话（assistant.tool_calls / role=tool）但 tools schema 缺失，且该对话从未成功携带过 tools — D819 复发形态');
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof InvariantError) throw err;
        // 铁律 24: 检查器自身异常不静默——log.warn 后放行（检查器不当故障源）
        log.warn({ err: err instanceof Error ? err.message : String(err), degraded: true }, 'INV-TOOL-SCHEMA-SENT 检查层异常 — 放行原请求');
      }
      return originalFetch(input, init);
    };
    globalThis.fetch = wrappedFetch;
    onRollback(() => {
      if (globalThis.fetch === wrappedFetch) {
        globalThis.fetch = originalFetch;
      } else {
        log.warn('INV-TOOL-SCHEMA-SENT 回滚时 globalThis.fetch 已被他人替换 — 残留风险，需人工核查');
      }
    });
  },
};
