/**
 * tui-v2/types.ts — TUI 类型定义
 */

import type { SidebarSnapshot } from './lib/sidebar-aggregator';

/** 消息角色 */
export type MessageRole = 'user' | 'agent' | 'system' | 'alert';

/** 单条消息 */
export interface MessageItem {
  role: MessageRole;
  text: string;
  streaming?: boolean;
  timestamp?: Date;
}

/** 专家状态 */
export interface ExpertStatus {
  name: string;
  status: 'done' | 'running' | 'queued' | 'failed';
  elapsed?: string;
  result?: string;
}

/** 增长目标 */
export interface GoalData {
  id: string;
  text: string;
  progressPct: number;
  elapsedDays: number;
  totalDays: number;
  phase: number;
}

/** 增长障碍 */
export interface ObstacleItem {
  name: string;
  status: 'pending' | 'active' | 'resolved';
  confidence?: number;
}

/** 遗留问题 */
export interface LegacyIssue {
  title: string;
  foundDate: string;
  status: 'unresolved' | 'in_progress';
}

/** TUI 全局状态 */
export interface TuiState {
  messages: MessageItem[];
  experts: ExpertStatus[];
  goals: GoalData[];
  obstacles: ObstacleItem[];
  legacyIssues: LegacyIssue[];
  phase: number;
  status: string;
  isStreaming: boolean;
  cost: {
    session: number;
    monthly: number;
  };
  /** 右边栏聚合快照 — SidebarAggregator 生成, SidePanel 纯渲染 */
  sidebar: SidebarSnapshot | null;
}

/** 初始状态 */
export function createInitialState(): TuiState {
  return {
    messages: [],
    experts: [],
    goals: [],
    obstacles: [],
    legacyIssues: [],
    phase: 0,
    status: '准备就绪',
    isStreaming: false,
    cost: { session: 0, monthly: 0 },
    sidebar: null,
  };
}
