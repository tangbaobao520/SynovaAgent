# SynovaAgent Desktop — 技术实施方案 v1.0

> 2026-07-01 | 基于 SYNOVA-PRD-交互设计-v3-20260701.html | 目标: Claude Code 可直接执行

---

## 零、实施约束

本方案遵循以下工程纪律（来自 AGENTS.md 铁律）：

1. **铁律 0-2: 测试先行 + 接线验收。** spec → test → impl → wire → review → merge。每个 Phase 结束必须通过验收门禁。
2. **铁律 4: 垂直切片交付。** 按用户可见的行为拆，不按技术层拆。每个 Phase 产出可演示的功能。
3. **铁律 7: 确认 Done 标准。** 默认：入口可触达 + 完整链路走通 + 结果可见。
4. **铁律 39: 五层架构边界。** 所有新增模块标注所属层。跨层引用由 pre-commit check-architecture.sh 检测。
5. **铁律 8: Mock/TODO 不留到交付代码。** pre-commit 硬阻断。
6. **铁律 38: as any 零容忍。** pre-commit 硬阻断。

每次提交前运行: `npx tsc --noEmit && npx vitest run`

---

## 一、当前状态审计

| 组件 | 状态 | 位置 | 说明 |
|------|------|------|------|
| Electron 壳 | **存在** | `electron-main.ts` (115行) | 基础托盘 + spawn Express 子进程。无渲染进程。 |
| Express 服务 | **存在** | `src/server.ts` (546行) | 27 条路由已注册。 |
| React 依赖 | **存在** | `package.json` | 当前仅用于 ink TUI。 |
| GraphStore 包 | **已完成** | `packages/graph-store/` | createSynovaGraphStore + 类型导出。Phase 3 已完成。 |
| Evolution 包 | **已完成** | `packages/evolution/` (10文件) | 三层进化引擎 + L3WriteAPI 已接线。 |
| AgentMemoryStore | **存在** | `src/l4/agent-memory-store.ts` (310行) | remember/recall/list/search/forget + FTS5 + 版本链。 |
| Workspace API | **存在** | `src/routes/workspaces-api.ts` (201行) | CRUD + 状态机。 |
| EventBus | **存在** | `src/orchestrator/event-bus.ts` (71行) | 进程内事件系统。 |
| RBAC | **部分** | `src/middleware/rbac.ts` | admin/manager/liaison/staff。**无 GA 角色**。 |
| 通知系统 | **骨架** | `src/notifications/` (3文件) | registry + types + loader。**无推送渠道**。 |
| 落地模式库 | **未创建** | `extensions/implementation-patterns/` | PRD §11.6 和 §20.2 定义了设计。 |
| GA 行为监控 | **未实现** | — | PRD §14.5 定义了 8 条检测规则。 |
| JWT 认证 | **未实现** | — | 当前使用明文 `role:department:userId` Token。 |

---

## 二、目标架构

