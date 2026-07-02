import { create } from 'zustand';

export type OnlineStatus = 'connected' | 'disconnected' | 'connecting';
export type ActiveView = 'chat' | 'dashboard' | 'settings';
export type ThemeMode = 'dark' | 'light';
export type UserRole = 'admin' | 'manager' | 'ga' | 'liaison' | 'staff';

export interface ClientInfo {
  orgId: string;
  name: string;
  industry: string;
  status: string;
  metrics: { flywheelSpeed: number; activeAlerts: number; pendingPlans: number };
}

export interface WorkspaceInfo {
  id: string; title: string; type: 'diagnostic' | 'manual'; updatedAt: string;
}

export interface ConversationInfo {
  id: string; title: string; preview: string; updatedAt: string;
}

export interface AppState {
  // 面板
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;

  // 应用状态
  onlineStatus: OnlineStatus;
  alertCount: number;
  activeView: ActiveView;
  theme: ThemeMode;

  // 角色
  userRole: UserRole;
  activeWorkspaceId: string | null;
  searchQuery: string;

  // GA 管理 (Phase 3.1)
  activeOrgId: string | null;
  gaClients: ClientInfo[];

  // 列表
  workspaces: WorkspaceInfo[];
  conversations: ConversationInfo[];

  // 诊断
  lastDiagnosisTime: string | null;
  dimensionCovered: number;
  dimensionTotal: number;

  // Actions
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setOnlineStatus: (s: OnlineStatus) => void;
  setAlertCount: (c: number) => void;
  setActiveView: (v: ActiveView) => void;
  toggleTheme: () => void;
  setUserRole: (r: UserRole) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  setDiagnosisInfo: (t: string, c: number, tot: number) => void;

  // GA Actions (Phase 3.1)
  setGaClients: (clients: ClientInfo[]) => void;
  setActiveOrgId: (orgId: string | null) => void;
}

const MOCK_WORKSPACES: WorkspaceInfo[] = [
  { id: 'ws-1', title: '默认工作区', type: 'manual', updatedAt: new Date().toISOString() },
  { id: 'ws-2', title: '财务诊断', type: 'diagnostic', updatedAt: new Date().toISOString() },
  { id: 'ws-3', title: '团队协作分析', type: 'diagnostic', updatedAt: new Date().toISOString() },
];
const MOCK_CONVERSATIONS: ConversationInfo[] = [
  { id: 'conv-1', title: '为什么现金流在恶化？', preview: '分析了现金流趋势', updatedAt: new Date().toISOString() },
  { id: 'conv-2', title: '团队协作分析', preview: '识别了跨部门协作障碍', updatedAt: new Date().toISOString() },
  { id: 'conv-3', title: '关键人风险评估', preview: '评估了核心岗位风险', updatedAt: new Date().toISOString() },
];

export const useAppStore = create<AppState>((set) => ({
  leftPanelOpen: true, rightPanelOpen: true,
  leftPanelWidth: 240, rightPanelWidth: 320,
  onlineStatus: 'connecting', alertCount: 0, activeView: 'chat', theme: 'dark',

  userRole: 'admin', activeWorkspaceId: null, searchQuery: '',
  activeOrgId: null,
  gaClients: [],

  workspaces: MOCK_WORKSPACES, conversations: MOCK_CONVERSATIONS,
  lastDiagnosisTime: null, dimensionCovered: 0, dimensionTotal: 8,

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setOnlineStatus: (onlineStatus) => set({ onlineStatus }),
  setAlertCount: (alertCount) => set({ alertCount }),
  setActiveView: (activeView) => set({ activeView }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setUserRole: (userRole) => set({ userRole }),
  setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
  setDiagnosisInfo: (time, covered, total) => set({
    lastDiagnosisTime: time, dimensionCovered: covered, dimensionTotal: total,
  }),

  setGaClients: (gaClients) => set({ gaClients }),
  setActiveOrgId: (orgId) => set((s) => ({
    activeOrgId: orgId,
    activeWorkspaceId: null,    // 切换客户时重置工作区
    conversations: s.userRole === 'ga' ? s.conversations : s.conversations,
  })),
}));
