/**
 * components/CenterPanel.tsx — 中栏对话面板
 *
 * Phase 0.5: 空状态占位
 * Phase 1.1: 欢迎页 ↔ 对话视图切换, 消息列表, 输入框
 *
 * 两种视图:
 *   1. welcome  — 首次启动显示 WelcomeScreen
 *   2. chat     — 消息列表 + 输入框
 *
 * 切换逻辑: welcomeState = ready 时显示 chat 视图
 */
import React, { useRef, useEffect } from 'react';
import WelcomeScreen from './WelcomeScreen';
import MessageItem from './MessageItem';
import { useConversationStore } from '../stores/conversation-store';

const CenterPanel: React.FC = () => {
  const messages = useConversationStore((s) => s.messages);
  const welcomeState = useConversationStore((s) => s.welcomeState);
  const phase = useConversationStore((s) => s.phase);
  const addMessage = useConversationStore((s) => s.addMessage);
  const setPhase = useConversationStore((s) => s.setPhase);
  const [inputValue, setInputValue] = React.useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim() || phase === 'loading') return;

    addMessage({
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    });
    setInputValue('');

    // Phase 1.2: 这里将触发 SSE 流式调用
    // 目前添加一个模拟的 thinking block 作为占位
    setPhase('thinking');
    addMessage({
      type: 'thinking',
      experts: ['战略顾问', '财务专家'],
      collapsed: true,
      timestamp: new Date().toISOString(),
    });

    // 模拟回复（Phase 1.2 替换为真实 SSE）
    setTimeout(() => {
      // 移除 thinking block
      useConversationStore.getState().removeLastMessage();
      addMessage({
        type: 'assistant',
        content: '收到你的问题。我正在分析企业数据，请稍候...',
        expertAttribution: [{ name: '战略顾问', confidence: 0.85 }],
        timestamp: new Date().toISOString(),
      });
      setPhase('idle');
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Welcome 视图
  if (welcomeState !== 'ready') {
    return (
      <main className="panel-center">
        <WelcomeScreen
          onStartDiagnosis={() => {
            useConversationStore.getState().setWelcomeState('ready');
          }}
          onEnterDemo={() => {
            useConversationStore.getState().setWelcomeState('ready');
          }}
        />
      </main>
    );
  }

  // Chat 视图
  return (
    <main className="panel-center">
      {/* Header */}
      <div className="center-header">
        <span className="center-header-title">
          {phase === 'loading' ? '诊断中...' : '对话'}
        </span>
        {phase === 'thinking' && (
          <span className="center-header-status">专家分析中...</span>
        )}
      </div>

      {/* Messages */}
      <div className="center-messages">
        {messages.length === 0 ? (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-text">
              描述你的组织问题，Synova 将进行智能诊断分析
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageItem key={(msg as any)._id || idx} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="center-input-area">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你的组织问题..."
          rows={2}
          disabled={phase === 'loading' || phase === 'thinking'}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || phase === 'loading' || phase === 'thinking'}
        >
          {phase === 'thinking' ? '分析中' : '发送'}
        </button>
      </div>
    </main>
  );
};

export default React.memo(CenterPanel);
