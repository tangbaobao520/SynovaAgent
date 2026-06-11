/**
 * tui-v2/demo.tsx — TUI 演示入口
 *
 * 不依赖后端，纯 UI 演示。
 * 用法: npx tsx src/tui-v2/demo.tsx
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { render, Box, Text, useStdout, useInput } from 'ink';
import { Header } from './components/header';
import { ChatPanel } from './components/chat-panel';
import { SidePanel } from './components/side-panel';
import { Composer } from './components/composer';
import { StatusBar } from './components/status-bar';
import { createInitialState, type TuiState } from './types';
import { SidebarAggregator } from './lib/sidebar-aggregator';
import { installStdinProxy, setScrollHandlers } from './lib/mouse-input';

// Demo 数据: 模拟一段诊断后的右边栏状态
function createDemoAggregator(): SidebarAggregator {
  const agg = new SidebarAggregator();
  agg.loadGoals([
    { id: '1', text: 'Q3 营收增长 30%', progressPct: 45, elapsedDays: 15, totalDays: 90, phase: 2 },
  ]);
  agg.mergeObstacles([
    { moduleId: 'obs1', summary: '销售线索转化率低', confidence: 0.85 },
    { moduleId: 'obs2', summary: '客户流失率高', confidence: 0.72 },
  ]);
  agg.setExperts([
    { id: 'strategy', name: '战略专家', status: 'done', elapsed: '2.3s' },
    { id: 'org', name: '组织专家', status: 'running', elapsed: '1.5s' },
    { id: 'finance', name: '财务专家', status: 'queued' },
  ]);
  return agg;
}

function DemoApp() {
  const { stdout } = useStdout();
  const [termHeight, setTermHeight] = useState(stdout?.rows || 24);
  const [termWidth, setTermWidth] = useState(stdout?.columns || 80);

  useEffect(() => {
    const handleResize = () => {
      setTermHeight(stdout?.rows || 24);
      setTermWidth(stdout?.columns || 80);
    };
    stdout?.on('resize', handleResize);
    return () => { stdout?.off('resize', handleResize); };
  }, []);

  const demoAgg = useMemo(() => createDemoAggregator(), []);
  const [state, setState] = useState<TuiState>({
    ...createInitialState(),
    sidebar: demoAgg.getSnapshot(),
    messages: [
      { role: 'agent', text: '你好！我是 Synova 增长导航助手。\n\n我能帮助你：\n- 设定增长目标\n- 发现增长障碍\n- 协调 AI 专家分析\n- 生成诊断报告\n\n📋 按 ↑↓ 键滚动对话区，PgUp/PgDn 翻页', streaming: false },
      { role: 'system', text: '═══ 系统就绪 ═══\nProvider: DeepSeek\nModel: deepseek-v4-pro\nBudget: ¥5.00\n\n输入 /help 查看所有命令' },
      { role: 'user', text: '我们公司最近销售转化率一直在下降，团队士气也不高' },
      { role: 'agent', text: '收到。让我帮你分析一下这个情况。\n\n可能的原因包括：\n1. 市场环境变化\n2. 销售流程中的瓶颈\n3. 团队协作问题\n4. 产品竞争力下降\n\n我需要启动一次组织诊断来深入分析。准备好了吗？' },
    ],
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [scrollLineOffset, setScrollLineOffset] = useState(0);

  const onScrollUp = useCallback(() => {
    setScrollLineOffset(prev => prev + 1);
  }, []);
  const onScrollDown = useCallback(() => {
    setScrollLineOffset(prev => Math.max(0, prev - 1));
  }, []);

  // 全局滚动快捷键
  const scrollUpRef = useRef(onScrollUp);
  const scrollDownRef = useRef(onScrollDown);
  scrollUpRef.current = onScrollUp;
  scrollDownRef.current = onScrollDown;
  useInput((_input, key) => {
    if (key.upArrow) { for (let i = 0; i < 3; i++) scrollUpRef.current(); return; }
    if (key.downArrow) { scrollDownRef.current(); return; }
    if (key.pageUp) { for (let i = 0; i < 5; i++) scrollUpRef.current(); return; }
    if (key.pageDown) { for (let i = 0; i < 5; i++) scrollDownRef.current(); return; }
  }, { isActive: true });

  // 鼠标滚轮回调注入（每次滚轮=1 条消息, 太快会跳过所有内容）
  useEffect(() => {
    setScrollHandlers(
      () => scrollUpRef.current(),
      () => scrollDownRef.current(),
    );
    return () => setScrollHandlers(null, null);
  }, []);

  const handleSubmit = useCallback((text: string) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, { role: 'user', text }],
    }));
    setScrollLineOffset(0);

    setIsStreaming(true);
    setStreamingText('');

    const response = `收到你的问题："${text}"\n\n这是一个演示回复。在实际环境中，这里会显示 DeepSeek 模型的真实回复。\n\n当前状态：\n- 模型: deepseek-v4-pro\n- 阶段: Phase 2 (假设生成)\n- 专家: 3 位正在分析`;

    let idx = 0;
    const chars = response.split('');
    const timer = setInterval(() => {
      const batch = chars.slice(idx, idx + 3);
      if (batch.length === 0) {
        clearInterval(timer);
        setIsStreaming(false);
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, { role: 'agent', text: response, streaming: false }],
        }));
        setStreamingText('');
        return;
      }
      setStreamingText(prev => prev + batch.join(''));
      idx += batch.length;
    }, 100);
  }, []);

  const displayMessages = state.messages.filter(m => !m.streaming);

  const headerHeight = 1;
  const composerHeight = 3;
  const statusBarHeight = 1;
  const contentHeight = Math.max(3, termHeight - headerHeight - composerHeight - statusBarHeight);
  const chatWidth = Math.floor(termWidth * 0.7);
  const sideWidth = Math.floor(termWidth * 0.3);

  return (
    <Box flexDirection="column" height={termHeight}>
      <Header
        title="Synova 增长导航"
        status="演示模式"
        model="deepseek-v4-pro"
        workDir="D:/synova-agent"
      />

      <Box flexDirection="row" height={contentHeight}>
        <ChatPanel
          messages={displayMessages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          scrollLineOffset={scrollLineOffset}
          width={chatWidth}
          height={contentHeight}
        />
        <SidePanel
          snapshot={state.sidebar}
          width={sideWidth}
          height={contentHeight}
        />
      </Box>

      <Composer onSubmit={handleSubmit} onScrollUp={onScrollUp} onScrollDown={onScrollDown} />

      <StatusBar
        mode="增长导航"
        model="deepseek-v4-pro"
        monthlyCost="¥1.24"
        hints="Ctrl+C 退出 │ /setup 配置 │ /model 切换 │ /help 帮助"
      />
    </Box>
  );
}

installStdinProxy();
render(<DemoApp />);