```
synova-agent/
├── electron-main.ts              # Electron 主进程 (已有，需扩展)
├── electron-renderer/            # [新建] React 渲染进程
│   ├── App.tsx                   # 三栏布局根组件
│   ├── components/
│   │   ├── LeftPanel.tsx         # 工作区列表 + 搜索 + 客户切换
│   │   ├── CenterPanel.tsx       # 对话消息流
│   │   ├── RightPanel.tsx        # 上下文感知面板
│   │   ├── Composer.tsx          # 输入框 (@提及, /命令, 文件拖拽)
│   │   ├── TitleBar.tsx          # 标题栏 (企业名 + 铃铛 + 头像)
│   │   ├── StatusBar.tsx         # 状态栏 (告警数 + 诊断时间 + 在线状态)
│   │   ├── NotificationCenter.tsx # 通知列表面板
│   │   ├── MessageItem.tsx       # 单条消息 (用户/Agent/思考/操作)
│   │   ├── ExpertAttribution.tsx # 专家标识折叠组件
│   │   ├── WelcomeScreen.tsx     # 首次启动欢迎页
│   │   └── EmptyStates.tsx       # 各面板空状态
│   ├── hooks/
│   │   ├── useConversation.ts    # 对话状态管理
│   │   ├── useStreaming.ts       # SSE 流式消息
│   │   ├── useWorkspaces.ts      # 工作区 CRUD
│   │   ├── useNotifications.ts   # 通知轮询
│   │   └── useKeyboard.ts        # 全局快捷键
│   ├── stores/
│   │   └── app-store.ts          # Zustand 全局状态
│   ├── ipc/
│   │   └── bridge.ts             # Electron IPC 桥接
│   └── styles/
│       └── global.css            # 全局样式 (暗色主题)
├── src/
│   ├── server.ts                 # [扩展] WebSocket + SSE 支持
│   ├── middleware/
│   │   ├── rbac.ts               # [扩展] 新增 'ga' 角色
│   │   └── auth.ts               # [新建] JWT 认证中间件
│   ├── routes/
│   │   ├── auth.ts               # [新建] 登录/登出/令牌刷新
│   │   ├── notifications.ts      # [新建] 通知查询/标记已读
│   │   └── ga-admin.ts           # [新建] GA 权限管理/客户分配
│   ├── services/
│   │   ├── audit-service.ts      # [新建] 审计日志服务
│   │   └── behavior-monitor.ts   # [新建] GA 行为异常检测
│   └── l4/
│       └── audit-store.ts        # [新建] 追加型审计日志存储
├── extensions/
│   └── implementation-patterns/  # [新建] 落地模式 JSON 文件
└── packages/
    ├── graph-store/               # [扩展] deleteNode/deleteEdge 加权限检查
    ├── evolution/                 # [已有] 进化引擎
    └── sentinel-engine/           # [已有] 哨兵引擎
```

---

## 三、实施 Phase

### Phase 0: 基础设施 (必须先做)

**目标**: 安全的 API 基础 + Electron 渲染进程启动。

#### 0.1 JWT 认证 + GA 角色

**新文件**: `src/middleware/auth.ts`

```
职责: JWT 签发/验证/刷新。Token 包含 { userId, role, orgId, exp }。
GA 角色的 token.exp 强制 ≤ 合作终止日期。
企业主可 POST /api/auth/revoke 使任何 token 立即失效。
```

**修改文件**: `src/middleware/rbac.ts`
- WorkspaceRole 类型增加 `'ga'`
- `canAccessWorkspace()`: ga 角色等同于 admin 读权限
- `canModifyWorkspace()`: ga 角色不可 deleteNode/deleteEdge

**验收**:
```bash
# 1. GA token 可正常访问 API
curl -H "Authorization: Bearer <ga_token>" http://localhost:3000/api/workspaces

# 2. GA token 无法调用 delete 端点
curl -X DELETE -H "Authorization: Bearer <ga_token>" http://localhost:3000/api/graph/node/xxx
# 预期: 403 Forbidden

# 3. 企业主撤销 token 后 GA 立即无法访问
curl -X POST -H "Authorization: Bearer <owner_token>" http://localhost:3000/api/auth/revoke -d '{"userId":"ga_001"}'
curl -H "Authorization: Bearer <ga_token>" http://localhost:3000/api/workspaces
# 预期: 401 Unauthorized
```

#### 0.2 GraphStore 权限检查

**修改文件**: `packages/graph-store/src/graph-store.ts`

`deleteNode()` 和 `deleteEdge()` 增加调用方身份检查：
- 从请求上下文读取当前用户角色
- 非 'admin' 或 'owner' 角色 → 抛出 `PermissionError`（.code='FORBIDDEN', .phase=4, .retryable=false）
- 即使异常被 catch，操作不执行

#### 0.3 审计日志服务

