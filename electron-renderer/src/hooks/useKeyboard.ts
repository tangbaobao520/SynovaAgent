/**
 * hooks/useKeyboard.ts — 全局快捷键
 *
 * Ctrl+B  = 切换左栏
 * Ctrl+J  = 切换右栏
 * Ctrl+K  = 命令面板 (Phase 2)
 * Ctrl+N  = 新建工作区 (Phase 1)
 */
import { useEffect } from 'react';

export interface KeyboardHandlers {
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  openCommandPalette?: () => void;
  newWorkspace?: () => void;
}

export function useKeyboard(handlers: KeyboardHandlers): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;

      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          handlers.toggleLeftPanel();
          break;
        case 'j':
          e.preventDefault();
          handlers.toggleRightPanel();
          break;
        case 'k':
          e.preventDefault();
          handlers.openCommandPalette?.();
          break;
        case 'n':
          e.preventDefault();
          handlers.newWorkspace?.();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlers]);
}
