/**
 * components/CenterPanel.tsx — 中栏对话面板
 *
 * Phase 0.5: 空状态占位 + 输入框骨架
 * Phase 1+: 完整消息流 + SSE 流式回复
 */
import React from 'react';

const CenterPanel: React.FC = () => {
  const [inputValue, setInputValue] = React.useState('');

  const handleSend = () => {
    if (!inputValue.trim()) return;
    // Phase 1: 发送消息到后端
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="panel-center">
      {/* Phase 1+: 对话状态标题 */}
      <div className="center-header">
        <span className="center-header-title">对话</span>
        <span style={{ color: 'var(--dim)', fontSize: 11 }}>
          Ctrl+Enter 发送
        </span>
      </div>

      {/* 消息区域 */}
      <div className="center-messages">
        <div className="empty-state fade-in">
          <div className="empty-state-icon">💬</div>
          <div className="empty-state-text">
            描述你的组织问题，Synova 将进行智能诊断分析
          </div>
        </div>
      </div>

      {/* 输入区域 */}
      <div className="center-input-area">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你的组织问题..."
          rows={2}
        />
        <button onClick={handleSend} disabled={!inputValue.trim()}>
          发送
        </button>
      </div>
    </main>
  );
};

export default React.memo(CenterPanel);