**新文件**: `src/l4/audit-store.ts`

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,         -- 'node.create' | 'node.delete' | 'threshold.update' | 'diagnosis.trigger'
  target_type TEXT,             -- 'Financial' | 'threshold' | 'diagnosis'
  target_id TEXT,
  old_value TEXT,               -- JSON
  new_value TEXT,               -- JSON
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 仅追加，无 UPDATE/DELETE 权限
```

**新文件**: `src/services/audit-service.ts`

```typescript
export class AuditService {
  static async log(entry: AuditEntry): Promise<void>;        // 所有写操作内部调用
  static async query(orgId: string, filters: AuditFilter): Promise<AuditEntry[]>;
  static async getGAHistory(orgId: string, gaId: string): Promise<AuditEntry[]>;  // 企业主查看 GA 操作
}
```

**验收**:
```bash
# 1. 任何写操作产生审计日志
curl -X POST /api/data/upload ... → audit_log 新增一条记录

# 2. 企业主可查看 GA 操作历史
curl -H "Authorization: Bearer <owner_token>" /api/audit/ga/ga_001
# 预期: 返回该 GA 的所有操作记录

# 3. GA 无法查看审计日志
curl -H "Authorization: Bearer <ga_token>" /api/audit
# 预期: 403 Forbidden
```

#### 0.4 GA 行为监控

**新文件**: `src/services/behavior-monitor.ts`

```typescript
export class BehaviorMonitor {
  // 规则 1: 批量数据修改检测
  static async checkBulkModification(orgId: string, actorId: string): Promise<Alert[]>;

  // 规则 2: 异常时段操作检测
  static async checkOffHoursActivity(orgId: string, actorId: string): Promise<Alert[]>;

  // 规则 3: 快速连续纠错检测
  static async checkRapidCorrections(orgId: string, actorId: string): Promise<Alert[]>;

  // 规则 4: 系统性下调阈值检测
  static async checkThresholdManipulation(orgId: string, actorId: string): Promise<Alert[]>;

  // 规则 5-8: (见 PRD §14.5)

  // 统一入口: 每次审计日志写入后异步调用
  static async evaluate(entry: AuditEntry): Promise<void> {
    // 检查所有规则 → 触发告警 → 通知企业主/企业对接人/Synova官方
  }
}
```

**验收**:
```bash
# 1. GA 30分钟内纠错 5 条专家结论 → 触发告警
# 预期: 企业主和企业对接人收到通知

# 2. GA 24小时内下调 4 个哨兵阈值 >30% → 触发严重告警
# 预期: 企业主、对接人、Synova 官方均收到通知
```

#### 0.5 Electron 渲染进程启动

**新建目录**: `electron-renderer/`

```bash
npm install --save-dev vite @vitejs/plugin-react
npm install zustand react-markdown
```

**新文件**: `electron-renderer/App.tsx`
- 三栏布局根组件
- 面板可折叠状态由 Zustand store 管理

**修改文件**: `electron-main.ts`
- 加载 `electron-renderer/index.html` 而非打开浏览器
- 增加 IPC 通道: `window:minimize-to-tray`, `notification:click`

**验收**:
```bash
npm run electron:dev
# 预期: Electron 窗口打开，显示空白三栏布局。左栏和中栏可分别收起。
# Ctrl+B 切换左栏。Ctrl+J 切换右栏。
```

---

### Phase 0 验收门禁

```bash
# 全部通过才能进入 Phase 1
grep -rn "TODO\|FIXME\|HACK" electron-renderer/src/ src/middleware/auth.ts src/services/ && echo "FAIL: TODOs found" || echo "PASS"
grep -rn "as any" electron-renderer/src/ src/middleware/ src/services/ && echo "FAIL: as any found" || echo "PASS"
npx tsc --noEmit
npx vitest run
```


---

### Phase 1: 欢迎页 + 对话消息系统

**目标**: 用户双击打开 → 看到欢迎页 → 输入企业信息 → 进入对话界面 → 发送消息 → 收到流式回复。

#### 1.1 欢迎页

**新文件**: `electron-renderer/components/WelcomeScreen.tsx`

参考 PRD §16 的首次引导设计。三态：
1. 首次启动（无企业配置）→ 完整欢迎页
2. 有企业配置但无数据 → 提示上传数据或进入演示模式
3. 一切就绪 → 直接进入主界面

欢迎页文案使用 PRD §3 定义的版本："你好，我是 Synova。我是你企业的 AI 免疫系统..."

**演示模式实现**:
- 跳过数据上传 → 加载 `extensions/demo/maternal-infant/` 示例数据
- GraphStore 写入示例节点（母婴行业 Financial/Goal/Team/Person）
- 哨兵预运行一次，缓存结果
- 水印："演示模式 - 数据为示例"

#### 1.2 消息组件

**新文件**: `electron-renderer/components/MessageItem.tsx`

```
每条消息的状态:
  UserMessage:    { role: 'user', content, timestamp }
  ThinkingBlock:  { type: 'thinking', experts: ['finance','strategy'], collapsed: true }
  AgentMessage:   { role: 'assistant', content, expertAttribution, actions }
  SystemMessage:  { type: 'system', content }  // "诊断完成"等
