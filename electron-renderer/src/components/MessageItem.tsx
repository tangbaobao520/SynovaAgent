/**
 * components/MessageItem.tsx — 单条消息渲染 (Phase 1.1 + 1.2)
 *
 * 四种消息:
 *   user      — 右对齐紫色气泡
 *   assistant — 左对齐灰底 + ExpertAttribution
 *   thinking  — 可折叠思考块
 *   system    — 居中系统提示
 */
import React, { useState } from 'react';
import ExpertAttribution from './ExpertAttribution';
import type { ChatMessage, ThinkingBlock } from '../types/chat';

interface Props { message: ChatMessage; }

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
            <ExpertAttribution experts={message.expertAttribution} />
          )}
          <div className="msg-time">{fmt(message.timestamp)}</div>
        </div>
      );

    case 'thinking':
      return <ThinkingBlockComponent block={message} />;

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

const ThinkingBlockComponent: React.FC<{ block: ThinkingBlock }> = ({ block }) => {
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
  } catch { return ''; }
}

export default React.memo(MessageItem);
