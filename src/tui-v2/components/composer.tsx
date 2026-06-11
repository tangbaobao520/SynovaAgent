/**
 * tui-v2/components/composer.tsx — 输入框
 *
 * 使用 ink-text-input v6 + useInput 增强：
 * - 光标移动（左右箭头）— 由 ink-text-input 内建
 * - 上下箭头浏览历史记录
 * - Ctrl+W 删除前一个单词
 * - Ctrl+U 删除到行首
 * - Ctrl+K 删除到行尾
 * - Backspace/Delete 正确删除 — 由 ink-text-input 内建
 * - 粘贴文本支持
 */
import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { getTheme } from '../lib/theme';

const MAX_HISTORY = 100;

interface ComposerProps {
  onSubmit: (text: string) => void;
  onScrollUp?: () => void;
  onScrollDown?: () => void;
  placeholder?: string;
}

export function Composer({ onSubmit, onScrollUp, onScrollDown, placeholder = '编写任务或使用 /' }: ComposerProps) {
  const theme = getTheme();
  const { exit } = useApp();
  const [text, setText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedText, setSavedText] = useState('');

  // ref 避免 useInput 闭包捕获旧值
  const textRef = useRef(text);
  const onScrollUpRef = useRef(onScrollUp);
  const onScrollDownRef = useRef(onScrollDown);
  textRef.current = text;
  onScrollUpRef.current = onScrollUp;
  onScrollDownRef.current = onScrollDown;

  const handleSubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setHistory(prev => [trimmed, ...prev.slice(0, MAX_HISTORY - 1)]);
      setText('');
      setHistoryIndex(-1);
      setSavedText('');
    }
  }, [onSubmit]);

  // 快捷键和导航键处理
  useInput((_input, key) => {
    // 过滤鼠标 SGR 序列 (\x1b[<CODE;X;YM) — stdin 被鼠标模块和 ink 共享
    if (typeof _input === 'string' && _input.startsWith('\x1b[<')) return;

    const currentText = textRef.current;
    const scrollUp = onScrollUpRef.current;
    const scrollDown = onScrollDownRef.current;

    // Ctrl+C 退出
    if (key.ctrl && _input === 'c') {
      exit();
      return;
    }

    // PageUp/PageDown 由 chat.tsx 全局处理，避免和 ink-text-input 冲突

    // 上箭头：空输入时滚动对话区，有输入时浏览历史
    if (key.upArrow) {
      if (currentText === '' && scrollUp) {
        // 空输入 → 每次按上滚 1 条消息
        scrollUp();
        return;
      }
      if (history.length === 0) return;
      if (historyIndex === -1) {
        setSavedText(currentText);
        setHistoryIndex(0);
        setText(history[0]);
      } else if (historyIndex < history.length - 1) {
        const next = historyIndex + 1;
        setHistoryIndex(next);
        setText(history[next]);
      }
      return;
    }

    // 下箭头：空输入时滚动对话区，有输入时浏览历史
    if (key.downArrow) {
      if (currentText === '' && scrollDown) {
        scrollDown();
        return;
      }
      if (historyIndex === -1) return;
      if (historyIndex === 0) {
        setHistoryIndex(-1);
        setText(savedText);
        setSavedText('');
      } else {
        const prev = historyIndex - 1;
        setHistoryIndex(prev);
        setText(history[prev]);
      }
      return;
    }

    // Ctrl+W：删除前一个单词
    if (key.ctrl && _input === 'w') {
      setText(prev => {
        const trimmed = prev.replace(/\s+$/, '');
        const lastSpace = trimmed.lastIndexOf(' ');
        return lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : '';
      });
      setHistoryIndex(-1);
      return;
    }

    // Ctrl+U：删除到行首
    if (key.ctrl && _input === 'u') {
      setText('');
      setHistoryIndex(-1);
      return;
    }

    // Ctrl+K：删除到行尾（无法获取光标位置，清空全部）
    if (key.ctrl && _input === 'k') {
      setText('');
      setHistoryIndex(-1);
      return;
    }

    // 任何正常输入重置历史索引
    if (!key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow && !key.pageUp && !key.pageDown) {
      if (historyIndex !== -1) {
        setHistoryIndex(-1);
        setSavedText('');
      }
    }
  }, { isActive: true });

  return (
    <Box height={3} borderStyle="single" borderColor={theme.borderFocus} paddingLeft={1} paddingRight={1}>
      <Text color={theme.user}>{'> '}</Text>
      <TextInput
        value={text}
        onChange={setText}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        showCursor={true}
        focus={true}
      />
    </Box>
  );
}
