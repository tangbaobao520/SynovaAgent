/**
 * tui-v2/hooks/use-streaming.ts — 流式输出 Hook（简化版）
 *
 * 设计原则：简单可靠，不引入复杂 Pipeline。
 * 数据流: LLM SSE → appendToken → bufferRef → setTimeout(16ms) → setState → ink 渲染
 *
 * 16ms 批量更新 (~60fps 检查频率)：
 *   - token 快速到达时合并为一批，减少重绘次数
 *   - token 稀疏时也能及时显示
 *   - 配合 ink 补丁（Synchronized Output + 行级 Diff），不闪烁
 */

import { useState, useCallback, useRef } from 'react';

interface StreamingState {
  text: string;
  isStreaming: boolean;
}

export function useStreaming() {
  const [state, setState] = useState<StreamingState>({ text: '', isStreaming: false });
  const bufferRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 将 buffer 刷到 React state */
  const flushBuffer = useCallback(() => {
    const text = bufferRef.current;
    if (!text) return;
    bufferRef.current = '';
    setState(prev => ({ ...prev, text: prev.text + text }));
  }, []);

  /** 调度 flush（16ms 后执行，已调度则忽略） */
  const scheduleFlush = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushBuffer();
    }, 16);
  }, [flushBuffer]);

  /** 开始流式输出 */
  const startStreaming = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    bufferRef.current = '';
    setState({ text: '', isStreaming: true });
  }, []);

  /** 追加 token */
  const appendToken = useCallback((token: string) => {
    bufferRef.current += token;
    scheduleFlush();
  }, [scheduleFlush]);

  /** 结束流式输出 — 先 flush 剩余内容，再清除状态 */
  const finishStreaming = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    flushBuffer();
    // 同步清除，避免与后续 addAgentMessage 产生竞态
    setState({ text: '', isStreaming: false });
  }, [flushBuffer]);

  /** 取消流式输出 */
  const cancelStreaming = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    bufferRef.current = '';
    setState({ text: '', isStreaming: false });
  }, []);

  return {
    streamingText: state.text,
    isStreaming: state.isStreaming,
    startStreaming,
    appendToken,
    finishStreaming,
    cancelStreaming,
  };
}
