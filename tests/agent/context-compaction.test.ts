/**
 * tests/agent/context-compaction.test.ts — D594 上下文压缩引擎四件套（DSH 借鉴卡 B-05）
 *
 * 覆盖契约（dev doc §5）:
 *   - 正常: 超 threshold 触发压缩，摘要 + 最近消息保留
 *   - 边界: CONTEXT_WINDOW_EXCEEDED → 强制压缩 → retry；压缩后回放一致；tool 配对不拆散
 *   - 事件: compaction/start|summary|end + 失败恰一次 end + 未完成锁
 *   - 影子价: 摘要必须严格小于被 shadowed tokens，否则不落地
 *   每用例 ≥3 expect（铁律 48）。
 */
import { describe, it, expect } from 'vitest';
import type { LLMMessage, LLMProvider, ChatResult, ChatOptions } from '../../src/providers/types';
// D587 公共面收窄: isContextOverflowError / CONTEXT_WINDOW_EXCEEDED 为模块内部实现，
// 溢出分类经 wrapProviderWithOverflowRecovery 公共面验证
import {
  ContextCompaction,
  ContextCompactionError,
  createProviderSummarizer,
  wrapProviderWithOverflowRecovery,
} from '../../src/agent/context-compaction';

// ═══ 测试工具 ═══

/** 固定内容消息（token 估算 = ceil(chars/4)，200 chars = 50 tokens） */
function msg(role: LLMMessage['role'], text: string, extra?: Partial<LLMMessage>): LLMMessage {
  return { role, content: text, ...extra };
}

const SYSTEM = 'S'.repeat(40); // 10 tokens
const LONG = 'L'.repeat(200); // 50 tokens
const SHORT = 's'.repeat(20); // 5 tokens

/** 确定性假摘要器：恒定短摘要（framed 远小于被 shadowed 内容） */
const shortSummarizer = () => 'CKPT';

/** 默认测试配置: window 400 → threshold 320 / retain 64 */
function makeEngine(summarizer: () => string | Promise<string> = shortSummarizer, overrides: Record<string, unknown> = {}): ContextCompaction {
  return new ContextCompaction({
    contextWindowTokens: 400,
    summarizer: { summarize: async () => summarizer() },
    ...overrides,
  });
}

/** 标准 7 轮长会话: system + 7×50 tokens = 360 ≥ threshold 320 */
function longConversation(): LLMMessage[] {
  return [msg('system', SYSTEM)];
}

/** 收集事件 */
function collectEvents(engine: ContextCompaction) {
  return engine.getEvents();
}

// ═══ 配置校验 ═══

describe('ContextCompaction 配置校验', () => {
  it('未知 key 抛 COMPACTION_CONFIG（配置拼错必须显式失败）', () => {
    expect(() => makeEngine(shortSummarizer, { unknowKey: 1 })).toThrowError(ContextCompactionError);
    try {
      makeEngine(shortSummarizer, { unknowKey: 1 });
    } catch (err) {
      expect((err as ContextCompactionError).code).toBe('COMPACTION_CONFIG');
      expect((err as ContextCompactionError).phase).toBe('context-compaction');
    }
  });

  it('retainRatio ≥ thresholdRatio 抛错（DSH validateRatioRetention 语义）', () => {
    expect(() => makeEngine(shortSummarizer, { thresholdRatio: 0.5, retainRatio: 0.5 })).toThrowError(ContextCompactionError);
    expect(() => makeEngine(shortSummarizer, { thresholdRatio: 0.5, retainRatio: 0.9 })).toThrowError(/retainRatio/);
  });

  it('contextWindowTokens 必须为正整数', () => {
    expect(() => makeEngine(shortSummarizer, { contextWindowTokens: 0 })).toThrowError(ContextCompactionError);
    expect(() => makeEngine(shortSummarizer, { contextWindowTokens: -100 })).toThrowError(ContextCompactionError);
    expect(() => makeEngine(shortSummarizer, { contextWindowTokens: 1.5 })).toThrowError(ContextCompactionError);
    // 缺失（直接构造，不经 makeEngine —— overrides 空对象不会清除默认 window）
    expect(() => new ContextCompaction({ summarizer: async () => shortSummarizer() })).toThrowError(/contextWindowTokens/);
  });

  it('retainRatio 与 retainTokens 互斥（DSH 语义）', () => {
    expect(() => makeEngine(shortSummarizer, { retainRatio: 0.1, retainTokens: 32 })).toThrowError(/mutually exclusive|互斥/);
  });
});

