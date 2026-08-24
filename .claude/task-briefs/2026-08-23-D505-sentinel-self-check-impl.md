# Task Brief: D505 哨兵自诊断可信度实现

> 生成: 2026-08-23 03:20:53 | 分支: main | as any: 0

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

本任务属于哪个系统（GA诊断/哨兵/基础设施）？触及哪层？该层现有模块？新增/替换/扩展？
哨兵系统（L3 洞察层）。扩展 src/sentinel/runner.ts（1044 行，调度框架）+ 新建 src/sentinel/self-check.ts（纯函数自诊断评估 H1/H2/H3）。现有模块复用：registry.count()/listCronSentinels、sentinel-loader.loadSentinels/clearSentinelCache、scheduler.listJobs（failures/lastRunAt/lastError 已暴露）、sentinel-events.appendSentinelEvent（I2 单源）、runner.createAutoTicket（D463）、dispatchNotification（D6）。

### b) 文件审计
grep 本任务关键词在 expert/ sentinel/ extensions/ knowledge/ theory/ skills/ 中。列出已有文件驱动模块。关系: 复用 / 扩展 / 新建 / 冲突
grep "self-check|selfcheck" src/ 零命中（自诊断实现 0 处，D505 spec §2 实测复核）。scheduler.ts failures 全仓 grep：仅 scheduler 内部自增/自清（L378 成功归零）+ builtin-tools.ts:246 只透传——零阈值消费者，断点属实。关系：runner 扩展、self-check 新建，无冲突。

### c) 决策
已有覆盖→复用，不准新建硬编码。无覆盖→新建走文件驱动（属扩展解耦）。冲突→取消任务，复用已有。
冲突取舍/多选项/架构选择 → 走 DECISION-REFERENCE 四步框架（docs/synova/coordination/DECISION-REFERENCE.md），结论写入 Q1c 决策参考系。
决策走 dev doc §5.3 四决策点（已收敛）：自检位置=进程内 cron；信号形态=特殊哨兵走 records/events/工单管线；告警不路由企业专家；阈值保守（H2 ≥3/≥5 分级、H3 间隔×3、健康零 finding）。参考：Anthropic + DeepSeek + 第一性原理 + 结论（D505 spec §5.3 原文，K3 可核）。
maxScheduleMs 计算决策（spec §5.4 项 1 留接口）：nextCronTime 未导出 → self-check.ts 内实现 estimateCronIntervalMs（解析常见五段 cron 形态，未识别兜底 24h），可独立单测。参考：DeepSeek（最少机制——不为此改 scheduler.ts 导出面）。



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
  ① SPEC / Done 标准 — 定义「怎么算做完」
  ② 测试 — 先写测试，测试 = 产品的一部分
  ③ 实现 — 刚好满足以下全部条件：
     - Done 标准中列出的所有完成项
     - 测试全部通过
     - 接线完整（新 export 有引用）
     - 错误路径有 log + degraded
     - tsc + vitest 零失败
  ④ 接线 — 端到端走通（入口可触达 + 链路完整 + 结果可见）
  ⑤ 验证 — 自检 6 问（接线/异常/类型/测试/残留/文件驱动）

引用依据（至少引用两项）：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 7: 入口可触达 + 完整链路走通 + 结果可见
  - 铁律 24+31: 错误处理 + 降级信号
  - 铁律 33: 测试命名约定
  - memory/ 中的历史教训文件

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
根据决策链和本任务特点，提炼 2-3 条必须遵守的规则。每条 rule 必须包含 verify 命令。
例如:
  - rule: "修改 manifest.json 后必须验证 sentinel-loader.ts 能正确解析"
    verify: "grep -rn '新字段名' src/sentinel/sentinel-loader.ts"
  - rule: "新增 export 必须在 pre-commit 组 4 有引用"
    verify: "grep -rn '新函数名' src/"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
按 DECISION-REFERENCE 四步框架（docs/synova/coordination/DECISION-REFERENCE.md）执行，并将结论记录在本字段：
  ① 第一性原理 — 问题的最简本质是什么？最少机制能解决吗？
  ② Anthropic 工程基线 — 隔离/失败即关闭/脚本验证/机器可验契约，哪条适用？
  ③ 开源实证 — 有可克隆的代码/架构参考吗？clone 下来看实际做法
  ④ 收敛检查 — 两参考系是否指向同一答案？收敛 = 大概率正确；分歧 = 值得深挖
决策记录格式（K3 审计可核）: 参考：Anthropic/DeepSeek/第一性原理 + 结论
简单决策（无冲突、单一路径）只需记录参考系名。

### d) 相关 Note 引用
- [ ] memory/notes/<四态>/YYYY-MM-DD-<主题>.md（本任务决策沉淀到哪条 Note；无则新建 proposed）

## Q2: 范围 — 正确的最简方案是什么？

做什么：实现 dev doc SYNOVA-IMPL-DSH-D505（feat/d505-dev-doc 分支，commit 4d877115）的全部写集
- src/sentinel/self-check.ts — evaluateSentinelHealth 纯函数 + H1/H2/H3 阈值常量 + estimateCronIntervalMs
- src/sentinel/runner.ts — runSelfCheck() 方法 + start() 注册 SentinelSelfCheck 每小时 cron + aggregateAndDispatch 过滤 sentinel-self-check（防语义污染）
- tests/sentinel/self-check.test.ts — 28 用例三路径（正常/降级/边界）
- task-state/D505.json — impl 状态登记（D382）
不做什么（Q2 排除项，含文件路径）：
- 不改 src/cron/scheduler.ts（listJobs 已够）
- 不改 src/agent/sentinel-service.ts
- 不改 src/monitoring/system-health.ts（D475 冻结）
- 不改 src/routes/ 任何文件（Win 领地）
- 不改 scripts/watchdog.js、extensions/sentinels/

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：runner.start() 注册的 SentinelSelfCheck cron（每小时整点）+ runSelfCheck() 可手动调用（测试）
处理（中间经过哪些步骤）：收集指标（registry.count/loadSentinels/listJobs/getStats/uptime）→ evaluateSentinelHealth 纯函数评估 H1/H2/H3 → findings 走 persistRunEvents（I2 单源）+ projectRunRecord → critical 调 createAutoTicket → warning/critical 调 dispatchNotification
结果（最终展示在哪）：records 中 sentinel-self-check finding（GET /api/sentinel/findings 可见，零 routes 改动）+ sentinel_tickets 表 auto 工单行 + Electron 桌面通知

## 架构层: 基础设施
L3（洞察层 — src/sentinel/ 与 runner/registry/loader 同层，纯函数无跨层依赖）
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] 入口可触达: grep "SentinelSelfCheck" src/sentinel/runner.ts 非零（WIRE CHECK，测试调用不计）
- [ ] 链路走通: tests/sentinel/self-check.test.ts 全过（≥10 用例）；vitest --changed 零失败
- [ ] 结果可见: 注入故障 → records 出现 sentinel-self-check finding + sentinel_tickets auto 行（集成断言）；健康时零 finding
