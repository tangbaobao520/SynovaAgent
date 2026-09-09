# D602 DS4 证据——卡片动作落库（真实后端 curl 前后对照）

> Spec 验收①（审计 D594 验收原文）: "桌面收到通知→点卡片动作→工单状态变化落库"
> spec §10 DS4: "桌面（或 headless 等价链）通知中心点'确认收到'→ POST transition 200 → GET tickets 该工单 status='acknowledged'（物理证据：curl 前后对照或日志；mock 测试不算此条证据）"
> 执行环境: Mac 本机隔离真实后端——worktree feat/d602 代码，`DEV_MODE=true PORT=18991 SYNOVA_DB_PATH=/tmp/d602-ds4-evidence/synova.db npx tsx src/index.ts`（临时新库，零 data/synova.db 接触，铁律 0-4）。
> 桌面动作等价性说明: 通知中心"确认收到"按钮 → `useNotifications.actOnTicket(id,'confirm')` → `POST /api/sentinel/tickets/:id/transition` body `{to:'acknowledged'}`（electron-renderer/src/hooks/useNotifications.ts，用例 10a 已锁 URL/method/body）。headless 无 GUI，故按 spec 允许的"headless 等价链"以同 URL/body 的 curl 执行落库半程。

## 链路（全部真实端点，零 mock）

```
① POST /api/ga/calibration/signals   （D551 真实端点, severity:8 → mapManualSeverity ≥7 = critical）
   → {"ok":true,"findingId":"ga-manual-mtt1zn6c-b7b49daa"}
② POST /api/sentinel/run/cash-runway （真实哨兵管线: runOnce + aggregateAndDispatch）
   → critical 信号 → createAutoTicket → INSERT INTO sentinel_tickets（真实 SQLite 表）
③ GET  /api/sentinel/tickets         → source:'table', status:'open'   ←—— 前照
④ POST /api/sentinel/tickets/:id/transition {to:'acknowledged'} → 200   ←—— 桌面按钮同款调用
⑤ GET  /api/sentinel/tickets         → status:'acknowledged'           ←—— 后照
⑥ 重启后端进程（同一 db 文件）→ GET → status 持久（source:'table'）      ←—— 落库（非内存）证明
```

## 前后对照（原始响应见 logs/）

**③ 前照（logs/tickets-before.json）**:
```
source: table | count: 1
 - ticket-sig_核心高管离职风险-auto | critical | status: open
```

**④ transition 响应（logs/transition-response.txt）**:
```
HTTP/200
{"ok":true,"ticket":{"id":"ticket-sig_核心高管离职风险-auto","signal_id":"sig_核心高管离职风险",
 "severity":"critical","expert_type":"auto",...,"status":"acknowledged",
 "created_at":"2026-09-08 19:19:19","resolved_at":null}}
```

**⑤ 后照（logs/tickets-after.json）**:
```
 - ticket-sig_核心高管离职风险-auto | status: acknowledged
```

**⑥ 续步 ack→resolve（状态机合法正向路径）+ 重启持久（logs/tickets-after-restart.json）**:
```
二次 transition {to:'resolved'} → HTTP 200（open→acknowledged→resolved 合法链）
进程 kill + 重启（同一 /tmp/d602-ds4-evidence/synova.db）后:
source: table
 - ticket-sig_核心高管离职风险-auto | status: resolved | resolvedAt: 2026-09-08 19:19:32
```
→ 状态经 **真实 SQLite 表**持久化，跨进程重启可查——"落库"物理证明（内存兜底路径重启即丢，source 会是 memory-fallback；此处 source='table' 双证）。

## 与桌面链路的对接点（接线，非本次 curl 独有）

| 桌面侧 | 生产代码 | 测试锁定 |
|---|---|---|
| 通知卡片渲染工单 | GET /api/sentinel/tickets（useNotifications.loadTicketNotifications） | 用例 8/9（真实 URL + 形状守卫） |
| "确认收到"按钮 | actOnTicket(id,'confirm') → POST …/transition {to:'acknowledged'} | 用例 10a（URL/method/body 原文断言） |
| "标记为误报"按钮 | actOnTicket(id,'dismiss') → {to:'dismissed'} | 用例 10b |
| 4xx/5xx 不抛 | {ok:false,error} 返回 + 项内提示 | 用例 10c（409/404/网络异常） |
| 成功后状态刷新 | actOnTicketAndRefresh → fetchNotifications | NotificationCenter handleAction |
