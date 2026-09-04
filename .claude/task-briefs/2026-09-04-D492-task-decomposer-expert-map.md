# Task Brief: D492 task-decomposer DIMENSION_EXPERT_MAP 对齐 7 位专家

> 生成: 2026-09-04 12:58:39 | 分支: feat/win-d492-dimension-expert-map | as any: 0

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
  L3 洞察: l3/ sentinel/ expert-platform/ expert/ (7 位文件驱动专家: host capital-cycle customer-cycle talent-cycle tech finance-structure competitive-strategy)
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
Synova = 组织数字孪生诊断 + 持续增长导航系统，本任务修的是 L2 编排层 src/agent/task-decomposer.ts 的维度→专家映射（D8b 任务分解协议）。该层现有模块: TaskDecomposer（decompose/executeSubTask/aggregate）+ DIMENSION_EXPERT_MAP（L82-93，全仓唯一的维度→专家映射表）+ runHandlerForDimension（L245-251，动态 import ExpertRouter 后 dispatch）。本任务是替换/修复: DIMENSION_EXPERT_MAP 十个映射值中 8 个指向 D282 已删除的旧专家名（finance/marketing/org/strategy/operations），两处 fallback（L139/L251）也是旧名 'org'，与 expert-registry.yaml v2.0 的 7 位新专家脱节；测试同债（executeSubTask 2 用例走旧名专家 → degraded → failed）。不新增模块，不建新包，不碰文件驱动 expert/ 目录。

### b) 文件审计
grep DIMENSION_EXPERT_MAP 全仓库: 仅定义与消费处 src/agent/task-decomposer.ts（L82 定义 + L139/L251 消费），无第二份映射表。grep executeSubTask 生产调用方: src/agent/main-agent.ts:321（loop-1 季度诊断链）。expert/ 目录实测 7 位新专家（host capital-cycle customer-cycle talent-cycle tech finance-structure competitive-strategy）+ _deprecated + _template；expert-registry.yaml v2.0 为 D282 定稿唯一源。expert-router.ts selectExpert（D491 已修）是 id 关键词→专家，方向不同、无重复。inferDimensionFromSentinel（L96-104）是 sentinel→维度（键方向），无 bug 不改。关系: 复用现有 TaskDecomposer 骨架，只修映射值与测试，不新建文件。

### c) 决策
已有覆盖→复用: expert-registry.yaml v2.0 7 位专家名为唯一权威，DIMENSION_EXPERT_MAP 映射对齐它，不新建硬编码专家清单之外的名字。无覆盖→不需要文件驱动新增（纯改名映射）。冲突→无冲突，dev doc §4.5 已给默认映射表（与 D491 selectExpert 语义一致），实现按表执行，若按 tools 语义微调则在 dev doc §3.2 同 commit 回填。映射取舍属单一路径决策，参考系见 Q1c。

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
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — dev doc docs/plans/codex/implementation/SYNOVA-IMPL-D492-task-decomposer-expert-map-20260902.md §6 DS1-DS8 已定义怎么算做完
  ② 测试 — 先改 tests/agent/task-decomposer.test.ts 用 7 位专家名跑红（现状 2 failed 是旧名事故场景本身），测试 = 产品的一部分
  ③ 实现 — DIMENSION_EXPERT_MAP + fallback 刚好满足: red 用例归零 + decompose/executeSubTask 拿到在册专家 + tsc vitest 零失败
  ④ 接线 — 无新 export; 修映射值使既有生产调用方（main-agent.ts:321 executeSubTask）拿到正确专家; decompose L139 与 runHandlerForDimension L251 两个消费点同表受益
  ⑤ 验证 — 自检 6 问（接线/异常/类型/测试/残留/文件驱动）+ DS1-DS8 逐条机器可验

