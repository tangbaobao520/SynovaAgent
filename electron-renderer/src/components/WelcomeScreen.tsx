/**
 * components/WelcomeScreen.tsx — 欢迎页 (Phase 1.1 / D575 首启配置向导)
 *
 * 三态:
 *   1. firstLaunch — D575: 渲染 LlmSetupCard 配置向导（打开产品第一步即配置 LLM）；
 *      「保存并进入」→ 主界面；「暂不配置」→ 主界面 + StatusBar 黄条（铁律 31 不静默）
 *   2. hasConfigNoData — 有企业配置但无数据，提示上传或演示模式
 *   3. ready — 一切就绪，直接进入主界面
 *
 * 结构（renderToStaticMarkup 桥接物理约束: 纯函数组件树零 hook——test-support/render.ts）:
 *   WelcomeScreen（hook 容器: store 订阅 + 向导表单 useState）
 *     ├─ firstLaunch → <LlmSetupCard/>（纯展示，props 驱动）
 *     └─ 其余 → <WelcomePanel/>（纯展示，welcomeState 经 props 收窄为非 firstLaunch 两态）
 *   三态测试 = LlmSetupCard 五态渲染 + WelcomePanel 两态渲染（tests/llm-config-frontend.test.ts）。
 *
 * 死代码清理（铁律 37 / spec 复核定案）: WELCOME_COPY.firstLaunch 键删除——
 * firstLaunch 分支提前 return 后，WELCOME_COPY 类型收窄为
 * Record<Exclude<WelcomeState,'firstLaunch'>,…>，welcomeState 控制流收窄零 as 通过（铁律 38）。
 *
 * 引用 PRD §16 首次引导设计。文案对齐 PRD §3 定义的版本:
 * "你好，我是 Synova。我是你企业的 AI 免疫系统..."
 */
import React, { useState } from 'react';
import { useConversationStore } from '../stores/conversation-store';
import { useAppStore } from '../stores/app-store';
import type { WelcomeState } from '../types/chat';
import { LlmSetupCard, type LlmSetupPhase } from './LlmSetupCard';
import {
  testLlmConnection,
  submitLlmConfig,
  mapLlmTestError,
  type LlmSetupForm,
  type LlmTestOutcome,
  type WizardProvider,
} from '../stores/llm-config';

interface WelcomeScreenProps {
  onStartDiagnosis: () => void;
  onEnterDemo: () => void;
}

/** D591: 快速行动种类——diagnosis 走 consult 显式诊断；其余预填文本进对话（conversation） */
export type QuickActionKind = 'diagnosis' | 'team-collab' | 'key-person-risk';

/** D591: 快速行动按钮单源（欢迎页 WelcomePanel 与 CenterPanel 空态共用，零重复） */
export const WELCOME_QUICK_ACTIONS: ReadonlyArray<{ kind: QuickActionKind; label: string }> = [
  { kind: 'diagnosis', label: '🔍 诊断我的公司' },
  { kind: 'team-collab', label: '👥 团队协作分析' },
  { kind: 'key-person-risk', label: '⚠️ 关键人风险' },
];

/** D591: 预填文案表（diagnosis 无预填——用户首条消息即诊断关注点） */
export const QUICK_ACTION_PREFILL: Record<Exclude<QuickActionKind, 'diagnosis'>, string> = {
  'team-collab': '请帮我分析团队协作现状，找出协作卡点',
  'key-person-risk': '请帮我评估关键岗位与关键人的风险',
};

/**
 * applyQuickAction — D591 快速行动意图写入（spec §5.1：经 store 传递预填文本/诊断意图）。
 * 「诊断我的公司」→ pendingIntent='diagnosis'（首条消息走 consult 显式诊断，CenterPanel 消费）；
 * 其余 → draftPrefill 预填文本（CenterPanel 待发送条一键发送，conversation 模式）。
 */
export function applyQuickAction(kind: QuickActionKind): void {
  const store = useConversationStore.getState();
  if (kind === 'diagnosis') {
    store.setPendingIntent('diagnosis');
    return;
  }
  store.setDraftPrefill(QUICK_ACTION_PREFILL[kind]);
}

/** 非向导两态的文案表（firstLaunch 键已删除——铁律 37；类型 Exclude 收窄） */
export const WELCOME_COPY: Record<Exclude<WelcomeState, 'firstLaunch'>, {
  title: string;
  subtitle: string;
  description: string;
  actionLabel: string;
  secondaryLabel: string;
}> = {
  hasConfigNoData: {
    title: '欢迎回来',
    subtitle: '已检测到企业配置，但尚未上传数据。',
    description: '你可以上传企业数据开始诊断，或进入演示模式体验功能。',
    actionLabel: '上传数据',
    secondaryLabel: '进入演示模式',
  },
  ready: {
    title: '一切就绪',
    subtitle: '企业数据已就绪，随时可以开始诊断。',
    description: '选择左侧的工作区开始对话，或直接提问。',
    actionLabel: '新建诊断',
    secondaryLabel: '',
  },
};

