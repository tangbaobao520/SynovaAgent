# Task Brief: Phase 0.2 GraphStore deleteNode/deleteEdge 权限检查

> 生成: 2026-07-01 22:51 | 分支: feat/prompt-architecture | as any: 0

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

本任务属于**基础设施（权限管控）**。触及 L4（packages/graph-store/ 本体存储层）+ L2（src/server.ts 初始化接线）。
现有模块：
- `packages/graph-store/src/graph-store.ts` — SynovaGraphStoreImpl（deleteNode/deleteEdge 无权限检查）
- `packages/error-types/src/index.ts` — PermissionDeniedError（已存在，code='PERMISSION_DENIED'）
- `src/services/request-context.ts` — AsyncLocalStorage 请求上下文（getCurrentUser）
- 17 处 createSynovaGraphStore 调用点

本任务：**扩展** graph-store（新增全局可注入权限检查器），**接线** server.ts 初始化。

### b) 文件审计
grep `deleteNode|deleteEdge` 在 src/ 中 → 仅 3 处引用（post-diagnosis-processor interface, graph-bridge interface, diagnosis-upload-v2 stub）。无实际运行时调用点。本任务是前瞻性安全加固。

### c) 决策
无业务冲突。新建权限检查器机制 + 接线到 server.ts。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行：
  ① SPEC / Done 标准 — 本 brief 已定义
  ② 测试 — 先写测试（deleteNode/deleteEdge 权限检查）
  ③ 实现 — 满足以下全部条件：
     - Done 标准中列出的所有完成项
     - 测试全部通过
     - 接线完整（setGraphStoreDeletePermissionChecker 在 server.ts 被调用）
     - 错误路径有 log + degraded（PermissionDeniedError 抛出）
     - tsc + vitest 零失败
  ④ 接线 — 端到端走通
  ⑤ 验证 — 自检 6 问

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 24+31: catch 有 log + degraded 信号传播
  - 铁律 32: 错误分类强制（code + phase + retryable）
  - 铁律 38: as any 零容忍
  - 铁律 46: 禁止桥接文件（本任务不引入 engine-core 依赖）

### b) 本任务执行约束

- rule: "deleteNode/deleteEdge 在权限不足时必须抛出 PermissionDeniedError（非静默忽略）"
  verify: "grep -rn 'PermissionDeniedError' packages/graph-store/src/graph-store.ts"
- rule: "权限检查器未设置时 deleteNode/deleteEdge 必须向后兼容（不抛异常）"
  verify: "grep -rn 'deletePermissionCheck' packages/graph-store/src/graph-store.ts"
- rule: "setGraphStoreDeletePermissionChecker 必须在 server.ts 中被调用"
  verify: "grep -rn 'setGraphStoreDeletePermissionChecker' src/server.ts"

## Q2: 范围 — 正确的最简方案是什么？

**做什么：**
1. `packages/graph-store/src/graph-store.ts`
   - 新增 `PermissionChecker` 类型
   - 新增模块级 `globalDeletePermissionChecker` 变量
   - 导出 `setGraphStoreDeletePermissionChecker(checker)` — 设置全局检查器
   - `deleteNode()`: 执行前调用检查器，拒绝时抛 `PermissionDeniedError`
   - `deleteEdge()`: 同上
   - 导入 `PermissionDeniedError` from `@synova/error-types`

2. `src/server.ts` — GraphStore 初始化处接线
   - 导入 `setGraphStoreDeletePermissionChecker`
   - 导入 `getCurrentUser` from request-context
   - 设置检查器：无用户上下文→允许，非 admin/owner→拒绝

3. 测试
   - `tests/l4/synova-graph-store-permission.test.ts` — 权限检查单元测试

**不做什么：**
- ❌ 不改 `packages/graph-store/src/graph-store.ts` 的 createNode/queryNodes 等非删除方法
- ❌ 不改 `packages/graph-store/src/graph-store.ts` 的 SynovaGraphStore 接口签名
- ❌ 不修改 `packages/error-types/src/index.ts`（PermissionDeniedError 已存在）
- ❌ 不改 `src/l4/graph-bridge.ts` 或 graph-bridge 相关文件
- ❌ 不涉及前端/API 路由
- ❌ 不涉及 sentinel/agent 层
- ❌ 不涉及 graph-bridge 或其他 L4 模块

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：
  GA/非管理员用户调用 deleteNode/deleteEdge（通过 API 路由→GraphStore）

处理（中间经过哪些步骤）：
  1. GraphStore deleteNode/deleteEdge 被调用
  2. 检查 globalDeletePermissionChecker 是否存在
  3. 存在则调用检查器
  4. 检查器从 request-context (AsyncLocalStorage) 读取当前用户角色
  5. 非 admin/owner → 抛出 PermissionDeniedError
  6. 无上下文或 admin/owner → 正常执行软删除

结果（最终展示在哪）：
  - GA 调用 deleteNode → 403/PermissionDeniedError
  - Admin 调用 deleteNode → 正常软删除
  - 内部系统调用（无请求上下文）→ 正常软删除
  - 无检查器时（旧代码兼容）→ 正常软删除

## 本任务在哪一层
L4（packages/graph-store/ 存储层）+ L2（server.ts 接线）

## Done 标准
- [ ] 入口可触达: setGraphStoreDeletePermissionChecker 导出并可在 server.ts 调用
- [ ] 链路走通: GA 角色调用 deleteNode → PermissionDeniedError
- [ ] 结果可见: deleteNode/deleteEdge 权限检查的 vitest 测试通过
- [ ] tsc --noEmit 零错误
- [ ] pre-commit 8 组通过
- [ ] CI success