引用依据（至少引用两项）：
  - 铁律 0-2: spec → test → impl → wire → review → merge; 本任务 red→green 严格先行
  - 铁律 9: 关键变更 grep 全仓库传播 — DIMENSION_EXPERT_MAP 值改动须 grep 确认两个消费点（L139/L251）同表同步受益
  - 铁律 24+31: runHandlerForDimension 已 fail-closed 返回 degraded + log.warn，本任务不新增 catch
  - 铁律 33: tests/agent/task-decomposer.test.ts 命名符合 *.test.ts 单元约定
  - memory/2026-09-02-d491 记录: D491 越界发现本映射债（task-decomposer.ts:82-93 旧名 + fallback 'org'），即本任务修复对象

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
  - rule: "DIMENSION_EXPERT_MAP 映射值只允许 expert-registry.yaml v2.0 的 7 位专家名, 两处 fallback 必须是 host"
    verify: "grep -n \": 'finance'\\|: 'marketing'\\|: 'org'\\|: 'strategy'\\|: 'operations'\" src/agent/task-decomposer.ts 返回 0 命中（映射值口径; includes() 关键词行不在此口径）"
  - rule: "新专家名必须出现在映射表与 fallback 中（正向物证）"
    verify: "grep -n \"finance-structure\\|customer-cycle\\|talent-cycle\\|competitive-strategy\\|'host'\" src/agent/task-decomposer.ts 命中 ≥6 行"
  - rule: "测试必须真跑红再跑绿, 不得只改断言不改实现, 不得改 router/dispatcher/loader/expert 目录"
    verify: "npx vitest run tests/agent/task-decomposer.test.ts 全 pass + git diff --name-only 仅 2 个写集文件"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
决策点: 10 个 sentinel 维度到 7 位在册专家的映射。① 第一性原理 — 最简本质是"维度语义 → 在册专家语义域"，7 位专家的语义域已由 expert-registry.yaml 各专家 tools 定义，映射只需让维度命中语义相同的在册专家；operational（运营执行）无对应专家 → host 兜底（最简机制，不新建专家）。② Anthropic 工程基线 — 机器可验契约: 映射表写进 dev doc §4.5 + 单测断言关键映射（financial/talent/operational/tech），fail-closed 由既有 dispatch degraded 路径承担。③ 开源实证 — 无需克隆外部仓库，仓库内 expert-router.ts selectExpert（D491 已修）即同域实证，DIMENSION_EXPERT_MAP 与它的语义分组保持一致（financial↔finance-structure、market/customer↔customer-cycle、organizational/talent↔talent-cycle、strategic/risk↔competitive-strategy、technology/product↔tech）。④ 收敛检查 — 两参考系都指向"按 dev doc §4.5 默认映射表执行、不微调、不扩面"。
参考：Anthropic/DeepSeek/第一性原理 + 结论: 按 dev doc §4.5 默认映射表逐条执行（financial→finance-structure; market→customer-cycle; organizational→talent-cycle; technology→tech 保留; strategic→competitive-strategy; operational→host 兜底; talent→talent-cycle; customer→customer-cycle; product→tech 保留; risk→competitive-strategy），fallback 'org'→'host'，不按 tools 语义微调，故 dev doc §3.2 无需回填。

### d) 相关 Note 引用
- [x] memory/2026-09-02-d491-expert-router-test-debt 记录了 D491 越界发现的本映射债（其"待办"即本任务）；本任务完成后该债闭环，决策沉淀写入本会话交付报告（memory 新条目），不另建 proposed Note。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/agent/task-decomposer.ts: DIMENSION_EXPERT_MAP（L82-93）十个映射值按 dev doc §4.5 对齐 7 位专家, L139/L251 fallback 'org' 改 'host'
- tests/agent/task-decomposer.test.ts: 旧名断言（finance/marketing/org）改 7 位新名, executeSubTask 2 个存量失败用例走真实专家转绿, 新增 operational→host 兜底用例

不做什么（排除项）：
- 不修改 src/agent/expert-router.ts — D491 已修 selectExpert
- 不修改 src/agent/expert-dispatcher.ts — 本任务无涉
- 不修改 src/agent/expert-config-loader.ts — D490 已修死分支
- 不修改 src/agent/main-agent.ts — 生产调用方零改动
- 不修改 src/loops/loop-scheduler.ts — cron 注册零改动
- 不修改 tests/agent/expert-router.test.ts — D491 已交付
- 不修改 tests/agent/expert-config-loader.test.ts — D490 已交付
- 不重写 task-decomposer.ts 的 inferDimensionFromSentinel — sentinel→维度（键方向）无 bug

