/**
 * components/RightPanel.tsx — 右栏面板 (Phase 3.4)
 */
import React, { useState, useEffect, useCallback } from 'react';
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

// ═══ API 基础路径 ═══
const API_BASE = '';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ═══ 类型 ═══

interface SolutionData {
  id: string;
  title: string;
  description: string;
  status: string;
  patternName: string;
  sentinelIds: string[];
  recommendations: Array<{ action: string; priority: string; expert: string }>;
  skills: Array<{ name: string; duration: string; owner: string }>;
  prerequisites: string[];
  riskFactors: string[];
  estimatedImpact: { improvement: string; timeline: string };
  pushedAt: string | null;
  createdAt: string;
}

interface SolutionsResponse {
  ok: boolean;
  solutions: SolutionData[];
  degraded?: boolean;
}

/** GA 工作区 3 标签 — 真实 API 驱动 (Phase 3.4) */
const GAWorkspaceTabs: React.FC = () => {
  const [tab, setTab] = useState<'action' | 'sentinel' | 'pattern'>('pattern');
  const [solutions, setSolutions] = useState<SolutionData[]>([]);
  const [showSolution, setShowSolution] = useState(false);
  const [loading, setLoading] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const currentReportId = useAppStore((s) => s.currentReportId);
  const activeOrgId = useAppStore((s) => s.activeOrgId);

  // 加载方案列表
  const loadSolutions = useCallback(async () => {
    if (!currentReportId) return;
    setLoading(true);
    const res = await apiFetch<SolutionsResponse>(`/api/solutions?reportId=${currentReportId}`);
    if (res?.ok && res.solutions) {
      setSolutions(res.solutions);
      if (res.degraded) setDegraded(true);
    }
    setLoading(false);
  }, [currentReportId]);

  useEffect(() => {
    loadSolutions();
  }, [loadSolutions]);

  // 生成方案
  const handleGeneratePlan = async () => {
    if (!currentReportId) return;
    setLoading(true);
    const res = await apiFetch<SolutionsResponse>('/api/solutions/generate', {
      method: 'POST',
      body: JSON.stringify({ reportId: currentReportId, sentinelIds: [], recommendations: [] }),
    });
    if (res?.ok && res.solutions.length > 0) {
      setSolutions(res.solutions);
      setShowSolution(true);
    }
    setLoading(false);
  };

  // 推送方案
  const handlePushSolution = async (solutionId: string) => {
    const res = await apiFetch<{ ok: boolean }>(`/api/solutions/${solutionId}/push`, {
      method: 'POST',
      body: JSON.stringify({ channels: ['electron'] }),
    });
    if (res?.ok) {
      // 刷新状态
      loadSolutions();
    }
    setShowSolution(false);
  };

  const pendingSolutions = solutions.filter(s => s.status === 'draft' || s.status === 'confirmed');
  const executingSolutions = solutions.filter(s => s.status === 'executing');
  const completedSolutions = solutions.filter(s => s.status === 'completed');

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
        <Section title="✅ 行动跟踪">
          {executingSolutions.map((s) => (
            <div key={s.id} className="sb-item" style={{ padding: '8px', margin: '4px 0', borderRadius: 6, background: 'var(--bg2)', fontSize: 11, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
              <div style={{ color: 'var(--blue)', fontSize: 10 }}>执行中 · {s.estimatedImpact.timeline}</div>
            </div>
          ))}
          {completedSolutions.map((s) => (
            <div key={s.id} className="sb-item" style={{ padding: '8px', margin: '4px 0', borderRadius: 6, background: 'var(--bg2)', fontSize: 11, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
              <div style={{ color: 'var(--green)', fontSize: 10 }}>✅ 已完成</div>
            </div>
          ))}
          {executingSolutions.length === 0 && completedSolutions.length === 0 && <Empty text="无进行中的行动项" />}
        </Section>
      )}

      {tab === 'sentinel' && (
        <Section title="📊 哨兵数据"><Empty /></Section>
      )}

      {tab === 'pattern' && (
        <>
          {loading && <div style={{ padding: 8, fontSize: 11, color: 'var(--dim)' }}>加载中...</div>}
          {degraded && <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--orange)' }}>⚠ 部分服务降级</div>}

          {showSolution && pendingSolutions.length > 0 ? (
            // 显示所有待审阅方案
            pendingSolutions.map((sol) => (
              <Section key={sol.id} title={`📋 ${sol.title}`}>
                <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5, padding: '4px 0' }}>
                  {sol.description}
                </div>
                {sol.skills.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg2)', marginBottom: 4 }}>技能清单</div>
                    {sol.skills.map((sk, i) => (
                      <div key={i} className="solution-preview-skill" style={{ fontSize: 11 }}>
                        <span>{sk.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--dim)' }}> — {sk.duration} · {sk.owner}</span>
                      </div>
                    ))}
                  </div>
                )}
                {sol.prerequisites.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg2)', marginBottom: 4 }}>前置条件</div>
                    {sol.prerequisites.map((p, i) => (
                      <div key={i} style={{ fontSize: 11, padding: '1px 0' }}>• {p}</div>
                    ))}
                  </div>
                )}
                {sol.riskFactors.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--orange)', marginBottom: 4 }}>风险因素</div>
                    {sol.riskFactors.map((r, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--orange)', padding: '1px 0' }}>⚠ {r}</div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent2)' }}>
                  预期效果: {sol.estimatedImpact.improvement} · {sol.estimatedImpact.timeline}
                </div>
                <button className="solution-confirm-btn" onClick={() => handlePushSolution(sol.id)} style={{ marginTop: 8 }}>
                  ✅ 确认方案 · 推送给对接人
                </button>
              </Section>
            ))
          ) : solutions.length > 0 ? (
            // 已有方案，显示状态
            <>
              <Section title="📋 已生成方案">
                {solutions.map((s) => (
                  <div key={s.id} style={{ padding: '8px', margin: '4px 0', borderRadius: 6, background: 'var(--bg2)', fontSize: 11, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
                    <div style={{ color: 'var(--dim)', fontSize: 10 }}>
                      {s.status === 'draft' && '📝 草稿'}
                      {s.status === 'confirmed' && '✅ 已确认'}
                      {s.status === 'executing' && '🔄 执行中'}
                      {s.status === 'completed' && '🎉 已完成'}
                      {s.status === 'rejected' && '❌ 已拒绝'}
                      {s.pushedAt ? ` · 已推送` : ''}
                    </div>
                    {(s.status === 'draft' || s.status === 'confirmed') && (
                      <button className="solution-generate-btn" onClick={() => setShowSolution(true)} style={{ marginTop: 4, fontSize: 10 }}>
                        {s.pushedAt ? '重新推送' : '推送方案'}
                      </button>
                    )}
                  </div>
                ))}
              </Section>
              {pendingSolutions.length === 0 && (
                <button className="solution-generate-btn" onClick={handleGeneratePlan} style={{ margin: '8px 0' }}>
                  📋 重新生成方案
                </button>
              )}
            </>
          ) : (
            // 无方案，显示生成入口
            <Section title="📋 落地模式匹配">
              {currentReportId ? (
                <>
                  <div className="empty-state" style={{ padding: '12px 8px' }}>
                    <div className="empty-state-text" style={{ fontSize: 11 }}>
                      诊断报告已就绪，可生成落地解决方案
                    </div>
                  </div>
                  <button className="solution-generate-btn" onClick={handleGeneratePlan} disabled={loading}>
                    {loading ? '生成中...' : '📋 生成落地方案'}
                  </button>
                </>
              ) : (
                <Empty text="请先进行一次诊断" />
              )}
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
