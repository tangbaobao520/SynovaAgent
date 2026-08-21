# D240 企业事实治理 — 成品补交付（2026-08-22 跨日提交）

## Q0: 定位
SynovaAgent 企业事实治理（D240 半成品补交付；实现文件曾存于本地工作树未入库，2026-08-21 从备份恢复并补齐）

## Q1: 调研
D240 dev doc（docs/plans/codex/implementation/SYNOVA-IMPL-D240-Enterprise-Facts-v1-0-20260727.md）为权威契约；行业对标 Hermes/Claude Code 文件驱动记忆；历史教训：D240 原 commit 062c73c 仅含 .gitkeep（假交付），本次以成品补齐
## Q2: 范围
做什么
- scripts/control-tower/enterprise-fact-store.ts
- scripts/control-tower/fact-approval-service.ts
- scripts/control-tower/conflict-scanner.ts
- src/l4/agent-memory-store.ts
- src/agent/expert-file-loader.ts
- src/deploy/bootstrap.ts
- tests/control-tower/enterprise-facts.test.ts
- .claude/task-briefs/2026-08-22-D240-enterprise-facts-delivery.md
- memory/notes/implemented/2026-08-21-d240-enterprise-facts-delivery.md
不做什么
- 管理员审批 UI（D241）
- 哇呢宝贝客户数据（不进 git）
## Q3: 验收
入口=CLI（npx tsx … list/approve/reject/scan）；交互=文件事实生命周期 pending→active/rejected + 冲突扫描；结果=loader 注入 active 事实 + 测试 9/9

## 架构层:
L4 记忆（agent-memory-store 双写）+ L2 prompt 组装（loader 注入）+ 控制塔 ops 脚本

## 接口审计
EnterpriseFactStore/FactApprovalService/ConflictScanner 全部被测试或生产调用引用；@synova/logger 存在；CronScheduler.schedule 模式对齐 bootstrap.ts 现有任务

## Done 标准
- vitest tests/control-tower/enterprise-facts.test.ts 9/9 绿
- tsc 28=28 零新增；as any=0
- pre-commit 13 组过
- grep 接线：agent-memory-store→EnterpriseFactStore、bootstrap→ConflictScanner、loader→loadActiveEnterpriseFacts
