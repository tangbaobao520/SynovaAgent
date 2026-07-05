# Task Brief: Phase 0: Inject GraphTraversal into SentinelContext + sentinel-loader

> 生成: 2026-07-05 02:59:05 | 分支: session/04 | as any: 0

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

流程约束: V4.3.0 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

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
- [x] 纵向（改 L3 代码）— src/sentinel/types.ts + src/sentinel/sentinel-loader.ts

**系统**: 哨兵基础设施 — L3 洞察层。
**本任务**: 在 SentinelContext 增加 traversal 字段，让 sentinel-loader.ts 构建 GraphTraversal 实例并注入到 aggregate 的 check() 调用中。
- 当前: `sentinelObj.check(store, teamId)` 
- 改为: `sentinelObj.check(store, teamId, traversal?)`
- traversal 是第 3 个可选参数。JavaScript 忽略多余实参，旧 aggregate 不收它也能继续工作。
- 本层现有模块: types.ts (接口)、sentinel-loader.ts (动态加载)、registry.ts (注册中心)、runner.ts (Cron 调度)

**本任务是新增能力**（给已有接口加字段），不是替换或扩展已有模块。

### b) 文件审计
- `src/sentinel/types.ts` — `SentinelContext` 接口。增加 `traversal?: GraphTraversal`。
- `src/sentinel/sentinel-loader.ts` — `registerLoadedSentinels()` 的 check() wrapper。注入 traversal。
- `src/l4/graph-traversal.ts` — 已有的 `GraphTraversal` 实现（Task A 已完成，46 行完整实现）。
- `src/sentinel/index.ts` — 导出 GraphTraversal 类型。
- `extensions/sentinels/*/aggregate.ts` — 50 个 aggregate（本任务不改，是后续 Phase 1-5 的目标）。

关系: 本任务是**复用已有 GraphTraversal**（Task A 完整实现），接入哨兵加载链路。L3 调用 L4 合法（五层架构：L3→L4）。

### c) 决策
无覆盖 → 新建基础设施连接。GraphTraversal API 已存在（L4），哨兵在 L3，本任务是 L3→L4 的合法桥接。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行：
  ① SPEC / Done 标准 — 定义「怎么算做完」
  ② 测试 — 先写集成测试（验证 sentinel-loader 注入 traversal）
  ③ 实现 — 刚好满足 Done 标准全部条件
  ④ 接线 — sentinel-loader → aggregate 收到 traversal
  ⑤ 验证 — 自检 6 问

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 7: 入口可触达（哨兵加载时通过 sentinel-loader） + 完整链路走通 + 结果可见
  - 铁律 24+31: traversal 构建失败 → log.warn + 不传 traversal（旧路径继续工作，降级但不静默）
  - 铁律 38: as any 零容忍 — GraphStore 转型用类型守卫
  - `memory/engine-core-bridge-files.md`: 桥接文件事故教训 — 本任务是合法 L3→L4 调用，不建代理

### b) 本任务执行约束

- rule: "GraphTraversal 构建失败必须 log.warn，不能静默吞掉"
  verify: "grep -c 'log.warn.*traversal' src/sentinel/sentinel-loader.ts | xargs test 1 -eq"

- rule: "traversal 是可选参数，旧 aggregate 不收也能继续工作"
  verify: "grep -c 'traversal?' src/sentinel/sentinel-loader.ts | xargs test 1 -eq"

- rule: "禁止 as any，使用类型守卫转型"
  verify: "grep -c 'as any' src/sentinel/sentinel-loader.ts | xargs test 0 -eq"

## Q2: 范围 — 正确的最简方案是什么？

**做什么**（3 个文件修改 + 1 个测试文件新增）:
- `src/sentinel/types.ts`: `SentinelContext` 增加 `traversal?: GraphTraversal` 和 `teamId?: string`
- `src/sentinel/sentinel-loader.ts`: 导入 `createGraphTraversal`，构建实例，作为第 3 参传 `sentinelObj.check(store, teamId, traversal)`
- `src/sentinel/index.ts`: 导出 `GraphTraversal` 类型
- `tests/sentinel/graph-traversal-integration.test.ts`: 集成测试验证注入链路

**不做什么**:
- 不改任何 aggregate.ts 文件（那是 Phase 1-5 的任务）
- 不改 `src/l4/graph-traversal.ts`（Task A 已完成）
- 不改 `src/sentinel/runner.ts`（上下文传递是 sentinel-loader 层的事）
- 不改 `src/sentinel/registry.ts`、`src/sentinel/builtins.ts`
- 不改 `src/sentinel/types.ts` 中 Sentinel 接口本身（`check(context)` 签名不变）
- 不加新 JSON 文件（不是文件驱动扩展）
- 不改旧哨兵适配器 `src/sentinel/adapters/cash-flow-sentinel.ts`
- 不改 `@synova/graph-store` 包
- 不改 `extensions/sentinels/*/manifest.json`

## Q3: 验收 — 入口 → 交互 → 结果

**入口**: `src/sentinel/sentinel-loader.ts` 的 `registerLoadedSentinels()` 在加载每个延伸哨兵时调用 check() wrapper。
**处理**: wrapper 从 context.db 构建 GraphTraversal → 传入 `sentinelObj.check(store, teamId, traversal)`。
**结果**: aggregate 的 check() 收到第 3 个参数 traversal（类型 `GraphTraversal | undefined`）。旧 aggregate 不受影响。

## 本任务在哪一层
L3（洞察层 — 哨兵加载链路）

## Done 标准
- [x] verify: grep -c "traversal" src/sentinel/sentinel-loader.ts | xargs test 3 -le && echo "PASS"
- [x] verify: grep -c "GraphTraversal" src/sentinel/types.ts | xargs test 1 -le && echo "PASS"
- [x] verify: grep -c "GraphTraversal" src/sentinel/index.ts | xargs test 1 -le && echo "PASS"
- [x] verify: npx tsc --noEmit 2>&1 | grep -c "error" | xargs -I{} bash -c 'test {} -eq 0 && echo "PASS" || echo "FAIL"'
- [x] verify: npx vitest run tests/sentinel/graph-traversal-integration.test.ts --reporter=verbose 2>&1 | grep -q "passed" && echo "PASS"
- [x] verify: grep "as any" src/sentinel/sentinel-loader.ts && echo "FAIL" || echo "PASS"

---

## Task Brief Checklist
- [x] Q0 定位: 项目拼图 + 文件审计 + 决策
- [x] Q1 调研: 决策链 + 执行约束（含 verify 命令）
- [x] Q2 范围: 做什么 + 不做什么
- [x] Q3 验收: 入口 → 处理 → 结果
- [x] 架构层级: L3
- [x] Done 标准: 可证伪的 verify 命令
- [ ] plan.json: 待创建
- [ ] Q2 排除项含文件路径
