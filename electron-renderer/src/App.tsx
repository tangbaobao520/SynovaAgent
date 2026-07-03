/**
 * App.tsx — Synova Desktop 根组件 (Phase 2.2)
 *
 * 集成: panels, Composer, CommandPalette, NotificationCenter, 快捷键
 */
import React, { useEffect, useMemo, useCallback, useState } from 'react';
import TitleBar from './components/TitleBar';
import StatusBar from './components/StatusBar';
import LeftPanel from './components/LeftPanel';
import CenterPanel from './components/CenterPanel';
import RightPanel from './components/RightPanel';
import ResizeHandle from './components/ResizeHandle';
import CommandPalette from './components/CommandPalette';
import NotificationCenter from './components/NotificationCenter';
import { useAppStore } from './stores/app-store';
import { useKeyboard } from './hooks/useKeyboard';
import { isElectron, getAppVersion, updateTrayState } from './ipc/bridge';

const App: React.FC = () => {
  const toggleLeftPanel = useAppStore((s) => s.toggleLeftPanel);
  const setOnlineStatus = useAppStore((s) => s.setOnlineStatus);
  const theme = useAppStore((s) => s.theme);
  const alertCount = useAppStore((s) => s.alertCount);
  const leftPanelWidth = useAppStore((s) => s.leftPanelWidth);
  const rightPanelWidth = useAppStore((s) => s.rightPanelWidth);
  const leftPanelOpen = useAppStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const setLeftPanelWidth = useAppStore((s) => s.setLeftPanelWidth);
  const setRightPanelWidth = useAppStore((s) => s.setRightPanelWidth);

  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const handleLeftResize = useCallback((w: number) => setLeftPanelWidth(w), [setLeftPanelWidth]);
  const handleRightResize = useCallback((w: number) => setRightPanelWidth(w), [setRightPanelWidth]);

  const handlers = useMemo(() => ({
    toggleLeftPanel,
    toggleRightPanel: () => useAppStore.getState().toggleRightPanel(),
    openCommandPalette: () => { setNotifOpen(false); setCmdPaletteOpen((p) => !p); },
  }), [toggleLeftPanel]);

  useKeyboard(handlers);

  // 健康检测
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        setOnlineStatus(res.ok ? 'connected' : 'disconnected');
      } catch { setOnlineStatus('disconnected'); }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [setOnlineStatus]);

  // sync alert count to tray
  useEffect(() => {
    if (!isElectron()) return;
    if (alertCount > 0) updateTrayState('unread', alertCount);
    else updateTrayState('normal');
  }, [alertCount]);

  useEffect(() => {
    if (isElectron()) getAppVersion().then((v) => console.log(`[Synova] v${v}`));
  }, []);

  const leftW = leftPanelOpen ? leftPanelWidth : 44;
  const rightW = rightPanelOpen ? rightPanelWidth : 0;

  return (
    <div className={`app-layout${theme === 'light' ? ' theme-light' : ''}`}>
      <TitleBar onToggleNotifications={() => { setCmdPaletteOpen(false); setNotifOpen((n) => !n); }} />
      <div className="app-body">
        <nav className={`panel-left ${leftPanelOpen ? 'open' : 'closed'}`}
          style={{ width: leftW, minWidth: leftW, transition: 'width 0.3s ease' }}>
          <LeftPanel />
        </nav>
        {leftPanelOpen && (
          <ResizeHandle side="left" panelWidth={leftPanelWidth} onWidthChange={handleLeftResize} />
        )}
        <main className="panel-center"><CenterPanel /></main>
        {rightPanelOpen && (
          <ResizeHandle side="right" panelWidth={rightPanelWidth} onWidthChange={handleRightResize} />
        )}
        {rightPanelOpen && (
          <aside className="panel-right open"
            style={{ width: rightW, minWidth: rightW, transition: 'width 0.3s ease' }}>
            <RightPanel />
          </aside>
        )}
      </div>
      <StatusBar />

      {/* Overlays */}
      <CommandPalette open={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
};

export default React.memo(App);
