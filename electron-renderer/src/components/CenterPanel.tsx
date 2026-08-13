/**
 * components/CenterPanel.tsx — 中栏对话面板
 *
 * Phase 0.5: 空状态占位
 * Phase 1.1: 欢迎页 + 消息 + 模拟回复
 * Phase 1.2: Composer + useStreaming SSE 流式
 */
import React, { useRef, useEffect } from 'react';
import WelcomeScreen from './WelcomeScreen';
import MessageItem from './MessageItem';
import Composer from './Composer';
import { useConversationStore } from '../stores/conversation-store';
import { useStreaming } from '../hooks/useStreaming';

const CenterPanel: React.FC = () => {
  const messages = useConversationStore((s) => s.messages);
  const welcomeState = useConversationStore((s) => s.welcomeState);
  const phase = useConversationStore((s) => s.phase);
  const { isStreaming, thinkingExperts, sendMessage, cancelStreaming } = useStreaming();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text: string) => { sendMessage(text); };

  // Welcome 视图
  if (welcomeState !== 'ready') {
    return (
      <main className="panel-center">
        <WelcomeScreen
          onStartDiagnosis={() => useConversationStore.getState().setWelcomeState('ready')}
          onEnterDemo={() => useConversationStore.getState().setWelcomeState('ready')}
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
          {isStreaming ? '诊断中...' : '对话'}
        </span>
        <div className="center-header-right">
          {isStreaming && (
            <>
              <span className="center-header-status">
                {thinkingExperts.length > 0
                  ? `${thinkingExperts.join('/')} 分析中`
                  : '处理中...'}
              </span>
              <button className="center-cancel-btn" onClick={cancelStreaming}>
                中断
              </button>
            </>
          )}
          {phase === 'done' && (
            <span className="center-header-done">✅ 诊断完成</span>
          )}
        </div>
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
            <MessageItem key={msg._id ?? idx} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <Composer
        onSend={handleSend}
        disabled={isStreaming}
        placeholder={isStreaming ? '等待诊断完成...' : '描述你的组织问题...'}
      />
    </main>
  );
};

export default React.memo(CenterPanel);
