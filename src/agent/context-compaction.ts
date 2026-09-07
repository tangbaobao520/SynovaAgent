/**
 * agent/context-compaction.ts — 会话级上下文压缩引擎（D594，DSH 借鉴卡 B-05）
 *
 * 借鉴锚点（读源码自研，零代码依赖，G1/G4）:
 *   D:/deepseek-harness/packages/compaction/compaction-basic/lib/index.js (0.1.1-rc.2)
 *   - DEFAULT_THRESHOLD_RATIO 0.8 / DEFAULT_RETAIN_RATIO 0.16 (:13/:15)
 *   - selectCompactableRange 头锚定 + 保留尾 + tool 配对平衡回退 (:379)
 *   - compactSurfaceRegion 压缩事务 start/summary/end，失败恰一次 end，未匹配 start 即锁 (:418)
 *   - 影子价 shadowedTokenCount: 摘要必须严格小于被 shadowed 内容，否则不落地 (:556)
 *   - agent/pre-step 压力触发失败 warn 继续本轮 (:780)
 *   - agent/request-error 溢出恢复: CONTEXT_WINDOW_EXCEEDED → 强制压缩 → retry (:802)
 *   - 压缩指令作为最后一条 user message 追加 — 复用前缀 KV-cache (:218)
 *
 * 契约（铁律 47）:
 *   输入: messages 数组（原地 mutate，保持 engineCtx.messages 共享引用不脱钩）
 *   输出: CompactionResult | null（null = 未触发）；压缩事件 start/summary/end
 *   降级: 压缩失败抛 ContextCompactionError（code + phase + retryable，铁律 32），
 *         调用方（conversation-engine）catch 后 log.warn 继续本轮，不阻断对话
 */
import { randomUUID } from 'crypto';
import { createLogger } from '@synova/logger';
import type { LLMMessage, LLMProvider, ChatResult, ChatOptions } from '../providers/types';

const log = createLogger('agent/context-compaction');

// ═══ 常量（DSH 对齐） ═══

const DEFAULT_THRESHOLD_RATIO = 0.8;
const DEFAULT_RETAIN_RATIO = 0.16;
/** B-01 映射: DSH CONTEXT_WINDOW_EXCEEDED → Synova ErrorCode.CONTEXT_OVERFLOW（src/errors/types.ts） */
const CONTEXT_WINDOW_EXCEEDED = 'CONTEXT_WINDOW_EXCEEDED';

/** 溢出错误的自有 code（provider 归一化产物 + DSH 原生码） */
const OVERFLOW_OWN_CODES: ReadonlySet<string> = new Set(['CONTEXT_OVERFLOW', CONTEXT_WINDOW_EXCEEDED]);

/** 溢出错误的消息模式（provider 未归一化时的兜底识别） */
const OVERFLOW_MESSAGE_PATTERNS: RegExp[] = [
  /\bcontext\s+(?:length|window|size)\s+(?:exceeded|overflow)/i,
  /\bmaximum\s+context\s+length\b/i,
  /上下文长度(?:超出|超限)/,
];

const CHECKPOINT_PREAMBLE = '[自动压缩检查点] 以下为更早对话的结构化摘要（原文已被压缩，关键结论保留）。紧随其后的是压缩前的最近对话。';
const SUMMARY_OPEN = '<compacted-summary>';
const SUMMARY_CLOSE = '</compacted-summary>';

/** 压缩指令 — 作为最后一条 user message 追加，前缀原样复用（KV-cache 命中，DSH :218） */
const COMPACTION_INSTRUCTION = [
  '你是对话压缩器。请把上面的对话历史压缩为一份供后续对话使用的结构化摘要。',
  '必须覆盖以下小节（无相关内容的节写「无」）:',
  '1. 原始诉求与意图 — 用户最初想解决什么问题',
  '2. 关键事实与结论 — 已确认的事实、数据、决定',
  '3. 数据与证据 — 提到过的具体数字、文件、指标',
  '4. 错误与修正 — 走过的弯路、被推翻的假设',
  '5. 未完成事项 — 提出但尚未解决的问题',
  '6. 当前进展 — 对话进行到哪一步',
  '7. 下一步 — 交谈双方接下来打算做什么',
  '8. 关键上下文 — 后续对话不可或缺的约束、偏好、术语',
  '只输出摘要正文，不要任何解释或客套。摘要必须显著短于原文。',
].join('\n');

// ═══ 类型 ═══