整个 expert/ 目录（含 expert-registry.yaml）全部只读, 含 7 位专家目录与 _deprecated/_template。

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：
测试入口 npx vitest run tests/agent/task-decomposer.test.ts; 生产入口为增长导航 loop-1 季度诊断（src/loops/loop-scheduler.ts:175 cron '0 9 1 */3 *'）→ main-agent.ts:321 executeSubTask 分解执行链。

处理（中间经过哪些步骤）：
decompose 按 DIMENSION_EXPERT_MAP 设子任务 expertType（新名）→ executeSubTask → runHandlerForDimension（L251 同表）→ ExpertRouter.dispatch(expertType) → expert/<新名>/manifest.json + PROMPT.md 加载 → 专家解读产出。

结果（最终展示在哪）：
vitest 全绿（red 2 failed → green）; 季度诊断在 financial/market/organizational/strategic/operational/talent/customer/risk 全部维度上路由到在册专家（不再 degraded）; DS1-DS8 逐条命令证据写入交付报告。

本任务在哪一层: L2（src/agent 编排层）

## 架构层: L2
L2 编排层 src/agent/，向下经 ExpertRouter 触达 L3 专家（既有合法桥接），本任务不新增跨层依赖
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [x] 入口可触达: verify: npx vitest run tests/agent/task-decomposer.test.ts 全 pass（red 2 failed → green）
- [x] 链路走通: verify: npx vitest run tests/agent/expert-router.test.ts tests/agent/expert-config-loader.test.ts 全绿零回归 + npx tsc --noEmit 28 基线零新增
- [x] 结果可见: verify: grep -n ": 'finance'\|: 'marketing'\|: 'org'\|: 'strategy'\|: 'operations'" src/agent/task-decomposer.ts 零命中（映射值口径）+ git diff --name-only HEAD^ 与写集 2 文件一致
- [x] 零绕过: verify: grep -n "no-verify" .claude/bypass.log 零命中

## 文档引用
- dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D492-task-decomposer-expert-map-20260902.md 全部 8 节（§2 代码审计 file:line 实测 / §3.1 写集 / §4.5 映射表 / §6 DS1-DS8）
- 权威源: expert/expert-registry.yaml v2.0（D282 9→7 声明式唯一源）
- 代码事实: src/agent/task-decomposer.ts、tests/agent/task-decomposer.test.ts、src/agent/main-agent.ts、src/loops/loop-scheduler.ts

## Q4: 历史教训
- 铁律 38 as any 零容忍: 本任务不引入断言
- 铁律 9 grep 传播: DIMENSION_EXPERT_MAP 值改动已 grep 确认两个消费点（decompose L139 / runHandlerForDimension L251）同表同步受益，无第二份映射表
- memory/2026-09-02-d491 教训: DS1 旧名字面 grep 必然命中 includes() 关键词 — 本任务 verify 一律用「映射值口径」（`: '旧名'`）与 return 值口径
- memory/2026-09-01-d490 教训: CRLF 根因 autocrlf=true 下 $ 锚定恒假 — 本任务测试断言不用行尾锚定正则
- memory/2026-08-23-d479 教训: hook 多同日 brief 取最新 — 本 brief 为 clone 与主 workspace 中唯一今日 brief
- memory/2026-08-24-d481 教训: 同 checkout 并行会话污染 — 本任务全程在独立 clone 内提交, 主工作区零代码改动

## 接口审计
src/agent/task-decomposer.ts: TaskDecomposer.decompose
src/agent/task-decomposer.ts: TaskDecomposer.executeSubTask
src/agent/task-decomposer.ts: TaskDecomposer.runHandlerForDimension（private）
src/agent/main-agent.ts: TaskDecomposer.executeSubTask（生产调用点, 只读引用）