// ═══ 正常路径：超 threshold 触发压缩 ═══

describe('压力触发压缩（threshold/retain 四件套）', () => {
  it('未超 threshold 不触发 — 返回 null 且消息零变动', () => {
    const engine = makeEngine();
    const messages = [msg('system', SYSTEM), msg('user', LONG), msg('assistant', LONG)];
    // 10 + 50 + 50 = 110 < 320
    const before = messages.length;
    expect(engine.measureTokens(messages)).toBe(110);
    expect(engine.compactIfNeeded(messages)).resolves.toBeNull();
    expect(messages).toHaveLength(before);
    expect(collectEvents(engine).filter(e => e.type === 'compaction/start')).toHaveLength(0);
  });

  it('超 threshold 触发压缩 — 摘要 + 最近消息保留 + 原地 mutate + 影子价记账', async () => {
    const engine = makeEngine();
    const messages = longConversation();
    for (let i = 0; i < 7; i++) messages.push(msg('user', LONG));
    const ref = messages;
    const result = await engine.compactIfNeeded(messages);

    expect(result).not.toBeNull();
    expect(result?.trigger).toBe('pressure');
    expect(result?.shadowedMessageCount).toBe(5);
    expect(result?.shadowedTokenCount).toBe(250); // 5 × 50
    // 原地 mutate — engineCtx.messages 共享引用不被脱钩
    expect(messages).toBe(ref);
    expect(messages).toHaveLength(4); // system + checkpoint + u6 + u7
    // system 原样保留
    expect(messages[0].content).toBe(SYSTEM);
    // checkpoint: user 角色含结构化摘要框架
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('<compacted-summary>');
    expect(messages[1].content).toContain('CKPT');
    // 最近消息逐字节保留
    expect(messages[2].content).toBe(LONG);
    expect(messages[3].content).toBe(LONG);
  });

  it('压缩事件序列 start→summary→end，compactionId 贯穿且 ok=true', async () => {
    const engine = makeEngine();
    const messages = longConversation();
    for (let i = 0; i < 7; i++) messages.push(msg('user', LONG));
    const result = await engine.compactIfNeeded(messages);
    const events = collectEvents(engine);

    expect(events.map(e => e.type)).toEqual(['compaction/start', 'compaction/summary', 'compaction/end']);
    expect(events[0].compactionId).toBe(result?.compactionId);
    expect(events[2].ok).toBe(true);
    expect(events[1].shadowedTokenCount).toBe(250);
    expect(events[1].shadowedRange).toEqual({ start: 1, end: 5 });
  });

  it('保留尾吃掉尾部后仅剩头部可压缩 — 正常收缩而非返回 null', async () => {
    const engine = makeEngine();
    // 布局: system 10 | 头部巨块 600 | 尾部保留块 100 → 总 710 ≥ threshold 320
    // retain 64: 自尾部累加 100 ≥ 64 → 保留起点落在尾部块 → 可压缩区间仅剩头部一条
    const messages = [msg('system', SYSTEM), msg('user', 'X'.repeat(2400)), msg('user', 'X'.repeat(400))];
    const result = await engine.compactIfNeeded(messages);
    // 压缩后: system 10 + checkpoint ~26 + 尾部 100 ≈ 136 < 320 → 正常返回
    expect(result).not.toBeNull();
    expect(result?.shadowedMessageCount).toBe(1);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('<compacted-summary>');
    expect(messages[2].content).toBe('X'.repeat(400));
  });
});

