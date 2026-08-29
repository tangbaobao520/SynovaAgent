/**
 * components/RightPanel.tsx — 右栏面板 (Phase 3.4)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/app-store';
// D538: 能力导航纯逻辑契约（状态机/权限/标签） + 详情分派类型
import { capabilityLabel, loopStatusColor, canAccessCap, type SelectedCap } from '../stores/capability';
// D556: GA 协同纯逻辑数据层（状态机/请求构建/响应映射/降级决策/seed——零 react/zustand）
import {
  getSeedToken,
  decideBlockState,
  deriveOverallPhase,
  mapStatsResponse,
  mapCalibrationsResponse,
  buildCalibrationRequest,
  buildSignalRequest,
  type GaCalibrationItem,
  type GaStatsData,
  type GaCollabPhase,
} from '../stores/ga-collab';
// D556: GA 协同纯展示组件（三块渲染——容器/展示拆分，renderToStaticMarkup 可断言）
import { GaDetailSections, type GaInjectedRecord } from './ga-detail-sections';

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

// ═══ API 基础路径（D504: Electron 生产态 loadFile 后相对路径失效 → getApiBase） ═══
import { getApiBase } from '../lib/api';
// D527: 诊断报告 onePager markdown 渲染（同 MessageItem 模式）
import ReactMarkdown from 'react-markdown';

async function apiFetch<T>(path: string, opts?: RequestInit, capture?: { status?: number }): Promise<T | null> {
  try {
    // D556 §7.3: seed 存在时附 legacy x-synova-token 头（auth.ts L366-376 既有通道）；
    // 无 seed → 请求形态与现状完全一致（DS4 零行为变化）
    const seedToken = getSeedToken();
    const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (seedToken) baseHeaders['x-synova-token'] = seedToken;
    const res = await fetch(`${getApiBase()}${path}`, {
      ...opts,
      headers: opts?.headers ?? baseHeaders,
    });
    // D556: 状态码捕获（decideBlockState 判别 403→blocked vs 5xx/网络→degraded）——既有调用方零感知
    if (capture) capture.status = res.status;
    if (!res.ok) return null;
    return await res.json() as T;
  } catch (err: unknown) {
    console.warn('[RightPanel] apiFetch failed', err instanceof Error ? err.message : String(err));
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

/** D527: 诊断报告 tab — GET /consult/:id/report?format=markdown 渲染 onePager（ReactMarkdown） */
const DiagnosisReportTab: React.FC = () => {
  const currentReportId = useAppStore((s) => s.currentReportId);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [degradedReason, setDegradedReason] = useState<string | null>(null);

  useEffect(() => {
    if (!currentReportId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setDegradedReason(null);
      try {
        const res = await fetch(
          `${getApiBase()}/api/diagnosis/consult/${currentReportId}/report?format=markdown`,
        );
        if (!res.ok) {
          // 404 = 报告不在内存缓存（服务重启后清空）——降级提示，不静默（铁律 24/31）
          if (!alive) return;
          setDegradedReason(`报告不可用（HTTP ${res.status}；服务重启后内存缓存已清，请重新诊断）`);
          console.warn('[DiagnosisReportTab] 报告获取失败', res.status);
          return;
        }
        const text = await res.text();
        if (alive) setMarkdown(text);
      } catch (err: unknown) {
        if (!alive) return;
        setDegradedReason('报告服务不可达，请确认后端服务已启动');
        console.warn('[DiagnosisReportTab] 报告请求异常', err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [currentReportId]);

  if (!currentReportId) return <Section title="📄 诊断报告"><Empty text="请先进行一次诊断" /></Section>;
  return (
    <Section title="📄 诊断报告">
      {loading && <div style={{ padding: 8, fontSize: 11, color: 'var(--dim)' }}>加载报告...</div>}
      {degradedReason && (
        <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--orange)' }}>⚠ {degradedReason}</div>
      )}
      {!loading && !degradedReason && markdown !== null && (
        <div className="report-markdown" style={{ fontSize: 11, lineHeight: 1.6 }}>
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      )}
    </Section>
  );
};

/** GA 工作区 4 标签 — 真实 API 驱动 (Phase 3.4 + D527 诊断报告 tab) */
const GAWorkspaceTabs: React.FC = () => {
  const [tab, setTab] = useState<'action' | 'sentinel' | 'pattern' | 'report'>('report');
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
    } else if (res === null) {
      setDegraded(true);
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
    } else if (res === null) {
      setDegraded(true);
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
    } else if (res === null) {
      setDegraded(true);
    }
    setShowSolution(false);
  };

  const pendingSolutions = solutions.filter(s => s.status === 'draft' || s.status === 'confirmed');
  const executingSolutions = solutions.filter(s => s.status === 'executing');
  const completedSolutions = solutions.filter(s => s.status === 'completed');

  return (
    <>
      <div className="right-panel-tabs">
        {(['action', 'sentinel', 'pattern', 'report'] as const).map((t) => (
          <button key={t} className={`right-panel-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'action' ? '行动跟踪' : t === 'sentinel' ? '哨兵数据' : t === 'pattern' ? '落地模式' : '诊断报告'}
          </button>
        ))}
      </div>

      {tab === 'report' && <DiagnosisReportTab />}

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

// ═══ D538 能力详情组件（真实接口数据渲染；Ga 块自 D556 起接线 D551 四端点） ═══

// 信号 Story 卡片（AggregatedSignal 真实 shape）
interface SourceFinding {
  sentinelId: string;
  sentinelName: string;
  finding: { id?: string; severity?: string; title?: string; description?: string; suggestion?: string; detectedAt?: string; status?: string };
}
interface AggregatedSignal {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  sources: SourceFinding[];
  entities: string[];
  recommendedExperts: string[];
  aggregatedAt: string;
  degraded: boolean;
}
interface SignalsResponse {
  ok: boolean;
  total: number;
  criticalCount: number;
  warningCount: number;
  signals: AggregatedSignal[];
  degraded?: boolean;
}

const SEVERITY_COLOR: Record<string, string> = { critical: 'var(--red)', warning: 'var(--orange)', info: 'var(--cyan)' };

/** 主动触达 — GET /api/sentinel/signals 真实数据渲染 */
const ReachDetail: React.FC = () => {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await apiFetch<SignalsResponse>('/api/sentinel/signals');
      if (!alive) return;
      if (res?.ok) {
        setData(res);
        if (res.degraded) setDegraded(true);
      } else {
        // 铁律 24/31: 失败 → console.warn + 降级提示条（apiFetch 已 log，标记 degraded）
        setDegraded(true);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Section title="主动触达 · 信号聚合">
      {!loading && degraded && <div className="cap-degraded-banner">⚠ 信号服务降级，部分数据可能不可用</div>}
      {loading && <div style={{ padding: 8, fontSize: 11, color: 'var(--dim)' }}>加载信号...</div>}
      {!loading && !degraded && data && data.signals.length === 0 && <Empty text="暂无聚合信号" />}
      {!loading && data?.signals.map((sig) => (
        <div key={sig.id} className="cap-detail-card">
          <div className="cap-detail-title" style={{ color: SEVERITY_COLOR[sig.severity] || 'var(--text)' }}>
            <span className={`cap-detail-dot cap-dot-${sig.severity}`} />{sig.title}
          </div>
          {sig.entities.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--dim)', margin: '2px 0' }}>实体: {sig.entities.join('、')}</div>
          )}
          {sig.recommendedExperts.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--accent2)', marginBottom: 4 }}>推荐专家: {sig.recommendedExperts.join(' · ')}</div>
          )}
          {sig.sources.slice(0, 3).map((src, i) => (
            <div key={i} className="cap-detail-source">
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>{src.sentinelName}</div>
              {src.finding.title && <div style={{ fontSize: 11 }}>{src.finding.title}</div>}
              {src.finding.description && <div style={{ fontSize: 10, color: 'var(--dim)' }}>{src.finding.description}</div>}
              {src.finding.suggestion && <div style={{ fontSize: 10, color: 'var(--accent2)' }}>建议: {src.finding.suggestion}</div>}
            </div>
          ))}
        </div>
      ))}
    </Section>
  );
};

interface LoopEntry {
  loopId: string;
  loopName: string;
  status: string;
  executionCount: number;
  lastExecution: { status: string; startedAt: string; completedAt?: string; durationMs?: number } | null;
  scales: Array<{ name: string; nextAt: string; period?: string }>;
}
interface LoopsResponse {
  ok: boolean;
  loops: LoopEntry[];
  degraded?: boolean;
}

/** 五循环状态 — GET /api/loops/status 真实数据渲染（按 loops.length 动态渲染，禁硬编码 5/6） */
const LoopsDetail: React.FC = () => {
  const [data, setData] = useState<LoopsResponse | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await apiFetch<LoopsResponse>('/api/loops/status');
      if (!alive) return;
      if (res?.ok) {
        setData(res);
        if (res.degraded) setDegraded(true);
      } else setDegraded(true);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Section title="五循环状态">
      {!loading && degraded && <div className="cap-degraded-banner">⚠ 降级：循环状态不可用</div>}
      {loading && <div style={{ padding: 8, fontSize: 11, color: 'var(--dim)' }}>加载循环...</div>}
      {!loading && !degraded && data && data.loops.length === 0 && <Empty text="暂无循环" />}
      {!loading && data?.loops.map((loop) => (
        <div key={loop.loopId} className="cap-detail-card">
          <div className="cap-detail-title">
            <span className={`cap-dot cap-dot-${loopStatusColor(loop.status)}`} />
            {loop.loopName}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)' }}>x{loop.executionCount}</span>
          </div>
          {loop.lastExecution && (
            <div style={{ fontSize: 10, color: 'var(--dim)' }}>
              {loop.lastExecution.status} · {loop.lastExecution.startedAt?.slice(0, 16).replace('T', ' ')}
              {typeof loop.lastExecution.durationMs === 'number' ? ` · ${(loop.lastExecution.durationMs / 1000).toFixed(1)}s` : ''}
            </div>
          )}
          {loop.scales.map((sc, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--dim)', margin: '2px 0' }}>· {sc.name} next: {sc.nextAt?.slice(0, 16).replace('T', ' ')}</div>
          ))}
        </div>
      ))}
    </Section>
  );
};

interface ActionItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'confirmed' | 'executing' | 'completed' | 'rejected';
  priority: 'critical' | 'high' | 'medium' | 'low';
  owner?: string;
  createdAt: string;
  updatedAt: string;
}
interface ActionsResponse {
  ok: boolean;
  actions: ActionItem[];
  degraded?: boolean;
}

const ACTION_STATUS_LABEL: Record<ActionItem['status'], string> = {
  pending: '待开始', confirmed: '已确认', executing: '执行中', completed: '已完成', rejected: '已拒绝',
};

/** Action 闭环 — GET /api/actions 真实数据渲染 */
const ActionDetail: React.FC = () => {
  const [data, setData] = useState<ActionsResponse | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await apiFetch<ActionsResponse>('/api/actions');
      if (!alive) return;
      if (res?.ok) {
        setData(res);
        if (res.degraded) setDegraded(true);
      } else setDegraded(true);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Section title="Action 闭环 · 执行承诺">
      {!loading && degraded && <div className="cap-degraded-banner">⚠ 行动项服务降级</div>}
      {loading && <div style={{ padding: 8, fontSize: 11, color: 'var(--dim)' }}>加载行动项...</div>}
      {!loading && !degraded && data && data.actions.length === 0 && <Empty text="暂无行动项" />}
      {!loading && data?.actions.map((a) => (
        <div key={a.id} className="cap-detail-card">
          <div className="cap-detail-title">{a.title}</div>
          <div style={{ fontSize: 10, margin: '2px 0' }}>
            <span className={`cap-status cap-status-${a.status}`}>{ACTION_STATUS_LABEL[a.status]}</span>
            <span style={{ color: 'var(--dim)' }}> · {a.priority} 优先级</span>
            {a.owner && <span style={{ color: 'var(--dim)' }}> · 负责人 {a.owner}</span>}
          </div>
          {a.description && <div style={{ fontSize: 10, color: 'var(--dim)' }}>{a.description}</div>}
          <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>更新: {a.updatedAt?.slice(0, 16).replace('T', ' ')}</div>
        </div>
      ))}
    </Section>
  );
};

// ═══ D556: GA 协同容器（role 防御 + 三块 fetch 编排 + 表单提交回显） ═══

/**
 * GaDetail 容器 — 占位转真实（D551 四端点消费，spec §5 三块端点映射）。
 * 纯展示渲染委托 GaDetailSections（props 驱动，可独立 UI 断言）；本组件持有全部
 * hooks/fetch/表单编排。旧占位组件已删除（占位文案零残留——S-5 ② 回归断言）。
 */
const GaDetail: React.FC = () => {
  const userRole = useAppStore((s) => s.userRole);
  // fail-closed 双保险（spec §5.2）: 左栏置灰（capability.ts L43-45，不改）+ 容器内防御复查
  const allowed = canAccessCap(userRole, 'ga');
  const [calibrationState, setCalibrationState] = useState<GaCollabPhase>('idle');
  const [statsState, setStatsState] = useState<GaCollabPhase>('idle');
  const [calibrations, setCalibrations] = useState<GaCalibrationItem[]>([]);
  const [stats, setStats] = useState<GaStatsData | null>(null);
  const [calibrationFormError, setCalibrationFormError] = useState<string | null>(null);
  const [signalFormError, setSignalFormError] = useState<string | null>(null);
  const [lastCalibrationId, setLastCalibrationId] = useState<string | null>(null);
  const [lastSignal, setLastSignal] = useState<{ signalId: string; findingId: string } | null>(null);
  const [injectedHistory, setInjectedHistory] = useState<GaInjectedRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 挂载/重试时拉取两块 GET（校准列表 + 效用仪表）——分块独立状态（spec §5.3 不连坐）
  useEffect(() => {
    if (!allowed) return; // blocked → 零 fetch（spec §5.2 fail-closed）
    let alive = true;
    (async () => {
      setCalibrationState('loading');
      setStatsState('loading');
      const calCapture: { status?: number } = {};
      const calRaw = await apiFetch<unknown>('/api/ga/calibration?limit=50', undefined, calCapture);
      if (!alive) return;
      if (calRaw === null) {
        setCalibrationState(decideBlockState(calCapture.status ?? null));
      } else {
        const calMapped = mapCalibrationsResponse(calRaw);
        if (calMapped.ok) {
          setCalibrations(calMapped.data);
          setCalibrationState('loaded');
        } else {
          setCalibrationState('degraded'); // 200 但结构畸形 → 诚实降级（铁律 24/31）
        }
      }
      const statsCapture: { status?: number } = {};
      const statsRaw = await apiFetch<unknown>('/api/ga/calibration/stats', undefined, statsCapture);
      if (!alive) return;
      if (statsRaw === null) {
        setStatsState(decideBlockState(statsCapture.status ?? null));
      } else {
        const statsMapped = mapStatsResponse(statsRaw);
        if (statsMapped.ok) {
          setStats(statsMapped.data);
          setStatsState('loaded');
        } else {
          setStatsState('degraded');
        }
      }
    })();
    return () => { alive = false; };
  }, [allowed, refreshKey]);

  const handleRetry = useCallback(() => setRefreshKey((k) => k + 1), []);

  // 校准提交（四动作表单）→ buildCalibrationRequest 客户端校验（镜像 D551 服务端）→ POST → 回显
  const handleCalibrationSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCalibrationFormError(null);
    const built = buildCalibrationRequest(Object.fromEntries(new FormData(e.currentTarget).entries()));
    if (!built.ok) {
      setCalibrationFormError(built.error);
      return;
    }
    setSubmitting(true);
    const capture: { status?: number } = {};
    const res = await apiFetch<{ ok?: boolean; calibrationId?: string }>(
      '/api/ga/calibration',
      { method: 'POST', body: JSON.stringify(built.body) },
      capture,
    );
    setSubmitting(false);
    if (res?.ok && res.calibrationId) {
      setLastCalibrationId(res.calibrationId); // 回显 201 {calibrationId}（spec §5.1）
      setRefreshKey((k) => k + 1);             // 提交成功 → 列表刷新
    } else if (res === null) {
      setCalibrationFormError(`校准提交失败（HTTP ${capture.status ?? '网络异常'}）— 稍后重试`);
      console.warn('[GaDetail] 校准提交失败', capture.status ?? 'network');
    } else {
      setCalibrationFormError('校准提交未成功（服务端返回异常）— 稍后重试');
      console.warn('[GaDetail] 校准提交响应异常');
    }
  }, []);

  // 信号注入（五要素表单）→ buildSignalRequest → POST → 回显 signalId/findingId + 会话内历史
  const handleSignalSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSignalFormError(null);
    const built = buildSignalRequest(Object.fromEntries(new FormData(e.currentTarget).entries()));
    if (!built.ok) {
      setSignalFormError(built.error);
      return;
    }
    setSubmitting(true);
    const capture: { status?: number } = {};
    const res = await apiFetch<{ ok?: boolean; signalId?: string; findingId?: string }>(
      '/api/ga/calibration/signals',
      { method: 'POST', body: JSON.stringify(built.body) },
      capture,
    );
    setSubmitting(false);
    if (res?.ok && res.signalId && res.findingId) {
      const { signalId, findingId } = res;
      setLastSignal({ signalId, findingId }); // 回显 201 {signalId, findingId}（spec §5.1）
      setInjectedHistory((history) => [
        {
          signalType: built.body.signalType,
          title: built.body.title,
          signalId,
          findingId,
          at: new Date().toISOString(),
        },
        ...history,
      ]);
    } else if (res === null) {
      setSignalFormError(`信号注入失败（HTTP ${capture.status ?? '网络异常'}）— 稍后重试`);
      console.warn('[GaDetail] 信号注入失败', capture.status ?? 'network');
    } else {
      setSignalFormError('信号注入未成功（服务端返回异常）— 稍后重试');
      console.warn('[GaDetail] 信号注入响应异常');
    }
  }, []);

  const phase = deriveOverallPhase(allowed, calibrationState, statsState);

  return (
    <GaDetailSections
      phase={phase}
      role={userRole}
      calibrationState={calibrationState}
      statsState={statsState}
      calibrations={calibrations}
      stats={stats}
      calibrationFormError={calibrationFormError}
      signalFormError={signalFormError}
      lastCalibrationId={lastCalibrationId}
      lastSignal={lastSignal}
      injectedHistory={injectedHistory}
      submitting={submitting}
      onRetry={handleRetry}
      onCalibrationSubmit={(e) => { void handleCalibrationSubmit(e); }}
      onSignalSubmit={(e) => { void handleSignalSubmit(e); }}
    />
  );
};

/** D538: 详情分派 —— 非 null 覆盖默认视图 */
const CAP_DETAIL_VIEW: Record<Exclude<SelectedCap, null>, React.FC> = {
  reach: ReachDetail,
  loops: LoopsDetail,
  action: ActionDetail,
  ga: GaDetail,
};

// ═══ 主组件 ═══

const RightPanel: React.FC = () => {
  const open = useAppStore((s) => s.rightPanelOpen);
  const userRole = useAppStore((s) => s.userRole);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const selectedCap = useAppStore((s) => s.selectedCap);
  if (!open) return null;

  const view = resolveView(userRole, activeWorkspaceId);
  const title = activeWorkspaceId ? '工作区面板' : '全局面板';
  const capTitle = selectedCap ? capabilityLabel(selectedCap) : '';

  return (
    <aside className="panel-right open fade-in">
      <div className="right-panel-header">
        <span>📊</span><span>{selectedCap ? `产品独有能力 · ${capTitle}` : title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)' }}>{userRole}</span>
      </div>
      <div className="right-panel-content">
        {selectedCap ? (
          (() => { const Detail = CAP_DETAIL_VIEW[selectedCap]; return <Detail />; })()
        ) : (
          <>
            {view === 'ga_dashboard' && <GADashboard />}
            {view === 'ga_admin' && <><Section title="📌 目标跟踪"><Empty /><Section title="🚨 关键告警"><Empty /></Section></Section></>}
            {view === 'ws_ga' && <GAWorkspaceTabs />}
            {view === 'ws_detail' && <><Section title="📌 目标跟踪"><Empty /><Section title="🚨 关键告警"><Empty /></Section></Section></>}
            {view === 'readonly' && <Section title="📌 概览"><Empty /></Section>}
            {(view === 'ws_readonly' || view === 'ws_detail') && <Section title="📌 概览"><Empty /></Section>}
          </>
        )}
      </div>
    </aside>
  );
};

export default React.memo(RightPanel);