```

**新文件**: `electron-renderer/components/ExpertAttribution.tsx`
- 默认折叠。展开显示每位专家的方法论和置信度。
- 点击"展开完整推理链" → 右栏切换到专家推理视图。

**新文件**: `electron-renderer/hooks/useStreaming.ts`
- SSE 连接 `/api/diagnosis/stream`
- 每个 token 追加到当前消息
- 流式完成后追加专家标识

**修改文件**: `src/routes/diagnosis.ts`
- 确保 SSE 端点返回 JSON lines 格式: `data: {"type":"token","content":"应"}\n\n`

#### 1.3 输入框

**新文件**: `electron-renderer/components/Composer.tsx`

功能:
- 多行文本。Enter 发送，Shift+Enter 换行。
- `@` 触发弹窗: 搜索专家/工作区名称。选中后以 tag 形式插入输入框。
- `/` 触发弹窗: 命令列表（/诊断、/摘要、/导出、/方案）。选中后以特殊格式发送。
- 文件拖拽到输入框区域: 触发 `onDrop` → 调用 `/api/data/upload` → 显示字段映射预览 → 确认上传。
- 粘贴图片: `Ctrl+V` 检测剪贴板图片 → base64 编码 → 作为附件发送。

#### 1.4 快捷键

**新文件**: `electron-renderer/hooks/useKeyboard.ts`

```typescript
export function useKeyboard(handlers: KeyboardHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); handlers.openCommandPalette(); }
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); handlers.toggleLeftPanel(); }
      if (e.ctrlKey && e.key === 'j') { e.preventDefault(); handlers.toggleRightPanel(); }
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); handlers.searchConversation(); }
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); handlers.newWorkspace(); }
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handlers.sendMessage(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlers]);
}
```

#### Phase 1 验收门禁

```bash
# 1. 欢迎页渲染正确
# 预期: 首次启动 → 看到"你好，我是 Synova..."欢迎文案

# 2. 演示模式
# 预期: 跳过数据上传 → 加载示例数据 → 进入主界面 → 左栏有预创建的工作区

# 3. 对话消息流
# 预期: 输入"为什么现金流在恶化？" → 看到思考块(折叠) → 文字逐字出现 → 专家标识追加

# 4. 快捷键
# 预期: Ctrl+B 切换左栏。Ctrl+J 切换右栏。Ctrl+K 打开命令面板。

# 5. @提及
# 预期: 输入 @ → 弹出专家列表 → 选择"财务顾问" → 输入框出现 @财务顾问 tag

