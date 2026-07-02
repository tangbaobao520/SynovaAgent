/**
 * components/RightPanel.tsx — 右栏面板
 *
 * 上下文感知面板。
 * Phase 0.5: 默认显示目标跟踪 + 告警 + 遗留问题（占位）
 * Phase 2+: 根据角色和上下文切换（GA 仪表盘/行动跟踪/哨兵数据）
 */
import React from 'react';
import { useAppStore } from '../stores/app-store';

const RightPanel: React.FC = () => {
  const open = useAppStore((s) => s.rightPanelOpen);

  if (!open) return null;

  return (
    <aside className="panel-right open fade-in">
      <div className="right-panel-header">
        <span>📊</span>
        <span>上下文面板</span>
      </div>
      <div className="right-panel-content">
        {/* 目标跟踪 */}
        <section className="sb-section">
          <div className="sb-section-title">📌 目标跟踪</div>
          <div className="empty-state" style={{ padding: '16px 8px' }}>
            <div className="empty-state-text" style={{ fontSize: 11 }}>
              暂无目标数据
            </div>
          </div>
        </section>

        {/* 关键告警 */}
        <section className="sb-section">
          <div className="sb-section-title">🚨 关键告警</div>
          <div className="empty-state" style={{ padding: '16px 8px' }}>
            <div className="empty-state-text" style={{ fontSize: 11 }}>
              暂无告警
            </div>
          </div>
        </section>

        {/* 遗留问题 */}
        <section className="sb-section">
          <div className="sb-section-title">🔄 遗留问题</div>
          <div className="empty-state" style={{ padding: '16px 8px' }}>
            <div className="empty-state-text" style={{ fontSize: 11 }}>
              暂无遗留问题
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
};

export default React.memo(RightPanel);
