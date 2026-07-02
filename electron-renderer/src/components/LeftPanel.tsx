/**
 * components/LeftPanel.tsx — 左栏面板
 *
 * 折叠态：40px 图标条（搜索、工作区、通知、设置）
 * 展开态：240px 面板（全局搜索 → 会话历史 → 工作区列表）
 *
 * 支持 Ctrl+B 快捷键切换折叠/展开。
 */
import React from 'react';
import { useAppStore } from '../stores/app-store';

const iconItems = [
  { icon: '🔍', label: '搜索', id: 'search' },
  { icon: '💬', label: '对话', id: 'conversations' },
  { icon: '📁', label: '工作区', id: 'workspaces' },
  { icon: '🔔', label: '通知', id: 'notifications' },
];

const LeftPanel: React.FC = () => {
  const open = useAppStore((s) => s.leftPanelOpen);
  const [activeItem, setActiveItem] = React.useState('conversations');

  return (
    <nav className={`panel-left ${open ? 'open' : 'closed'}`}>
      {/* Header 区域：展开时显示标题，折叠时显示图标按钮 */}
      <div className="left-panel-header">
        {iconItems.slice(0, 4).map((item) => (
          <button
            key={item.id}
            className="icon-btn"
            title={item.label}
            onClick={() => setActiveItem(item.id)}
            style={{
              background: activeItem === item.id ? 'var(--border)' : undefined,
              color: activeItem === item.id ? 'var(--text)' : undefined,
            }}
          >
            {item.icon}
          </button>
        ))}
      </div>

      {/* 展开时的详细内容 */}
      {open && (
        <div className="left-panel-content fade-in">
          {/* 全局搜索 */}
          <div className="panel-section-title">搜索</div>
          <div
            className="panel-item"
            style={{ background: 'var(--input)', margin: '0 0 8px', cursor: 'default' }}
          >
            <span className="panel-item-icon">🔍</span>
            <span style={{ color: 'var(--dim)', fontSize: 12 }}>
              搜索工作区或对话...
            </span>
          </div>

          {/* 会话历史 */}
          <div className="panel-section-title">最近对话</div>
          <div className="panel-item" onClick={() => setActiveItem('conv1')}>
            <span className="panel-item-icon">💬</span>
            <span>为什么现金流在恶化？</span>
          </div>
          <div className="panel-item" onClick={() => setActiveItem('conv2')}>
            <span className="panel-item-icon">💬</span>
            <span>团队协作分析</span>
          </div>

          {/* 工作区列表 */}
          <div className="panel-section-title">工作区</div>
          <div className="panel-item" onClick={() => setActiveItem('ws1')}>
            <span className="panel-item-icon">📁</span>
            <span>默认工作区</span>
          </div>
          <div className="panel-item" onClick={() => setActiveItem('ws2')}>
            <span className="panel-item-icon">📁</span>
            <span>财务诊断</span>
          </div>
        </div>
      )}
    </nav>
  );
};

export default React.memo(LeftPanel);
