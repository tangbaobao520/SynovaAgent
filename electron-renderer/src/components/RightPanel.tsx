/**
 * components/RightPanel.tsx — 右栏面板 (Phase 3.1)
 */
import React, { useState } from 'react';
import { useAppStore } from '../stores/app-store';

// ═══ 视图解析 ═══

function resolveView(role: string, wsId: string | null): string {
  if (!wsId) {
    const map: Record<string, string> = { admin: 'ga_admin', manager: 'ga_admin', ga: 'ga_dashboard', liaison: 'readonly', staff: 'readonly' };
    return map[role] || 'readonly';
  }
  const map: Record<string, string> = { admin: 'ws_detail', manager: 'ws_detail', ga: 'ws_ga', liaison: 'ws_readonly', staff: 'ws_readonly' };
  return map[role] || 'ws_readonly';
}

// ═══ 子组件 ═══

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="sb-section"><div className="sb-section-title">{title}</div>{children}</section>
);

const Empty: React.FC<{ text?: string }> = ({ text = '暂无数据' }) => (
  <div className="empty-state" style={{ padding: '16px 8px' }}>
    <div className="empty-state-text" style={{ fontSize: 11 }}>{text}</div>
  </div>
);

/** GA 客户仪表盘 — 显示当前选中客户的数据 */
const GADashboard: React.FC = () => {
  const gaClients = useAppStore((s) => s.gaClients);
  const activeOrgId = useAppStore((s) => s.activeOrgId);
  const client = gaClients.find((c) => c.orgId === activeOrgId);

  if (!client) {
    return (
      <>
        <Section title="📊 GA 仪表盘"><Empty text="请从左栏选择一个客户" /></Section>
      </>
    );
  }

  const { metrics } = client;
  const flywheelPercent = Math.round(metrics.flywheelSpeed * 100);

  return (
    <>
      {/* 客户信息 */}
      <Section title={`🏢 ${client.name}`}>
        <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.6 }}>
          {client.industry} · 活跃
        </div>
      </Section>

      {/* 飞轮转速 */}
      <Section title="🔄 飞轮转速">
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: flywheelPercent > 50 ? 'var(--green)' : flywheelPercent > 30 ? 'var(--orange)' : 'var(--red)' }}>
            {flywheelPercent}%
          </span>
          <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>较上周 +5.2%</div>
        </div>
      </Section>

      {/* KPI 卡片 */}
      <Section title="📊 关键指标">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="ga-kpi-card"><div className="ga-kpi-value" style={{ color: 'var(--red)' }}>{metrics.activeAlerts}</div><div className="ga-kpi-label">活跃告警</div></div>
          <div className="ga-kpi-card"><div className="ga-kpi-value" style={{ color: 'var(--accent2)' }}>{metrics.pendingPlans}</div><div className="ga-kpi-label">待审阅方案</div></div>
        </div>
      </Section>

      <Section title="🚨 活跃告警">
        {metrics.activeAlerts > 0 ? (
          Array.from({ length: metrics.activeAlerts }).map((_, i) => (
            <div key={i} className="notif-item unread priority-warning" style={{ padding: '6px 8px', margin: '2px 0', borderRadius: 6 }}>
              <div className="notif-item-body">
                <div className="notif-item-title">告警 #{i + 1}</div>
                <div className="notif-item-body-text">待处理异常信号</div>
              </div>
            </div>
          ))
        ) : <Empty text="无活跃告警" />}
      </Section>
    </>
  );
};

/** 方案预览卡片 */
const SolutionPreview: React.FC<{
  pattern: { name: string; description: string; skills: Array<{ name: string; duration: string; owner: string }>; prerequisites: string[]; riskFactors: string[] };
  onConfirm: () => void;
}> = ({ pattern, onConfirm }) => (
  <div className="solution-preview fade-in">
    <div className="solution-preview-header">
      <span className="solution-preview-title">{pattern.name}</span>
    </div>
    <div className="solution-preview-desc">{pattern.description}</div>

    <div className="solution-preview-section">
      <div className="solution-preview-section-title">技能清单</div>
      {pattern.skills.map((s, i) => (
        <div key={i} className="solution-preview-skill">
          <span>{s.name}</span>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>{s.duration} · {s.owner}</span>
        </div>
      ))}
    </div>

    <div className="solution-preview-section">
      <div className="solution-preview-section-title">前置条件</div>
      {pattern.prerequisites.map((p, i) => (
        <div key={i} className="solution-preview-item">• {p}</div>
      ))}
    </div>

    <div className="solution-preview-section">
      <div className="solution-preview-section-title">风险因素</div>
      {pattern.riskFactors.map((r, i) => (
        <div key={i} className="solution-preview-item" style={{ color: 'var(--orange)' }}>⚠ {r}</div>
      ))}
    </div>

    <button className="solution-confirm-btn" onClick={onConfirm}>
      确认方案 · 推送给对接人
    </button>
  </div>
);