/** 压缩触发器 — 模块内部单点枚举（D587 公共面收窄: 仅导出生产消费的类型） */
const COMPACTION_TRIGGERS = ['pressure', 'context-overflow', 'manual'] as const;
export type CompactionTrigger = (typeof COMPACTION_TRIGGERS)[number];

export interface CompactionEvent {
  type: 'compaction/start' | 'compaction/summary' | 'compaction/end';
  compactionId: string;
  trigger: CompactionTrigger;
  ts: string;
  /** summary 事件起有效 */
  shadowedRange?: { start: number; end: number };
  shadowedMessageCount?: number;
  /** 影子价 — 被 shadowed 内容的估算 token（DSH shadowedTokenCount） */
  shadowedTokenCount?: number;
  summaryTokenCount?: number;
  /** end 事件起有效 */
  ok?: boolean;
  error?: { message: string; code?: string };
}

export interface CompactionResult {
  compactionId: string;
  trigger: CompactionTrigger;
  shadowedRange: { start: number; end: number };
  shadowedMessageCount: number;
  shadowedTokenCount: number;
  summaryTokenCount: number;
  /** 未加框架的原始摘要正文 */
  summary: string;
}

export interface CompactionSummarizer {
  summarize(prefix: LLMMessage[]): Promise<string>;
}

export interface CompactionConfigInput {
  /** 上下文窗口 token 预算（必填，正整数） */
  contextWindowTokens: number;
  thresholdRatio?: number;
  retainRatio?: number;
  retainTokens?: number;
  compactionRetries?: number;
  maxOverflowRetries?: number;
  summarizer: CompactionSummarizer;
  onEvent?: (event: CompactionEvent) => void;
}

/** 铁律 32: 错误分类强制 — code + phase + retryable */
export class ContextCompactionError extends Error {
  readonly code: string;
  readonly phase = 'context-compaction';
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'ContextCompactionError';
    this.code = code;
    this.retryable = retryable;
  }
}

// ═══ 内部工具 ═══

/** token 估算惯例: ceil(chars/4)（同 prompt-assembler.ts tokenCount） */
function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function frameSummary(summary: string): string {
  return `${CHECKPOINT_PREAMBLE}\n\n${SUMMARY_OPEN}\n${summary}\n${SUMMARY_CLOSE}`;
}

/**
 * 溢出错误识别（模块内部 — 经 wrapProviderWithOverflowRecovery 公共面消费）:
 * 自有 code 命中 OVERFLOW_OWN_CODES，或消息命中 OVERFLOW_MESSAGE_PATTERNS。
 */
function isContextOverflowError(err: unknown): boolean {
  if (err instanceof Error) {
    const own = (err as { code?: unknown }).code;
    if (typeof own === 'string' && OVERFLOW_OWN_CODES.has(own)) return true;
    const message = typeof err.message === 'string' ? err.message : '';
    if (OVERFLOW_MESSAGE_PATTERNS.some(p => p.test(message))) return true;
  }
  return false;
}

// ═══ 默认摘要器（KV-cache 前缀复用范式） ═══

/**
 * 生产摘要器: 复用对话 provider，把压缩指令作为最后一条 user message 追加 —
 * 前缀逐字节一致，provider 侧 KV-cache 命中（DSH :218 范式）。
 * 返回原始文本（trim 由引擎统一执行）；空响应交由引擎 EMPTY_SUMMARY 拒绝落地。
 */
export function createProviderSummarizer(provider: LLMProvider, maxTokens = 8192): CompactionSummarizer {
  return {
    summarize: async (prefix: LLMMessage[]) => {
      const options: ChatOptions = { maxTokens, temperature: 0.2 };
      const result: ChatResult = await provider.chat(
        [...prefix, { role: 'user', content: COMPACTION_INSTRUCTION }],
        options,
      );
      return result.content ?? '';
    },
  };
}

// ═══ 溢出恢复包装 ═══

/**
 * provider 溢出恢复（DSH agent/request-error :802 范式）:
 * chat 抛溢出错误 → forceCompact(retain=0) → retry，至多 maxOverflowRetries 次；
 * 非溢出错误原样透传；无可压缩区间时放弃恢复并抛出原始错误。
 *
 * 必须包装在 failover chain 内侧 — chain（providers/registry）会把 provider 错误
 * 归一为普通 Error 重新抛出，wrapper 先于 chain 才能看到原始错误码。
 * stream 不做恢复（现网 L2 消费面全走 chat；流式路径由压力压缩前置保护）。
 */
