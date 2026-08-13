# SynovaAgent — P0/P1 紧急修复实施方案 v1.0

> 2026-07-06 | 基于 2026-07-05 全量审计 (8/8 实施文档审计完成)
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在，不是"我相信会有人调"）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38 — pre-commit 硬阻断）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-06 确认）

- 分支: `feat/prompt-architecture`
- Loop Engineering: V4.4.0, pre-commit 8 组硬阻断生效
- 哨兵/计算函数/本体层/边类型: **暂停重构，本方案不涉及**
- synova-session-02 worktree: 152KB 对标补全代码待合并

---

## Phase 1: 铁律违规修复（6 个文件，2h）

### 1.1 LeftPanel.tsx — 2 处空 catch 无 log

**文件**: `electron-renderer/src/components/LeftPanel.tsx`
**违规**: L39 `.catch(() => {})` · L44 `fetch(...).catch(() => {})` — 铁律 11/24
**影响**: 客户列表加载失败 → 用户永久看到"加载客户列表..."。组织切换失败 → UI 与后端脱节。

**修复规则**:
- 每个 `.catch(() => {})` 改为 `.catch((err: unknown) => { log.warn(...); ... })`
- 必须导入: `import { createLogger } from '@synova/logger'`（如果尚未导入）
- L39（客户列表加载失败）: catch 内设置 `setError('加载客户列表失败，请重试')`，前端展示错误提示而非永久 loading
- L44（组织切换失败）: catch 内不执行 `setActiveOrgId` 和 `setActiveWorkspaceId(null)`——状态不变。展示 toast 错误提示

**验收**:
```
# 模拟 fetch 失败
预期: 不再静默失败 → 显示错误提示 → 不会永久 loading
# grep 确认
grep -rn "\.catch(() => {})" electron-renderer/src/components/LeftPanel.tsx
预期: 零结果
```

### 1.2 CenterPanel.tsx — 1 处 as any

**文件**: `electron-renderer/src/components/CenterPanel.tsx`
**违规**: L78 `(msg as any)._id` — 铁律 38
**根因**: `ChatMessage` 联合类型不含 `_id` 字段。运行时 `conversation-store.ts` 通过 `as ChatMessage & { _id: number }` 强制添加。

**修复规则**（两步，缺一不可）:
1. 在 `electron-renderer/src/types/chat.ts` 中给 `ChatMessage` 类型添加 `_id?: number`
2. 回到 CenterPanel.tsx 删除 `as any`，改为 `msg._id`

**验收**:
```
grep -rn "as any" electron-renderer/src/components/CenterPanel.tsx
预期: 零结果
```

### 1.3 RightPanel.tsx — 1 处空 catch 无 log

**文件**: `electron-renderer/src/components/RightPanel.tsx`
**违规**: L142 `} catch {` 后直接 `return null` — 铁律 24
**影响**: `apiFetch` 是整个 RightPanel 数据加载的唯一路径。网络错误、JSON 解析失败、服务端 500 全部静默返回 null。

**修复规则**:
- `} catch {` 改为 `} catch (err: unknown) { log.warn({ err }, 'apiFetch failed'); return null; }`
- 调用方 (L185, L201, L214) 在 `res === null` 时需设置 `setDegraded(true)`。当前只检查 `res?.ok`，null 直接跳过无反馈
- 必须导入 logger

**验收**:
```
# 模拟网络断连
预期: 右栏显示降级提示 "数据加载失败，请检查网络" 而非白屏
# grep 确认
grep -rn "catch {" electron-renderer/src/components/RightPanel.tsx | grep -v "catch (err"
预期: 零结果
```

### 1.4 im-channel.ts — 2 处 catch(err: any)

**文件**: `src/l1/im-channel.ts`
**违规**: L94 `catch (err: any)` · L122 `catch (err: any)` — 铁律 38

**修复规则**:
- `catch (err: any)` 改为 `catch (err: unknown)`
- catch 块内使用 `err instanceof Error ? err.message : String(err)` 安全访问
- 两个 catch 已有 `log.warn`，保留

