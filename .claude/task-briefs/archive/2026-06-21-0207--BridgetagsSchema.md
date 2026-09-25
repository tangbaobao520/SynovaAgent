# Task Brief: 架构闭环: Bridge传tags+Schema定制字段+boss-mailbox定时触发+RBAC服务端

> 生成: 2026-06-21 02:07:30 | 分支: feat/prompt-architecture | as any: 1

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
Bridge: workspace-title作tags→关键词匹配跨区事实。Schema: Zod按专家区分。Cron: node-cron或setInterval

### b) 顶级团队怎么做
先修数据(传tags)→修Schema(定制)→修触发(cron)→修权限(服务端RBAC)。不跳步

### c) 我们犯过的错
模式A: Bridge接了但没传tags=跨区未生效。模式C: Schema文件建了但千篇一律。4个问题中3个是我的偷懒

## Q2: 范围
4个修复: Bridge传tags + 2位专家Schema定制(finance/strategy作示范) + boss-mailbox cron触发 + RBAC服务端
不做: 8位Schema全定制(Phase 2), feishu.py企业微信(需外部API key)

## Q3: 验收
Bridge: tags从workspace.title提取→跨区相关事实返回。Schema: finance含cashFlowRatio, strategy含sevenPowers。Cron: 周一9点自动推送。RBAC: /context端点验证权限

## 本任务在哪一层
L2编排(Bridge+Engine) + L3洞察(Schema) + cron(CronScheduler) + L1路由(RBAC)

## 文档引用
- 上下文管理优化任务.md §Step 3
- src/agent/workspace-context-bridge.ts: loadContextForWorkspace()
- src/l3/expert-output-schema.ts: ExpertOutputSchema
- src/cron/scheduler.ts: CronScheduler

## 接口审计
src/agent/workspace-context-bridge.ts: loadContextForWorkspace(workspaceId, tags?) → {ownFacts, relatedFacts}
src/agent/conversation-engine.ts: loadConfirmedFacts() → Promise<string[] | undefined>
src/routes/workspaces-api.ts: GET /api/workspaces/:id/context → {sources}

## 数据流
Bridge: workspace.title分词→tags[]→bridge.loadContextForWorkspace(orgId, tags)→relatedFacts注入压缩
Schema: finance OUTPUT_SCHEMA.md含cashFlowRatio:number→LLM输出→expert-output-schema.ts类型校验
Cron: CronScheduler每周一9:00→boss-mailbox.generateReport()→pushToFeishu(webhookUrl)
RBAC: /context→rbacMiddleware→extractRbacContext→canAccessWorkspace→过滤department

## Done 标准 (PRD §6.3 §12.4 §17)
- [x] Bridge传入tags(workspace.title分词)→跨区事实生效
- [x] finance+strategy Schema定制字段示例
- [x] boss-mailbox CronScheduler注册(周一9:00)
- [x] /api/workspaces/:id/context服务端RBAC验证
- [x] tsc零错误 + tests通过