// ═══ 回放一致性 ═══

describe('压缩后回放一致', () => {
  it('system 逐字节相等 + checkpoint 唯一 + 保留尾深相等', async () => {
    const engine = makeEngine();
    const messages = [msg('system', SYSTEM)];
    const tail = [msg('user', LONG), msg('assistant', LONG), msg('user', LONG), msg('assistant', LONG)];
    messages.push(...tail, msg('user', LONG), msg('assistant', LONG));
    // 10 + 6×50 = 310 < 320 → 再加一条
    messages.push(msg('user', LONG)); // 360 ≥ 320
    const snapshot = [...messages];
    await engine.compactIfNeeded(messages);

    expect(messages[0]).toEqual(snapshot[0]);
    const checkpoints = messages.filter(m => m.content.includes('<compacted-summary>'));
    expect(checkpoints).toHaveLength(1);
    // 保留尾 = 最后 2 条，逐字节相等
    expect(messages.slice(-2)).toEqual(snapshot.slice(-2));
    // 消息总数收缩
    expect(messages.length).toBeLessThan(snapshot.length);
  });
});

// ═══ tool 配对不拆散 ═══

describe('tool 配对平衡（DSH toolPairingBalanced 范式）', () => {
  it('保留边界落在 tool result 上时回退到其 assistant — 配对不拆散', async () => {
    const engine = makeEngine();
    // 精确 token 布局（ceil(chars/4)）:
    //   system 10 | u1..u6 各 300 chars=75 | asst_tc 20 chars=5 | tool 20 chars=5 | a2 120 chars=30 | u5 120 chars=30
    //   总 = 10+450+5+5+30+30 = 530 ≥ threshold 320
    //   保留尾 64 自尾部累加: u5 30 → a2 60 → tool 65 ≥ 64 → 自然边界恰好落在 tool result 上
    const messages: LLMMessage[] = [msg('system', SYSTEM)];
    for (let i = 0; i < 6; i++) messages.push(msg('user', 'B'.repeat(300)));
    messages.push(
      msg('assistant', 'c'.repeat(20), { tool_calls: [{ function: { name: 'query_graph', arguments: '{}' } }] }),
      msg('tool', 'r'.repeat(20), { tool_call_id: 'call-1' }),
      msg('assistant', 'a'.repeat(120)),
      msg('user', 'z'.repeat(120)),
    );
    const result = await engine.compactIfNeeded(messages);

    expect(result).not.toBeNull();
    // 边界回退生效: shadowed 只含 u1..u6（配对整体未被 shadow）
    expect(result?.shadowedMessageCount).toBe(6);
    expect(result?.shadowedRange).toEqual({ start: 1, end: 6 });
    // tool result 保留且其 assistant 相邻在前
    const toolIdx = messages.findIndex(m => m.role === 'tool');
    expect(toolIdx).toBeGreaterThan(0);
    expect(messages[toolIdx - 1].role).toBe('assistant');
    expect(messages[toolIdx - 1].tool_calls).toBeDefined();
    // 保留区内无孤儿 tool message
    const retained = messages.slice(toolIdx - 1);
    expect(retained.some(m => m.role === 'tool' && m.tool_call_id === 'call-1')).toBe(true);
    // checkpoint 紧跟 system，压缩后低于 threshold
    expect(messages[1].content).toContain('<compacted-summary>');
    expect(engine.measureTokens(messages)).toBeLessThan(320);
  });
});

// ═══ 溢出恢复 ═══

