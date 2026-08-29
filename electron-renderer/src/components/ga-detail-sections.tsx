/**
 * components/ga-detail-sections.tsx — D556 GA 协同纯展示组件（props 驱动，零 hook/零 store）
 *
 * 独立文件的原因（spec §3.3.1 的一处受控偏离，D333 决策）: spec 原方案将本组件置于
 * RightPanel.tsx 内——但 RightPanel 模块图含 react-markdown/zustand，二者不在 root
 * package-lock（扁平+嵌套均无实查）且 CI vitest job 仅 root npm ci → 从 root 测试 import
 * RightPanel.tsx 在 CI 必然解析失败。拆出零依赖纯展示文件后: RightPanel 容器真 import
 * 本组件（非代理桥接——容器持有全部 hooks/fetch/表单编排，本文件仅 props 渲染），
 * tests/ga-collab-ui.test.ts 可直接 renderToStaticMarkup 断言（CI 绿为 DS9 硬前提）。
 *
 * 契约（铁律 47 — spec §5 三块端点映射 + §8 断言矩阵）:
 *   @input  — GaDetailSectionsProps（全部数据/回调由容器注入；组件零副作用零 fetch）
 *   @output — 五场景可断言的静态结构:
 *             blocked → 「仅 GA 可见」空态（零列表/零表单）；degraded → cap-degraded-banner +
 *             重试按钮 + 零假数据；其余 → 三块（data-ga-block + data-endpoint 结构标记）
 *   @degraded — 分块独立降级条（spec §5.3 不连坐）；note 原文透传（采纳率不可得显性化）
 *   @error  — 不抛（未知 phase 走 idle 分支兜底渲染）
 */
import React from 'react';
import type { GaCalibrationItem, GaCollabPhase, GaStatsData } from '../stores/ga-collab';

/** 三块结构标记（断言矩阵场景 2 的「三端点区块结构」物证 + spec §5.1 端点映射） */
const BLOCK_META = {
  calibration: { title: '🧬 诊断校准面板', endpoint: '/api/ga/calibration' },
  injection: { title: '📥 手动信号注入', endpoint: '/api/ga/calibration/signals' },
  stats: { title: '📊 反馈效用仪表', endpoint: '/api/ga/calibration/stats' },
} as const;

/** 会话内注入历史条目（D551 无信号列表端点——历史 = 本会话提交回显，不伪造跨会话数据） */
export interface GaInjectedRecord {
  signalType: string;
  title: string;
  signalId: string;
  findingId: string;
  at: string;
}

