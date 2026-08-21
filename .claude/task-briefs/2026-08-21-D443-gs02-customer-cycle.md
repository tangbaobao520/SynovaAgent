# Task Brief: D443: GS-02 客户循环场景脚本 — crm-standard 注入 → customer-demand-shift 越阈（诚实 RED 契约错位）

> 生成: 2026-08-21 11:11:34 | 分支: main | as any: 0

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
- [x] 扩展（脚本场景，不改产品代码）
客户循环验收证据层（S1-1/S1-4）：`scripts/golden-scenarios/GS-02-customer-cycle/`（run.sh + fixtures + expect.json + README），复用 D361 common/ + GS-03/GS-05 模式（D462 修复链：JWT/SYNOVA_DB_PATH/后台 bootstrap）。零 src/ 产品代码变更。

### b) 文件审计
- `extensions/ontology/field-mappings/crm-standard.json` — 只读（映射契约，错位根因）
- `extensions/sentinels/customer-demand-shift/`（aggregate.ts:32-38 需 name/revenue/churn/nps）— 只读
- `src/agent/data-ingest-service.ts`（ingestBatch：props 无 teamId/revenue/churn）— 只读
- `scripts/golden-scenarios/GS-03-capital-cycle/` + `GS-05-alert-closure/` — 模式参照
关系: 全复用零修改。

### c) 决策
无冲突；诚实 RED 先例（GS-03 初版/D445）。决策参考系见 Q1c。

## 注入上下文
### DECISION-REFERENCE

> D333 决策参考框架全文（创始人 2026-08-13 定）:

# 决策参考框架（双参考系）

> 2026-08-13 创始人定 | 用途：遇到难决策/多选项/最佳实践选择时，强制走四步参考，并记录所用参考系
> 触发条件：①多选项需取舍 ②设计/架构方案选择 ③优先级排序 ④"最佳实践是什么"类问题 ⑤实现与文档声称冲突时

## 四步框架

```
① 第一性原理（DeepSeek/梁文峰）：这个问题的最简本质是什么？最少机制能解决吗？
② Anthropic 工程基线：隔离/失败即关闭/脚本验证/机器可验契约——哪条适用？
③ 开源实证（DeepSeek）：有可克隆的代码/架构参考吗？clone 下来看实际做法（成本/效率/结构）
④ 收敛检查：两参考系是否指向同一答案？收敛 = 大概率正确；分歧 = 值得深挖
```

## 双参考系边界

| 参考系 | 适用 | 不适用 |
|--------|------|--------|
| **Anthropic 工程实践** | agent 隔离、门禁/fail-closed、脚本化验证、机器可验契约、并行协作 | 成本/产品定位/模型选择 |
| **DeepSeek 第一性原理 + 开源实证** | 产品哲学、成本/效率/架构取舍、反内卷、开源参考（clone 仓库） | 工程流程细节（其仓库是模型/推理代码，非 agent 协作） |

## 梁文峰原则摘要（DeepSeek 参考时使用）

- **第一性原理**：不做无意义的炫技，回到问题本质
- **极致成本**：能用最少机制解决就不用多的（这正好支持"worktree 隔离 = 最少机制"而非 N 个门禁）
- **开源开放**：能参考开源实证就不闭门造车
- **反内卷**：机制是为了减少摩擦，不是为了增加流程

## 记录要求（可验证，不靠记忆）

- Codex 决策：在 dev doc / 本会话回复中**明确写"参考：Anthropic/DeepSeek/第一性原理 + 结论"**
- Claude Code 决策：dev doc 要求完成报告含**决策记录**（决策点 + 参考系 + 理由），K3 审计可核

## 已用案例

| 日期 | 决策 | 参考系 | 结论 |
|------|------|--------|------|
| 2026-08-13 | 并行 agent 冲突（串行 vs 并行） | Anthropic（隔离基线）+ DeepSeek（最少机制） | 收敛：worktree 隔离（D307）优先解锁并行 |


## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① 侦察（映射/sentinel/ingest 契约）→ ② 脚本骨架（run.sh/expect.json 先行）→ ③ 本地跑通 → ④ 证据落盘 → ⑤ 提交
引用：铁律 0-2、GSS 运行契约 8 条、GS-03/GS-05 模式复用

### b) 执行约束（带 verify）
- rule: "断言带 purpose 且含负向" verify: "grep -c purpose scripts/golden-scenarios/GS-02-customer-cycle/expect.json >= 3 && grep -c notContains expect.json >= 1"
- rule: "隔离三件套（JWT/SYNOVA_DB_PATH/后台 bootstrap）" verify: "grep -cE 'JWT_SECRET|SYNOVA_DB_PATH|bootstrap-state.json' run.sh >= 3"

### c) 决策参考系
- 复用 vs 新建：复用 GS-03/GS-05 模式（D462 已验证的修复链）→ 最少机制
- 诚实 RED 处置：映射↔compute 契约错位（revenue/churn 缺失）是产品缺口，场景如实 RED 并文档化（转绿 = 新任务，参照 D355 先例）
记录格式: 参考：Anthropic（机器可验）+ 第一性原理（复用最少机制）+ 结论：复用模式 + 诚实 RED

### d) 相关 Note 引用
- [x] memory/notes/implemented/2026-08-21-d443-gs02-customer-cycle.md（本任务决策已沉淀）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- scripts/golden-scenarios/GS-02-customer-cycle/run.sh: 场景执行（JWT 自举 → fresh-db → bootstrap → 空库负向 → 注入 crm-standard → 触发 customer-demand-shift → 断言 → 证据）
- scripts/golden-scenarios/GS-02-customer-cycle/expect.json: 3 断言（注入 ok / critical 触发 / 负向不误报）
- scripts/golden-scenarios/GS-02-customer-cycle/fixtures/crm-shift.json: 越阈数据（流失率 0.25 / NPS -10 / 集中度 0.5）
- scripts/golden-scenarios/GS-02-customer-cycle/README.md: 场景 + 诚实 RED 状态 + 契约错位根因文档
- scripts/golden-scenarios/evidence/GS-02-2026-08-21.json: 场景运行证据（calc-progress 消费，git 跟踪）
- task-state/D443.json: impl 段回填

不做什么：
- 不改 extensions/sentinels/customer-demand-shift/ — 产品代码（契约错位是独立修复任务）
- 不改 extensions/ontology/field-mappings/crm-standard.json — 产品配置
- 不改 src/ 产品代码 / scripts/golden-scenarios/common/ — 领地
- 不改 scripts/audit/ — 审计红线

## Q3: 验收 — 入口 → 交互 → 结果

入口：`bash scripts/golden-scenarios/GS-02-customer-cycle/run.sh`
处理：fresh-db → bootstrap → 空库触发（负向）→ 注入 crm-standard → 触发 customer-demand-shift → 断言
结果：机器判定 exit 0/1 + evidence/GS-02-<date>.json（诚实 RED：注入绿 + critical RED 契约错位文档化）

## 架构层: 扩展层
scripts/golden-scenarios/ 证据工厂——零产品代码变更（只调 /api/data/upload + /api/sentinel/run 真实路由）。
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [x] verify: bash scripts/golden-scenarios/GS-02-customer-cycle/run.sh 可执行（exit 0/1 机器判定）
- [x] verify: grep -c "purpose" expect.json >= 3（断言非空壳）
- [x] verify: grep -cE "notContains" expect.json >= 1（负向断言）
- [x] verify: ls scripts/golden-scenarios/evidence/GS-02-*.json（证据落盘）
- [x] verify: git diff --name-only 仅限 GS-02 目录 + task-state/D443.json + brief/note（写集一致）
