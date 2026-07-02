/**
 * components/RightPanel.tsx — 右栏面板 (Phase 2.1)
 *
 * 根据 userRole + activeWorkspaceId 解析视图:
 *
 *   无工作区选中:
 *     admin/manager → 全局仪表盘（目标+告警+问题）
 *     ga           → 客户总览仪表盘
 *     liaison/staff → 只读概览
 *
 *   有工作区选中:
 *     admin/manager → 工作区详情（目标+告警+问题+成员）
 *     ga           → 3 个标签: 行动跟踪 / 哨兵数据 / 落地模式
 */
import React, { useState } from 'react';
import { useAppStore } from '../stores/app-store';

// ════════════════════════════════════════════════════════════════
// 视图解析器
// ════════════════════════════════════════════════════════════════

function resolveRightPanelView(role: string, workspaceId: string | null): string {
  if (!workspaceId) {
    // 全局视图
    const views: Record<string, string> = {
      admin: 'global_admin',
      manager: 'global_admin',
      ga: 'global_ga',
      liaison: 'global_readonly',
      staff: 'global_readonly',
    };
    return views[role] || 'global_readonly';
  }
  // 工作区视图
  const views: Record<string, string> = {
    admin: 'workspace_detail',
    manager: 'workspace_detail',
    ga: 'workspace_ga',
    liaison: 'workspace_readonly',
    staff: 'workspace_readonly',
  };
  return views[role] || 'workspace_readonly';
}

// ════════════════════════════════════════════════════════════════
// 面板子组件
// ════════════════════════════════════════════════════════════════

const SectionGoals: React.FC = () => (
  <section className="sb-section">
    <div className="sb-section-title">📌 目标跟踪</div>
    <div className="empty-state" style={{ padding: '16px 8px' }}>
      <div className="empty-state-text" style={{ fontSize: 11 }}>暂无目标数据</div>
    </div>
  </section>
);

const SectionAlerts: React.FC = () => (
  <section className="sb-section">
    <div className="sb-section-title">🚨 关键告警</div>
    <div className="empty-state" style={{ padding: '16px 8px' }}>
      <div className="empty-state-text" style={{ fontSize: 11 }}>暂无告警</div>
    </div>
  </section>
);

const SectionIssues: React.FC = () => (
  <section className="sb-section">
    <div className="sb-section-title">🔄 遗留问题</div>
    <div className="empty-state" style={{ padding: '16px 8px' }}>
      <div className="empty-state-text" style={{ fontSize: 11 }}>暂无遗留问题</div>
    </div>
  </section>
);

/** GA 客户总览仪表盘（无工作区时） */
const GADashboard: React.FC = () => (
  <>
    <section className="sb-section">
      <div className="sb-section-title">🔄 飞轮转速</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent2)', textAlign: 'center', padding: '8px 0' }}>
        0.42
      </div>
      <div style={{ fontSize: 10, color: 'var(--dim)', textAlign: 'center' }}>较上周 +5.2%</div>
    </section>
    <SectionAlerts />
    <section className="sb-section">
      <div className="sb-section-title">📋 待审阅方案</div>
      <div className="empty-state" style={{ padding: '12px 8px' }}>
        <div className="empty-state-text" style={{ fontSize: 11 }}>暂无待审阅方案</div>
      </div>
    </section>
  </>
);

/** GA 工作区视图：3 个标签 */
const GAWorkspaceTabs: React.FC = () => {
  const [tab, setTab] = useState<'action' | 'sentinel' | 'pattern'>('action');

  return (
    <>
      <div className="right-panel-tabs">
        <button
          className={`right-panel-tab${tab === 'action' ? ' active' : ''}`}
          onClick={() => setTab('action')}
        >
          行动跟踪
        </button>
        <button
          className={`right-panel-tab${tab === 'sentinel' ? ' active' : ''}`}
          onClick={() => setTab('sentinel')}
        >
          哨兵数据
        </button>
        <button
          className={`right-panel-tab${tab === 'pattern' ? ' active' : ''}`}
          onClick={() => setTab('pattern')}
        >
          落地模式
        </button>
      </div>

      {tab === 'action' && (
        <section className="sb-section">
          <div className="sb-section-title">✅ 行动项</div>
          <div className="empty-state" style={{ padding: '16px 8px' }}>
            <div className="empty-state-text" style={{ fontSize: 11 }}>暂无行动项</div>
          </div>
        </section>
      )}

      {tab === 'sentinel' && (
        <section className="sb-section">
          <div className="sb-section-title">📊 哨兵数据</div>
          <div className="empty-state" style={{ padding: '16px 8px' }}>
            <div className="empty-state-text" style={{ fontSize: 11 }}>暂无哨兵数据</div>
          </div>
        </section>
      )}

      {tab === 'pattern' && (
        <section className="sb-section">
          <div className="sb-section-title">📋 落地模式</div>
          <div className="empty-state" style={{ padding: '16px 8px' }}>
            <div className="empty-state-text" style={{ fontSize: 11 }}>暂无匹配模式</div>
          </div>
        </section>
      )}
    </>
  );
};

/** 工作区详情视图（admin/manager） */
const WorkspaceDetail: React.FC = () => (
  <>
    <SectionGoals />
    <SectionAlerts />
    <SectionIssues />
    <section className="sb-section">
      <div className="sb-section-title">👥 团队成员</div>
      <div className="empty-state" style={{ padding: '16px 8px' }}>
        <div className="empty-state-text" style={{ fontSize: 11 }}>暂无成员数据</div>
      </div>
    </section>
  </>
);

/** 只读概览 */
const ReadonlyView: React.FC = () => (
  <>
    <SectionGoals />
    <SectionAlerts />
  </>
);

// ════════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════════

const RightPanel: React.FC = () => {
  const open = useAppStore((s) => s.rightPanelOpen);
  const userRole = useAppStore((s) => s.userRole);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  if (!open) return null;

  const view = resolveRightPanelView(userRole, activeWorkspaceId);

  const viewTitle = activeWorkspaceId ? '工作区面板' : '全局面板';

  return (
    <aside className="panel-right open fade-in">
      <div className="right-panel-header">
        <span>📊</span>
        <span>{viewTitle}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)' }}>
          {userRole}
        </span>
      </div>
      <div className="right-panel-content">
        {view === 'global_admin' && (
          <><SectionGoals /><SectionAlerts /><SectionIssues /></>
        )}
        {view === 'global_ga' && <GADashboard />}
        {view === 'global_readonly' && <ReadonlyView />}
        {view === 'workspace_detail' && <WorkspaceDetail />}
        {view === 'workspace_ga' && <GAWorkspaceTabs />}
        {view === 'workspace_readonly' && <ReadonlyView />}
      </div>
    </aside>
  );
};

export default React.memo(RightPanel);
