/**
 * hooks/useStreaming.ts — SSE 流式 Hook (Phase 1.2 / D591 对话接线)
 *
 * D591 双模式（spec §3 Q4 契约）:
 *   mode 缺省 'conversation' — POST {api}/api/conversations（D590 对话 SSE 端点）
 *     body {message}（currentSessionId 非空时 {message, sessionId} 续轮）；
 *     open 帧 sessionId → setCurrentSessionId（提交回声对账，localStorage 持久化）；
 *     token 帧 → bufferRef += text + scheduleFlush()（真流式水源，16ms flush）；
 *     agent_message 帧 → assistant 全文落库 + 清 streamingText；end 帧 → phase 'done'；
 *     诊断事件 flat 透传复用既有 D527 管道（零改动）。
 *   mode 'diagnosis' — 既有 consult 行为逐字节不变（URL/payload/帧归约，用例 8 锁定）。
 *
 * 数据流:
 *   fetch SSE → parseLine → handleEvent → applySSEEvent 契约归约 → store 落库 / 逐字渲染
 *
 * 结构: createStreamingController 工厂承载全部发送/消费逻辑（React 无关，node vitest 直测），
 *   useStreaming 为薄适配层（useState 桥接）。bufferRef + 16ms flush 模式沿用铁律 41
 *   已验证模式；禁多层缓冲/限帧抽象类（铁律 41 模式纪律）。
 */
import { useState, useRef } from 'react';
import { useConversationStore } from '../stores/conversation-store';
import { useAppStore } from '../stores/app-store';
import type { ExpertAttr } from '../types/chat';
import { getApiBase } from '../lib/api';
// D527: SSE 事件契约单源（类型全集 + applySSEEvent 归约，未知事件不静默丢弃）
import { applySSEEvent, type SSEEventType, type SSEEventLike, type SSEContractState } from './sse-contract';

export type { SSEEventType };

export interface SSEEvent extends SSEEventLike {
  findings?: Array<{ dimension: string; description: string; confidence?: number }>;
  confidence?: number;
  cardType?: string;
  summary?: string;
  expert?: string;
  experts?: string[];
  nodeId?: string;
  communityId?: string;
}

/** D591: 发送模式——'conversation'（缺省，对话主链路）/ 'diagnosis'（显式诊断入口） */
export type StreamingMode = 'conversation' | 'diagnosis';

export interface SendMessageOptions {
  /** 缺省 'conversation'；显式诊断入口传 'diagnosis'（WelcomeScreen「诊断我的公司」链路） */
  mode?: StreamingMode;
}

export interface UseStreamingReturn {
  /** 是否正在流式接收中 */
  isStreaming: boolean;
  /** 当前流式文本（token 帧逐字累积，16ms flush 驱动） */
  streamingText: string;
  /** 当前的 thinking experts */
  thinkingExperts: string[];
  /**
   * 发送消息并启动 SSE 流式连接（D591 契约）。
   * @input  text 用户消息；opts.mode 缺省 'conversation' → /api/conversations；
   *         'diagnosis' 保持 consult 行为与 main@b54a0fb6 逐字节等价。
   * @output Promise<void>——流终态（done/error）后 resolve；用户消息乐观上屏 + thinking block
   *         为同步副作用；open 帧 sessionId 落 conversation-store（localStorage 持久化）。
   * @degraded fetch 失败/非 2xx → setError(人话) + phase 'error'（错误条可见，铁律 24/31）；
   *           SSE data 解析失败 → console.warn 跳帧不断流；AbortError 静默返回。
   */
  sendMessage: (text: string, opts?: SendMessageOptions) => Promise<void>;
  /** 中断当前流式 */
  cancelStreaming: () => void;
}

/**
 * StreamingHost — controller 的状态写入宿主抽象（D591）。
 * 生产实现 = React setState（useStreaming 内注入）；测试注入捕获桩（node vitest 无渲染器）。
 */
export interface StreamingHost {
  setStreaming: (v: boolean) => void;
  /** token flush：追加到流式文本（生产实现 prev + text） */
  appendStreaming: (text: string) => void;
  /** 清空流式文本（发送起点 / agent_message 全文落库后） */
  resetStreaming: () => void;
  setExperts: (experts: string[]) => void;
}

export interface StreamingController {
  sendMessage: (text: string, opts?: SendMessageOptions) => Promise<void>;
  cancelStreaming: () => void;
}

/**
 * createStreamingController — D591 发送/消费核心工厂（铁律 47 契约）。
 *
 * @input  host: StreamingHost（流式文本/状态写入宿主）
 * @output { sendMessage, cancelStreaming }——与 useStreaming 外部行为一致；buffer/定时器/契约状态
 *         封闭在工厂闭包内（原 useRef 生命周期 = 一次 create 调用）。
 * @degraded 同 UseStreamingReturn.sendMessage（fetch 失败→错误条数据；解析失败→warn 跳帧；
 *           AbortError→静默；诊断事件缺字段→applySSEEvent 既有降级）。
 */
