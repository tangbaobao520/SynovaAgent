/**
 * tui-v2/components/status-bar.tsx — 底部状态栏
 *
 * 4 芯片左对齐 + 快捷键右对齐。
 * 纯 props → 无内部状态 → 不影响闪烁修复。
 */
import React from 'react';
import { Box, Text } from 'ink';
import { getTheme } from '../lib/theme';

export interface StatusBarProps {
  mode: string;
  model?: string;
  /** 账户余额文本 (已格式化, 如 "¥98.50") */
  balance?: string;
  /** 月费用文本 (已格式化, 如 "¥1.24") */
  monthlyCost?: string;
  /** 快捷键提示 (右侧对齐) */
  hints: string;
}

export function StatusBar({ mode, model, balance, monthlyCost, hints }: StatusBarProps) {
  const theme = getTheme();

  // 左侧芯片
  const chips: string[] = [mode];
  if (model) chips.push(model);
  if (balance) chips.push(`余额 ${balance}`);
  if (monthlyCost) chips.push(`月费 ${monthlyCost}`);
  const left = chips.join(' │ ');

  // 右侧快捷键
  const fullLine = `${left}  ${' '.repeat(Math.max(1, 6))}${hints}`;

  return (
    <Box height={1} paddingLeft={1} paddingRight={1}>
      <Text color={theme.statusBar.accent}>
        <Text color={theme.statusBar.accent} bold>{mode}</Text>
        {model && <><Text color={theme.statusBar.fg}> │ </Text><Text color={theme.user}>{model}</Text></>}
        {balance && <><Text color={theme.statusBar.fg}> │ </Text><Text color={theme.statusBar.fg}>余额 </Text><Text color={theme.sidePanel.done}>{balance}</Text></>}
        {monthlyCost && <><Text color={theme.statusBar.fg}> │ </Text><Text color={theme.statusBar.fg}>月费 </Text><Text color={theme.statusBar.fg}>{monthlyCost}</Text></>}
        <Text>  </Text>
        <Text dimColor>{hints}</Text>
      </Text>
    </Box>
  );
}
