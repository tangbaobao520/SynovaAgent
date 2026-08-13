/**
 * stores/conversation-store.ts — 对话状态管理 (Zustand)
 *
 * Phase 1.1: 消息 CRUD + 欢迎页三态
 * Phase 1.2+: SSE 流式、@提及、命令面板
 */
import { create } from 'zustand';
import type { ChatMessage, ConversationPhase, WelcomeState } from '../types/chat';

export interface ConversationState {
  messages: ChatMessage[];
  phase: ConversationPhase;
  welcomeState: WelcomeState;
  errorMessage: string | null;

  setWelcomeState: (state: WelcomeState) => void;
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (updater: (msg: ChatMessage) => ChatMessage) => void;
  removeLastMessage: () => void;
  setPhase: (phase: ConversationPhase) => void;
  clearMessages: () => void;
  setError: (msg: string | null) => void;
}

let _id = 0;

export const useConversationStore = create<ConversationState>((set) => ({
  messages: [],
  phase: 'idle',
  welcomeState: 'firstLaunch',
  errorMessage: null,

  setWelcomeState: (welcomeState) => set({ welcomeState }),

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
}));
