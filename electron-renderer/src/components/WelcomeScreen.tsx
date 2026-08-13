/**
 * components/WelcomeScreen.tsx — 欢迎页 (Phase 1.1)
 *
 * 三态:
 *   1. firstLaunch — 首次启动，显示完整欢迎文案 + 开始按钮
 *   2. hasConfigNoData — 有企业配置但无数据，提示上传或演示模式
 *   3. ready — 一切就绪，直接进入主界面
 *
 * 引用 PRD §16 首次引导设计。文案对齐 PRD §3 定义的版本:
 * "你好，我是 Synova。我是你企业的 AI 免疫系统..."
 */
import React from 'react';
import { useConversationStore } from '../stores/conversation-store';
import type { WelcomeState } from '../types/chat';

interface WelcomeScreenProps {
  onStartDiagnosis: () => void;
  onEnterDemo: () => void;
}

const WELCOME_COPY = {
  firstLaunch: {
    title: '你好，我是 Synova。',
    subtitle: '我是你企业的 AI 免疫系统——\n持续观测、主动发现、自动诊断。',
    description: '让我了解你的企业，一起找到增长的方向。',
    actionLabel: '开始诊断',
    secondaryLabel: '',
  },
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

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStartDiagnosis, onEnterDemo }) => {
  const welcomeState = useConversationStore((s) => s.welcomeState);
  const setWelcomeState = useConversationStore((s) => s.setWelcomeState);
  const copy = WELCOME_COPY[welcomeState];

  const handleAction = () => {
    if (welcomeState === 'ready' || welcomeState === 'firstLaunch') {
      setWelcomeState('ready');
      onStartDiagnosis();
    } else {
      // hasConfigNoData: 跳转到上传
      onStartDiagnosis();
    }
  };

  const handleDemo = () => {
    setWelcomeState('ready');
    onEnterDemo();
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
          <button className="welcome-btn secondary" onClick={handleDemo}>
            {copy.secondaryLabel}
          </button>
        )}
      </div>

      {/* 快速行动（仅 ready 和 firstLaunch） */}
      {welcomeState !== 'hasConfigNoData' && (
        <div className="welcome-quick-actions">
          <span className="welcome-qa-label">快速诊断:</span>
          <button className="welcome-qa-btn" onClick={() => { setWelcomeState('ready'); onStartDiagnosis(); }}>
            🔍 诊断我的公司
          </button>
          <button className="welcome-qa-btn" onClick={() => { setWelcomeState('ready'); onStartDiagnosis(); }}>
            👥 团队协作分析
          </button>
          <button className="welcome-qa-btn" onClick={() => { setWelcomeState('ready'); onStartDiagnosis(); }}>
            ⚠️ 关键人风险
          </button>
        </div>
      )}

      {/* 演示模式水印（仅演示） */}
      <div className="welcome-watermark">演示模式 - 数据为示例</div>
    </div>
  );
};

export default React.memo(WelcomeScreen);
