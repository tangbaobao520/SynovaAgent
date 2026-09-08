/**
 * stores/conversation-store.ts — 对话状态管理 (Zustand)
 *
 * Phase 1.1: 消息 CRUD + 欢迎页三态
 * Phase 1.2+: SSE 流式、@提及、命令面板
 * D591: 会话锚持久化（currentSessionId + localStorage['synova:last-session-id']，提交回声对账
 *       与刷新恢复的单一锚点）、恢复投影纯函数 restoreMessages、快速行动预填（draftPrefill/pendingIntent）
 */
import { create } from 'zustand';
import type { ChatMessage, ConversationPhase, WelcomeState } from '../types/chat';

export interface ConversationState {
  messages: ChatMessage[];
  phase: ConversationPhase;
  welcomeState: WelcomeState;
  errorMessage: string | null;
  /** D527: 六阶段进度（phase_started 驱动，-1 = 尚未开始） */
  phaseIndex: number;
  phaseLabel: string;
  phaseTotal: number;
  /** D591: 当前会话锚（open 帧回声/恢复投影后落定；续轮请求携带） */
  currentSessionId: string | null;
  /** D591: 快速行动预填文本（WelcomeScreen 产出，CenterPanel 待发送条消费后清空） */
  draftPrefill: string | null;
  /** D591: 快速行动诊断意图（'diagnosis' = 首条消息走 /api/diagnosis/consult 显式诊断） */
  pendingIntent: 'diagnosis' | null;

  setWelcomeState: (state: WelcomeState) => void;
  /** D527: 六阶段进度更新（sse-contract phase_started 归约结果落库） */
  setPhaseProgress: (index: number, label: string) => void;
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void;
  removeLastMessage: () => void;
  setPhase: (phase: ConversationPhase) => void;
  clearMessages: () => void;
  setError: (msg: string | null) => void;
  /** D591: 会话锚落定/清除（id=null 同时删 localStorage 键；SSR/无 window 守卫） */
  setCurrentSessionId: (id: string | null) => void;
  /** D591: 恢复路径专用——批量替换 messages（投影结果注入 _id 供渲染 key） */
  restoreMessages: (msgs: ChatMessage[]) => void;
  /** D591: "新对话"语义（§8 登记的预留 API，本期 UI 零调用） */
  clearSession: () => void;
  /** D591: 快速行动预填写入/清除 */
  setDraftPrefill: (text: string | null) => void;
  /** D591: 快速行动诊断意图写入/清除 */
  setPendingIntent: (intent: 'diagnosis' | null) => void;
}

/** D591: 本地会话锚 localStorage 键（spec §5.1 固定值） */
export const LAST_SESSION_ID_STORAGE_KEY = 'synova:last-session-id';

/** localStorage 安全访问（无 window/node 测试/隐私模式 → null，不抛） */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch (err) {
    // 铁律 24: 不静默——localStorage 不可达属环境降级，warn 留痕后按无存储处理
    console.warn('[conversation-store] localStorage 不可用，会话锚降级为内存态:',
      err instanceof Error ? err.message : String(err));
  }
  return null;
}

/**
 * readLastSessionId — D591 读取本地会话锚（恢复时序第 ① 步）
 * @input  无（读 localStorage[LAST_SESSION_ID_STORAGE_KEY]）
 * @output 会话 id 字符串 | null（无键/空值/无 window → null，非异常）
 * @degraded localStorage 访问异常 → console.warn + null（不抛）
 */
