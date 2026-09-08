# Task Brief: D593 — L1-P2 报告落盘 + 桌面报告/哨兵呈现 + 401 对齐

> 生成: 2026-09-08 23:31 | 分支: feat/d593-report-persistence-p2（worktree .synova-wt-d593） | as any: 0
> Spec（唯一契约）: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D593-report-persistence-20260908.md
> 编码指令: 创始人派单 2026-09-08（L1 审计收工计划 Phase 2 首任务；task-state/D593.json 已登记）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
本任务服务 GA 与桌面端用户：诊断报告是核心产出（PRODUCT-BRIEF §三"两套系统的产出都是报告"+ §五 W1 + §六 P0），跑完一次诊断后报告必须一直在那里——重启不丢、刷新可读、右栏打开即真实数据。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- 纵向：L1 交互层为主（routes/diagnosis.ts + routes/conversations.ts + middleware/auth.ts + electron-renderer 呈现）+ 一处 L5 域内扩展（SessionStore.listDiagnosisReports，同类查询方法先例 getDiagnosisCheckpoint/searchSessions）。零 L2/L3/L4 修改。
- 系统：GA 按需诊断链路的最后一公里（D590 对话端点 → D591 桌面接线 → D592 E2E 已通），本任务做报告落盘与读回。L1→L5 仅经 D563 既有动态 import 通道（diagnosis.ts:215 / conversations.ts:91-108 resolveStore 范式），零新增静态跨层 import。

### b) 文件审计（全部 file:line 于开工时在 worktree 内重新核验，与 spec §4 一致）
- 内存 FIFO：src/routes/diagnosis.ts:74-75（completedReports Map + COMPLETED_REPORTS_MAX=50）+ :78-84 cacheCompletedReport + 写点 :441 + 读点 :543（miss→404 :545）
- 闲置资产（M3 机制建成未接线）：diagnosis_checkpoints 表 session-store.ts:212-217 + saveDiagnosisCheckpoint :492 + getDiagnosisCheckpoint :508（损坏 JSON→log.warn+null）+ deleteDiagnosisCheckpoints :527；launcher saveCheckpoint 死代码（不碰，spec §5.4 决策 8）
- 对话桥：conversations.ts:273-303 phaseComplete→launcher→complete 帧，报告零落盘
- 键错配：consultId=diag-xxx（diagnosis.ts:126）≠ reportId=rpt_xxx（桌面 currentReportId 落 reportId）
- 白名单：auth.ts:92-114 isWhitelisted 十六规则（D590 三前缀 :110-112 已落）；notifications 四路由（notifications.ts:74/99/112/129）、solutions 四路由（solutions.ts:60/91/114/169）、ga 三路由（ga-admin.ts:66/88/125）均白名单外
- 桌面：RightPanel.tsx DiagnosisReportTab :199-249（404 文案 :216-219 错误归因"内存缓存已清"）、哨兵 tab Empty :345-347、apiFetch :153-172、SEVERITY_COLOR :477；LeftPanel.tsx /api/ga/clients :62 + /api/ga/switch :112 + conversations 渲染 :215-223；app-store.ts conversations:[] :110 + setCurrentReportId :129（无 localStorage）
- 哨兵 API 已就绪：GET /api/sentinel/reports（ExpertReportsResponse{ok,reports[{sentinelId,expert,summary,confidence,checkedAt}]}）+ GET /api/sentinel/tickets（TicketsResponse{ok,source,degraded?,tickets[{id,title,severity,createdAt,status,resolvedAt?}]}），白名单内零 401
- 测试先例：tests/routes/diagnosis-consult-events.test.ts + tests/routes/conversations.test.ts（真实路由+真实 :memory: SQLite+mock 引擎三处）；tests/electron/use-streaming-conversation.test.ts + tests/ga-collab-ui.test.ts（组件函数直调 + test-support/render.ts 序列化）
- 环境：vitest.config.ts include 仅 *.test.ts / *.integration.test.ts——新 electron 测试文件用 .test.ts（无 JSX 语法，组件直调）；dev 模式 npm run dev 指向 .bat（Mac 用 npx tsx src/index.ts）

### c) 决策
持久化载体复用 diagnosis_checkpoints 表（零 schema 变更，spec §5.4 决策 1）；读路径内存 miss→checkpoint 冷读不触碰引擎（决策 3，DSH dsh-api-session-controller lib/index.js:142-170 冷读激活范式）；键=reportId（决策 2）；列表端点新建（决策 4）；五前缀精确白名单（决策 9）。九项决策已记录 spec §5.4（S-12），本 brief 不重复展开。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC = spec §5 六组契约 + §7 十二用例 + DS1-DS9；② 测试先行 red→green（404/路由不存在即 red 证据）；③ 实现 = 写集 8 修改 + 2 新建；④ 接线 = spec §8 表逐条 grep；⑤ 验证 = 自检 5 问 + verify-incremental + 写集对账。

### b) 本任务执行约束
- rule: "新方法 listDiagnosisReports 必须有生产调用方（列表端点 handler）"
  verify: "grep -rn 'listDiagnosisReports' src/ 返回 ≥2 处（定义 + diagnosis.ts 调用）"
