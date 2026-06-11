/**
 * tui-v2/components/message.tsx — 单条消息渲染（Markdown 基础支持）
 *
 * 支持:
 *   - 用户消息(绿色 ▎), Agent(紫色 ●), 系统(灰色 ◆), 告警(红色 ⚠)
 *   - Markdown: 标题 #/##/###, 列表 - * / +, 引用 >, 代码块 ```
 *   - React.memo — text/role 不变则跳过重渲染
 *
 * 对标 CodeWhale: 标签与首行同行，续行缩进，Markdown 语法着色
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../lib/theme';
import type { MessageRole } from '../types';

export interface MessageProps {
  role: MessageRole;
  text: string;
  maxWidth?: number;
}

const roleConfig = {
  user: { label: '你', color: 'green' as const, glyph: '▎' },
  agent: { label: 'Agent', color: 'magenta' as const, glyph: '●' },
  system: { label: '系统', color: 'gray' as const, glyph: '◆' },
  alert: { label: '告警', color: 'red' as const, glyph: '⚠' },
};

/** 单行 Markdown 样式解析 */
function parseLineStyle(line: string): {
  style: 'h1' | 'h2' | 'h3' | 'list' | 'quote' | 'code' | 'codeFence' | 'normal';
  display: string;
} {
  if (line.startsWith('### ')) return { style: 'h3', display: line.slice(4) };
  if (line.startsWith('## ')) return { style: 'h2', display: line.slice(3) };
  if (line.startsWith('# ')) return { style: 'h1', display: line.slice(2) };
  if (/^[-*+] /.test(line)) return { style: 'list', display: line };
  if (line.startsWith('> ')) return { style: 'quote', display: line };
  if (line.startsWith('```')) return { style: 'codeFence', display: line };
  if (line.startsWith('    ') || line.startsWith('\t')) return { style: 'code', display: line };
  return { style: 'normal', display: line };
}

/** 渲染单行，根据 Markdown 样式应用颜色和粗体 */
function MarkdownLine({ line }: { line: string }) {
  const theme = getTheme();
  const { style, display } = parseLineStyle(line);

  switch (style) {
    case 'h1':
      return (
        <Box marginY={1}>
          <Text bold underline color={theme.agent}>{display}</Text>
        </Box>
      );
    case 'h2':
      return (
        <Box marginY={1}>
          <Text bold color={theme.agent}>{display}</Text>
        </Box>
      );
    case 'h3':
      return (
        <Box marginTop={1}>
          <Text bold color={theme.surfaceFg}>{display}</Text>
        </Box>
      );
    case 'list':
      return (
        <Text color={theme.surfaceFg}>
          <Text color={theme.user}>{display.slice(0, 2)}</Text>
          {display.slice(2)}
        </Text>
      );
    case 'quote':
      return (
        <Text color={theme.system}>
          <Text color={theme.user}>{'> '}</Text>
          {display.slice(2)}
        </Text>
      );
    case 'codeFence':
      return <Text dimColor>{display}</Text>;
    case 'code':
      return <Text color={theme.system}>{display}</Text>;
    default:
      // 行内粗体 **text**
      if (display.includes('**')) {
        const parts = display.split(/(\*\*.*?\*\*)/g);
        return (
          <Text color={theme.surfaceFg}>
            {parts.map((part, i) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <Text key={i} bold>{part.slice(2, -2)}</Text>;
              }
              return part;
            })}
          </Text>
        );
      }
      return <Text color={theme.surfaceFg}>{display || ' '}</Text>;
  }
}

export const Message = React.memo(function Message({ role, text }: MessageProps) {
  const theme = getTheme();
  const config = roleConfig[role];
  const lines = text.split('\n');

  // 跟踪代码块状态
  let inCodeBlock = false;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 标签行 */}
      <Box>
        <Text bold color={config.color}>{`${config.glyph} ${config.label}: `}</Text>
        {/* 首行内容 */}
        {lines.length > 0 && (() => {
          const first = lines[0];
          if (first.startsWith('```')) { inCodeBlock = !inCodeBlock; }
          const { style, display } = parseLineStyle(first);
          if (style === 'normal' && first.includes('**')) {
            const parts = first.split(/(\*\*.*?\*\*)/g);
            return (
              <Text color={theme.surfaceFg}>
                {parts.map((part, i) => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return <Text key={i} bold>{part.slice(2, -2)}</Text>;
                  }
                  return part;
                })}
              </Text>
            );
          }
          return <Text color={theme.surfaceFg}>{first || ''}</Text>;
        })()}
      </Box>

      {/* 续行 */}
      {lines.slice(1).map((line, idx) => {
        if (line.startsWith('```')) { inCodeBlock = !inCodeBlock; }
        return (
          <Box key={idx} paddingLeft={2}>
            <MarkdownLine line={line} />
          </Box>
        );
      })}
    </Box>
  );
});
