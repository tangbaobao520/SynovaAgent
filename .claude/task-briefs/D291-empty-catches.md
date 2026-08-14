# Task Brief: D291: Fix 23 Empty Catches — 添加 log.warn/log.error

> 生成: 2026-07-31 09:17:54 | 分支: main | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。
诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

目标: 成为组织诊断的 AWS。每个新客户、新行业、新数据源 → 加文件即可，不改代码。
能文件化的必须文件化。不能文件化的必须有明确的扩展点。

### 三层解耦体系

**纵向解耦：五层物理隔离**
代码按 L1-L5 架构分层，每层只与相邻层通信。L1 交互层不知道 L4 用什么数据库，L3 洞察层不知道 L5 数据存在哪。换底层存储，上层零改动。pre-commit 物理阻断跨层 import——L2→L4 的代码提交不进去。

**横向解耦：11 个独立 Monorepo 包**
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 迁移到独立包；未来新增须遵循此结构。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码：
- 新 AI 专家 = 新建目录 + 10 个 Markdown 文件 → 自动注册到 ExpertDispatcher
- 新诊断哨兵 = 加 xxx-sentinel.ts → builtins 自动扫描加载
- 新行业 = 加行业目录（基准数据+阈值+案例库）→ 1-2 天上线，零 TypeScript 改动
- 新本体实体类型 = 加 JSON Schema 文件

流程约束: V4.5.0 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
        反馈闭环: GA评审/客户反馈 → 记忆层 → 数据层
        Sentinel Finding[] → 诊断引擎 Phase 2 → 8 位文件驱动专家解读

L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (8位文件驱动专家: strategy org finance tech marketing action business_model knowledge)
  L4 本体: l4/ evidence/ 企业事实层: AgentMemoryStore (enterprise_fact, 版本化+superseded_by链)
  L5 存储: store/ cron/
三层粒度: 专家→哨兵→计算。哨兵=可独立告警的最小子领域。compute=纯数学函数。
L0 进化: evolution/ 两路反馈→候选池→确认/执行验证→写入知识库
文件化扩展: expert/ knowledge/shared/ theory/ skills/ — 新增=加文件,不改代码
数据安全: L0公开摘要→L1聚合信号→L2脱敏证据→L3原始数据(仅客户内Agent可见,GA不可见)
引擎: packages/engine-core/ (Novis遗产,逐步迁移)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

本任务属于基础设施质量修复。跨越 L1(web-adapter) L2(agent/) L3(l3/ sentinel/) L4(services/) 四层。
属于审计修复——无新增功能，仅修复 23 处空 catch 违反铁律 24+31。

### b) 文件审计
16 个源文件均不在 expert/ sentinel-manifest/ extensions/ knowledge/ theory/ skills/ 中。
均为已有 TypeScript 代码的质量修复，不涉及文件驱动模块。
审计工具: `scripts/audit/audit-check.py` 已就位。

### c) 决策
不新建文件、不新增模块。纯代码修复。审计回归工具 `audit-check.py --full` 验证。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC — D291 开发文档已定义（16 文件 23 行号已列出）
  ② 测试 — 回归审计 `audit-check.py --full` 即测试（无新测试文件）
  ③ 实现 — 每处空 catch 加 log.warn/log.error + 必要时 degraded: true
  ④ 验证 — audit-check.py --full → [3] ERRORS: 0 + tsc + vitest
  ⑤ 自检 — 6 问 + 确认 23 处全部修复

引用依据：
  - 铁律 24: 异常处理审计——catch 必须有 log.error/warn（不能空吞）
  - 铁律 31: 降级信号传播——每个独立失败模块必须返回 degraded 标记
  - 铁律 11: 静默降级禁止——catch 必须 log.warn/error + 返回 degraded: true
  - memory/stub-implementation-pattern.md — 空壳/空 catch 历史教训

### b) 本任务执行约束
  - rule: "每个修复的 catch 必须有 log.warn({ err }, 'context') 或 log.error"
    verify: "python scripts/audit/audit-check.py --full | grep 'ERRORS: 0'"
  - rule: "returns degraded: true 必须是可行的（函数确实有返回值路径）"
    verify: "cat src/agent/conversation-engine.ts | grep -c 'degraded: true\|return.*degraded'"
  - rule: "不改任何 export 签名，不改任何函数名"
    verify: "git diff --stat -- src/ | wc -l"

## Q2: 范围 — 正确的最简方案