interface WelcomePanelProps {
  welcomeState: Exclude<WelcomeState, 'firstLaunch'>;
  onStartDiagnosis: () => void;
  onEnterDemo: () => void;
  /** D591: 快速行动意图写入（applyQuickAction；缺省兼容既有纯展示测试） */
  onQuickAction?: (kind: QuickActionKind) => void;
}

/** 纯展示面板（零 hook——renderToStaticMarkup 可测）: hasConfigNoData / ready 两态 */
export const WelcomePanel: React.FC<WelcomePanelProps> = ({ welcomeState, onStartDiagnosis, onEnterDemo, onQuickAction }) => {
  const copy = WELCOME_COPY[welcomeState];

  const handleAction = () => {
    // 两态动作一致: 进入主界面（上传/演示分流由上层视图处理——原逻辑保持）
    onStartDiagnosis();
  };

  return (
    <div className="welcome-screen fade-in">
      <div className="welcome-icon">🔍</div>
      <h1 className="welcome-title">{copy.title}</h1>
      <p className="welcome-subtitle">{copy.subtitle}</p>
      <p className="welcome-desc">{copy.description}</p>

      <div className="welcome-actions">
        <button className="welcome-btn primary" onClick={handleAction}>
          {copy.actionLabel}
        </button>
        {copy.secondaryLabel && (
          <button className="welcome-btn secondary" onClick={onEnterDemo}>
            {copy.secondaryLabel}
          </button>
        )}
      </div>

      {/* 快速行动（仅 ready）——D591: 意图写入（预填/诊断）后进入主界面 */}
      {welcomeState === 'ready' && (
        <div className="welcome-quick-actions">
          <span className="welcome-qa-label">快速诊断:</span>
          {WELCOME_QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.kind}
              className="welcome-qa-btn"
              onClick={() => { onQuickAction?.(qa.kind); onStartDiagnosis(); }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* 演示模式水印（仅演示） */}
      <div className="welcome-watermark">演示模式 - 数据为示例</div>
    </div>
  );
};

const INITIAL_FORM: LlmSetupForm = {
  provider: 'deepseek',
  model: 'deepseek-chat', // 决策 4: UI 预填 = synova.json llm.model 现值（GET /api/llm/config 未配置回退链一致）
  baseUrl: '',
  apiKey: '',
};

const WelcomeScreen: React.FC<WelcomeScreenProps> = (props) => {
  const welcomeState = useConversationStore((s) => s.welcomeState);
  const setWelcomeState = useConversationStore((s) => s.setWelcomeState);

  // ── D575: 向导表单状态（hook 容器；LlmSetupCard 为 props 驱动纯展示）──
  const [form, setForm] = useState<LlmSetupForm>(INITIAL_FORM);
  const [phase, setPhase] = useState<LlmSetupPhase>('idle');
  const [testResult, setTestResult] = useState<LlmTestOutcome | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  if (welcomeState === 'firstLaunch') {
    const handleTest = async () => {
      setPhase('testing');
      const result = await testLlmConnection(form);
      if (result === null) {
        // 传输层降级（铁律 31: 不静默，渲染人话）——本地服务不可达
        setTestResult({ ok: false, code: 'NETWORK', message: mapLlmTestError('NETWORK') });
        setPhase('test-fail');
        return;
      }
      setTestResult(result);
      setPhase(result.ok ? 'test-ok' : 'test-fail');
    };

    const handleSave = async () => {
      setPhase('saving');
      setSaveErrorMessage(null);
      const result = await submitLlmConfig(form);
      if (result === null) {
        setSaveErrorMessage('无法连接本地服务，请确认后端已启动');
        setPhase('save-error');
        return;
      }
      if (result.ok) {
        // 保存成功 → 主界面，黄条消失（结果可见）
        useAppStore.getState().setLlmUnconfigured(false);
        setWelcomeState('ready');
        return;
      }
      setSaveErrorMessage(result.message);
      setPhase('save-error');
    };

    const handleSkip = () => {
      // 暂不配置 → 主界面 + StatusBar 黄条常驻（铁律 31: 未配置不静默）
      useAppStore.getState().setLlmUnconfigured(true);
      setWelcomeState('ready');
    };

    return (
      <LlmSetupCard
        provider={form.provider}
        model={form.model}
        baseUrl={form.baseUrl}
        apiKey={form.apiKey}
        phase={phase}
        testResult={testResult}
        saveErrorMessage={saveErrorMessage}
        onProviderChange={(provider: WizardProvider) => setForm((f) => ({ ...f, provider }))}
        onModelChange={(model) => setForm((f) => ({ ...f, model }))}
        onBaseUrlChange={(baseUrl) => setForm((f) => ({ ...f, baseUrl }))}
        onApiKeyChange={(apiKey) => setForm((f) => ({ ...f, apiKey }))}
        onTest={() => { void handleTest(); }}
        onSave={() => { void handleSave(); }}
        onSkip={handleSkip}
      />
    );
  }

  // hasConfigNoData / ready — welcomeState 经控制流收窄为零 as 的两态
  return (
    <WelcomePanel
      welcomeState={welcomeState}
      onStartDiagnosis={props.onStartDiagnosis}
      onEnterDemo={props.onEnterDemo}
      onQuickAction={applyQuickAction}
    />
  );
};

export { WelcomeScreen };
export default React.memo(WelcomeScreen);
