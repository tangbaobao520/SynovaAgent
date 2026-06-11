/**
 * tui-v2/components/section-panel.tsx — 可折叠侧边栏面板
 *
 * 每个 Section 包含标题栏 + 内容区, 支持折叠/展开。
 * Auto-collapse: 低优先级面板在空间紧张时自动折叠。
 */
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../lib/theme';
import type { SidebarSection, GoalItem, ObstacleItem, ExpertItem, LegacyItem } from '../lib/sidebar-aggregator';

interface SectionPanelProps {
  section: SidebarSection;
  /** 该项在可见面板中的索引 (0=最上面, 用于颜色区分) */
  index: number;
  /** 可用行数, 超出时截断 */
  maxLines?: number;
}

export const SectionPanel = React.memo(function SectionPanel({ section, index, maxLines }: SectionPanelProps) {
  const theme = getTheme();
  const [collapsed, setCollapsed] = useState(false);

  const headerColor = index === 0 ? theme.sidePanel.header : theme.sidePanel.header;
  const icon = collapsed ? '▶' : '▼';

  const lines = renderItems(section, theme, maxLines);
  const visibleLines = collapsed ? lines.slice(0, 1) : lines;

  return (
    <Box flexDirection="column" marginBottom={collapsed ? 0 : 1}>
      <Text bold color={headerColor} wrap="truncate">
        {icon} {section.title}
      </Text>
      {!collapsed && visibleLines.slice(1).map((line, idx) => (
        <Text key={idx}>{line}</Text>
      ))}
    </Box>
  );
});

// ═══ Item Renderers ═══

function renderItems(section: SidebarSection, theme: ReturnType<typeof getTheme>, maxLines?: number): string[] {
  const result: string[] = [];
  let count = 0;
  const limit = maxLines ? maxLines - 1 : Infinity; // minus header

  switch (section.id) {
    case 'goals':
      for (const item of section.items as GoalItem[]) {
        if (count >= limit) { result.push(`  ⋯ 还有 ${section.items.length - count} 项目标`); break; }
        result.push(`  ${item.text}`);
        const bar = '█'.repeat(Math.round(item.progressPct / 10)) + '░'.repeat(10 - Math.round(item.progressPct / 10));
        result.push(`  ${bar} ${item.progressPct}%`);
        result.push(`  第 ${item.elapsedDays} 天 / 共 ${item.totalDays} 天 · Phase ${item.phase}/5`);
        count += 3;
      }
      break;

    case 'obstacles':
      for (const item of section.items as ObstacleItem[]) {
        if (count >= limit) { result.push(`  ⋯ 还有 ${section.items.length - count} 项`); break; }
        const icon = item.status === 'resolved' ? '✓' : item.status === 'active' ? '▶' : '○';
        const conf = item.confidence !== undefined ? ` ${Math.round(item.confidence * 100)}%` : '';
        result.push(`  ${icon} ${item.text}${conf}`);
        count += 1;
      }
      break;

    case 'experts':
      for (const item of section.items as ExpertItem[]) {
        if (count >= limit) { result.push(`  ⋯ 还有 ${section.items.length - count} 位专家`); break; }
        const icon = item.status === 'done' ? '◆' : item.status === 'running' ? '▶' : item.status === 'failed' ? '✕' : '○';
        const label = item.status === 'done' ? '完成' : item.status === 'running' ? '进行中' : item.status === 'failed' ? '失败' : '排队';
        const elapsed = item.elapsed ? ` ${item.elapsed}` : '';
        result.push(`  ${icon} ${item.name}  ${label}${elapsed}`);
        count += 1;
      }
      break;

    case 'legacy':
      for (const item of section.items as LegacyItem[]) {
        if (count >= limit) { result.push(`  ⋯ 还有 ${section.items.length - count} 项`); break; }
        result.push(`  ⚡ ${item.title}`);
        result.push(`    ${item.foundDate} · ${item.status === 'in_progress' ? '进行中' : '未解决'}`);
        count += 2;
      }
      break;
  }

  return result;
}