export interface GaDetailSectionsProps {
  phase: GaCollabPhase;
  role: string;
  /** 块独立状态（spec §5.3 分块降级） */
  calibrationState: GaCollabPhase;
  statsState: GaCollabPhase;
  calibrations: GaCalibrationItem[];
  stats: GaStatsData | null;
  calibrationFormError: string | null;
  signalFormError: string | null;
  /** POST 回显（spec §5.1: 201 {calibrationId} / {signalId, findingId}） */
  lastCalibrationId: string | null;
  lastSignal: { signalId: string; findingId: string } | null;
  injectedHistory: GaInjectedRecord[];
  submitting: boolean;
  onRetry: () => void;
  onCalibrationSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onSignalSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

const Empty: React.FC<{ text?: string }> = ({ text = '暂无数据' }) => (
  <div className="empty-state" style={{ padding: '16px 8px' }}>
    <div className="empty-state-text" style={{ fontSize: 11 }}>{text}</div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="sb-section"><div className="sb-section-title">{title}</div>{children}</section>
);

function formatTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

/** 块 1: 校准列表 + 四动作表单（spec §5.1 端点 1/2） */
const CalibrationBlock: React.FC<GaDetailSectionsProps> = (props) => (
  <div className="cap-detail-card" data-ga-block="calibration" data-endpoint={BLOCK_META.calibration.endpoint}>
    <div className="cap-detail-title">{BLOCK_META.calibration.title}</div>
    {props.calibrationState === 'loading' && <div className="ga-block-note">加载校准列表...</div>}
    {props.calibrationState === 'degraded' && (
      <div className="cap-degraded-banner">⚠ 校准列表服务降级，稍后重试</div>
    )}
    {props.calibrationState === 'blocked' && (
      <div className="cap-degraded-banner">⚠ 服务端拒绝访问（仅 GA 可见）</div>
    )}
    {props.calibrationState === 'loaded' && props.calibrations.length === 0 && (
      <Empty text="暂无校准记录" />
    )}
    {props.calibrationState === 'loaded' && props.calibrations.map((item) => (
      <div key={item.calibrationId} className="ga-calibration-item">
        <div style={{ fontSize: 11 }}>
          {item.action} · {item.targetType || item.targetId || '—'}
          {item.supersededBy ? ' · 已被取代' : ''}
        </div>
        <div style={{ fontSize: 10, color: 'var(--dim)' }}>
          {formatTime(item.calibratedAt)}
          {item.supersedes ? ` · supersedes ${item.supersedes}` : ''}
        </div>
      </div>
    ))}
    <form data-ga-form="calibration" onSubmit={props.onCalibrationSubmit}>
      <select name="action" aria-label="校准动作">
        <option value="mark_error">标记错误</option>
        <option value="add_context">补充背景</option>
        <option value="rewrite_logic">重写逻辑</option>
        <option value="demote_signal">降级信号</option>
      </select>
      <select name="targetType" aria-label="目标类型">
        <option value="diagnosis_conclusion">诊断结论</option>
        <option value="diagnosis_logic">诊断逻辑</option>
        <option value="signal_relevance">信号相关性</option>
      </select>
      <input name="targetId" placeholder="目标 ID（结论/逻辑/信号）" />
      <select name="errorType" aria-label="错误类型（标记错误用）">
        <option value="事实错误">事实错误</option>
        <option value="归因错误">归因错误</option>
        <option value="遗漏关键信息">遗漏关键信息</option>
        <option value="过于笼统">过于笼统</option>
      </select>
      <input name="correctedContent" placeholder="正确信息或补充说明（标记错误用）" />
      <input name="contextCard" placeholder="背景卡片（补充背景用）" />
      <input name="originalVersion" placeholder="原版本 ID（重写逻辑用）" />
      <input name="rewrittenVersion" placeholder="重写版本 ID（重写逻辑用）" />
      <input name="sentinelId" placeholder="哨兵 ID（降级信号用）" />
      <input name="supersedes" placeholder="被取代条目 ID（可选，版本链）" />
      {props.calibrationFormError && <div className="ga-form-error">⚠ {props.calibrationFormError}</div>}
      {props.lastCalibrationId && (
        <div className="ga-submit-ok" data-calibration-id={props.lastCalibrationId}>
          ✓ 校准已提交 calibrationId={props.lastCalibrationId}
        </div>
      )}
      <button className="ga-submit-btn" type="submit" disabled={props.submitting}>提交校准</button>
    </form>
  </div>
);

/** 块 2: 五要素信号注入表单（spec §5.1 端点 3；蓝图 §3.3.1 五要素） */
const InjectionBlock: React.FC<GaDetailSectionsProps> = (props) => (
  <div className="cap-detail-card" data-ga-block="injection" data-endpoint={BLOCK_META.injection.endpoint}>
    <div className="cap-detail-title">{BLOCK_META.injection.title}</div>
    <form data-ga-form="signal" onSubmit={props.onSignalSubmit}>
      <select name="signalType" aria-label="信号类型">
        <option value="人员变动">人员变动</option>
        <option value="战略转向">战略转向</option>
        <option value="竞品动态">竞品动态</option>
        <option value="客户反馈">客户反馈</option>
        <option value="监管变化">监管变化</option>
        <option value="供应商变化">供应商变化</option>
        <option value="市场传闻">市场传闻</option>
        <option value="技术突破">技术突破</option>
        <option value="内部冲突">内部冲突</option>
        <option value="其他">其他</option>
      </select>
      <input name="title" placeholder="信号标题" />
      <input name="description" placeholder="信号描述" />
      <input name="severity" type="number" placeholder="严重度 1-10" />
      <input name="confidence" type="number" placeholder="置信度 0-100" />
      <input name="relatedEdges" placeholder="关联边（逗号分隔，可选）" />
      <input name="relatedNodes" placeholder="关联节点（逗号分隔，可选）" />
      {props.signalFormError && <div className="ga-form-error">⚠ {props.signalFormError}</div>}
      {props.lastSignal && (
        <div className="ga-submit-ok" data-finding-id={props.lastSignal.findingId}>
          ✓ 信号已注入 signalId={props.lastSignal.signalId} findingId={props.lastSignal.findingId}
        </div>
      )}
      <button className="ga-submit-btn" type="submit" disabled={props.submitting}>注入信号</button>
    </form>
    {props.injectedHistory.length > 0 && (
      <div className="ga-injected-history">
        <div style={{ fontSize: 10, color: 'var(--dim)' }}>注入历史（本会话）</div>
        {props.injectedHistory.map((rec, i) => (
          <div key={i} className="ga-injected-item" style={{ fontSize: 10 }}>
            · {rec.title}（{rec.signalType}）→ findingId={rec.findingId} · {formatTime(rec.at)}
          </div>
        ))}
      </div>
    )}
  </div>
);

/** 块 3: 效用仪表（spec §5.1 端点 4；note 原文透传 = 诚实降级显性化，禁采纳率伪造） */
const StatsBlock: React.FC<GaDetailSectionsProps> = (props) => (
  <div className="cap-detail-card" data-ga-block="stats" data-endpoint={BLOCK_META.stats.endpoint}>
    <div className="cap-detail-title">{BLOCK_META.stats.title}</div>
    {props.statsState === 'loading' && <div className="ga-block-note">加载效用统计...</div>}
    {props.statsState === 'degraded' && (
      <div className="cap-degraded-banner">⚠ 效用统计服务降级，稍后重试</div>
    )}
    {props.statsState === 'blocked' && (
      <div className="cap-degraded-banner">⚠ 服务端拒绝访问（仅 GA 可见）</div>
    )}
    {props.statsState === 'loaded' && props.stats && (
      <div className="ga-stats-body">
        <div style={{ fontSize: 11 }}>校准累计 <span className="ga-stat-num">{props.stats.calibration.total}</span></div>
        <div style={{ fontSize: 11 }}>注入累计 <span className="ga-stat-num">{props.stats.injection.total}</span></div>
        <div style={{ fontSize: 11 }}>回流计数 <span className="ga-stat-num">{props.stats.reflux.feedbackCount}</span></div>
        {props.stats.note && (
          <div className="ga-stats-note" data-honesty="note" style={{ fontSize: 10, color: 'var(--dim)' }}>
            {props.stats.note}
          </div>
        )}
      </div>
    )}
    {props.statsState === 'loaded' && !props.stats && <Empty text="暂无效用统计" />}
    <button className="ga-refresh-btn" onClick={props.onRetry} disabled={props.submitting}>刷新统计</button>
  </div>
);

/**
 * GaDetailSections — GA 协同三块纯展示（容器: RightPanel.tsx GaDetail）。
 * @input  — props（见 GaDetailSectionsProps）
 * @output — phase 分派: blocked → 仅 GA 可见空态（零列表/零表单——spec §5.2 fail-closed）；
 *           degraded → 整面板降级条 + 重试 + 零假数据（spec §5.3）；其余 → 三块结构
 *           （各块按独立状态渲染数据/加载/降级条）
 * @degraded — 降级文案 + 重试，零假数据（铁律 8）
 * @error  — 不抛
 */
export const GaDetailSections: React.FC<GaDetailSectionsProps> = (props) => {
  if (props.phase === 'blocked') {
    return (
      <Section title="GA 人机协同（仅 GA 可见）">
        <div className="empty-state" data-ga-block="blocked-empty" style={{ padding: '12px 8px' }}>
          <div className="empty-state-text" style={{ fontSize: 11 }}>
            仅 GA 可见 — 当前角色（{props.role}）无权访问 GA 协同面板
          </div>
        </div>
      </Section>
    );
  }
  if (props.phase === 'degraded') {
    return (
      <Section title="GA 人机协同">
        <div className="cap-degraded-banner">⚠ GA 协同服务降级，稍后重试</div>
        <Empty text="GA 协同数据不可用（校准列表与效用仪表均未成功获取）" />
        <button className="ga-retry-btn" onClick={props.onRetry}>重试</button>
      </Section>
    );
  }
  return (
    <Section title="GA 人机协同">
      {props.phase === 'loading' && <div className="ga-block-note">加载 GA 协同数据...</div>}
      {props.phase === 'idle' && <Empty text="GA 协同面板待加载" />}
      <CalibrationBlock {...props} />
      <InjectionBlock {...props} />
      <StatsBlock {...props} />
    </Section>
  );
};
