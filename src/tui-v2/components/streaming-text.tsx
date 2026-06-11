/**
 * tui-v2/components/streaming-text.tsx — 流式文本组件
 *
 * 布局与 Message 一致: ● Agent: + 首行同行，续行缩进
 * 流式 text 变化时自身重渲染，不波及父级历史消息
 */

import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../lib/theme';

interface StreamingTextProps {
  text: string;
  maxWidth?: number;
}

export const StreamingText = React.memo(function StreamingText({ text }: StreamingTextProps) {
  const theme = getTheme();
  const lines = text.split('\n');

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 首行：标签 + 第一行内容 */}
      <Box>
        <Text bold color={theme.agent}>{'● Agent: '}</Text>
        <Text color={theme.surfaceFg}>{lines[0] || ''}</Text>
      </Box>
      {/* 续行：缩进对齐 */}
      {lines.slice(1).map((line, idx) => (
        <Box key={idx} paddingLeft={2}>
          <Text color={theme.surfaceFg}>{line || ' '}</Text>
        </Box>
      ))}
      {/* 光标闪烁指示 */}
      <Box paddingLeft={2}>
        <Text color={theme.agent}>▎</Text>
      </Box>
    </Box>
  );
});