export function wrapProviderWithOverflowRecovery(inner: LLMProvider, compaction: ContextCompaction): LLMProvider {
  const wrapped: LLMProvider = {
    name: inner.name,
    baseUrl: inner.baseUrl,
    chat: async (messages, options) => {
      try {
        return await inner.chat(messages, options);
      } catch (err) {
        if (!isContextOverflowError(err)) throw err;
        let lastError: unknown = err;
        for (let attempt = 0; attempt < compaction.maxOverflowRetries; attempt++) {
          log.warn({ provider: inner.name, attempt: attempt + 1 }, '上下文溢出 — 强制压缩后重试');
          const recovered = await compaction.forceCompact(messages);
          if (recovered === null) break; // 无可压缩区间（如仅剩最后一条）→ 放弃恢复
          try {
            return await inner.chat(messages, options);
          } catch (retryErr) {
            if (!isContextOverflowError(retryErr)) throw retryErr;
            lastError = retryErr;
          }
        }
        throw lastError;
      }
    },
    stream: (messages, callback, options) => inner.stream(messages, callback, options),
    listModels: () => inner.listModels(),
    healthCheck: () => inner.healthCheck(),
  };
  if (inner.validateResponse) {
    const validate = inner.validateResponse.bind(inner);
    wrapped.validateResponse = (raw) => validate(raw);
  }
  if (inner.convertTools) {
    const convert = inner.convertTools.bind(inner);
    wrapped.convertTools = (tools) => convert(tools);
  }
  return wrapped;
}

// ═══ 压缩引擎 ═══

/**
 * 会话级上下文压缩引擎。
 * threshold = floor(window × thresholdRatio)；retain = retainTokens ?? floor(window × retainRatio)。
 * compactIfNeeded = 压力触发（超阈值才动）；forceCompact = 溢出恢复（绕过阈值，retain=0）。
 * 压缩以事务落地: start → summary → end，失败恰一次 end(ok:false)，进行中重入抛 COMPACTION_BUSY。
 */
export class ContextCompaction {
  readonly maxOverflowRetries: number;

  private readonly thresholdTokens: number;
  private readonly retainTokensBudget: number;
  private readonly compactionRetries: number;
  private readonly summarizer: CompactionSummarizer;
  private readonly onEvent: ((event: CompactionEvent) => void) | null;
  private readonly events: CompactionEvent[] = [];
  private inFlightCompactionId: string | null = null;

