/**
 * components/LeftPanel.tsx — 左栏面板 (Phase 2.1)
 *
 * 折叠态: 44px 图标条
 * 展开态: 搜索输入框 → 对话列表 → 工作区列表 → (GA) 客户列表
 */
import React from 'react';
import { useAppStore } from '../stores/app-store';

const ICON_ITEMS = [
  { icon: '🔍', label: '搜索', id: 'search' },
  { icon: '💬', label: '对话', id: 'conversations' },
  { icon: '📁', label: '工作区', id: 'workspaces' },
  { icon: '🔔', label: '通知', id: 'notifications' },
];

const MOCK_GA_CLIENTS = [
  { id: 'c-1', name: 'Acme Corp', industry: '制造' },
  { id: 'c-2', name: 'TechFlow', industry: '科技' },
  { id: 'c-3', name: '健康之路', industry: '医疗' },
];

const LeftPanel: React.FC = () => {
  const open = useAppStore((s) => s.leftPanelOpen);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const workspaces = useAppStore((s) => s.workspaces);
  const conversations = useAppStore((s) => s.conversations);
  const userRole = useAppStore((s) => s.userRole);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);

  const [activeSection, setActiveSection] = React.useState('conversations');

  const filteredConvs = conversations.filter(
    (c) => !searchQuery || c.title.includes(searchQuery),
  );
  const filteredWss = workspaces.filter(
    (w) => !searchQuery || w.title.includes(searchQuery),
  );

  return (
    <nav className={`panel-left ${open ? 'open' : 'closed'}`}>
      {/* 图标栏 */}
      <div className="left-panel-header">
        {ICON_ITEMS.map((item) => (
          <button
            key={item.id}
            className="icon-btn"
            title={item.label}
            onClick={() => setActiveSection(item.id)}
            style={{
              background: activeSection === item.id ? 'var(--border)' : undefined,
              color: activeSection === item.id ? 'var(--text)' : undefined,
            }}
          >
            {item.icon}
          </button>
        ))}
      </div>

      {/* 展开内容 */}
      {open && (
        <div className="left-panel-content fade-in">
          {/* 搜索 */}
          <div className="panel-section-title">搜索</div>
          <div className="left-panel-search">
            <input
              className="left-search-input"
              type="text"
              placeholder="搜索工作区或对话..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* 对话列表 */}
          <div className="panel-section-title">最近对话</div>
          {filteredConvs.length === 0 && (
            <div className="panel-item" style={{ color: 'var(--dim)', cursor: 'default' }}>
              无匹配对话
            </div>
          )}
          {filteredConvs.map((conv) => (
            <div key={conv.id} className="panel-item">
              <span className="panel-item-icon">💬</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.title}
                </div>
                <div style={{ fontSize: 10, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.preview}
                </div>
              </div>
            </div>
          ))}

          {/* 工作区列表 */}
          <div className="panel-section-title">工作区</div>
          {filteredWss.map((ws) => (
            <div
              key={ws.id}
              className={`panel-item${activeWorkspaceId === ws.id ? ' active' : ''}`}
              onClick={() => setActiveWorkspaceId(ws.id)}
            >
              <span className="panel-item-icon">📁</span>
              <span>{ws.title}</span>
              {ws.type === 'diagnostic' && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent2)' }}>
                  诊断
                </span>
              )}
            </div>
          ))}

          {/* GA 客户列表 */}
          {userRole === 'ga' && (
            <>
              <div className="panel-section-title">客户列表</div>
              {MOCK_GA_CLIENTS.map((client) => (
                <div key={client.id} className="panel-item">
                  <span className="panel-item-icon">🏢</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>{client.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--dim)' }}>{client.industry}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default React.memo(LeftPanel);