# 6. 代码质量
grep -rn "as any" electron-renderer/ && echo "FAIL" || echo "PASS"
npx tsc --noEmit && npx vitest run
```

---

### Phase 2: 三栏面板 + 上下文感知右栏

**目标**: 面板可折叠、可拖拽。右栏内容根据角色和上下文自动切换。

#### 2.1 面板组件

**新文件**: `electron-renderer/components/LeftPanel.tsx`

折叠态: 40px 宽图标条。四个图标: 工作区、客户切换(GA)、搜索、通知。
展开态: 240px。从上到下: 全局搜索 → 会话历史 → 工作区列表 → (GA专属)客户列表。
面板宽度可拖拽。最小 180px，最大 450px。拖到 <100px 时自动收起。

**新文件**: `electron-renderer/components/RightPanel.tsx`

根据 `userRole + currentContext` 渲染不同内容。参见 PRD §4.3 的完整矩阵。

实现关键:
```typescript
function resolveRightPanelView(role: string, workspaceId: string | null): PanelView {
  if (!workspaceId) {
    // 无工作区选中: 全局视图
    return GLOBAL_VIEWS[role];
  }
  // 有工作区选中: 角色定制视图
  return WORKSPACE_VIEWS[role];
}
```

GA 的右栏有三个可切换标签: 行动跟踪 / 哨兵数据 / 落地模式。

#### 2.2 全局命令面板

**新文件**: `electron-renderer/components/CommandPalette.tsx`

`Ctrl+K` 打开。输入关键词实时搜索:
- 工作区（标题匹配）
- 对话历史（FTS5 全文检索，调用 `/api/search/conversations`）
- 命令（/诊断、/摘要、/导出、/方案）
- 哨兵数据（sentinelId 匹配）

#### 2.3 通知中心

**新文件**: `electron-renderer/components/NotificationCenter.tsx`

标题栏铃铛图标。点击展开通知列表面板。显示最近 20 条通知。按优先级排序（紧急告警 → 方案更新 → 诊断完成 → 纠错通知）。

通知数据结构:
```typescript
interface AppNotification {
  id: string;
  type: 'alert' | 'update' | 'complete' | 'correction';
  priority: 'critical' | 'warning' | 'info';
  title: string;
  body: string;
  workspaceId?: string;  // 点击跳转到相关工作区
  createdAt: string;
  read: boolean;
}
```

**新文件**: `src/routes/notifications.ts`
- GET `/api/notifications` — 获取当前用户的通知列表
- POST `/api/notifications/:id/read` — 标记已读
- POST `/api/notifications/read-all` — 全部标记已读

#### Phase 2 验收门禁

```bash
# 1. 面板折叠
# 预期: Ctrl+B → 左栏收起到图标条。Ctrl+B → 展开。拖拽中间分隔线 → 宽度变化。

# 2. 右栏切换
# 预期: GA 选中工作区 → 右栏显示三个标签。对接人选中工作区 → 右栏显示行动清单。

# 3. 命令面板
# 预期: Ctrl+K → 输入"现金流" → 列出匹配的工作区和对话。

