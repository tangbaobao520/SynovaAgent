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
  // D527: 六阶段进度 + 降级错误条（铁律 24/31 前端侧）
  const phaseIndex = useConversationStore((s) => s.phaseIndex);
  const phaseLabel = useConversationStore((s) => s.phaseLabel);
  const phaseTotal = useConversationStore((s) => s.phaseTotal);
  const errorMessage = useConversationStore((s) => s.errorMessage);
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

      {/* D527: 六阶段进度条（phase_started 0-5 推进；done 后由 header 显示完成态）。内联样式：写集不含 global.css */}
      {phaseIndex >= 0 && phaseIndex < phaseTotal && phase !== 'done' && (
        <div role="status" style={{ padding: '6px 16px', borderBottom: '1px solid var(--border, #2a3348)', fontSize: 11, color: 'var(--dim, #94a3b8)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>阶段 {phaseIndex + 1}/{phaseTotal} · {phaseLabel}</span>
          <progress value={phaseIndex + 1} max={phaseTotal} style={{ flex: 1, height: 6 }} />
        </div>
      )}

      {/* D527: 降级错误条（LLM 不可用/后端未就绪 → 用户可见，不静默不白屏，铁律 24/31） */}
      {phase === 'error' && errorMessage && (
        <div role="alert" style={{ padding: '8px 16px', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red, #ef4444)', fontSize: 12, borderBottom: '1px solid rgba(239, 68, 68, 0.3)' }}>
          ⚠ {errorMessage}
        </div>
      )}

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
