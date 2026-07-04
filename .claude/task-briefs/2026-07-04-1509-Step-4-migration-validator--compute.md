# Task Brief: Step 4: migration-validator — compute迁移验证器

> 生成: 2026-07-04 15:09:34 | 分支: session/04 | as any: 0

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
- [x] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

**系统**: 基础设施 — L4 本体层。
**本任务**: 一次性迁移验证器。Task B（compute 函数重写）完成后，用于验证新旧 compute 输出一致性。
**现有模块**: 
- `src/l4/graph-traversal.ts` (新建，Step 3完成)
- `src/l4/temporal-baseline.ts` (新建，Step 3完成)
- `extensions/ontology/` (新实体+边类型就绪)

### b) 文件审计
- `src/l4/migration-validator.ts` — 不存在（本次创建）
- `tests/l4/migration-validator.test.ts` — 不存在（本次创建）
- 无已有覆盖。纯新建。

### c) 决策
无覆盖 → 新建。遵循 SYNOVA-IMPL 规范中 migration-validator 接口定义。
不含任何 compute 函数的具体引用（只提供框架）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
1. SPEC: migration-validator 是 Task B 完成后的验证工具，当前只需编译通过
2. 先写单元测试（验证 diff 计算、状态分类的准确性）
3. 实现 validator 核心逻辑
4. 验证 tsc + vitest 通过
5. 这一工具在 Phase 3 完成后会被删除（一次性工具）

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 24+31: catch 必须有 log + degraded
- memory/stub-implementation-pattern.md: 每个函数必须有真实内容，不能只写骨架

### b) 本任务执行约束
**rule 1**: migration-validator 必须能正确计算 diffPercent 并分类 pass/review/block
verify: grep -q "diffPercent\|status.*pass\|status.*block" src/l4/migration-validator.ts && echo "PASS" || echo "FAIL"

**rule 2**: 每条 catch 必须有 log.warn 或 log.error
verify: grep -E "catch\s*\(" src/l4/migration-validator.ts | wc -l | xargs -I{} bash -c 'test "{}" -ge 1 && echo "PASS" || echo "FAIL"'

## Q2: 范围 — 正确的最简方案

**做什么**: 
1. `src/l4/migration-validator.ts` — ValidationReport 接口 + validateMigration() 函数
   - validateMigration(oldCompute, newCompute, testData) → ValidationReport
   - 自动计算 diffPercent = |old - new| / max(|old|, 1)
   - 自动分类：<1% pass, 1-5% review, >5% block
   - 批量入口：validateAll(oldComputes, newComputes, testData) → ValidationReport[]
2. `tests/l4/migration-validator.test.ts` — 单元测试覆盖 diff 精度和状态分类

**不做什么**: 
- 不改任何 compute 函数（如 kz-index.ts、cash-runway.ts）
- 不改 sentinel-loader.ts
- 不改 ontology-loader.ts
- 不创建测试数据夹具（Phase 3 时做）
- 不接入真实 compute 函数（等 Task B 完成后接入）

## Q3: 验收 — 入口 → 交互 → 结果

入口: `npx vitest run tests/l4/migration-validator.test.ts`
处理: 测试验证 diff 精度（0.5%/3%/10%）、降级标记、批量模式
结果: 测试全部通过 + tsc 零错误

## 本任务在哪一层

L4（本体层）— 一次性验证工具

## Done 标准
- [x] verify: npx vitest run tests/l4/migration-validator.test.ts 2>&1 | tail -5 | grep -q "passed" && echo "PASS" || echo "FAIL"
- [x] verify: grep -c "diffPercent" src/l4/migration-validator.ts && echo "PASS" || echo "FAIL"
- [x] verify: grep -c "validateMigration" src/l4/migration-validator.ts && echo "PASS" || echo "FAIL"
- [x] verify: npx tsc --noEmit 2>&1 | grep -c "error" | grep -q 0 && echo "PASS" || echo "FAIL"