# 4. 通知中心
# 预期: 触发一条哨兵告警 → 铃铛出现红点 → 点击展开通知列表 → 点击通知跳转到工作区。
```

---

### Phase 3: GA 管理功能

**目标**: GA 可管理多个客户、审阅专家结论、生成落地方案。权限边界物理阻断。

#### 3.1 客户管理

**修改文件**: `electron-renderer/components/LeftPanel.tsx`

GA 左栏底部: 客户列表。点击切换 → 全局状态 `activeOrgId` 变化 → 所有组件重新加载该客户的数据。

**新文件**: `src/routes/ga-admin.ts`
- GET `/api/ga/clients` — GA 管理的客户列表
- POST `/api/ga/clients` — 新增客户（需要企业主授权码）
- POST `/api/ga/switch/:orgId` — 切换当前活跃客户

#### 3.2 专家仪表盘

**修改文件**: `electron-renderer/components/RightPanel.tsx`

GA 在无工作区选中时，右栏显示客户仪表盘: 飞轮转速 + 活跃告警 + 待审阅方案。

GA 在工作区内，右栏可切换到"哨兵数据"视图: compute 函数输入值、公式、阈值对比、历史趋势。

#### 3.3 纠错叠加层

**修改文件**: `src/l3/expert-dispatcher.ts`

GA 纠错时:
- 不修改原始 ExpertReport
- 写入 AgentMemoryStore (type: 'ga_correction', source: 'ga:{gaId}')
- 原始报告的 `supersededBy` 指向纠错记录
- 后续读取时: 先查原始报告 → 再查纠错叠加层 → 合并展示

#### 3.4 方案工作台

**新文件**: `extensions/implementation-patterns/info-distortion.json`

```
见 PRD §20.2 的设计。第一个文件: info-distortion.json
```

**修改文件**: `electron-renderer/components/RightPanel.tsx`

GA 点击 [生成落地方案] → 系统:
1. 读取当前工作区关联的哨兵 finding
2. 匹配 extensions/implementation-patterns/ 中的模式
3. 组装 skill 清单 + 数据依赖 + 字段覆盖度
4. 右栏渲染方案预览
5. GA 校准 → 确认 → 推送给对接人

#### Phase 3 验收门禁

```bash
# 1. GA 切换客户
# 预期: 点击客户B → 工作区列表和对话历史全部切换。

# 2. GA 纠错
# 预期: GA 纠错"市场定位"结论 → 原始报告保留 → 纠错记录写入 AgentMemoryStore。

# 3. GA 无法删除数据
# 预期: GA 调用 deleteNode → 403 Forbidden。

# 4. GA 行为监控
# 预期: GA 24小时内下调 4 个阈值 → 企业主收到告警通知。
```


---

### Phase 4: 系统托盘 + 通知推送 + 老板信箱

**目标**: 关闭窗口不退出应用。系统托盘角标。critical 告警 → 系统通知弹出。

#### 4.1 系统托盘增强

**修改文件**: `electron-main.ts`

- 托盘图标根据状态变化: 绿色(normal) / 橙色(unread) / 红色(critical)
- 未读角标: `tray.setToolTip('Synova - 3条未读通知')`
- 右键菜单: 打开主窗口、今日摘要、暂停通知2小时、暂停至明早8:00、退出
- 关闭窗口 → `event.preventDefault()` → `win.hide()` (不退出)
- 窗口关闭时如果哨兵检测到 critical 告警 → 系统通知

#### 4.2 通知推送渠道

**修改文件**: `src/notifications/notification-loader.ts`

增加推送渠道:
- `electron`: 通过 IPC 发送通知到渲染进程
- `im`: 飞书/钉钉 webhook (Phase 5)

**新增依赖**: `electron-notifications` 或使用 Electron 原生 `Notification` API

#### 4.3 老板信箱推送

**修改文件**: `src/agent/boss-mailbox.ts`

每周一早 8:00 Cron 触发:
1. 聚合本周所有哨兵信号
2. 生成邮件文本（格式见 PRD §15.2）
3. 调用通知渠道发送

**新增文件**: `src/services/email-service.ts`
- 邮件发送使用 nodemailer
- 配置存储在 AgentMemoryStore (type: 'enterprise_fact', key: 'email_config')

#### Phase 4 验收门禁

```bash
# 1. 系统托盘
# 预期: 关闭窗口 → 应用最小化到托盘 → 右键菜单出现。

# 2. 通知弹出
# 预期: 触发 critical 哨兵告警 → 系统通知弹出 + 托盘变红。

# 3. 免打扰
# 预期: 右键 → 暂停通知2小时 → 期间无弹窗 → 2小时后恢复。