  constructor(config: CompactionConfigInput) {
    // 配置拼错必须显式失败（DSH validateCompactConfig 语义）
    const allowedKeys: ReadonlySet<string> = new Set([
      'contextWindowTokens', 'thresholdRatio', 'retainRatio', 'retainTokens',
      'compactionRetries', 'maxOverflowRetries', 'summarizer', 'onEvent',
    ]);
    for (const key of Object.keys(config)) {
      if (!allowedKeys.has(key)) {
        throw new ContextCompactionError('COMPACTION_CONFIG', `未知配置项 "${key}"（允许: ${[...allowedKeys].join(', ')}）`);
      }
    }
    const window = config.contextWindowTokens;
    if (typeof window !== 'number' || !Number.isInteger(window) || window <= 0) {
      throw new ContextCompactionError('COMPACTION_CONFIG', `contextWindowTokens 必须为正整数，收到 ${String(window)}`);
    }
    const thresholdRatio = config.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO;
    const retainRatio = config.retainRatio ?? DEFAULT_RETAIN_RATIO;
    for (const [name, value] of [['thresholdRatio', thresholdRatio], ['retainRatio', retainRatio]] as const) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) {
        throw new ContextCompactionError('COMPACTION_CONFIG', `${name} 必须在 (0, 1] 内，收到 ${String(value)}`);
      }
    }
    if (config.retainRatio !== undefined && config.retainTokens !== undefined) {
      throw new ContextCompactionError('COMPACTION_CONFIG', 'retainRatio 与 retainTokens 互斥 (mutually exclusive) — 只能二选一');
    }
    const thresholdTokens = Math.floor(window * thresholdRatio);
    if (retainRatio >= thresholdRatio) {
      throw new ContextCompactionError('COMPACTION_CONFIG', `retainRatio (${retainRatio}) 必须严格小于 thresholdRatio (${thresholdRatio})`);
    }
    let retainTokens: number;
    if (config.retainTokens !== undefined) {
      if (!Number.isInteger(config.retainTokens) || config.retainTokens <= 0) {
        throw new ContextCompactionError('COMPACTION_CONFIG', `retainTokens 必须为正整数，收到 ${String(config.retainTokens)}`);
      }
      if (config.retainTokens >= thresholdTokens) {
        throw new ContextCompactionError('COMPACTION_CONFIG', `retainTokens (${config.retainTokens}) 必须小于 thresholdTokens (${thresholdTokens})`);
      }
      retainTokens = config.retainTokens;
    } else {
      retainTokens = Math.floor(window * retainRatio);
    }
    for (const [name, value] of [['compactionRetries', config.compactionRetries], ['maxOverflowRetries', config.maxOverflowRetries]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new ContextCompactionError('COMPACTION_CONFIG', `${name} 必须为非负整数，收到 ${String(value)}`);
      }
    }
    this.thresholdTokens = thresholdTokens;
    this.retainTokensBudget = retainTokens;
    this.compactionRetries = config.compactionRetries ?? 0;
    this.maxOverflowRetries = config.maxOverflowRetries ?? 1;
    this.summarizer = config.summarizer;
    this.onEvent = config.onEvent ?? null;
  }

  /** 全部会话消息的估算 token 总量 */
  measureTokens(messages: LLMMessage[]): number {
    return messages.reduce((sum, m) => sum + estimateTextTokens(m.content), 0);
  }

  /** 已发生的压缩事件（start/summary/end 序列） */
  getEvents(): readonly CompactionEvent[] {
    return this.events;
  }

  /**
   * 压力触发: 总量 ≥ threshold 才压缩；压缩后仍 ≥ threshold 时最多再试 compactionRetries 次，
   * 仍失败抛 STILL_ABOVE_THRESHOLD；首轮即无可压缩区间返回 null。
   * 压缩失败（摘要器异常/影子价不过/重入）直接传播 — 调用方决定降级（DSH：失败不静默）。
   */
  async compactIfNeeded(messages: LLMMessage[], trigger: CompactionTrigger = 'pressure'): Promise<CompactionResult | null> {
    if (this.measureTokens(messages) < this.thresholdTokens) return null;
    let result: CompactionResult | null = null;
    for (let attempt = 0; attempt <= this.compactionRetries; attempt++) {
      const range = this.selectCompactableRange(messages, this.retainTokensBudget);
      if (range === null) {
        if (result === null) return null; // 无可压缩区间
        break; // 已压缩过但仍超阈值
      }
      result = await this.compactRange(messages, range, trigger);
      if (this.measureTokens(messages) < this.thresholdTokens) return result;
    }
    throw new ContextCompactionError(
      'STILL_ABOVE_THRESHOLD',
      `压缩完成但总量 (${this.measureTokens(messages)}) 仍 >= threshold (${this.thresholdTokens})，共 ${this.compactionRetries + 1} 次尝试`,
    );
  }

  /**
   * 溢出恢复强制压缩: 绕过阈值检查，retain=0（除最后一条外全部可 shadow）。
   * 无可压缩区间返回 null（如会话仅剩 system + 一条消息）。
   */
  async forceCompact(messages: LLMMessage[], trigger: CompactionTrigger = 'context-overflow'): Promise<CompactionResult | null> {
    const range = this.selectCompactableRange(messages, 0);
    if (range === null) return null;
    return this.compactRange(messages, range, trigger);
  }

  /**
   * 可压缩区间选择（DSH selectCompactableRange :379 范式）:
   * 头部 system 锚定不动 → 自尾部累加到 retain 预算得保留起点 → tool 配对平衡回退
   * （保留区不得以孤儿 tool result 开头，被 shadow 区不得以未应答 tool_calls 的 assistant 结尾）。
   * 返回 {start, end} 闭区间（shadow messages[start..end]），无可安全区间返回 null。
   */
  private selectCompactableRange(messages: LLMMessage[], retainTokens: number): { start: number; end: number } | null {
    let systemEnd = 0;
    while (systemEnd < messages.length && messages[systemEnd].role === 'system') systemEnd++;
    if (systemEnd >= messages.length) return null; // 只有 system，无可压缩
    let keepFromIdx = messages.length - 1;
    let acc = 0;
    while (keepFromIdx >= systemEnd) {
      acc += estimateTextTokens(messages[keepFromIdx].content);
      if (acc >= retainTokens) break;
      keepFromIdx--;
    }
    if (keepFromIdx <= systemEnd) return null; // 保留尾吃掉全部非 system 消息
    while (keepFromIdx > systemEnd + 1
      && (!this.boundaryBeforeRetained(messages, keepFromIdx) || !this.boundaryAfterShadowed(messages, keepFromIdx - 1))) {
      keepFromIdx--;
    }
    if (keepFromIdx <= systemEnd) return null;
    if (!this.boundaryBeforeRetained(messages, keepFromIdx) || !this.boundaryAfterShadowed(messages, keepFromIdx - 1)) {
      return null; // 回退到地板仍不配对安全 → 放弃本轮
    }
    return { start: systemEnd, end: keepFromIdx - 1 };
  }

  /** 保留区第一条不得是孤儿 tool result（其配对 assistant 已被 shadow） */
  private boundaryBeforeRetained(messages: LLMMessage[], idx: number): boolean {
    return messages[idx].role !== 'tool';
  }

  /** 被 shadow 区最后一条不得携带未应答 tool_calls */
  private boundaryAfterShadowed(messages: LLMMessage[], idx: number): boolean {
    const m = messages[idx];
    return !(m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
  }

  /**
   * 压缩事务（DSH compactSurfaceRegion :418 范式）:
   * start（持锁）→ 摘要 → 空摘要/影子价校验（不过则不落地）→ summary 事件 → 原地 splice → end(ok:true)。
   * 任何失败: 恰一次 end(ok:false) + 释放锁 + 原始错误向外传播（铁律 32 分类由事件与错误对象承载）。
   */
  private async compactRange(messages: LLMMessage[], range: { start: number; end: number }, trigger: CompactionTrigger): Promise<CompactionResult> {
    if (this.inFlightCompactionId !== null) {
      throw new ContextCompactionError('COMPACTION_BUSY', 'compaction already in progress — 未完成压缩期间不可重入', true);
    }
    const compactionId = randomUUID();
    const shadowed = messages.slice(range.start, range.end + 1);
    const shadowedTokenCount = shadowed.reduce((sum, m) => sum + estimateTextTokens(m.content), 0);
    this.emit({ type: 'compaction/start', compactionId, trigger, ts: new Date().toISOString() });
    this.inFlightCompactionId = compactionId;
    let summaryTokenCount = 0;
    let summary = '';
    try {
      // 摘要输入 = system 前缀 + 被 shadow 区间 — 前缀逐字节复用（KV-cache 命中）
      const raw = await this.summarizer.summarize([...messages.slice(0, range.start), ...shadowed]);
      summary = raw.trim();
      if (summary.length === 0) {
        throw new ContextCompactionError('EMPTY_SUMMARY', 'summarizer returned no text — 拒绝落地空摘要', true);
      }
      const framed = frameSummary(summary);
      summaryTokenCount = estimateTextTokens(framed);
      if (summaryTokenCount >= shadowedTokenCount) {
        // 影子价校验（DSH :556）: 摘要必须严格更小，否则压缩即膨胀
        throw new ContextCompactionError(
          'SUMMARY_NOT_SMALLER',
          `summary is not smaller than the shadowed content (${summaryTokenCount} estimated tokens >= ${shadowedTokenCount}) — 拒绝落地`,
        );
      }
      this.emit({
        type: 'compaction/summary', compactionId, trigger, ts: new Date().toISOString(),
        shadowedRange: { ...range }, shadowedMessageCount: shadowed.length,
        shadowedTokenCount, summaryTokenCount,
      });
      // 原地 splice — engineCtx.messages 与 this.messages 共享同一数组引用，不得 reassign
      messages.splice(range.start, shadowed.length, { role: 'user', content: framed });
    } catch (err) {
      this.inFlightCompactionId = null;
      this.emit({
        type: 'compaction/end', compactionId, trigger, ts: new Date().toISOString(), ok: false,
        error: {
          message: err instanceof Error ? err.message : String(err),
          code: err instanceof ContextCompactionError ? err.code : undefined,
        },
      });
      throw err;
    }
    this.inFlightCompactionId = null;
    this.emit({ type: 'compaction/end', compactionId, trigger, ts: new Date().toISOString(), ok: true });
    log.info(
      { compactionId, trigger, shadowedMessages: shadowed.length, shadowedTokenCount, summaryTokenCount },
      `compacted ${shadowed.length} messages (${shadowedTokenCount} tokens) into ${summaryTokenCount}-token summary`,
    );
    return {
      compactionId, trigger, shadowedRange: { ...range },
      shadowedMessageCount: shadowed.length, shadowedTokenCount, summaryTokenCount, summary,
    };
  }

  private emit(event: CompactionEvent): void {
    this.events.push(event);
    if (this.onEvent) {
      try {
        this.onEvent(event);
      } catch (err) {
        log.warn({ err }, 'compaction onEvent 回调失败 — 非阻断');
      }
    }
  }
}
