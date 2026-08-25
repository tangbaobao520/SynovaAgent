/**
 * hooks/useConversation.ts — 对话状态 hook (Phase 5.1)
 *
 * 封装 sendMessage/messages/isStreaming/addMessage。
 * CenterPanel 和 Composer 共用入口。
 */
import { useCallback } from 'react';
import { useConversationStore } from '../stores/conversation-store';
import { useStreaming } from './useStreaming';
import type { ChatMessage } from '../types/chat';

export function useConversation() {
  const messages = useConversationStore((s) => s.messages);
  const welcomeState = useConversationStore((s) => s.welcomeState);
  const phase = useConversationStore((s) => s.phase);
  const addMessage = useConversationStore((s) => s.addMessage);
  const setWelcomeState = useConversationStore((s) => s.setWelcomeState);
  const clearMessages = useConversationStore((s) => s.clearMessages);

  const { isStreaming, thinkingExperts, sendMessage, cancelStreaming } = useStreaming();

  // D517 修复: useStreaming.sendMessage 只收 text（后端 /api/diagnosis/consult 尚无 mentions 字段，
  // 静默丢弃会造成假接线）——本 hook 当前零消费者，签名收敛为单参，mentions 待后端支持后再上。
  const send = useCallback((text: string) => {
    void sendMessage(text);
  }, [sendMessage]);

  return {
    messages,
    welcomeState,
    phase,
    isStreaming,
    thinkingExperts,
    sendMessage: send,
    cancelStreaming,
    addMessage,
    setWelcomeState,
    clearMessages,
  };
}
