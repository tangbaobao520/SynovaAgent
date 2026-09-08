import { create } from 'zustand';
// D538: 能力导航纯逻辑契约（状态机/权限/标签）—— store 只消费类型
import type { SelectedCap } from './capability';
// D556: GA 协同纯逻辑数据层（seed 身份读取——零 react/zustand，node 可测）
import { getSeedIdentity } from './ga-collab';

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

  // D538: 左栏能力导航选中态（null = 右栏显示默认三标签）
  selectedCap: SelectedCap;

  // GA 管理 (Phase 3.1)
  activeOrgId: string | null;
  gaClients: ClientInfo[];

  // 列表
  workspaces: WorkspaceInfo[];
  conversations: ConversationInfo[];

  // 诊断
  lastDiagnosisTime: string | null;
  currentReportId: string | null;  // Phase 3.4: 最近诊断的报告 ID
  dimensionCovered: number;
  dimensionTotal: number;

  // D575: LLM 未配置黄条（boot 判定 / 「暂不配置」置 true；保存配置置 false）
  llmUnconfigured: boolean;

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
  setSelectedCap: (cap: SelectedCap) => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  setDiagnosisInfo: (t: string, c: number, tot: number) => void;
  setCurrentReportId: (id: string) => void;
  setLlmUnconfigured: (v: boolean) => void;

  // GA Actions (Phase 3.1)
  setGaClients: (clients: ClientInfo[]) => void;
  setActiveOrgId: (orgId: string | null) => void;

  // D593: 会话列表真数据（GET /api/sessions → LeftPanel 挂载时写入，D591 遗留接线）
  setConversations: (list: ConversationInfo[]) => void;
}

/**
 * bootUserRole — D556 boot seed（spec §7.2）: localStorage 'synova.dev-identity' 存在且
 * role==='ga' 时初始化 userRole='ga'；无 seed / 非 ga → 'admin'（L98 原语义不变——
 * DS4: 无 seed 行为与现状完全一致）。seed 仅 dev 语义，D483-D486 落地后由真实 JWT 替代。
 *
 * D591（审计范围⑤）: 初始 workspaces/conversations 假数据删除，为空数组
 * （诚实空态优于假绿数据）；真会话列表接 GET /api/sessions 归 D593。
 */
function bootUserRole(): UserRole {
  return getSeedIdentity() ? 'ga' : 'admin';
}

// ═══ D593: 报告锚持久化（currentReportId + localStorage['synova:last-report-id']） ═══
// 对齐 D591 conversation-store 的 last-session-id 模式（提交回声/刷新恢复的单一锚点）。

/** D593: 本地报告锚 localStorage 键（spec §5.1 固定值） */
export const LAST_REPORT_ID_STORAGE_KEY = 'synova:last-report-id';

/** localStorage 安全访问（无 window/node 测试/隐私模式 → null，不抛） */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch (err) {
    // 铁律 24: 不静默——localStorage 不可达属环境降级，warn 留痕后按无存储处理
    console.warn('[app-store] localStorage 不可用，报告锚降级为内存态:',
      err instanceof Error ? err.message : String(err));
  }
  return null;
}

/**
 * readLastReportId — D593 读取本地报告锚（刷新恢复时序第 ① 步；列表端点为兜底）
 * @input  无（读 localStorage[LAST_REPORT_ID_STORAGE_KEY]）
 * @output 报告 id 字符串 | null（无键/空值/无 window → null，非异常）
 * @degraded localStorage 访问异常 → console.warn + null（不抛）
 */
export function readLastReportId(): string | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const id = storage.getItem(LAST_REPORT_ID_STORAGE_KEY);
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch (err) {
    console.warn('[app-store] 报告锚读取失败:',
      err instanceof Error ? err.message : String(err));
    return null;
  }
}

export const useAppStore = create<AppState>((set) => ({
  leftPanelOpen: true, rightPanelOpen: true,
  leftPanelWidth: 240, rightPanelWidth: 320,
  onlineStatus: 'connecting', alertCount: 0, activeView: 'chat', theme: 'dark',

  userRole: bootUserRole(), activeWorkspaceId: null, searchQuery: '',
  selectedCap: null,
  activeOrgId: null,
  gaClients: [],

  workspaces: [], conversations: [],
  lastDiagnosisTime: null, currentReportId: readLastReportId(), dimensionCovered: 0, dimensionTotal: 8,
  llmUnconfigured: false,

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setOnlineStatus: (onlineStatus) => set({ onlineStatus }),
  setAlertCount: (alertCount) => set({ alertCount }),
  setActiveView: (activeView) => set({ activeView }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setUserRole: (userRole) => set({ userRole }),
  setActiveWorkspaceId: (activeWorkspaceId) => set({ activeWorkspaceId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCap: (selectedCap) => set({ selectedCap }),
  setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
  setDiagnosisInfo: (time, covered, total) => set({
    lastDiagnosisTime: time, dimensionCovered: covered, dimensionTotal: total,
  }),
  // D593: 报告锚落定（同步写 localStorage；写失败不静默——内存锚仍在，仅持久化降级，铁律 24）
  setCurrentReportId: (reportId) => {
    set({ currentReportId: reportId });
    const storage = safeLocalStorage();
    if (!storage) return;
    try {
      storage.setItem(LAST_REPORT_ID_STORAGE_KEY, reportId);
    } catch (err) {
      console.warn('[app-store] 报告锚写入失败:',
        err instanceof Error ? err.message : String(err));
    }
  },
  setLlmUnconfigured: (llmUnconfigured) => set({ llmUnconfigured }),

  setGaClients: (gaClients) => set({ gaClients }),
  // D593: 会话列表真数据写入（LeftPanel 挂载时 GET /api/sessions 映射后调用；D591 §5.4 决策 5 遗留闭环）
  setConversations: (conversations) => set({ conversations }),
  setActiveOrgId: (orgId) => set((s) => ({
    activeOrgId: orgId,
    activeWorkspaceId: null,    // 切换客户时重置工作区
    conversations: s.userRole === 'ga' ? s.conversations : s.conversations,
  })),
}));