/** GA 工作区 3 标签 */
const GAWorkspaceTabs: React.FC = () => {
  const [tab, setTab] = useState<'action' | 'sentinel' | 'pattern'>('action');
  const [showSolution, setShowSolution] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const mockPattern = {
    name: '信息扭曲校正',
    description: '建立透明化机制和跨部门同步流程，减少信息传递失真',
    skills: [
      { name: '组织透明化审计', duration: '1-2周', owner: '组织专家' },
      { name: '跨部门同步流程设计', duration: '2-3周', owner: '行动顾问' },
    ],
    prerequisites: ['已建立基础通讯工具', '有跨部门协作痛点'],
    riskFactors: ['中层管理者可能的抵触情绪', '需要高层明确支持'],
  };

  const handleGeneratePlan = () => setShowSolution(true);
  const handleConfirmPlan = () => { setConfirmed(true); setShowSolution(false); };

  return (
    <>
      <div className="right-panel-tabs">
        {(['action', 'sentinel', 'pattern'] as const).map((t) => (
          <button key={t} className={`right-panel-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'action' ? '行动跟踪' : t === 'sentinel' ? '哨兵数据' : '落地模式'}
          </button>
        ))}
      </div>

      {tab === 'action' && (
        <>
          <Section title="✅ 行动项"><Empty /></Section>
        </>
      )}

      {tab === 'sentinel' && (
        <Section title="📊 哨兵数据"><Empty /></Section>
      )}

      {tab === 'pattern' && (
        <>
          {confirmed ? (
            <Section title="📋 已确认方案">
              <div style={{ fontSize: 11, color: 'var(--green)', textAlign: 'center', padding: 8 }}>
                ✅ 方案已推送给对接人
              </div>
            </Section>
          ) : showSolution ? (
            <SolutionPreview pattern={mockPattern} onConfirm={handleConfirmPlan} />
          ) : (
            <Section title="📋 落地模式匹配">
              <div className="empty-state" style={{ padding: '12px 8px' }}>
                <div className="empty-state-text" style={{ fontSize: 11 }}>
                  已匹配 1 个落地模式
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', padding: '4px 0', lineHeight: 1.5 }}>
                信息扭曲校正 — 当企业存在信息传递失真时适用
              </div>
              <button className="solution-generate-btn" onClick={handleGeneratePlan}>
                📋 生成落地方案
              </button>
            </Section>
          )}
        </>
      )}
    </>
  );
};

// ═══ 主组件 ═══

const RightPanel: React.FC = () => {
  const open = useAppStore((s) => s.rightPanelOpen);
  const userRole = useAppStore((s) => s.userRole);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  if (!open) return null;

  const view = resolveView(userRole, activeWorkspaceId);
  const title = activeWorkspaceId ? '工作区面板' : '全局面板';

  return (
    <aside className="panel-right open fade-in">
      <div className="right-panel-header">
        <span>📊</span><span>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)' }}>{userRole}</span>
      </div>
      <div className="right-panel-content">
        {view === 'ga_dashboard' && <GADashboard />}
        {view === 'ga_admin' && <><Section title="📌 目标跟踪"><Empty /><Section title="🚨 关键告警"><Empty /></Section></Section></>}
        {view === 'ws_ga' && <GAWorkspaceTabs />}
        {view === 'ws_detail' && <><Section title="📌 目标跟踪"><Empty /><Section title="🚨 关键告警"><Empty /></Section></Section></>}
        {view === 'readonly' && <Section title="📌 概览"><Empty /></Section>}
        {(view === 'ws_readonly' || view === 'ws_detail') && <Section title="📌 概览"><Empty /></Section>}
      </div>
    </aside>
  );
};

export default React.memo(RightPanel);
