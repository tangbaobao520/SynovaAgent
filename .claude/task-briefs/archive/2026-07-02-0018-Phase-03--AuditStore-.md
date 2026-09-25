# Task Brief: Phase 0.3 审计日志服务 AuditStore + AuditService

> 生成: 2026-07-02 00:18:52 | 分支: feat/prompt-architecture | as any: 1

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

流程约束: V4.2.9 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

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

本任务属于**基础设施（审计日志）**。触及 L4（src/l4/audit-store.ts 存储层）+ L1（src/routes/audit.ts API）+ L2（src/server.ts 初始化）。
现有模块：src/security/connector-audit.ts（连接器专用审计，格式不同）。本任务创建通用审计日志系统。

### b) 文件审计
grep audit 在 expert/ sentinel/ extensions/ → 0 匹配。无重复。

### c) 决策
无覆盖 → 新建。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
  ① SPEC 已定义（本 brief）
  ② 测试 — 先写（AuditStore CRUD + AuditService + API）
  ③ 实现 — Done 全部完成 + 测试通过 + 接线完整 + 错误有 log + tsc/vitest 零失败
  ④ 接线 — 端到端（API 可写审计日志 + 可查询）
  ⑤ 验证 — 自检 6 问

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 24+31: catch 有 log + degraded
  - 铁律 32: 错误分类强制
  - 铁律 38: as any 零容忍

### b) 本任务执行约束
- rule: "审计日志仅追加，不支持 UPDATE/DELETE"
  verify: grep -rn INSERT.*INTO.*audit_log src/l4/audit-store.ts
- rule: "审计路由只允许 admin/owner 访问"
  verify: grep -rn FORBIDDEN src/routes/audit.ts
- rule: "审计日志写入失败不能影响主业务流程（降级）"
  verify: grep -rn degraded src/services/audit-service.ts

## Q2: 范围 — 正确的最简方案是什么？

**做什么：**
1. src/l4/audit-store.ts — 审计日志存储（audit_log 表 append-only）
2. src/services/audit-service.ts — 审计日志服务（log/query/getGAHistory）
3. src/routes/audit.ts — 审计日志 API（GET /api/audit, GET /api/audit/ga/:gaId）
4. src/server.ts — 初始化 + 注册路由
5. 测试

**不做什么：**
- 不改 src/security/connector-audit.ts（独立系统）
- 不实现自动归档（v2）
- 不涉及 packages/ 包

## Q3: 验收 — 入口 → 交互 → 结果

入口：Enterprise Owner 调用 GET /api/audit
处理：JWT 鉴权 → RBAC 角色检查（admin/owner only）→ AuditService.query()
结果：返回审计日志 JSON 数组

## 本任务在哪一层
L4（audit-store.ts）+ L1（routes/audit.ts）+ L2（server.ts）

## Done 标准
- [ ] AuditStore.log() 写入 audit_log 表
- [ ] AuditStore.query() 按 orgId + filters 查询
- [ ] GET /api/audit 返回审计日志（admin 200, GA 403）
- [ ] GET /api/audit/ga/:gaId 返回 GA 操作历史
- [ ] 测试全部通过 + tsc 零错误 + CI success
