/**
 * tui-v2/components/chat-panel.tsx — 对话面板
 *
 * 滚动模型:
 *   scrollLineOffset = 从最新消息往后跳过的消息条数 (0=粘底)
 *   从末条消息往前 fit, 只渲染 panelHeight 内放得下的消息
 *   被截断的消息显示 "⋯ 上方还有 N 条消息"
 *   滚到中间时同时显示 "⋯ 上方 N 条" 和 "⋯ 下方 N 条"
 *
 * 铁律: 反闪烁由 ink-patch 解决，组件不碰渲染管线。
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { Message } from './message';
import { StreamingText } from './streaming-text';
import { displayWidth } from '../lib/grapheme';
import type { MessageItem } from '../types';

interface ChatPanelProps {
  messages: MessageItem[];
  streamingText?: string;
  isStreaming: boolean;
  thinkingText?: string;
  scrollLineOffset?: number;
  width?: number;
  height?: number;
}

/** 估算单条消息行数（含标签+间距） */
function estLines(msg: MessageItem, maxWidth: number): number {
  let lines = 1; // 标签行 ("▎ 你:" / "● Agent:")
  for (const line of msg.text.split('\n')) {
    if (!line) { lines += 1; continue; }
    lines += Math.max(1, Math.ceil(displayWidth(line) / Math.max(1, maxWidth)));
  }
  return lines + 1; // +1 间距
}

function estStreamingLines(text: string, maxWidth: number): number {
  if (!text) return 2;
  let lines = 1; // "Agent:" 标签
  for (const line of text.split('\n')) {
    if (!line) { lines += 1; continue; }
    lines += Math.max(1, Math.ceil(displayWidth(line) / Math.max(1, maxWidth)));
  }
  return lines + 1;
}

function estThinkingLines(text: string, maxWidth: number): number {
  if (!text) return 0;
  return text.split('\n').length + 1;
}

export const ChatPanel = React.memo(function ChatPanel({
  messages, streamingText, isStreaming, thinkingText, scrollLineOffset = 0, width = 80, height
}: ChatPanelProps) {
  const BORDER = 2;
  const PAD = 2;
  const GUTTER = 1; // scrollbar
  const panelH = Math.max(3, (height || 24) - BORDER);
  // 先不带滚动条 estimate 是否溢出
  const cwTry = Math.max(20, (width || 80) - BORDER - PAD - GUTTER);
  let total = 0;
  for (const m of messages) total += estLines(m, cwTry);
  if (isStreaming && streamingText) total += estStreamingLines(streamingText, cwTry);
  if (thinkingText) total += estThinkingLines(thinkingText, cwTry);
  const hasScrollbar = total > panelH;
  const cw = Math.max(20, (width || 80) - BORDER - PAD - (hasScrollbar ? GUTTER : 0));

  // ── 核心: 从末条往前 fit, scrollLineOffset 条消息跳过 ──
  // 上界: 确保至少留 1 条消息可见, 不能全滚走
  const maxSkip = Math.max(0, messages.length - 1);
  const skip = Math.min(Math.max(0, scrollLineOffset), maxSkip);

  // 从末尾构建可见消息列表
  const { visible, truncatedAbove, truncatedBelow } = useMemo(() => {
    const result: MessageItem[] = [];
    let remaining = panelH;

    // 减去 streaming / thinking 占用的行数
    if (thinkingText) remaining -= estThinkingLines(thinkingText, cw);
    if (isStreaming && streamingText) remaining -= estStreamingLines(streamingText, cw);

    // 确保最小 2 行给消息
    if (remaining < 2) remaining = 2;

    let skipped = 0; // 从末尾跳过的消息数
    let below = 0;   // 底部被跳过的消息数
    let above = 0;   // 顶部被截断的消息数

    // 从末条往前遍历
    for (let i = messages.length - 1; i >= 0; i--) {
      const lines = estLines(messages[i], cw);
      if (skipped < skip) {
        // 还在跳过区间
        skipped++;
        below++;
        continue;
      }
      // 检查是否 fit
      if (lines <= remaining) {
        result.unshift(messages[i]);
        remaining -= lines;
      } else {
        // 不完全 fit → 这条消息放不下, 上方所有消息被截断
        above = i + 1; // messages[0..i] 共 i+1 条被截断
        break;
      }
    }

    return {
      visible: result,
      truncatedAbove: above > 0 ? above : null,
      truncatedBelow: below > 0 ? below : null,
    };
  }, [messages, skip, panelH, cw, thinkingText, isStreaming, streamingText]);

  // ── 滚动条 ──
  const scrollbar = useMemo(() => {
    if (!hasScrollbar) return null;
    const trackH = panelH;
    const thumbRatio = Math.max(0.05, Math.min(1, panelH / Math.max(1, total)));
    const thumbH = Math.max(1, Math.round(thumbRatio * trackH));
    const maxPos = trackH - thumbH;
    // skip / totalMessages 映射到 thumb 位置
    const ratio = messages.length > 0 ? skip / messages.length : 0;
    const thumbPos = Math.round(ratio * maxPos);
    return { thumbH, thumbPos, trackH };
  }, [hasScrollbar, panelH, total, skip, messages.length]);

  return (
    <Box width={width} height={height} flexDirection="row" borderStyle="single" borderColor="gray">
      {/* 消息区 */}
      <Box width={cw + PAD} height={panelH} flexDirection="column" padding={1}>
        {truncatedAbove && <Text dimColor>⋯ 上方还有 {truncatedAbove} 条消息</Text>}
        {visible.map((msg, i) => (
          <Box key={`m-${i}`} flexDirection="column">
            <Message role={msg.role} text={msg.text} maxWidth={cw} />
          </Box>
        ))}
        {thinkingText && (
          <Box flexDirection="column" marginBottom={1}>
            {thinkingText.split('\n').map((l, i) => <Text key={i} dimColor>{l || ' '}</Text>)}
          </Box>
        )}
        {isStreaming && streamingText !== undefined && <StreamingText text={streamingText} maxWidth={cw} />}
        {truncatedBelow && (
          <Text dimColor>⋯ 下方还有 {truncatedBelow} 条消息（↓ 回到底部）</Text>
        )}
      </Box>

      {/* 滚动条 */}
      {hasScrollbar && scrollbar && (
        <Box width={1} height={panelH} flexDirection="column">
          {Array.from({ length: scrollbar.trackH }, (_, i) => {
            const isThumb = i >= scrollbar.thumbPos && i < scrollbar.thumbPos + scrollbar.thumbH;
            return <Text key={i} color={isThumb ? 'cyan' : 'gray'}>{isThumb ? '┃' : '│'}</Text>;
          })}
        </Box>
      )}
    </Box>
  );
});