# 4. 老板信箱
# 预期: 手动触发 Cron → 生成邮件文本 → 日志记录发送成功。
```

---

### Phase 5: IM 接入 + 多专家记忆 + 工具隔离

**目标**: 企业主/部门负责人在飞书中 @Synova 即可对话。专家记忆标注归属。专家工具调用有权限隔离。

#### 5.1 IM 接入

**修改文件**: `src/routes/im.ts`

- POST `/api/im/webhook` — 接收飞书/钉钉消息
- 解析 @Synova 提及 → 提取消息文本 → 创建对话 → 异步返回
- 回复通过飞书 webhook 返回

#### 5.2 多专家记忆归属

**修改文件**: `src/l4/agent-memory-store.ts`

MemoryType 枚举增加: `'expert_finding'`, `'ga_correction'`, `'cross_validation'`

所有记忆写入时增加 `source` 字段强制。source 格式:
- `'expert:finance'` — 专家产生
- `'ga:zhang_san'` — GA 操作
- `'sentinel:F1'` — 哨兵运行
- `'user_feedback'` — 用户反馈

#### 5.3 专家工具隔离

**修改文件**: `src/l3/expert-dispatcher.ts`

`runExpert()` 调用前:
1. 读取 expert-registry.yaml 中该专家的 `tools` 声明
2. 构建 ToolRegistry 的子集（仅包含声明的工具）
3. 将该子集注入 ExpertAutonomyEngine

跨专家工具调用: strategy 请求 finance 的工具 → 通过 `crossReferences` 调度 → 不直接调用。

#### Phase 5 验收门禁

```bash
# 1. IM 对话
# 预期: 飞书中 @Synova "现金流怎么样？" → 收到 Agent 回复。

# 2. 记忆归属
# 预期: finance 专家产生结论 → AgentMemoryStore 中 source='expert:finance'。

# 3. 工具隔离
# 预期: strategy 专家调用 cashflow_analysis → 403 或返回聚合值。
```

---

### Phase 6: 落地模式库 + 文件化扩展

**目标**: 新增哨兵自动匹配落地模式。GA 生成方案的完整链路打通。

#### 6.1 落地模式库

**新文件**: `extensions/implementation-patterns/`

为现有 46 哨兵中最重要的 10 个创建落地模式 JSON。格式见 PRD §20.2。

**修改文件**: `src/services/pattern-matcher.ts`

```typescript
export function matchPatterns(finding: SentinelFinding): ImplementationPattern[] {
  // 读取 extensions/implementation-patterns/*.json
  // 按 sentinelId 匹配
  // 返回匹配的落地模式
}
```

#### 6.2 方案生成链路

GA 点击 [生成落地方案]:
1. `matchPatterns()` 获取匹配的落地模式
2. 查询企业当前数据字段覆盖度
3. 对比模式的 dataDependencies → 标记缺失项
4. 渲染方案预览
5. GA 确认 → 方案写入 AgentMemoryStore (type: 'implementation_plan')
6. 推送对接人
7. 方案关联的 action items 自动创建到右栏

#### Phase 6 验收门禁

```bash
# 1. 落地模式匹配
# 预期: 现金流预警工作区 → [生成方案] → 返回催收提醒 Agent 的落地模式。

# 2. 方案推送
# 预期: GA 确认方案 → 对接人右栏出现方案行动项。

# 3. 文件化扩展
# 预期: 新增一个落地模式 JSON 文件 → 重启后对新哨兵生效。
```

---

## 四、前后端接口契约

### 4.1 对话接口

```
POST /api/conversation/message
  Body: { workspaceId?: string, content: string, mentions?: string[], command?: string }
  Response: SSE stream
    data: {"type":"thinking","experts":["finance"]}
    data: {"type":"token","content":"应"}
    data: {"type":"token","content":"收"}
    ...
    data: {"type":"done","messageId":"msg_xxx","expertAttribution":{...}}
