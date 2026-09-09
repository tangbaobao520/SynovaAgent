# Task Brief: D602 交互卡片呈现 + preload/IPC 收敛 + 通知 error 消费

> Spec（编码唯一契约）: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D602-interactive-cards-preload-20260908.md
> 分支: feat/d602-interactive-cards-preload（worktree .synova-wt-d602，基线 origin/main@92b094de）
> 日期: 2026-09-09

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = AI 诊断 Agent。本任务在 L1 交互层桌面壳（electron/ 主进程 + electron-renderer/ 渲染进程），
是 L1 审计 Phase 2 的 IPC/通知/卡片收尾棒（原审计编号 D594，派单改号 D602）。后端零改动——
工单状态机（D580）/ tickets+transition 端点 / D590+D593 白名单全部现成。写集全部在
electron/* + electron-renderer/src/* + tests/electron/*（spec §5.1：8 修改 + 2 新建 + 1 删除）。

### b) 文件审计
- electron/preload.cjs 13 行 2 方法（getServerUrl/getConfig，全文 read）；electron/main.cjs 216 行零 ipcMain（全文 read），
  Tray 菜单 :176-177 指向 /cockpit 与 /app/admin.html 旧页；P0 轮询 :192-207 只到 OS 层。
- electron-renderer/preload.js 孤儿死文件：声明 8 方法 8 通道，全仓引用零命中（grep 实测）——删除。
- ipc/bridge.ts 10 方法接口 + 6 wrapper；零消费方 3 方法：minimizeToTray/pauseNotifications/resumeNotifications（grep 实测）。
- 生产消费方：App.tsx:19/:80-81/:85 + lib/api.ts:31（getServerUrl，desktop-build.test.ts:85 断言保留）。
- GET /api/sentinel/tickets（sentinel.ts:96）+ POST /tickets/:id/transition（:115-146）形状实测（sentinel-service.ts:76-95）。
- useNotifications.ts:34 指 /api/notifications（上游零写入方恒空）；error :42 产出无消费；
  NotificationCenter.tsx:23 不解构 error；useStreaming.ts:244-247 case 'error' 已 import useAppStore（:22）。
- app-store.ts safeLocalStorage 先例 :110-119 可复用；D593 asSentinelTickets 形状守卫先例（RightPanel.tsx:257-277，未导出，本任务自含一份）。
- 测试先例：right-panel-report-sentinel.test.ts（mock fetch + 真实 zustand + window 桩 + renderToStaticMarkup 纯组件直调）。

### c) 决策
已有覆盖 → 复用 + 接线；新建面收敛到 IPC 三方（preload 8 方法/main 6 通道/bridge 接口收敛 10→8）+
通知状态（localNotifications）+ 2 测试文件；孤儿 preload.js 删除收敛。
参考：Anthropic/DeepSeek/第一性原理 + 结论——接口≡运行时才消除 P0-2（spec §5.3 决策 1-6 全收敛，无分歧）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- Electron 官方安全基线：contextIsolation:true + contextBridge 显式暴露（现状合规，main.cjs:78）；
  main 永不信任 renderer 输入——每 handler 类型/枚举/长度校验，非法 warn+忽略不抛；
  推送通道 main→renderer 用 webContents.send，订阅端必须返回退订函数（防 effect 重挂载双订阅）。
- M3 模式（建成未接线）是四个断点的共同根源（审计 §8.3 台账）——本任务以接线复用为主。
- 铁律 11/24/31：`?.` 静默 no-op 收编为真实行为或显式降级；假空态（获取失败显示"暂无通知"）改 error banner。
- 铁律 37/38：死接口死文件 grep 零引用后删；新代码 as any/as never/as unknown as = 0。
- 契约逐方法落位 spec §5.2-A 表 8 行（铁律 47）；测试 red→green 对照 spec §7（铁律 48/0-2）。

## Q2: 范围 — 正确的最简方案

做什么：

- electron/preload.cjs — 2→8 方法（getServerUrl/getConfig 保留 + getAppVersion invoke + updateTrayState/showNotification send + onPushNotification/onNotificationClick/onNavigate 订阅返回退订函数；JSDoc 契约头）
- electron/main.cjs — 补 ipcMain.handle('app:get-version') + ipcMain.on('tray:update-state')/on('notify:show')（枚举/类型/长度校验，非法 warn+忽略）+ Tray 菜单三项替换旧页 + checkP0Alerts 补 push-notification 通道 + 全 handler try/catch warn
- electron-renderer/src/ipc/bridge.ts — 接口收敛 10→8：删 minimizeToTray/pauseNotifications/resumeNotifications（3 wrapper 同删），on* 返回退订函数，增 onPushNotification
- electron-renderer/src/stores/app-store.ts — 增 localNotifications 状态 + pushLocalNotification（FIFO 上限 20 + electronAPI.showNotification 旁路 try/catch warn 不抛）+ dismissLocalNotification
- electron-renderer/src/hooks/useNotifications.ts — 数据源切 GET /api/sentinel/tickets（形状守卫，畸形跳过）+ alertCount=open 工单数 + 新增 actOnTicket（POST transition，4xx/5xx 返回 {ok:false,error} 不抛）+ error 透出
- electron-renderer/src/components/NotificationCenter.tsx — 渲染 error banner + localNotifications 段 + 工单动作按钮（确认收到/标记为误报），抽纯组件供测试直调（D593 SentinelDetailSections 先例）
- electron-renderer/src/App.tsx — 增 3 个推送订阅 effect（onPushNotification/onNotificationClick/onNavigate，挂载一次+cleanup 退订）
- electron-renderer/src/hooks/useStreaming.ts — case 'error' 增 pushLocalNotification 1 行（SSE error → 通知中心+系统通知）
- tests/electron/ipc-contract.test.ts — 新建（用例 1-5，fs+正则物理断言 IPC 三方一致）
- tests/electron/notification-center.test.ts — 新建（用例 6-11，mock fetch+真实 store+window 桩+纯组件渲染）
- electron-renderer/preload.js — 删除（孤儿死文件，grep 零引用先证）
- .claude/task-briefs/2026-09-09-D602-interactive-cards-preload.md — 本 brief
- task-state/D602.json — 状态机回填（impl 段 + status=impl_done）
- docs/synova/audit-reports/D602-ipc-notification-evidence-20260909/README.md — 证据索引（目录内其余 evidence 文件随此提交）

不做什么（含文件路径）：

- 不修改 src/ 后端任何文件（含 src/routes/sentinel.ts 的 alerts action 空洞端点修复、src/routes/notifications.ts 死数据源补写入方）——归哨兵线另派
- 不修改 electron-renderer/src/components/RightPanel.tsx——D593 spec §5.1 文件边界声明归 D593
- 不修改 electron-renderer/src/components/StatusBar.tsx 与 electron-renderer/src/components/TitleBar.tsx——审计 D594 范围④显式 descope，创始人后续派单
- 不修改 electron/icon.png（补文件）——已存在已打包（spec §1 勘误 1）
- 不修改 build-synova.cjs 与 electron/package.json 构建配置——白名单已含 icon.png，孤儿 preload.js 本就不在白名单
- 不修改 electron-renderer/src/hooks/sse-contract.ts——D590 契约单源零回归锁定
- 不修改 tests/electron/use-streaming-conversation.test.ts 等 10 个既有测试文件——21 用例零改动全绿
- 不修改 scripts/audit/ 全目录（K3 红线）；零 @deepseek-ai import（G1）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：① 托盘图标（角标=open 工单数）；② TitleBar 铃铛；③ 对话中诊断出错（SSE error 帧）。
处理（中间步骤）：点铃铛/托盘菜单"打开通知中心"→ 面板列哨兵工单卡片+本地错误通知+error banner；工单卡片点"确认收到"/"标记为误报"→ POST /api/sentinel/tickets/:id/transition。
结果（最终展示）：transition 200 → GET tickets 状态变化落库（重启后端可查）；SSE error → 通知中心本地通知+系统通知双可见；21 用例零回归 + tsc 28=28。

## 架构层: L1 交互层（Electron 桌面壳：主进程 + 渲染进程），纯消费侧接线；
后端仅经 HTTP（/api/sentinel/*，D590 白名单），零 src/ import，五层边界零触碰。

## Done 标准:（verify: 命令逐条可执行）

1. IPC 三方一致测试全绿（red 先证：现状 preload 2≠bridge 10、main 零 ipcMain 必红）
   verify: npx vitest run tests/electron/ipc-contract.test.ts tests/electron/notification-center.test.ts
2. 零回归：use-streaming-conversation 21 用例零改动全绿 + electron 目录全绿
   verify: npx vitest run tests/electron/use-streaming-conversation.test.ts（21/21）&& npx vitest run tests/electron/
3. tsc 基线 28=28
   verify: npx tsc --noEmit 2>&1 | grep -c "error TS"  # = 28
4. 收敛清理：孤儿 preload.js 已删 + bridge 死接口 3 个已删，grep 零引用
   verify: grep -rn "minimizeToTray\|pauseNotifications\|resumeNotifications" electron-renderer/src/ （零结果）
   verify: grep -rn "preload\.js" electron/ electron-renderer/ build-synova.cjs tests/ （零结果，排除 preload.cjs 与本 brief/spec）
5. Tray 旧页清零
   verify: grep -n "cockpit\|admin.html" electron/main.cjs （零结果）
6. 接线验证（spec §8 表）：新 export 生产调用点 grep 命中（App.tsx 订阅 ≥3、pushLocalNotification 消费 ≥2、actOnTicket 按钮 onClick ≥1、dismissLocalNotification ≥1）
7. DS4/DS5 真实后端证据（curl 前后对照 + SSE error 场景日志）落 docs/synova/audit-reports/D602-*-evidence-*/（mock 测试不算）
