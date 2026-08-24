/**
 * components/LeftPanel.tsx — 左栏面板 (Phase 3.1)
 *
 * 折叠态: 44px 图标条
 * 展开态: 搜索 → 对话 → 工作区 → (GA) 客户列表可切换
 */
import React, { useEffect, useState } from 'react';
import { useAppStore } from '../stores/app-store';
import { getApiBase } from '../lib/api';

const ICON_ITEMS = [
  { icon: '🔍', label: '搜索', id: 'search' },
  { icon: '💬', label: '对话', id: 'conversations' },
  { icon: '📁', label: '工作区', id: 'workspaces' },
  { icon: '🔔', label: '通知', id: 'notifications' },
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
  const activeOrgId = useAppStore((s) => s.activeOrgId);
  const setActiveOrgId = useAppStore((s) => s.setActiveOrgId);
  const gaClients = useAppStore((s) => s.gaClients);
  const setGaClients = useAppStore((s) => s.setGaClients);

  const [activeSection, setActiveSection] = React.useState('conversations');
  const [clientLoadError, setClientLoadError] = useState<string | null>(null);

  // 加载 GA 客户列表
  useEffect(() => {
    if (userRole === 'ga' && gaClients.length === 0) {
      fetch(`${getApiBase()}/api/ga/clients`)
        .then((r) => r.json())
        .then((d) => { if (d.ok) setGaClients(d.clients); setClientLoadError(null); })
        .catch((err) => { console.warn('[LeftPanel] 加载客户列表失败', err); setClientLoadError('加载客户列表失败，请重试'); });
    }
  }, [userRole, gaClients.length, setGaClients]);

  const handleSwitchOrg = (orgId: string) => {
    fetch(`${getApiBase()}/api/ga/switch/${orgId}`, { method: 'POST' })
      .then(() => {
        setActiveOrgId(orgId);
        setActiveWorkspaceId(null);
      })
      .catch((err) => { console.warn('[LeftPanel] 组织切换失败', err); });
  };

  const filteredConvs = conversations.filter(
    (c) => !searchQuery || c.title.includes(searchQuery),
  );
  const filteredWss = workspaces.filter(
    (w) => !searchQuery || w.title.includes(searchQuery),
  );
  const activeClient = gaClients.find((c) => c.orgId === activeOrgId);

  return (
    <nav className={`panel-left ${open ? 'open' : 'closed'}`}>
      <div className="left-panel-header">
        {ICON_ITEMS.map((item) => (
          <button key={item.id} className="icon-btn" title={item.label}
            onClick={() => setActiveSection(item.id)}
            style={{ background: activeSection === item.id ? 'var(--border)' : undefined }}>
            {item.icon}
          </button>
        ))}
      </div>

      {open && (
        <div className="left-panel-content fade-in">
          {/* 搜索 */}
          <div className="panel-section-title">搜索</div>
          <div className="left-panel-search">
            <input className="left-search-input" type="text"
              placeholder="搜索工作区或对话..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          {/* 对话列表 */}
          <div className="panel-section-title">最近对话</div>
          {filteredConvs.map((conv) => (
            <div key={conv.id} className="panel-item">
              <span className="panel-item-icon">💬</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
                <div style={{ fontSize: 10, color: 'var(--dim)' }}>{conv.preview}</div>
              </div>
            </div>
          ))}

          {/* 工作区列表 */}
          <div className="panel-section-title">工作区</div>
          {filteredWss.map((ws) => (
            <div key={ws.id} className={`panel-item${activeWorkspaceId === ws.id ? ' active' : ''}`}
              onClick={() => setActiveWorkspaceId(ws.id)}>
              <span className="panel-item-icon">📁</span>
              <span>{ws.title}</span>
              {ws.type === 'diagnostic' && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--accent2)' }}>诊断</span>
              )}
            </div>
          ))}

          {/* GA 客户列表 */}
          {userRole === 'ga' && (
            <>
              <div className="panel-section-title">
                客户列表
                {activeClient && (
                  <span style={{ float: 'right', fontSize: 10, color: 'var(--accent2)' }}>
                    {activeClient.name}
                  </span>
                )}
              </div>
              {gaClients.map((client) => (
                <div key={client.orgId}
                  className={`panel-item${activeOrgId === client.orgId ? ' active' : ''}`}
                  onClick={() => handleSwitchOrg(client.orgId)}>
                  <span className="panel-item-icon">🏢</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>{client.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--dim)' }}>{client.industry}</div>
                  </div>
                  {activeOrgId === client.orgId && (
                    <span style={{ fontSize: 10, color: 'var(--green)' }}>●</span>
                  )}
                </div>
              ))}
              {gaClients.length === 0 && (
                <div className="panel-item" style={{ color: clientLoadError ? 'var(--red)' : 'var(--dim)', cursor: 'default' }}>
                  {clientLoadError || '加载客户列表...'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default React.memo(LeftPanel);