export function readLastSessionId(): string | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const id = storage.getItem(LAST_SESSION_ID_STORAGE_KEY);
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch (err) {
    console.warn('[conversation-store] 会话锚读取失败:',
      err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * restoreMessages — D591 会话恢复投影纯函数（铁律 47 契约；§3 Q4）
 *
 * @input  sessionPayload: unknown — GET /api/sessions/:id 响应体（{ok, session, messages}），形状不可信
 * @output ChatMessage[] — 仅投影 role∈{user,assistant} 的消息，保序；system/tool 等非对话角色、
 *         越界/畸形项（非对象/缺 content/content 非 string/空串）跳过；timestamp 缺失回落当前时刻
 * @degraded payload 非 {messages: unknown[]} 形状 → 返回 []（诚实空态，不抛）
 */
export function restoreMessages(sessionPayload: unknown): ChatMessage[] {
  if (typeof sessionPayload !== 'object' || sessionPayload === null) return [];
  const msgs = (sessionPayload as { messages?: unknown }).messages;
  if (!Array.isArray(msgs)) return [];

  const out: ChatMessage[] = [];
  for (const item of msgs) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as { role?: unknown; content?: unknown; timestamp?: unknown; ts?: unknown };
    if (rec.role !== 'user' && rec.role !== 'assistant') continue;
    if (typeof rec.content !== 'string' || rec.content.length === 0) continue;
    const ts = typeof rec.timestamp === 'string' ? rec.timestamp
      : typeof rec.ts === 'string' ? rec.ts
      : new Date().toISOString();
    out.push(
      rec.role === 'user'
        ? { type: 'user', content: rec.content, timestamp: ts }
        : { type: 'assistant', content: rec.content, timestamp: ts },
    );
  }
  return out;
}

let _id = 0;

export const useConversationStore = create<ConversationState>((set) => ({
  messages: [],
  phase: 'idle',
  welcomeState: 'firstLaunch',
  errorMessage: null,
  phaseIndex: -1,
  phaseLabel: '',
  phaseTotal: 6,
  currentSessionId: null,
  draftPrefill: null,
  pendingIntent: null,

  setWelcomeState: (welcomeState) => set({ welcomeState }),
  setPhaseProgress: (phaseIndex, phaseLabel) => set({ phaseIndex, phaseLabel }),

  addMessage: (msg) => set((s) => ({
    messages: [...s.messages, { ...msg, _id: ++_id } as ChatMessage & { _id: number }],
  })),

  updateLastMessage: (updater) => set((s) => {
    if (s.messages.length === 0) return s;
    const msgs = [...s.messages];
    msgs[msgs.length - 1] = updater(msgs[msgs.length - 1]);
    return { messages: msgs };
  }),

  removeLastMessage: () => set((s) => ({
    messages: s.messages.slice(0, -1),
  })),

  setPhase: (phase) => set({ phase }),
  clearMessages: () => set({ messages: [], phase: 'idle', errorMessage: null }),
  setError: (errorMessage) => set({ errorMessage }),

  setCurrentSessionId: (id) => {
    set({ currentSessionId: id });
    const storage = safeLocalStorage();
    if (!storage) return;
    try {
      if (id) storage.setItem(LAST_SESSION_ID_STORAGE_KEY, id);
      else storage.removeItem(LAST_SESSION_ID_STORAGE_KEY);
    } catch (err) {
      // 铁律 24: 写失败（配额/隐私模式）不静默——内存锚仍在，仅持久化降级
      console.warn('[conversation-store] 会话锚写入失败:',
        err instanceof Error ? err.message : String(err));
    }
  },

  restoreMessages: (msgs) => set({
    messages: msgs.map((m) => ({ ...m, _id: ++_id } as ChatMessage & { _id: number })),
  }),

  clearSession: () => {
    set({
      currentSessionId: null, messages: [], phase: 'idle', errorMessage: null,
      phaseIndex: -1, phaseLabel: '', draftPrefill: null, pendingIntent: null,
    });
    const storage = safeLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(LAST_SESSION_ID_STORAGE_KEY);
    } catch (err) {
      console.warn('[conversation-store] 会话锚清除失败:',
        err instanceof Error ? err.message : String(err));
    }
  },

  setDraftPrefill: (draftPrefill) => set({ draftPrefill }),
  setPendingIntent: (pendingIntent) => set({ pendingIntent }),
}));
