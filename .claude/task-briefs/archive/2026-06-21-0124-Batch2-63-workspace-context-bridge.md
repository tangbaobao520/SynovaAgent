# Task Brief: Batch2: §6.3 workspace-context-bridge接入Engine+§12.4 boss-mailbox飞书推送+§17 department-workspace动态数据

> 生成: 2026-06-21 01:25:00 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（每次重读）

- SynovaAgent = 组织数字孪生诊断 + 持续增长导航系统。
  诊断是手段，目的是增长。
  核心问题：这家企业的增长卡在哪里？现在该做什么？
- Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
- 五层架构：L1(交互)→L2(编排)→L3(洞察)→L4(本体)→L5(存储)，只能向下依赖相邻层。
- 8 位专家: strategy / org / finance / tech / marketing / action / business_model / knowledge
- 完整数据流:
  原始数据 → 本体层(电子病历) → 7维度×25测量器 → 证据池 → 专家ReAct推理 → 诊断报告

## Q1: 调研 — 这件事以前怎么做的？

### a) 业界最佳实践
workspace-context-bridge已有类+测试。需接入ConversationEngine.loadConfirmedFacts()。boss-mailbox有renderText,需接推送通道

### b) 顶级团队怎么做
先接线后测试——每个修复只改1-2个文件

### c) 我们犯过的错
模式A: bridge文件存在但Engine不调。模式D: boss-mailbox有渲染无推送

## Q2: 范围
3项: bridge→Engine(conversation-engine.ts) + boss-mailbox飞书(server.ts) + dept-workspace动态数据(department-workspace.ts)
不做: 邮件推送(SMTP需外部配置)

## Q3: 验收
bridge接入→压缩时跨工作区事实可用。boss-mailbox→飞书webhook可推送。dept-page→API数据替代硬编码

## 本任务在哪一层
L2编排(conversation-engine接入) + L1路由(department-workspace) + 推送通道

## 文档引用
- PRD §6.3 §12.4 §17
- src/agent/workspace-context-bridge.ts: loadContextForWorkspace()
- src/agent/boss-mailbox.ts: renderText()

## 接口审计
src/agent/workspace-context-bridge.ts: loadContextForWorkspace(workspaceId, tags?) → {ownFacts, relatedFacts}
src/agent/conversation-engine.ts: loadConfirmedFacts() → Promise<string[] | undefined>
src/agent/boss-mailbox.ts: pushToFeishu(report, webhookUrl) → Promise<boolean>
src/routes/im.ts: POST /api/im/feishu/webhook → 飞书消息接收

## 数据流
§6.3: Engine压缩→loadConfirmedFacts()→bridge.loadContextForWorkspace(orgId)→跨区事实注入
§12.4: boss-mailbox.renderText()→POST feishu webhook→飞书群消息
§17: department-workspace.GET /dept→fetch /api/workspaces/mine→动态渲染工作区列表

## Done 标准 (PRD §6.3 §12.4 §17)
- [x] §6.3 bridge接入Engine: loadConfirmedFacts调用WorkspaceContextBridge
- [x] §12.4 boss-mailbox飞书推送: pushToFeishu()实现
- [x] §17 department-workspace动态: /context API+动态渲染
- [x] tsc零错误 + 139/139 tests passed
