/**
 * tui-v3/demo-opentui.tsx — opentui 最小验证
 *
 * 验证: 鼠标滚轮 / 流式不闪 / 中文输入
 * 用法: npx tsx --tsconfig src/tui-v3/tsconfig.json src/tui-v3/demo-opentui.tsx
 */

import { useState, useCallback } from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';

function App() {
  const [streaming, setStreaming] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<string[]>([
    '  opentui 验证 demo — 鼠标滚轮 / 流式不闪 / 中文输入',
    '──────────────────────────────────────────────',
    '  1. 滚轮 → 应能上下滚动此区域',
    '  2. Ctrl+C → 退出',
    '  3. 回车 → 模拟流式输出',
    '  4. 输入框 → 测试中文 IME',
    '',
    ...Array.from({ length: 20 }, (_, i) => `  第 ${i + 1} 行测试文本 — Lorem ipsum dolor sit amet`),
    '━━━━━━ 底部 ━━━━━━',
  ]);

  const handleSubmit = useCallback((val: string) => {
    setMessages(prev => [...prev, `> ${val}`]);
    setInputValue('');
    setIsStreaming(true);
    setStreaming('');

    const response = `收到: "${val}" — 流式输出测试。平滑不闪烁。`;
    const chars = response.split('');
    let idx = 0;
    const timer = setInterval(() => {
      if (idx >= chars.length) {
        clearInterval(timer);
        setIsStreaming(false);
        setMessages(prev => [...prev, response]);
        setStreaming('');
        return;
      }
      setStreaming(prev => prev + chars[idx]);
      idx++;
    }, 30);
  }, []);

  return (
    <box flexDirection="column" height="100%">
      <box height={1} backgroundColor="#6c5ce7">
        <text color="white"> Synova opentui 验证 — 鼠标滚轮/流式/中文输入 </text>
      </box>

      <scrollbox flexGrow={1} scrollOnBottom={!isStreaming}>
        {messages.map((msg, i) => (
          <text key={i}>{msg}</text>
        ))}
        {isStreaming && <text color="cyan">{streaming}</text>}
      </scrollbox>

      <box height={3} borderStyle="single">
        <input
          value={inputValue}
          onChange={(val: string) => setInputValue(val)}
          onSubmit={handleSubmit}
          placeholder="输入中文测试 IME..."
        />
      </box>

      <box height={1} backgroundColor="#333">
        <text color="gray"> 状态栏: 验证中 │ 模型: opentui │ Ctrl+C 退出</text>
      </box>
    </box>
  );
}

const renderer = await createCliRenderer({
  useMouse: true,
  exitOnCtrlC: true,
  targetFps: 60,
  screenMode: 'alternate-screen',
});
createRoot(renderer).render(<App />);
