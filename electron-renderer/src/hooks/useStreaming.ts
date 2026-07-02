/**
 * hooks/useStreaming.ts — SSE 流式 Hook (Phase 1.2)
 *
 * 连接 POST /api/diagnosis/consult 读取 SSE 事件流。
 * 使用 bufferRef + 16ms flush 模式（复用 TUI use-streaming.ts 已验证模式）。
 *
 * 数据流:
 *   fetch SSE → parseLine → onEvent → store.addMessage / store.updateLastMessage
 *
 * SSE 事件类型:
 *   phase, expert_hypothesis, hypothesis_generated, interim_finding,
 *   community_reports, entity_resolution, judgment_card, complete, error
 */
import { useState, useCallback, useRef } from 'react';
import { useConversationStore } from '../stores/conversation-store';
import type { ChatMessage, ExpertAttr } from '../types/chat';

export type SSEEventType =
  | 'phase' | 'expert_hypothesis' | 'hypothesis_generated'
  | 'interim_finding' | 'community_reports' | 'entity_resolution'
  | 'judgment_card' | 'complete' | 'error';

export interface SSEEvent {
  type: SSEEventType;
  phase?: number;
  label?: string;
  message?: string;
  findings?: Array<{ dimension: string; description: string; confidence?: number }>;
  confidence?: number;
  cardType?: string;
  summary?: string;
  expert?: string;
  experts?: string[];
  nodeId?: string;
  communityId?: string;
}

export interface UseStreamingReturn {
  /** 是否正在流式接收中 */
  isStreaming: boolean;
  /** 当前流式文本（用于渲染逐字效果） */
  streamingText: string;
  /** 当前的 thinking experts */
  thinkingExperts: string[];
  /** 发送消息并启动 SSE 流式连接 */
  sendMessage: (text: string) => Promise<void>;
  /** 中断当前流式 */
  cancelStreaming: () => void;
}

export function useStreaming(): UseStreamingReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingExperts, setThinkingExperts] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBuffer = useCallback(() => {
    const text = bufferRef.current;
    if (!text) return;
    bufferRef.current = '';
    setStreamingText((prev) => prev + text);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushBuffer();
    }, 16);
  }, [flushBuffer]);

  const store = useConversationStore.getState();

  const handleEvent = useCallback((evt: SSEEvent) => {
    const storeNow = useConversationStore.getState();

    switch (evt.type) {
      case 'phase':
        // 阶段变更: 添加系统消息
        if (evt.label) {
          storeNow.addMessage({
            type: 'system',
            content: `🔄 ${evt.label}${evt.message ? ': ' + evt.message : ''}`,
            subType: 'phase',
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'expert_hypothesis':
      case 'hypothesis_generated':
      case 'interim_finding':
        // 中间发现: 添加助理消息带专家属性
        {
          const experts: ExpertAttr[] = [];
          if (evt.expert) {
            experts.push({ name: evt.expert, confidence: evt.confidence || 0.5 });
          }
          storeNow.addMessage({
            type: 'assistant',
            content: evt.message || '',
            expertAttribution: experts.length > 0 ? experts : undefined,
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'judgment_card':
        // 判断卡片: 添加带内容的助理消息
        storeNow.addMessage({
          type: 'assistant',
          content: evt.summary || evt.message || '',
          expertAttribution: evt.experts?.map((e) => ({
            name: e, confidence: evt.confidence || 0.5,
          })),
          timestamp: new Date().toISOString(),
        });
        break;

      case 'community_reports':
      case 'entity_resolution':
        // 进度更新: 系统消息
        storeNow.addMessage({
          type: 'system',
          content: `📊 ${evt.label || evt.type}${evt.message ? ': ' + evt.message : ''}`,
          subType: 'phase',
          timestamp: new Date().toISOString(),
        });
        break;

      case 'complete':
        // 完成
        storeNow.addMessage({
          type: 'system',
          content: '✅ 诊断完成',
          subType: 'info',
          timestamp: new Date().toISOString(),
        });
        storeNow.setPhase('done');
        break;

      case 'error':
        storeNow.setError(evt.message || '诊断过程中发生错误');
        storeNow.setPhase('error');
        break;
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const storeNow = useConversationStore.getState();

    // 添加用户消息
    storeNow.addMessage({
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });

    // 设置为 thinking 状态
    storeNow.setPhase('thinking');
    setThinkingExperts(['战略顾问', '财务专家', '组织专家']);
    setIsStreaming(true);
    setStreamingText('');

    // 添加 thinking block
    storeNow.addMessage({
      type: 'thinking',
      experts: ['战略顾问', '财务专家', '组织专家'],
      collapsed: true,
      timestamp: new Date().toISOString(),
    });

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    try {
      const res = await fetch('/api/diagnosis/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: text.replace(/\s+/g, '-').toLowerCase().slice(0, 40),
          initiator: { role: '管理者', name: '用户', concerns: [text] },
        }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `HTTP ${res.status}`);
      }

      // 移除 thinking block
      storeNow.removeLastMessage();
      storeNow.setPhase('streaming');

      // 读取 SSE 流
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Response body not readable');

      const decoder = new TextDecoder();
      let buf = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event: ')) {
            currentEventType = trimmed.slice(7).trim();
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const raw = trimmed.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;

            try {
              const evt = JSON.parse(raw) as SSEEvent;
              if (!evt.type && currentEventType) {
                evt.type = currentEventType as SSEEventType;
              }
              handleEvent(evt);
            } catch {
              // JSON 解析失败，跳过
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      storeNow.setError((err as Error)?.message || '连接失败');
      storeNow.setPhase('error');
    } finally {
      setIsStreaming(false);
      setThinkingExperts([]);
      abortRef.current = null;
    }
  }, [handleEvent]);

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setThinkingExperts([]);
    useConversationStore.getState().setPhase('idle');
  }, []);

  return {
    isStreaming,
    streamingText,
    thinkingExperts,
    sendMessage,
    cancelStreaming,
  };
}