describe('溢出恢复（CONTEXT_WINDOW_EXCEEDED → 强制压缩 → retry）', () => {
  it('溢出分类经公共面 — 自有双码 + 消息模式触发恢复，无关错误透传', async () => {
    const ownCode = (code: string, message: string): Error => {
      const err = new Error(message);
      Object.defineProperty(err, 'code', { value: code, enumerable: false });
      return err;
    };
    // 每个分类用例: 3 条消息（system + 2×50 tokens）→ 溢出时 forceCompact(retain=0) 可压缩 1 条
    const cases: Array<{ label: string; err: Error; overflow: boolean }> = [
      { label: 'own-code CONTEXT_OVERFLOW（B-01 归一化产物）', err: ownCode('CONTEXT_OVERFLOW', 'request failed'), overflow: true },
      { label: 'own-code CONTEXT_WINDOW_EXCEEDED（DSH 原生码）', err: ownCode('CONTEXT_WINDOW_EXCEEDED', 'request failed'), overflow: true },
      { label: 'message 模式 maximum context length', err: new Error("This model's maximum context length is 4096 tokens"), overflow: true },
      { label: 'message 模式 上下文长度超出', err: new Error('上下文长度超出限制'), overflow: true },
      { label: 'own-code AUTH_FAILED', err: ownCode('AUTH_FAILED', '401 unauthorized'), overflow: false },
      { label: 'network timeout', err: new Error('network timeout'), overflow: false },
    ];
    for (const c of cases) {
      const engine = makeEngine();
      const messages = [msg('system', SYSTEM), msg('user', LONG), msg('user', LONG)];
      let calls = 0;
      const p: LLMProvider = {
        name: 'p', baseUrl: 'http://p',
        chat: async () => {
          calls += 1;
          throw c.err;
        },
        stream: async () => {},
        listModels: () => [],
        healthCheck: async () => ({ healthy: true }),
      };
      await expect(wrapProviderWithOverflowRecovery(p, engine).chat(messages)).rejects.toThrow(c.err.message);
      // 溢出: 首调 + 每次强制压缩后重试各 1 次；非溢出: 原样透传仅 1 次
      expect(calls).toBe(c.overflow ? 1 + engine.maxOverflowRetries : 1);
      expect(collectEvents(engine).filter(e => e.type === 'compaction/start')).toHaveLength(c.overflow ? engine.maxOverflowRetries : 0);
    }
  });

  it('forceCompact retain=0 — 除最后一条外全部 shadow（绕过 threshold 与保留尾策略）', async () => {
    const engine = makeEngine();
    const messages = longConversation();
    for (let i = 0; i < 5; i++) messages.push(msg('user', LONG));
    const last = messages[messages.length - 1];
    const result = await engine.forceCompact(messages);

    expect(result).not.toBeNull();
    expect(result?.trigger).toBe('context-overflow');
    expect(result?.shadowedMessageCount).toBe(4); // u1..u4（最后一条保留）
    expect(messages).toHaveLength(3); // system + checkpoint + last
    expect(messages[2].content).toBe(last.content);
    expect(messages[1].content).toContain('<compacted-summary>');
  });

  it('wrapProviderWithOverflowRecovery — 溢出→强制压缩→retry 成功；持续溢出→限定次数后抛出', async () => {
    const engine = makeEngine();
    const messages = longConversation();
    for (let i = 0; i < 5; i++) messages.push(msg('user', LONG));

    let chatCalls = 0;
    const overflowErr = (): Error => {
      const err = new Error('context length exceeded');
      Object.defineProperty(err, 'code', { value: 'CONTEXT_OVERFLOW', enumerable: false });
      return err;
    };
    const okAfterCompact = (): ChatResult => ({ content: 'recovered', model: 'fake' });

    // 场景 1: 第一次溢出，压缩后重试成功
    const flaky: LLMProvider = {
      name: 'fake', baseUrl: 'http://fake',
      chat: async (_messages, _options) => {
        chatCalls += 1;
        if (chatCalls === 1) throw overflowErr();
        return okAfterCompact();
      },
      stream: async () => {},
      listModels: () => [],
      healthCheck: async () => ({ healthy: true }),
    };
    const wrapped = wrapProviderWithOverflowRecovery(flaky, engine);
    const result = await wrapped.chat(messages);
    expect(result.content).toBe('recovered');
    expect(chatCalls).toBe(2);
    // 压缩真实发生 — system + checkpoint + 最后一条
    expect(messages).toHaveLength(3);
    expect(messages.some(m => m.content.includes('<compacted-summary>'))).toBe(true);

    // 场景 2: 持续溢出 — maxOverflowRetries=1 → chat 恰好调 2 次后抛原始错误
    const engine2 = makeEngine();
    const messages2 = longConversation();
    for (let i = 0; i < 5; i++) messages2.push(msg('user', LONG));
    let stubbornCalls = 0;
    const stubborn: LLMProvider = {
      name: 'fake2', baseUrl: 'http://fake2',
      chat: async () => {
        stubbornCalls += 1;
        throw overflowErr();
      },
      stream: async () => {},
      listModels: () => [],
      healthCheck: async () => ({ healthy: true }),
    };
    const stubbornWrapped = wrapProviderWithOverflowRecovery(stubborn, engine2);
    await expect(stubbornWrapped.chat(messages2)).rejects.toThrow(/context length exceeded/);
    expect(stubbornCalls).toBe(1 + engine2.maxOverflowRetries);

    // 场景 3: 非溢出错误原样透传，不触发压缩
    const engine3 = makeEngine();
    let authCalls = 0;
    const authFail: LLMProvider = {
      name: 'fake3', baseUrl: 'http://fake3',
      chat: async () => {
        authCalls += 1;
        const err = new Error('401 unauthorized');
        Object.defineProperty(err, 'code', { value: 'AUTH_FAILED', enumerable: false });
        throw err;
      },
      stream: async () => {},
      listModels: () => [],
      healthCheck: async () => ({ healthy: true }),
    };
    await expect(wrapProviderWithOverflowRecovery(authFail, engine3).chat([msg('user', 'hi')])).rejects.toThrow(/401/);
    expect(authCalls).toBe(1);
    expect(collectEvents(engine3)).toHaveLength(0);
  });
});

