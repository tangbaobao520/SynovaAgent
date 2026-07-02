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
 */
import React, { useEffect, useMemo } from 'react';
import TitleBar from './components/TitleBar';
import StatusBar from './components/StatusBar';
import LeftPanel from './components/LeftPanel';
import CenterPanel from './components/CenterPanel';
import RightPanel from './components/RightPanel';
import { useAppStore } from './stores/app-store';
import { useKeyboard } from './hooks/useKeyboard';
import { isElectron, getAppVersion } from './ipc/bridge';

const App: React.FC = () => {
  const toggleLeftPanel = useAppStore((s) => s.toggleLeftPanel);
  const setOnlineStatus = useAppStore((s) => s.setOnlineStatus);

  // 稳定引用避免 hooks 重复执行
  const handlers = useMemo(() => ({
    toggleLeftPanel,
    toggleRightPanel: () => useAppStore.getState().toggleRightPanel(),
  }), [toggleLeftPanel]);

  // 注册全局快捷键
  useKeyboard(handlers);

  // 初始化：检测后端连接状态
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

  // Electron 特定初始化
  useEffect(() => {
    if (isElectron()) {
      getAppVersion().then((version) => {
        console.log(`[Synova Desktop] v${version}`);
      });
    }
  }, []);

  return (
    <div className="app-layout">
      <TitleBar />
      <div className="app-body">
        <LeftPanel />
        <CenterPanel />
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
};

export default React.memo(App);
