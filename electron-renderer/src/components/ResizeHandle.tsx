/**
 * components/ResizeHandle.tsx — 面板拖拽调整宽度手柄
 *
 * 渲染为 4px 宽的竖条，hover 时高亮。
 * mousedown 开始拖拽 → mousemove 更新宽度 → mouseup 结束。
 */
import React, { useCallback, useRef, useEffect } from 'react';

interface ResizeHandleProps {
  /** 拖拽方向: 'left' = 调整左面板, 'right' = 调整右面板 */
  side: 'left' | 'right';
  /** 当前面板宽度（px） */
  panelWidth: number;
  /** 宽度回调 */
  onWidthChange: (newWidth: number) => void;
  /** 最小宽度 */
  minWidth?: number;
  /** 最大宽度 */
  maxWidth?: number;
}

const HANDLE_WIDTH = 4;
const MIN_PANEL = 180;
const MAX_PANEL = 450;

const ResizeHandle: React.FC<ResizeHandleProps> = ({
  side,
  panelWidth,
  onWidthChange,
  minWidth = MIN_PANEL,
  maxWidth = MAX_PANEL,
}) => {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = side === 'left'
        ? e.clientX - startX.current      // 左栏：右移=变宽
        : startX.current - e.clientX;      // 右栏：左移=变宽
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [side, minWidth, maxWidth, onWidthChange]);

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: HANDLE_WIDTH,
        cursor: 'col-resize',
        flexShrink: 0,
        background: 'transparent',
        transition: 'background 0.15s',
        position: 'relative',
        zIndex: 5,
      }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--accent)'; }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
    />
  );
};

export default React.memo(ResizeHandle);