做什么：
- src/agent-observer/collector.ts: 空 catch 加 log.warn/log.error
- src/agent/adapter-registry.ts: 空 catch 加 log.warn/log.error
- src/agent/adapter-scanner.ts: 空 catch 加 log.warn/log.error
- src/agent/atomic-write.ts: 空 catch 加 log.warn/log.error
- src/agent/builtin-tools.ts: 空 catch 加 log.warn/log.error
- src/agent/conversation-engine.ts: 空 catch 加 log.warn/log.error
- src/agent/data-ingest-service.ts: 空 catch 加 log.warn/log.error
- src/agent/diagnosis-launcher.ts: 空 catch 加 log.warn/log.error
- src/agent/expert-file-loader.ts: 空 catch 加 log.warn/log.error
- src/agent/file-scanner.ts: 空 catch 加 log.warn/log.error
- src/agent/knowledge-file-importer.ts: 空 catch 加 log.warn/log.error
- src/agent/knowledge-injector.ts: 空 catch 加 log.warn/log.error
- src/agent/main-agent.ts: 空 catch 加 log.warn/log.error
- src/agent/orchestrator-adapter.ts: 空 catch 加 log.warn/log.error
- src/agent/post-diagnosis-processor.ts: 空 catch 加 log.warn/log.error
- src/agent/proactive-push.ts: 空 catch 加 log.warn/log.error
- src/agent/prompt-assembler.ts: 空 catch 加 log.warn/log.error
- src/agent/sentinel-service.ts: 空 catch 加 log.warn/log.error
- src/agent/task-decomposer.ts: 空 catch 加 log.warn/log.error
- src/agent/tool-loop-executor.ts: 空 catch 加 log.warn/log.error
- src/cli/commands/config-cmd.ts: 空 catch 加 log.warn/log.error
- src/config-file.ts: 空 catch 加 log.warn/log.error
- src/connectors/csv-import.ts: 空 catch 加 log.warn/log.error
- src/connectors/ima.ts: 空 catch 加 log.warn/log.error
- src/contract/contract-gate.ts: 空 catch 加 log.warn/log.error
- src/contract/contract-store.ts: 空 catch 加 log.warn/log.error
- src/cron/scheduler.ts: 空 catch 加 log.warn/log.error
- src/cycles/cycle-loader.ts: 空 catch 加 log.warn/log.error
- src/deploy/backup-scheduler.ts: 空 catch 加 log.warn/log.error
- src/deploy/backup-verify.ts: 空 catch 加 log.warn/log.error
- src/deploy/bootstrap.ts: 空 catch 加 log.warn/log.error
- src/deploy/recovery-pack.ts: 空 catch 加 log.warn/log.error
- src/deploy/rollback.ts: 空 catch 加 log.warn/log.error
- src/deploy/startup-check.ts: 空 catch 加 log.warn/log.error
- src/env/env-snapshot-schema.ts: 空 catch 加 log.warn/log.error
- src/errors/types.ts: 空 catch 加 log.warn/log.error
- src/evidence/evidence-store.ts: 空 catch 加 log.warn/log.error
- src/growth/action-store.ts: 空 catch 加 log.warn/log.error
- src/growth/goal-store.ts: 空 catch 加 log.warn/log.error
- src/infra/command-lanes.ts: 空 catch 加 log.warn/log.error
- src/ingest/index.ts: 空 catch 加 log.warn/log.error
- src/init/engine-context.ts: 空 catch 加 log.warn/log.error
- src/l1-interaction/web-adapter.ts: 空 catch 加 log.warn/log.error
- src/l1/im-channel.ts: 空 catch 加 log.warn/log.error
- src/l3/assumption-monitor.ts: 空 catch 加 log.warn/log.error
- src/l3/expert-dispatcher.ts: 空 catch 加 log.warn/log.error
- src/l3/framework-loader.ts: 空 catch 加 log.warn/log.error
- src/l3/knowledge-agent.ts: 空 catch 加 log.warn/log.error
- src/l3/platform-dependency-check.ts: 空 catch 加 log.warn/log.error
- src/l3/rule-loader.ts: 空 catch 加 log.warn/log.error
- src/l3/synova-diagnosis-engine-impl.ts: 空 catch 加 log.warn/log.error
- src/l3/tone-enforcer.ts: 空 catch 加 log.warn/log.error
- src/l4/agent-memory-store.ts: 空 catch 加 log.warn/log.error
- src/l4/data-exporter.ts: 空 catch 加 log.warn/log.error
- src/l4/data-purger.ts: 空 catch 加 log.warn/log.error
- src/l4/delivery-queue.ts: 空 catch 加 log.warn/log.error
- src/l4/graph-bridge.ts: 空 catch 加 log.warn/log.error
- src/l4/industry-loader.ts: 空 catch 加 log.warn/log.error
- src/l4/ontology-loader.ts: 空 catch 加 log.warn/log.error
- src/l4/traversal-permission-filter.ts: 空 catch 加 log.warn/log.error
- src/l5/ontology-event-bus.ts: 空 catch 加 log.warn/log.error
- src/llm/retry-middleware.ts: 空 catch 加 log.warn/log.error
- src/loops/loop-scheduler.ts: 空 catch 加 log.warn/log.error
- src/loops/middle-evolution-engine.ts: 空 catch 加 log.warn/log.error
- src/mcp/index.ts: 空 catch 加 log.warn/log.error
- src/monitoring/system-health.ts: 空 catch 加 log.warn/log.error
- src/mvp-server.ts: 空 catch 加 log.warn/log.error
- src/notifications/notification-loader.ts: 空 catch 加 log.warn/log.error
- src/notifications/registry.ts: 空 catch 加 log.warn/log.error
- src/orchestrator/llm-phase-executor.ts: 空 catch 加 log.warn/log.error
- src/playbook/playbook-loader.ts: 空 catch 加 log.warn/log.error
- src/providers/base.ts: 空 catch 加 log.warn/log.error
- src/providers/ernie.ts: 空 catch 加 log.warn/log.error
- src/providers/registry.ts: 空 catch 加 log.warn/log.error
- src/routes/actions-api.ts: 空 catch 加 log.warn/log.error
- src/routes/chat.ts: 空 catch 加 log.warn/log.error
- src/routes/data.ts: 空 catch 加 log.warn/log.error
- src/routes/department-workspace.ts: 空 catch 加 log.warn/log.error
- src/routes/diagnosis-upload-v2.ts: 空 catch 加 log.warn/log.error
- src/routes/diagnosis.ts: 空 catch 加 log.warn/log.error
- src/routes/documents.ts: 空 catch 加 log.warn/log.error
- src/routes/ga-diagnosis.ts: 空 catch 加 log.warn/log.error
- src/routes/ga-evolution.ts: 空 catch 加 log.warn/log.error
- src/routes/health.ts: 空 catch 加 log.warn/log.error
- src/routes/healthz.ts: 空 catch 加 log.warn/log.error
- src/routes/home.ts: 空 catch 加 log.warn/log.error
- src/routes/im.ts: 空 catch 加 log.warn/log.error
- src/routes/knowledge.ts: 空 catch 加 log.warn/log.error
- src/routes/ontology-admin.ts: 空 catch 加 log.warn/log.error
- src/routes/ontology.ts: 空 catch 加 log.warn/log.error
- src/routes/review.ts: 空 catch 加 log.warn/log.error
- src/routes/workspace.ts: 空 catch 加 log.warn/log.error
- src/security/policy-engine.ts: 空 catch 加 log.warn/log.error
- src/security/pre-upload-validator.ts: 空 catch 加 log.warn/log.error
- src/sentinel/adapters/cash-flow-sentinel.ts: 空 catch 加 log.warn/log.error
- src/sentinel/adapters/goal-alignment-sentinel.ts: 空 catch 加 log.warn/log.error
- src/sentinel/sentinel-loader.ts: 空 catch 加 log.warn/log.error
- src/services/audit-service.ts: 空 catch 加 log.warn/log.error
- src/services/behavior-monitor.ts: 空 catch 加 log.warn/log.error
- src/services/config-recovery.ts: 空 catch 加 log.warn/log.error
- src/services/db-encryption.ts: 空 catch 加 log.warn/log.error
- src/services/fault-recovery.ts: 空 catch 加 log.warn/log.error
- src/services/retry.ts: 空 catch 加 log.warn/log.error
- src/services/role-template-store.ts: 空 catch 加 log.warn/log.error
- src/services/solution-generator.ts: 空 catch 加 log.warn/log.error
- src/skill/skill-loader.ts: 空 catch 加 log.warn/log.error
- src/store/session-store.ts: 空 catch 加 log.warn/log.error
- src/store/storage-backend.ts: 空 catch 加 log.warn/log.error
- src/tui-v2/lib/commands.ts: 空 catch 加 log.warn/log.error
- scripts/check-secrets.sh: 默认值误报修复 (用户批准)
- scripts/pre-commit-check.sh: 硬编码误报 + import type 过滤修复 (用户批准)

不做什么：
- 不改任何函数签名（*.ts 内 export 签名不变）
- 不新增测试文件（*.test.ts 不新建）
- 不修改 scripts/audit/audit-check.py（D290 已完成）
- 不修改 src/agent/session-service.ts（非本任务文件）
- 不修改 expert/*.md、sentinel/*.yaml、knowledge/*.md、theory/*.md、skills/*.md 文件驱动目录


## Q3: 验收 — 入口 → 交互 → 结果

入口：CLI 触发 `python scripts/audit/audit-check.py --full`
处理：脚本扫描 src/ 下所有 catch 块，检测是否包含 log.warn/log.error
结果：终端输出 `[3] ERRORS: 0`（之前是 23）

## 架构层:
L1-L4 跨层 — 纯 catch 修复, 无跨层 import 变更

## Done 标准
- [ ] 23 处空 catch 全部修复（每处有 log.warn/log.error）
- [ ] `python scripts/audit/audit-check.py --full` → [3] ERRORS: 0
- [ ] tsc --noEmit 零新增错误
- [ ] vitest run 零新增失败
- [ ] 通过控制塔提交（synova-commit），不绕开 --no-verify
