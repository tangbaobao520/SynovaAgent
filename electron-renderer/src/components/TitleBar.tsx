/**
 * components/TitleBar.tsx — 标题栏
 *
 * 显示企业名、在线状态指示灯、维度覆盖度、通知铃铛。
 */
import React from 'react';
import { useAppStore } from '../stores/app-store';

const TitleBar: React.FC = () => {
  const onlineStatus = useAppStore((s) => s.onlineStatus);
  const alertCount = useAppStore((s) => s.alertCount);
  const dimensionCovered = useAppStore((s) => s.dimensionCovered);
  const dimensionTotal = useAppStore((s) => s.dimensionTotal);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const dimPercent = dimensionTotal > 0
    ? Math.round((dimensionCovered / dimensionTotal) * 100)
    : 0;

  const statusLabels: Record<string, string> = {
    connected: '连接正常',
    disconnected: '已断开',
    connecting: '连接中...',
  };

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-logo">
          <span className={`status-dot ${onlineStatus}`} />
          <span>Synova</span>
        </div>
      </div>

      <div className="titlebar-center">
        <div className="dimension-bar">
          <span style={{ color: 'var(--dim)' }}>维度</span>
          <span className="dimension-count">
            {dimensionCovered}/{dimensionTotal}
          </span>
          <div className="dimension-track">
            <div
              className="dimension-fill"
              style={{ width: `${dimPercent}%` }}
            />
          </div>
        </div>
        <span style={{ color: 'var(--dim)', fontSize: 11 }}>
          {statusLabels[onlineStatus]}
        </span>
      </div>

      <div className="titlebar-right">
        <button
          className="titlebar-btn"
          title="通知"
          onClick={() => {}}
        >
          🔔
          {alertCount > 0 && (
            <span className="notification-badge">
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
        </button>
        <button className="titlebar-btn" title="切换主题" onClick={toggleTheme}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button className="titlebar-btn" title="设置" onClick={() => {}}>
          ⚙️
        </button>
      </div>
    </header>
  );
};

export default React.memo(TitleBar);
