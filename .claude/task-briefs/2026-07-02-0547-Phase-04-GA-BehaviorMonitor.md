# Task Brief: Phase 0.4 GA行为监控 BehaviorMonitor

> 生成: 2026-07-02 05:47:52 | 分支: feat/prompt-architecture | as any: 0

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

本任务属于**基础设施（GA 行为监控）**。触及 L2（src/services/ 服务层）。
依赖 Phase 0.3 AuditStore 审计日志作为数据源，输出告警信号。
现有模块：AuditService（审计日志查询）、通知系统 registry（告警分发）。

### b) 文件审计
grep behavior-monitor 在 src/ → 0 匹配。全新文件。

### c) 决策
无覆盖 → 新建。依赖 AuditService 但不修改它。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
  ① SPEC 已定义（本 brief）
  ② 测试 — 先写（BehaviorMonitor 4 规则 + evaluate）
  ③ 实现 — 满足 Done 标准 + 测试通过 + 接线完整
  ④ 接线 — evaluate 在 AuditService.log() 后异步调用
  ⑤ 验证 — 自检 6 问

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 24+31: catch 有 log + degraded
  - 铁律 38: as any 零容忍

### b) 本任务执行约束
- rule: "BehaviorMonitor.evaluate 必须降级安全（不抛异常到 AuditService）"
  verify: grep -rn 'try\|catch\|degraded' src/services/behavior-monitor.ts
- rule: "4 条规则各自独立实现，互不影响"
  verify: grep -rn 'checkBulkModification\|checkOffHoursActivity\|checkRapidCorrections\|checkThresholdManipulation' src/services/behavior-monitor.ts | wc -l

## Q2: 范围 — 正确的最简方案是什么？

**做什么：**
1. src/services/behavior-monitor.ts — BehaviorMonitor
   - BehaviorAlert 接口
   - 4 条检测规则（checkBulkModification / checkOffHours / checkRapidCorrections / checkThresholdManipulation）
   - evaluate(entry) 统一入口
   - 每条规则查询 AuditService 最近记录做模式匹配

2. src/services/audit-service.ts — 修改
   - log() 末尾异步调用 BehaviorMonitor.evaluate()

**不做什么：**
- 不创建 `src/notifications/` 通知推送渠道（Phase 4 处理）
- 不修改 `src/l4/audit-store.ts` 的 audit_log schema 或已有方法（仅新增 rawQuery）
- 不涉及 `packages/` 下的任何文件
- 不修改 `src/routes/` 或 `src/server.ts`

## Q3: 验收 — 入口 → 交互 → 结果

入口：每次 AuditService.log() 调用 → 自动触发 BehaviorMonitor.evaluate()
处理：evaluate 异步运行 4 条规则，每条查询审计日志分析模式
结果：返回 BehaviorAlert[]，记录到 logger

## 本任务在哪一层
L2（src/services/）+ L4（src/l4/audit-store.ts 新增 rawQuery）+ L4（src/l4/audit-store.ts 新增 rawQuery）

## Done 标准
- [ ] checkBulkModification: 5 分钟内同 actor >10 次操作 → alert
- [ ] checkOffHoursActivity: 工作时段外（22:00-06:00）操作 → alert
- [ ] checkRapidCorrections: 30 分钟内同 actor 5 次纠错 → alert
- [ ] checkThresholdManipulation: 24 小时内下调 4 个阈值 >30% → alert
- [ ] evaluate 对所有规则统一入口，降级安全
- [ ] 测试全部通过 + tsc 零错误 + CI success