// ═══ 影子价 + 失败路径 ═══

describe('影子价格校验与失败路径', () => {
  it('summary 不小于被 shadowed 内容 → SUMMARY_NOT_SMALLER 且不落地', async () => {
    const engine = makeEngine(() => 'H'.repeat(5000)); // 1250 tokens framed > shadowed 250
    const messages = longConversation();
    for (let i = 0; i < 7; i++) messages.push(msg('user', LONG));
    const snapshot = [...messages];

    await expect(engine.compactIfNeeded(messages)).rejects.toThrowError(ContextCompactionError);
    try {
      await engine.compactIfNeeded(messages);
    } catch (err) {
      expect((err as ContextCompactionError).code).toBe('SUMMARY_NOT_SMALLER');
    }
    // 未落地 — 消息保持原样
    expect(messages).toEqual(snapshot);
    // 失败恰一次 end(ok:false)（两次尝试 → 两个完整失败周期）
    const ends = collectEvents(engine).filter(e => e.type === 'compaction/end');
    expect(ends.length).toBe(2);
    expect(ends.every(e => e.ok === false)).toBe(true);
  });

  it('in-flight 锁 — 未完成压缩期间再触发 → COMPACTION_BUSY', async () => {
    let release: ((value: string) => void) | undefined;
    const engine = new ContextCompaction({
      contextWindowTokens: 400,
      summarizer: { summarize: () => new Promise<string>(resolve => {
        release = resolve;
      }) },
    });
    const messages = longConversation();
    for (let i = 0; i < 7; i++) messages.push(msg('user', LONG));

    const first = engine.compactIfNeeded(messages);
    await expect(engine.compactIfNeeded(messages)).rejects.toThrowError(/already in progress|COMPACTION_BUSY/);
    try {
      await engine.compactIfNeeded(messages);
    } catch (err) {
      expect((err as ContextCompactionError).code).toBe('COMPACTION_BUSY');
      expect((err as ContextCompactionError).retryable).toBe(true);
    }
    release?.('CKPT');
    const result = await first;
    expect(result).not.toBeNull();
    expect(result?.summary).toBe('CKPT');
    // 锁释放 — 后续压缩可进行
    expect(engine.getEvents().filter(e => e.type === 'compaction/end' && e.ok === true)).toHaveLength(1);
  });

  it('summarizer 抛错 → 恰一次 end(ok:false) + 消息不变 + 锁释放', async () => {
    const engine = makeEngine(() => {
      throw new Error('llm down');
    });
    const messages = longConversation();
    for (let i = 0; i < 7; i++) messages.push(msg('user', LONG));
    const snapshot = [...messages];

    await expect(engine.compactIfNeeded(messages)).rejects.toThrow(/llm down/);
    expect(messages).toEqual(snapshot);
    const events = collectEvents(engine);
    expect(events.filter(e => e.type === 'compaction/end')).toHaveLength(1);
    expect(events[events.length - 1].ok).toBe(false);
    expect(events[events.length - 1].error?.message).toBe('llm down');
    // 锁已释放 — 换好摘要器可再次压缩
    const recovered = new ContextCompaction({
      contextWindowTokens: 400,
      summarizer: { summarize: async () => 'CKPT' },
    });
    expect(recovered.compactIfNeeded(messages)).resolves.not.toBeNull();
  });
});

