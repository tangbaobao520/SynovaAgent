# D602 evidence 索引 + DS 对照（D580/D590 evidence 结构先例）

> 任务 D602（交互卡片呈现 + preload/IPC 收敛 + 通知 error 消费，原审计编号 D594）| 2026-09-09
> 分支: feat/d602-interactive-cards-preload（基线 origin/main@92b094de，worktree .synova-wt-d602）
> Spec: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D602-interactive-cards-preload-20260908.md

## 文件清单

| 文件 | 内容 |
|---|---|
| README.md | 本文件 — 总览 + DS1-DS10 对照 + 审计员独立复跑入口 |
| red-green-evidence.md | 两新测试文件 red（实现前 23/23 失败原文）→ green（实现后 23/23 通过）双轮全文 |
| ds4-transition-evidence.md | DS4 真实后端 curl 前后对照（工单落表 → transition 200 → 状态变化 → 重启持久）全记录 |
| ds5-sse-error-evidence.md | DS5 真实后端 SSE error 帧捕获 + 渲染层消费链证明（用例 7/11 + 接线 grep） |
| logs/tickets-before.json | DS4 前照：工单 open（source:table） |
| logs/tickets-after.json | DS4 后照：transition 200 → status=acknowledged |
| logs/tickets-after-restart.json | DS4 重启后照：status 持久（source:table，非内存） |
| logs/transition-response.txt | POST /api/sentinel/tickets/:id/transition 200 响应原文 |
| logs/consult-sse-error-frame.txt | 真实后端 SSE error 帧原文（DS5） |
| logs/consult-sse-full-stream.log.txt | 真实 consult SSE 全流（含 error + complete degraded 帧） |
| logs/backend-boot.log.txt | 隔离后端（PORT=18991, SYNOVA_DB_PATH=/tmp 临时库）启动日志——45 哨兵注册证据 |

## DS1-DS10 对照（spec §10）

| DS | 内容 | 状态 | 证据 |
|---|---|---|---|
| DS1 | tests/electron/ipc-contract.test.ts 全绿（用例 1-5；red 先证：现状 preload 2≠bridge 10、main 零 ipcMain 必红） | ✅ | red-green-evidence.md §1（red: 5/5 失败，用例 1 失败原文 `['getConfig','getServerUrl'] ≠ 10 键`）/ §2（green: 5/5） |
| DS2 | tests/electron/notification-center.test.ts 全绿（用例 6-11；red 先证） | ✅ | red-green-evidence.md §1（red: 18/18 失败）/ §2（green: 18/18） |
| DS3 | IPC 三方一致物理证明（preload 8 ≡ bridge 8 ≡ main 通道 3+3 推送）+ as any=0 | ✅ | ipc-contract 用例 1/2/3/5 全绿 + 10 文件 `as any/as never/as unknown as` grep 零命中（完成报告 §自检） |
| DS4 | 卡片动作落库——POST transition 200 → GET tickets 状态变化（**真实后端 curl 前后对照 + 重启持久**，非 mock） | ✅ | ds4-transition-evidence.md：open → acknowledged（200 + GET 后照）→ resolved；重启后 source:table + 状态持久 |
| DS5 | SSE error 可见——真实后端 error 帧捕获 + 渲染层消费（用例 7/11 + 接线 grep） | ✅ | ds5-sse-error-evidence.md：真实流 `data: {"type":"error",…LLM 调用失败…}` + useStreaming:249 pushLocalNotification 生产接线 + 用例 7a/7b/7c/11b 绿 |
| DS6 | Tray 恢复——菜单三项现役 UI（旧页 URL 清零，用例 4）+ 角标通道真通 + icon 降级守卫保留 | ✅ | ipc-contract 用例 4 全绿（菜单三项 + 旧页模板字面量零命中 + /api/cockpit/data 轮询合法保留）+ main.cjs:247-253 菜单 + :168-190 tray:update-state handler |
| DS7 | 收敛清理——孤儿 preload.js 已删 + 死接口 3 个已删，grep 零引用 | ✅ | `grep -rn "preload\.js" electron/ electron-renderer/ build-synova.cjs tests/`（排除 preload.cjs）零结果；`grep -rn "minimizeToTray\|pauseNotifications\|resumeNotifications" electron-renderer/src/` 零结果（含注释——bridge.ts 头注释为物理清零已剔除死名） |
| DS8 | 零回归——use-streaming-conversation **21 用例零改动全绿** + use-streaming-contract + right-panel 全绿；tsc 28=28 | ✅ | 21/21 绿（零 diff）+ electron 目录 12 文件 164 passed + tsc --noEmit 根 28 = 基线 28 + electron-renderer tsc 0 错误 |
| DS9 | 接线验证（spec §8 表）全部 grep 命中 + 全量 vitest 零新失败 + catch 全部 log+degraded | ✅ | 完成报告 §接线（§8 表 8 条逐条 grep 行号）+ 全量 vitest exit 0 + 新代码 5 处 catch 均有 console.warn + 显式降级返回/跳过 |
| DS10 | 完成报告含 §5.3 六项决策 + §1 四项勘误转述 + 北星验收三句（附证据） | ✅ | 完成报告（同 commit 消息 + 汇报正文） |

## 审计员独立复跑入口

```bash
# ① 新测试全绿
npx vitest run tests/electron/ipc-contract.test.ts tests/electron/notification-center.test.ts
# ② 零回归（21 用例零改动）
npx vitest run tests/electron/use-streaming-conversation.test.ts
# ③ 基线
npx tsc --noEmit 2>&1 | grep -c "error TS"   # = 28（与 main 基线一致）
# ④ 收敛清零
grep -rn "minimizeToTray\|pauseNotifications\|resumeNotifications" electron-renderer/src/   # 零结果
grep -rn "preload\.js" electron/ electron-renderer/ build-synova.cjs tests/ | grep -v "preload\.cjs"   # 零结果
grep -n "cockpit\|admin\.html" electron/main.cjs   # 仅 /api/cockpit/data 轮询一行（决策 6-B 合法保留）
# ⑤ DS4 独立复跑（真实后端，隔离端口/临时库，不碰 data/synova.db）
DEV_MODE=true PORT=18991 SYNOVA_DB_PATH=/tmp/d602-audit/synova.db npx tsx src/index.ts &
#   → POST /api/ga/calibration/signals（severity:8）→ POST /api/sentinel/run/cash-runway
#   → GET /api/sentinel/tickets（open）→ POST /api/sentinel/tickets/:id/transition {to:'acknowledged'}
#   → GET（acknowledged）→ 重启进程 → GET（持久）
```

## 环境边界（如实声明）

- DS4/DS5 证据产生于 **Mac 本机隔离真实后端**（worktree 代码，PORT=18991 + /tmp 临时 SQLite，零 data/synova.db 接触）。
- DS5 的"系统通知"半程（electronAPI.showNotification → OS 通知）在 headless 环境无法物理弹出——由用例 7a（stub 被调用透传）+ main.cjs notify:show handler 静态契约锁定；OS 层弹窗留桌面端人工验收。
- 18790 端口常驻实例为 Sep 5 旧进程（D580 前代码），证据未采用其响应——全部证据来自 worktree 新代码实例。
