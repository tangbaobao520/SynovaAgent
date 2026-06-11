/**
 * tui-v2/app.tsx — ink App 根组件
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Box, useApp, useStdout } from 'ink';
import { Header } from './components/header';
import { ChatPanel } from './components/chat-panel';
import { SidePanel } from './components/side-panel';
import { Composer } from './components/composer';
import { StatusBar } from './components/status-bar';
import { TuiViewAdapter } from '../l1-interaction/tui-adapter-v2';
import type { ConversationEngine } from '../agent/conversation-engine';
import type { EventBus } from '../orchestrator/event-bus';
import { createInitialState, type TuiState } from './types';
import { setScrollHandlers } from './lib/mouse-input';

interface AppProps {
  engine: ConversationEngine;
  eventBus: EventBus;
  model?: string;
  workDir?: string;
}

export function App({ engine, eventBus, model, workDir }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState<TuiState>(createInitialState);

  const termHeight = stdout?.rows || 24;
  const termWidth = stdout?.columns || 80;

  const adapter = useMemo(() => new TuiViewAdapter(setState, eventBus), [eventBus]);

  useEffect(() => {
    try { (engine as unknown as { setViewAdapter?: (a: unknown) => void }).setViewAdapter?.(adapter); } catch {}
    return () => { adapter.dispose(); };
  }, [engine, adapter]);

  const handleSubmit = useCallback((text: string) => {
    adapter.showUserMessage(text);
    try { (engine as unknown as { processUserInput?: (t: string) => Promise<unknown> }).processUserInput?.(text); } catch (err) {
      adapter.showError(`处理失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [engine, adapter]);

  const [scrollLineOffset, setScrollLineOffset] = useState(0);
  const onScrollUp = useCallback(() => setScrollLineOffset(prev => prev + 1), []);
  const onScrollDown = useCallback(() => setScrollLineOffset(prev => Math.max(0, prev - 1)), []);
  const scrollUpRef = useRef(onScrollUp); scrollUpRef.current = onScrollUp;
  const scrollDownRef = useRef(onScrollDown); scrollDownRef.current = onScrollDown;

  useEffect(() => {
    setScrollHandlers(
      () => { for (let i = 0; i < 3; i++) scrollUpRef.current(); },
      () => scrollDownRef.current(),
    );
    return () => setScrollHandlers(null, null);
  }, []);

  const streamingText = state.isStreaming ? state.messages.filter(m => m.streaming).pop()?.text || '' : '';
  const displayMessages = state.messages.filter(m => !m.streaming);

  const headerHeight = 1;
  const composerHeight = 3;
  const statusBarHeight = 1;
  const contentHeight = Math.max(3, termHeight - headerHeight - composerHeight - statusBarHeight);
  const chatWidth = Math.floor(termWidth * 0.7);
  const sideWidth = Math.floor(termWidth * 0.3);

  return (
    <Box flexDirection="column" height={termHeight}>
      <Header title="Synova 增长导航" status={state.status} model={model} workDir={workDir} />
      <Box flexDirection="row" height={contentHeight}>
        <ChatPanel messages={displayMessages} streamingText={streamingText} isStreaming={state.isStreaming} scrollLineOffset={scrollLineOffset} width={chatWidth} height={contentHeight} />
        <SidePanel snapshot={state.sidebar} width={sideWidth} height={contentHeight} />
      </Box>
      <Composer onSubmit={handleSubmit} />
      <StatusBar mode="增长导航" model={model} monthlyCost={`¥${state.cost.monthly.toFixed(2)}`} hints="Ctrl+C 退出 │ /setup 配置 │ /model 切换 │ /help 帮助" />
    </Box>
  );
}
