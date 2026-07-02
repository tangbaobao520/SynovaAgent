import { create } from 'zustand';

export type OnlineStatus = 'connected' | 'disconnected' | 'connecting';
export type ActiveView = 'chat' | 'dashboard' | 'settings';

export interface AppState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  onlineStatus: OnlineStatus;
  alertCount: number;
  activeView: ActiveView;
  lastDiagnosisTime: string | null;
  dimensionCovered: number;
  dimensionTotal: number;

  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setOnlineStatus: (status: OnlineStatus) => void;
  setAlertCount: (count: number) => void;
  setActiveView: (view: ActiveView) => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setDiagnosisInfo: (time: string, covered: number, total: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftPanelWidth: 240,
  rightPanelWidth: 320,
  onlineStatus: 'connecting',
  alertCount: 0,
  activeView: 'chat',
  lastDiagnosisTime: null,
  dimensionCovered: 0,
  dimensionTotal: 8,

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setOnlineStatus: (status) => set({ onlineStatus: status }),
  setAlertCount: (count) => set({ alertCount: count }),
  setActiveView: (view) => set({ activeView: view }),
  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
  setDiagnosisInfo: (time, covered, total) => set({
    lastDiagnosisTime: time, dimensionCovered: covered, dimensionTotal: total,
  }),
}));