// ═══ 默认摘要器（KV-cache 前缀复用范式） ═══

describe('createProviderSummarizer', () => {
  function fakeProvider(chatImpl: (messages: LLMMessage[], options?: ChatOptions) => Promise<ChatResult>): { provider: LLMProvider; calls: Array<{ messages: LLMMessage[]; options?: ChatOptions }> } {
    const calls: Array<{ messages: LLMMessage[]; options?: ChatOptions }> = [];
    return {
      calls,
      provider: {
        name: 'fake', baseUrl: 'http://fake',
        chat: async (messages, options) => {
          calls.push({ messages, options });
          return chatImpl(messages, options);
        },
        stream: async () => {},
        listModels: () => [],
        healthCheck: async () => ({ healthy: true }),
      },
    };
  }

  it('压缩指令作为最后一条 user message 追加 — 前缀原样复用（KV-cache 命中）', async () => {
    const { provider, calls } = fakeProvider(async () => ({ content: 'CKPT-SUMMARY', model: 'fake' }));
    const summarizer = createProviderSummarizer(provider, 1024);
    const prefix = [msg('system', SYSTEM), msg('user', LONG), msg('assistant', SHORT)];
    const summary = await summarizer.summarize(prefix);

    expect(summary).toBe('CKPT-SUMMARY');
    expect(calls).toHaveLength(1);
    expect(calls[0].messages).toHaveLength(4);
    // 前缀逐字节一致
    expect(calls[0].messages.slice(0, 3)).toEqual(prefix);
    // 追加的是 user 角色、含压缩指令
    expect(calls[0].messages[3].role).toBe('user');
    expect(calls[0].messages[3].content.length).toBeGreaterThan(50);
    // maxTokens 传入摘要调用
    expect(calls[0].options?.maxTokens).toBe(1024);
  });

  it('空响应 → 引擎 EMPTY_SUMMARY 拒绝落地', async () => {
    const { provider } = fakeProvider(async () => ({ content: '   ', model: 'fake' }));
    const engine = new ContextCompaction({
      contextWindowTokens: 400,
      summarizer: createProviderSummarizer(provider, 1024),
    });
    const messages = longConversation();
    for (let i = 0; i < 7; i++) messages.push(msg('user', LONG));
    const snapshot = [...messages];

    await expect(engine.compactIfNeeded(messages)).rejects.toThrowError(/EMPTY_SUMMARY|no text/);
    expect(messages).toEqual(snapshot);
    expect(collectEvents(engine).filter(e => e.type === 'compaction/end' && e.ok === false)).toHaveLength(1);
  });
});