export function createStreamingController(host: StreamingHost): StreamingController {
  const abortRef: { current: AbortController | null } = { current: null };
  const bufferRef: { current: string } = { current: '' };
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  // D527: 契约状态机（跨事件保持：六阶段进度/降级标记）
  const contractStateRef: { current: SSEContractState } = {
    current: { phaseIndex: -1, phaseLabel: '', phase: 'idle', errorMessage: null, degraded: false },
  };

  const flushBuffer = () => {
    const text = bufferRef.current;
    if (!text) return;
    bufferRef.current = '';
    host.appendStreaming(text);
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBuffer();
    }, 16);
  };

  const handleEvent = (evt: SSEEvent) => {
    const storeNow = useConversationStore.getState();

    // ① 契约归约（单一数据流，D527）：六阶段进度 / reportId / 降级 / 未知事件 warn
    const r = applySSEEvent(contractStateRef.current, evt);
    contractStateRef.current = r.state;
    if (r.state.phaseIndex >= 0) {
      storeNow.setPhaseProgress(r.state.phaseIndex, r.state.phaseLabel);
    }
    if (r.reportId) {
      // D527 缺口 2 修复：诊断完成 → reportId 落 app-store（RightPanel 报告/方案首次可达）
      useAppStore.getState().setCurrentReportId(r.reportId);
    }
    if (r.systemMessage && (evt.type === 'phase_started' || evt.type === 'degraded')) {
      storeNow.addMessage({
        type: 'system',
        content: r.systemMessage.content,
        subType: r.systemMessage.type === 'degraded' ? 'info' : 'phase',
        timestamp: new Date().toISOString(),
      });
    }

    // ①b D591: 对话帧消费（真流式水源 + 提交回声对账；诊断事件 flat 分支不受影响）
    switch (evt.type) {
      case 'open': {
        // 提交回声：open 帧 sessionId → 会话锚（store + localStorage，续轮请求携带）
        if (r.sessionId) storeNow.setCurrentSessionId(r.sessionId);
        return;
      }
      case 'token': {
        // 真流式水源：bufferRef += text + 16ms flush（铁律 41 模式）
        bufferRef.current += evt.text ?? '';
        scheduleFlush();
        return;
      }
      case 'agent_message': {
        // 全文兜底（铁律 43 顺序：先落全文、再清流式文本，不留空白帧）。
        // 同时清 buffer + 挂起 flush 定时器：16ms 窗口内未 flush 的 token 残片
        // 不得在全文上屏后再被定时器吐出（竞态：快流下 agent_message 先于 flush 到达）。
        bufferRef.current = '';
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        storeNow.addMessage({
          type: 'assistant',
          content: evt.content ?? '',
          timestamp: new Date().toISOString(),
        });
        host.resetStreaming();
        return;
      }
      case 'end': {
        // 终帧。error 帧先行到达时（D590 契约：error → end）不得把 error 覆写回 done
        // ——错误条必须保持可见（铁律 31 降级信号传播）
        if (storeNow.phase !== 'error') storeNow.setPhase('done');
        return;
      }
    }

    // ② 消息渲染（既有诊断 case 保留，零改动）
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
        // D602: SSE error 帧 → 通知中心本地通知 + electronAPI 在场时系统通知双可见
        // （铁律 31 降级信号传播；spec §5.1 useStreaming 行——diagnosis/conversation 两模式共用本 case，零分支差异）
        useAppStore.getState().pushLocalNotification({
          title: '对话流错误',
          body: evt.message || '诊断过程中发生错误',
          severity: 'warning',
        });
        break;
    }
  };

  const sendMessage = async (text: string, opts?: SendMessageOptions) => {
    // D591: 模式分流——缺省 conversation（对话主链路）；diagnosis 保持既有行为
    const mode: StreamingMode = opts?.mode ?? 'conversation';
    const storeNow = useConversationStore.getState();

    // 提交回声：乐观上屏（两模式共用，既有行为）
    storeNow.addMessage({
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });

    // 设置为 thinking 状态
    storeNow.setPhase('thinking');
    host.setExperts(['战略顾问', '财务专家', '组织专家']);
    host.setStreaming(true);
    host.resetStreaming();

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
      // D591: 按 mode 选 URL 与 body；SSE 读取循环与 handleEvent 两模式共用
      const url = mode === 'diagnosis'
        ? `${getApiBase()}/api/diagnosis/consult`
        : `${getApiBase()}/api/conversations`;
      const body = mode === 'diagnosis'
        ? JSON.stringify({
            teamId: text.replace(/\s+/g, '-').toLowerCase().slice(0, 40),
            initiator: { role: '管理者', name: '用户', concerns: [text] },
          })
        : JSON.stringify(
            storeNow.currentSessionId
              ? { message: text, sessionId: storeNow.currentSessionId }
              : { message: text },
          );

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
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
            } catch (parseErr: unknown) {
              // 铁律 24: 不静默吞解析失败
              console.warn('[useStreaming] SSE data JSON 解析失败，跳过该帧:', raw.slice(0, 120),
                parseErr instanceof Error ? parseErr.message : String(parseErr));
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      storeNow.setError((err as Error)?.message || '连接失败');
      storeNow.setPhase('error');
    } finally {
      host.setStreaming(false);
      host.setExperts([]);
      abortRef.current = null;
    }
  };

  const cancelStreaming = () => {
    abortRef.current?.abort();
    host.setStreaming(false);
    host.setExperts([]);
    useConversationStore.getState().setPhase('idle');
  };

  return { sendMessage, cancelStreaming };
}

export function useStreaming(): UseStreamingReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingExperts, setThinkingExperts] = useState<string[]>([]);

  // controller 与组件实例 1:1（闭包即原 useRef 生命周期；React 18 严格模式双挂载亦各自独立）
  const ctrlRef = useRef<StreamingController | null>(null);
  if (!ctrlRef.current) {
    ctrlRef.current = createStreamingController({
      setStreaming: setIsStreaming,
      appendStreaming: (text) => setStreamingText((prev) => prev + text),
      resetStreaming: () => setStreamingText(''),
      setExperts: setThinkingExperts,
    });
  }

  return {
    isStreaming,
    streamingText,
    thinkingExperts,
    sendMessage: ctrlRef.current.sendMessage,
    cancelStreaming: ctrlRef.current.cancelStreaming,
  };
}