- rule: "saveDiagnosisCheckpoint 首次真实接线必须双路线（consult + 对话桥）"
  verify: "grep -rn 'saveDiagnosisCheckpoint' src/routes/ 返回 ≥2 处"
- rule: "五前缀白名单落地后桌面消费方零 401"
  verify: "grep -n '/api/notifications\\|/api/solutions\\|/api/ga/clients\\|/api/ga/switch\\|/api/diagnosis/reports' src/middleware/auth.ts 各 ≥1"
- rule: "降级诚实：partial_report 行级 JSON 损坏跳过不 500，写失败 log.warn 不阻断 SSE"
  verify: "grep -n 'degraded' src/store/session-store.ts src/routes/diagnosis.ts"

### c) 决策参考系
spec §5.4 九项决策全部记录（双参考系收敛，无分歧）。参考：Anthropic/DeepSeek/第一性原理 + 结论（checkpoint 表复用/reportId 键/冷读 fallback/列表端点/全保留策略/呈现 only/会话列表纳入/死代码不碰/五前缀精确白名单）。

### d) 相关 Note 引用
- [x] memory/notes/ 既有教训已由 spec Q1c 引用（D316 物理证明/D381 写集格式/D576 诚实交付/M3 机制未接线）；本任务无新增治理决策，不新建 Note。

## Q2: 范围 — 正确的最简方案是什么？

做什么（= spec §5.1 写集，8 修改 + 2 新建 + 交付物登记）：
- src/routes/diagnosis.ts
- src/routes/conversations.ts
- src/store/session-store.ts
- src/middleware/auth.ts
- electron-renderer/src/components/RightPanel.tsx
- electron-renderer/src/components/LeftPanel.tsx
- electron-renderer/src/stores/app-store.ts
- README.md
- tests/routes/diagnosis-report-persistence.test.ts
- tests/electron/right-panel-report-sentinel.test.ts
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D593-report-persistence-20260908.md
- task-state/D593.json
- docs/synova/audit-reports/D593-report-persistence-evidence-20260908/README.md
- .claude/task-briefs/2026-09-08-D593-report-persistence.md

不做什么：
- 不改 src/server.ts（列表端点复用 diagnosisRoutes 既有挂载，spec §8 零 server.ts 改动）
- 不改 src/agent/diagnosis-launcher.ts（saveCheckpoint 死代码不碰，spec §5.4 决策 8）
- 不改 src/store/conversation-store.ts（D591 已闭环，spec §6 排除）
- 不改 electron-renderer/src/hooks/useStreaming.ts（D591 已闭环，spec §6 排除）
- 不改 electron-renderer/src/lib/sse-contract.ts（D591 已闭环，spec §6 排除）
- 不改 vitest.config.ts（include 已覆盖 *.test.ts，新测试文件命名适配）
- 不改 src/agent/sentinel-service.ts（哨兵数据源治理归哨兵线，本任务呈现 only，spec §5.4 决策 6）
- 不改 src/routes/notifications.ts（白名单修复后自通，零代码变更仅回归验证）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：POST /api/diagnosis/consult（显式诊断）或 POST /api/conversations 访谈完成（对话桥）→ 诊断完成。
处理（中间经过哪些步骤）：完成点写 diagnosis_checkpoints（reportId 键，phase=5，完整 report+onePager+meta）；GET /api/diagnosis/consult/:id/report 内存 miss→checkpoint 冷读（不触碰引擎）；GET /api/diagnosis/reports 列表分页。
结果（最终展示在哪）：重启后端后报告仍可取（curl 物理证据）；桌面右栏报告 tab 刷新后渲染 markdown（localStorage/列表兜底恢复 currentReportId）、哨兵 tab 渲染真实 reports+tickets（无 Empty 占位）；notifications/solutions/ga-clients/ga-switch 端点非 401。

## 架构层: L1 交互层为主 + 一处 L5 域内扩展
L1（routes/ + middleware/ + electron-renderer）→ L5（store/session-store.ts 新方法，域内自洽）；L1→L5 仅经 D563 动态 import 通道；零 L2/L3/L4 修改。
#CRITERIA: A

## Done 标准
- [ ] 入口可触达: GET /api/diagnosis/reports 路由存在且白名单内（verify: grep -n "api/diagnosis/reports" src/routes/diagnosis.ts src/middleware/auth.ts 各 ≥1）
- [ ] 链路走通: 两新测试文件全绿（verify: npx vitest run tests/routes/diagnosis-report-persistence.test.ts tests/electron/right-panel-report-sentinel.test.ts，exit 0）
- [ ] 结果可见: DS2 物理证据——跑诊断→杀后端→重启→GET report 200（evidence 落盘 docs/synova/audit-reports/D593-report-persistence-evidence-20260908/）
- [ ] 写集对账: bash scripts/workflow/check-dev-doc-write-set.sh docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D593-report-persistence-20260908.md exit 0
- [ ] 接线完整: grep -rn "listDiagnosisReports" src/ ≥2；grep -rn "saveDiagnosisCheckpoint" src/routes/ ≥2；grep -rn "SentinelDetail" electron-renderer/src/components/RightPanel.tsx ≥2；grep -rn "setConversations" electron-renderer/src/ ≥2（定义+生产调用）
- [ ] 降级诚实: grep -rn "内存缓存已清" electron-renderer/src/ 零结果（错误归因文案清除）
