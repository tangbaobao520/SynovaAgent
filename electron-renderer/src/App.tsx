/**
 * App.tsx — Synova Desktop 三栏布局根组件
 *
 * 布局:
 * ┌─────────── TitleBar ───────────────────────────┐
 * ├──────┬────────────────────────┬────────────────┤
 * │ Left │     CenterPanel        │   RightPanel   │
 * │Panel │     (消息流)           │   (上下文)     │
 * ├──────┴────────────────────────┴────────────────┤
 * └─────────── StatusBar ──────────────────────────┘
 *
 * Phase 0.5: 面板可折叠（Ctrl+B/J），过渡动画 300ms ease。
 * Phase 0.6: 可拖拽调整面板宽度（拖拽手柄 hover 高亮）。
 */
import React, { useEffect, useMemo, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import StatusBar from './components/StatusBar';
import LeftPanel from './components/LeftPanel';
import CenterPanel from './components/CenterPanel';
import RightPanel from './components/RightPanel';
import ResizeHandle from './components/ResizeHandle';
import { useAppStore } from './stores/app-store';
import { useKeyboard } from './hooks/useKeyboard';
import { isElectron, getAppVersion } from './ipc/bridge';

const App: React.FC = () => {
  const toggleLeftPanel = useAppStore((s) => s.toggleLeftPanel);
  const setOnlineStatus = useAppStore((s) => s.setOnlineStatus);
  const theme = useAppStore((s) => s.theme);
  const leftPanelWidth = useAppStore((s) => s.leftPanelWidth);
  const rightPanelWidth = useAppStore((s) => s.rightPanelWidth);
  const leftPanelOpen = useAppStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const setLeftPanelWidth = useAppStore((s) => s.setLeftPanelWidth);
  const setRightPanelWidth = useAppStore((s) => s.setRightPanelWidth);

  const handleLeftResize = useCallback((w: number) => setLeftPanelWidth(w), [setLeftPanelWidth]);
  const handleRightResize = useCallback((w: number) => setRightPanelWidth(w), [setRightPanelWidth]);

  const handlers = useMemo(() => ({
    toggleLeftPanel,
    toggleRightPanel: () => useAppStore.getState().toggleRightPanel(),
  }), [toggleLeftPanel]);

  useKeyboard(handlers);

  // 健康检测
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        setOnlineStatus(res.ok ? 'connected' : 'disconnected');
      } catch {
        setOnlineStatus('disconnected');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [setOnlineStatus]);

  // Electron 初始化
  useEffect(() => {
    if (isElectron()) {
      getAppVersion().then((v) => console.log(`[Synova Desktop] v${v}`));
    }
  }, []);

  const leftW = leftPanelOpen ? leftPanelWidth : 44;
  const rightW = rightPanelOpen ? rightPanelWidth : 0;

  return (
    <div className={`app-layout${theme === 'light' ? ' theme-light' : ''}`}>
      <TitleBar />
      <div className="app-body">
        {/* Left Panel */}
        <nav
          className={`panel-left ${leftPanelOpen ? 'open' : 'closed'}`}
          style={{ width: leftW, minWidth: leftW, transition: 'width 0.3s ease' }}
        >
          <LeftPanel />
        </nav>

        {/* Left Resize Handle */}
        {leftPanelOpen && (
          <ResizeHandle
            side="left"
            panelWidth={leftPanelWidth}
            onWidthChange={handleLeftResize}
          />
        )}

        {/* Center Panel */}
        <main className="panel-center">
          <CenterPanel />
        </main>

        {/* Right Resize Handle */}
        {rightPanelOpen && (
          <ResizeHandle
            side="right"
            panelWidth={rightPanelWidth}
            onWidthChange={handleRightResize}
          />
        )}

        {/* Right Panel */}
        {rightPanelOpen && (
          <aside
            className="panel-right open"
            style={{ width: rightW, minWidth: rightW, transition: 'width 0.3s ease' }}
          >
            <RightPanel />
          </aside>
        )}
      </div>
      <StatusBar />
    </div>
  );
};

export default React.memo(App);
