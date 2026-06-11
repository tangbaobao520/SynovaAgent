/**
 * tui-v2/components/header.tsx — 顶部标题栏
 */
import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../lib/theme';

interface HeaderProps {
  title: string;
  status: string;
  model?: string;
  workDir?: string;
}

export const Header = React.memo(function Header({ title, status, model, workDir }: HeaderProps) {
  const theme = getTheme();
  return (
    <Box height={1} paddingLeft={1} paddingRight={1}>
      <Text color={theme.statusBar.accent} bold>{title}</Text>
      <Text color={theme.statusBar.fg}> · </Text>
      <Text color={theme.statusBar.fg}>{status}</Text>
      {model && <><Text color={theme.statusBar.fg}> · </Text><Text color={theme.user}>{model}</Text></>}
      {workDir && <><Text color={theme.statusBar.fg}> · </Text><Text color={theme.system}>{workDir}</Text></>}
    </Box>
  );
});
