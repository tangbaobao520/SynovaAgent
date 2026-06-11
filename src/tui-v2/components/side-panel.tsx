/**
 * tui-v2/components/side-panel.tsx — 右侧面板
 *
 * 接收 SidebarSnapshot → 渲染 4 个可折叠面板。
 * Auto-collapse: 空间紧张时低优先级面板自动折叠。
 */
import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../lib/theme';
import { SectionPanel } from './section-panel';
import type { SidebarSnapshot } from '../lib/sidebar-aggregator';

interface SidePanelProps {
  snapshot: SidebarSnapshot | null;
  width?: number;
  height?: number;
}

export const SidePanel = React.memo(function SidePanel({ snapshot, width = 30, height }: SidePanelProps) {
  const theme = getTheme();

  if (!snapshot || snapshot.sections.length === 0) {
    return (
      <Box width={width} height={height} flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor>发送消息后开始导航</Text>
      </Box>
    );
  }

  const sections = snapshot.sections;
  // Auto-collapse: 估算可用行数, 优先保留高优先级面板
  const estimatedHeight = height ?? 20;
  const headerLines = 1; // border + padding
  const availableLines = estimatedHeight - 2; // minus border
  const maxLinesPerSection = Math.max(4, Math.floor(availableLines / sections.length));

  return (
    <Box width={width} height={height} flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
      {sections.map((section, idx) => (
        <SectionPanel
          key={section.id}
          section={section}
          index={idx}
          maxLines={maxLinesPerSection}
        />
      ))}
      {snapshot.isActive && (
        <Text color={theme.sidePanel.running}>● 诊断进行中 · Phase {snapshot.phase}/5</Text>
      )}
    </Box>
  );
});
