/**
 * components/MessageItem.tsx — 单条消息渲染 (Phase 1.1)
 */
import React, { useState } from 'react';
import type { ChatMessage, ThinkingBlock } from '../types/chat';

interface Props {
  message: ChatMessage;
}

const MessageItem: React.FC<Props> = ({ message }) => {
  switch (message.type) {
    case 'user':
      return (
        <div className="msg msg-user fade-in">
          <div className="msg-content">{message.content}</div>
          <div className="msg-time">{fmt(message.timestamp)}</div>
        </div>
      );

    case 'assistant':
      return (
        <div className="msg msg-agent fade-in">
          <div className="msg-content">{message.content}</div>
          {message.expertAttribution && message.expertAttribution.length > 0 && (
            <div className="msg-expert-attribution">
              {message.expertAttribution.map((exp, i) => (
                <span key={i} className="msg-expert-tag" title={exp.methodology}>
                  {exp.name} · {Math.round(exp.confidence * 100)}%
                </span>
              ))}
            </div>
          )}
          <div className="msg-time">{fmt(message.timestamp)}</div>
        </div>
      );

    case 'thinking':
      return <ThinkingBlock block={message} />;

    case 'system':
      return (
        <div className={`msg msg-system fade-in ${message.subType || ''}`}>
          {message.content}
        </div>
      );

    default:
      return null;
  }
};

// ═══ 可折叠思考块 ═══

const ThinkingBlock: React.FC<{ block: ThinkingBlock }> = ({ block }) => {
  const [collapsed, setCollapsed] = useState(block.collapsed);

  return (
    <div className="msg msg-thinking fade-in">
      <button className="thinking-toggle" onClick={() => setCollapsed(!collapsed)}>
        <span className="thinking-arrow">{collapsed ? '▶' : '▼'}</span>
        <span className="thinking-label">专家思考中</span>
        <span className="thinking-experts">
          {block.experts.map((e, i) => (
            <span key={i} className="thinking-expert-tag">{e}</span>
          ))}
        </span>
      </button>
      {!collapsed && (
        <div className="thinking-detail">
          正在调用 {block.experts.join('、')} 进行综合分析...
        </div>
      )}
    </div>
  );
};

function fmt(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default React.memo(MessageItem);