**验收**:
```
grep -rn "err: any" src/l1/im-channel.ts
预期: 零结果
```

### 1.5 MessageItem.tsx — 1 处空 catch 无 log

**文件**: `electron-renderer/src/components/MessageItem.tsx`
**违规**: L80 `} catch { return ''; }` — 铁律 24

**修复规则**:
- `} catch {` 改为 `} catch { log.warn('date format failed'); return ''; }`
- 必须导入 logger

---

## Phase 2: 通知系统打通（3 个文件，4h）

### 2.1 新建 notification API 路由

**文件**: `src/routes/notifications.ts`（新建）— L1 交互层

**端点**:
```
GET    /api/notifications              — 列表（支持 ?unread=true 过滤）
POST   /api/notifications/:id/read     — 标记已读
POST   /api/notifications/read-all     — 全部已读
GET    /api/notifications/unread-count — 未读数
```

**数据来源**: 第一阶段从 `AgentMemoryStore` 读取 type=`sentinel_finding` 的记录，按 orgId + severity 过滤。

**接线**: `src/server.ts` — `app.use('/api/notifications', notificationsRoutes)`

**验收**:
```
curl http://localhost:3000/api/notifications
预期: 200, 返回 JSON 数组
curl http://localhost:3000/api/notifications/unread-count
预期: 200, { count: N }
```

### 2.2 前端 useNotifications hook

**文件**: `electron-renderer/src/hooks/useNotifications.ts`（新建）

调用 `GET /api/notifications`，30s 轮询。管理 unreadCount 状态，提供给 NotificationCenter 和 TitleBar 铃铛使用。替换当前 MOCK_NOTIFICATIONS。

### 2.3 通知点击导航

**文件**: `electron-renderer/src/components/NotificationCenter.tsx`

`onClick` 处理器（L92-95）当前只调 `markAsRead`，不使用 `n.workspaceId`。修复：调用 `setActiveWorkspaceId(n.workspaceId)` → 跳转到相关哨兵告警的工作区。

---

## Phase 3: 对标补全代码合并（1 个操作，2h）

**源**: `D:\novis-backup-20260526\synova-session-02`

**独有代码清单**:
| 文件 | 说明 |
|------|------|
| `src/orchestrator/context-engine.ts` | G1 上下文引擎，已接线 |
| `src/services/escalation-engine.ts` | G3 升级链，已接线 |
| `src/l3/tool-guard.ts` | G4 工具守卫，已接线 |
| `src/agent/tool-loop-executor.ts` | G4 接线修改 |
| `tests/orchestrator/context-engine.test.ts` | 22 tests |
| `tests/services/escalation-engine.test.ts` | 22 tests |
| `tests/l3/tool-guard.test.ts` | 19 tests |
| `extensions/context-strategies/default.json` | G1 配置 |
| `extensions/policies/escalation-rules.json` | G3 配置 |
| `extensions/frameworks/fts5-cjk-tokenizer.json` | G5 配置 |
| `tests/fixtures/jsonl-runner.ts` | G6 |
| `tests/fixtures/jsonl/sample-diagnosis.jsonl` | G6 |

**执行**:
```
cd D:\novis-backup-20260526\synova-session-02
git add [以上全部文件]
git commit -m "feat(benchmark): Phase G1/G3/G4/G5/G6 — 对标补全全部交付"
```
然后在主仓库合并。

**注意**: 不合并 V4.4.0 Loop Engineering 变更（scripts/memory/AGENTS.md 修改）。

---

## Phase 4: 零调用方接线（5 个文件，6h）

### 4.1 rate-limit.ts → server.ts

**文件**: `src/middleware/rate-limit.ts`
**当前**: 142 行，`createFixedWindowLimiter` 已导出，零调用方。
**接线**: 在 `src/server.ts` 中: `import { createFixedWindowLimiter } from './middleware/rate-limit'; app.use(createFixedWindowLimiter(100, 60000));`

### 4.2 config-recovery.ts → server.ts 启动流程

