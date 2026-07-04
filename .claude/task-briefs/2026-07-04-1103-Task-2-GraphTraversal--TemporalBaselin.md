# Task Brief: Task 2: GraphTraversal + TemporalBaseline 实现

> 生成: 2026-07-04 11:03:23 | 分支: session/04 | as any: 0

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

## Q0: 定位

### a) 项目拼图
- [x] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包）
- [ ] 扩展（文件驱动，不改代码）

**系统**: 基础设施 — L4 本体层 -> L3 洞察层桥接能力。
**现有模块**: `src/l4/graph-bridge.ts` (图数据写入), `src/l4/ontology-loader.ts` (类型加载).
**本任务**: 创建 GraphTraversal 工具类，供 compute 函数迁移时进行图遍历。

### b) 文件审计
- `src/l4/graph-traversal.ts` — 不存在（新建）
- `src/l4/temporal-baseline.ts` — 不存在（新建）
- `extensions/ontology/` — 新实体+边类型已就绪

### c) 决策
无覆盖 → 新建。不写桥接/兼容层。实现直接使用 GraphStore 原语。

## Q1: 调研

### a) Anthropic 决策链
1. 先写 GraphTraversal 接口（traverse/getTemporalParams/scanOutliers/evaluateEdges）
2. 写 TemporalBaseline（Holt-Winters 时序分析）
3. 写单元测试（mock GraphStore）
4. 验证 tsc + vitest → 全绿

### b) 执行约束
**rule 1**: traverse() 必须从起始节点沿边类型遍历到 1 步深度，返回节点+边
verify: grep -q "traverse" src/l4/graph-traversal.ts && echo "PASS" || echo "FAIL"

**rule 2**: TemporalBaseline computeTemporalBaseline() 必须正确识别 decelerating/stable trend
verify: grep -q "decelerating\|stable" src/l4/temporal-baseline.ts && echo "PASS" || echo "FAIL"

## Q2: 范围
**做什么**: GraphTraversal 接口+实现 (traverse/scanOutliers/evaluateEdges/getTemporalParams) + TemporalBaseline + 单元测试
**不做什么**: 不改任何 compute 函数（如 kz-index.ts、cash-runway.ts），不改 sentinel-loader.ts，不改 ontology-loader.ts

## Q3: 验收
入口: src/l4/graph-traversal.ts / src/l4/temporal-baseline.ts
处理: 单元测试验证 BFS 遍历、时序差分、异常扫描
结果: 测试全部通过 + tsc 零错误

## 本任务在哪一层

L4（本体层）— 图遍历工具

## Done 标准
- [x] verify: npx vitest run src/l4/graph-traversal.test.ts 2>&1 | tail -5 | grep -q "passed" && echo "PASS" || echo "FAIL"
- [x] verify: npx vitest run src/l4/temporal-baseline.test.ts 2>&1 | tail -5 | grep -q "passed" && echo "PASS" || echo "FAIL"
- [x] verify: npx tsc --noEmit 2>&1 | grep -c "error" | xargs -I{} bash -c 'test "{}" -eq 0 && echo "PASS" || echo "FAIL"'
