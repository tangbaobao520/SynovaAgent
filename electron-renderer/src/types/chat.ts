/**
 * types/chat.ts — 对话消息类型定义 (Phase 1.1)
 *
 * 四种消息类型，全部带 type 字段用于 TypeScript 联合判定。
 */

export interface ExpertAttr {
  name: string;
  confidence: number;
  methodology?: string;
}

export interface Action {
  id: string;
  label: string;
  type: 'confirm' | 'reject' | 'view';
  payload?: Record<string, unknown>;
}

export interface UserMessage {
  type: 'user';
  content: string;
  timestamp: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  experts: string[];
  collapsed: boolean;
  timestamp: string;
}

export interface AgentMessage {
  type: 'assistant';
  content: string;
  expertAttribution?: ExpertAttr[];
  actions?: Action[];
  timestamp: string;
}

export interface SystemMessage {
  type: 'system';
  content: string;
  subType?: 'phase' | 'degraded' | 'info';
  timestamp: string;
}

/** 联合消息类型 */
export type ChatMessage = UserMessage | ThinkingBlock | AgentMessage | SystemMessage;

/** 对话阶段 */
export type ConversationPhase = 'idle' | 'loading' | 'thinking' | 'streaming' | 'done' | 'error';

/** 欢迎页三态 */
export type WelcomeState = 'firstLaunch' | 'hasConfigNoData' | 'ready';
