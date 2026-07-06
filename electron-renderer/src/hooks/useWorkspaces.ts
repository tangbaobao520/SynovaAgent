/**
 * hooks/useWorkspaces.ts — 工作区管理 hook (Phase 5.2)
 *
 * 封装 workspaces CRUD。LeftPanel 和 CommandPalette 共用。
 */
import { useCallback } from 'react';
import { useAppStore, type WorkspaceInfo } from '../stores/app-store';

export function useWorkspaces() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);

  // 当前选中的工作区
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;

  // 创建工作区（临时：本地 mock，后续接 API）
  const createWorkspace = useCallback((title: string, type: WorkspaceInfo['type'] = 'manual') => {
    // MVP: 本地创建，不调用 API。未来通过 /api/workspaces POST 实现
    console.warn('[useWorkspaces] createWorkspace — MVP 本地 Mock');
  }, []);

  // 切换到工作区
  const switchTo = useCallback((id: string | null) => {
    setActiveWorkspaceId(id);
  }, [setActiveWorkspaceId]);

  return {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    createWorkspace,
    switchTo,
  };
}