```

### 4.2 工作区接口

```
GET    /api/workspaces                          # 列表
POST   /api/workspaces                          # 创建
GET    /api/workspaces/:id                       # 详情 (含对话历史)
PATCH  /api/workspaces/:id                       # 更新状态
DELETE /api/workspaces/:id                       # 归档
POST   /api/workspaces/:id/messages              # 发送消息
```

### 4.3 通知接口

```
GET    /api/notifications                        # 列表
POST   /api/notifications/:id/read               # 标记已读
POST   /api/notifications/read-all               # 全部已读
GET    /api/notifications/unread-count           # 未读数
```

### 4.4 GA 接口

```
GET    /api/ga/clients                           # 客户列表
POST   /api/ga/clients                           # 新增客户
POST   /api/ga/clients/:orgId/switch             # 切换活跃客户
GET    /api/ga/clients/:orgId/dashboard          # 客户仪表盘
POST   /api/ga/corrections                       # 提交纠错
GET    /api/ga/patterns/:sentinelId              # 落地模式匹配
POST   /api/ga/plans                             # 生成落地方案
```

### 4.5 审计接口 (企业主专属)

```
GET    /api/audit?orgId=&actorId=&action=&limit=  # 查询审计日志
GET    /api/audit/ga/:gaId                         # 指定GA操作历史
GET    /api/audit/alerts                           # GA行为告警记录
```

---

## 五、数据流完整链路

```
用户双击打开 Electron 应用
  → WelcomeScreen 检查企业配置
  → 首次: 填写企业名+行业 → POST /api/onboarding → GraphStore 初始化
  → 进入主界面: 三栏布局
  → 用户输入消息 → POST /api/conversation/message
    → L2 ConversationEngine.processMessageStream()
      → ExpertRouter.route() 确定专家
      → ExpertDispatcher.runExpert() LLM 推理
      → SSE 流式返回 token
  → 左栏更新工作区列表
  → 右栏根据角色+上下文更新
  → 如有 critical 告警:
    → 系统托盘红色角标
    → 系统通知弹出
    → 铃铛图标红点
```

---

## 六、风险与缓解

| 风险 | 缓解 |
|------|------|
| Electron + React 渲染性能 | 虚拟滚动消息列表 (react-window)。消息超过 100 条时分页加载。 |
| SSE 连接中断 | 自动重连 (指数退避, 最多 5 次)。重连后从最后收到的 messageId 续传。 |
| SQLite 并发写入 | better-sqlite3 是同步的。写操作通过队列串行化。Node.js 单线程天然保护。 |
| GA 权限遗漏 | Phase 0 的审计日志 + 行为监控覆盖所有写操作。新增端点必须在 audit-service 注册。 |
| 演示模式数据泄露 | 演示模式下禁止导出、禁止 API 外部访问。水印全局显示。 |

---

## 七、文件清单

| Phase | 新建文件 | 修改文件 |
|-------|---------|---------|
| 0 | `src/middleware/auth.ts`, `src/l4/audit-store.ts`, `src/services/audit-service.ts`, `src/services/behavior-monitor.ts`, `electron-renderer/` (完整目录) | `src/middleware/rbac.ts`, `packages/graph-store/src/graph-store.ts`, `electron-main.ts` |
| 1 | `electron-renderer/components/WelcomeScreen.tsx`, `MessageItem.tsx`, `ExpertAttribution.tsx`, `Composer.tsx`, `hooks/useStreaming.ts`, `hooks/useKeyboard.ts`, `stores/app-store.ts` | `src/routes/diagnosis.ts` |
| 2 | `electron-renderer/components/LeftPanel.tsx`, `RightPanel.tsx`, `CommandPalette.tsx`, `NotificationCenter.tsx`, `src/routes/notifications.ts` | — |
| 3 | `src/routes/ga-admin.ts`, `extensions/implementation-patterns/` | `electron-renderer/components/RightPanel.tsx`, `src/l3/expert-dispatcher.ts` |
| 4 | `src/services/email-service.ts` | `electron-main.ts`, `src/notifications/notification-loader.ts`, `src/agent/boss-mailbox.ts` |
| 5 | — | `src/routes/im.ts`, `src/l4/agent-memory-store.ts`, `src/l3/expert-dispatcher.ts` |
| 6 | `extensions/implementation-patterns/*.json`, `src/services/pattern-matcher.ts` | `electron-renderer/components/RightPanel.tsx` |