**文件**: `src/services/config-recovery.ts`
**接线**: 在 `src/server.ts` 启动流程中，数据库初始化后调用 `restoreConfig()`. 失败降级默认配置。

### 4.3 command-lanes.ts → synova-agent.ts

**文件**: `src/infra/command-lanes.ts`
**接线**: 在 `src/agent/synova-agent.ts` 工具执行路径中，用 `CommandLane` 包装高风险工具调用。

### 4.4 schema-migration.ts → engine-context.ts

**文件**: `src/store/schema-migration.ts`
**接线**: 在 `src/init/engine-context.ts` 数据库初始化后调用 `migrateSchema(db)`。

### 4.5 memory-monitor.ts → server.ts

**文件**: `src/services/memory-monitor.ts`
**接线**: 在 `src/server.ts` 启动后: `setInterval(() => memoryMonitor.check(), 60000)`。

### 4.6 migration-validator.ts — 标记为工具，不接线

**文件**: `src/l4/migration-validator.ts`
**决策**: 不接入生产路径。在文件头部添加注释: `// 一次性工具: compute 函数迁移验证。Phase 3 哨兵迁移时手动调用。`

---

## Phase 5: 前端功能补全（4 个文件，6h）

### 5.1 useConversation hook

**文件**: `electron-renderer/src/hooks/useConversation.ts`（新建）
封装 `sendMessage`/`messages`/`isStreaming`/`addMessage`。CenterPanel 和 Composer 共用。

### 5.2 useWorkspaces hook

**文件**: `electron-renderer/src/hooks/useWorkspaces.ts`（新建）
封装 workspaces CRUD。LeftPanel 和 CommandPalette 共用。

### 5.3 Markdown 渲染

`cd electron-renderer && npm install react-markdown`
`MessageItem.tsx` 中 AgentMessage 分支通过 `<ReactMarkdown>{content}</ReactMarkdown>` 渲染。

### 5.4 IME 组合态

**文件**: `electron-renderer/src/components/Composer.tsx`
添加 `isComposing` state。`onCompositionStart → true`, `onCompositionEnd → false`。`handleKeyDown` 中 `if (isComposing) return`。

---

## 实施优先级与并行策略

| 顺序 | Phase | 工时 | 可并行 |
|:---:|-------|:---:|:---:|
| 1 | Phase 1: 铁律修复 | 2h | ✅ |
| 2 | Phase 3: 对标补全合并 | 2h | ✅ |
| 3 | Phase 2: 通知系统 | 4h | ✅ |
| 4 | Phase 4: 零调用方接线 | 6h | ✅ |
| 5 | Phase 5: 前端补全 | 6h | ✅ |

**总工时: 20h（约 3 个工作日）。全部 5 个 Phase 可并行启动——写集合均不重叠。**

---

## 完成标准

```
[ ] Phase 1: grep "as any" electron-renderer/ = 0
[ ] Phase 1: grep "\.catch(() => {})" electron-renderer/ = 0
[ ] Phase 1: grep "catch {" electron-renderer/ 全部有 log.warn/error
[ ] Phase 1: grep "err: any" src/l1/im-channel.ts = 0
[ ] Phase 2: curl /api/notifications → 200
[ ] Phase 2: 通知点击 → 导航到工作区
[ ] Phase 3: context-engine/escalation-engine/tool-guard 在主仓库 src/ 下存在
[ ] Phase 4: rate-limit 在 server.ts 中有 app.use 调用
[ ] Phase 4: config-recovery 在启动流程中被调用
[ ] Phase 4: memory-monitor 有 setInterval 调用
[ ] Phase 5: Agent 消息渲染 Markdown（**bold** → 粗体）
[ ] Phase 5: 中文输入 Enter 选字不误发送
[ ] npx tsc --noEmit 零错误
[ ] npx vitest run 全部通过
```

**设计文档**: 本方案整合了 DESKTOP-IMPL-v1、BENCHMARK-GAP-IMPL-v1、运行时卓越-IMPL-v1 三份审计的 P0/P1 发现。