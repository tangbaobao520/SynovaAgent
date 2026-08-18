# Task Brief: D402: D391 审计 P1 修复 — federated 兜底写入即蒸发（惰性单例 ??= + 写后读回断言 + T6b 改写）

> 生成: 2026-08-18 23:08:27 | 分支: feat/d402-federated-fix | as any: 0

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
- [x] 纵向（改 L1 代码）
本任务属于知识管理 API 系统（D241 审批 + D244 联邦知识）的 L1 交互层：`src/routes/admin-knowledge.ts` 8 端点。缺陷在 getPipeline()/getStore() 的实例化方式（每请求 new → 写入蒸发 201 假成功，K3 D391 审计 P1-1）。替换 getPipeline 的实例化逻辑为 ??= 惰性单例，不改类本体、不改路由挂载。

### b) 文件审计
grep/read 实测（2026-08-18，worktree .wt-d402 @ origin/main）：
- `src/routes/admin-knowledge.ts` — 缺陷现场（getPipeline L54-56 `?? new FederatedPipeline()`；getStore L43-45 `?? new KnowledgeStore()`）→ 修改
- `src/services/federated-pipeline.ts` — FederatedPipeline 类本体（实例内存 Map L53）→ 不修改（缺陷根因在实例化，不在类内）
- `src/l4/knowledge-store.ts` — KnowledgeStore 类本体（构造即 initSchema）→ 不修改
- `tests/routes/admin-knowledge.test.ts` — T6b L203-211 把"200 空列表"写成正确规格 → 改写
- `scripts/` 相关门禁 — 不涉及（本任务无控制塔/编排器改动，D395a Note 门禁不触发）
关系: 修改既有 2 文件，零新建代码文件。

### c) 决策
修复方式已由 K3 D391 审计转 PASS 条件 + spec §4.5 四决策点定案（??= 惰性单例 + getStore 连带 + 进程内持久 + T6b 改写），无多选项冲突；决策参考系记录在 Q1c。

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
| 2026-08-16 | D402 四决策点（修复方式/连带范围/持久化深度/T6b 处置） | K3 审计 + Anthropic + 第一性原理（spec §4.5） | 收敛：??= 惰性单例 + getStore 连带 + 进程内持久 + T6b 改写 |

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — spec 已由 dev-doc 交付（SYNOVA-IMPL-DSH-D402-federated-fix-20260816.md），DS1-DS10 完成标准已定义
  ② 测试 — 先写测试（red：写后读回/惰性单例构造计数/注入优先/降级不缓存），测试 = 产品的一部分
  ③ 实现 — getPipeline()/getStore() 改 ??= 惰性单例 + JSDoc 契约更新
  ④ 接线 — 5 handler（mark-shareable/pending/approve/degraded/ga-weight-drop）+ 3 handler（pending/approve/reject）真实调用 getPipeline()/getStore()，无需新接线
  ⑤ 验证 — 自检 5 问（接线/异常/类型/测试/残留）+ verify-incremental（L1 oxlint → L2 tsc → L3 vitest → L4 接线）

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge（本任务按序执行）
  - 铁律 5: 后端能力 ≠ 用户可用功能——201 假成功 = 能力未真正可用（K3 P1-1 定性）
  - 铁律 11: 假性成功比显式失败更危险（恒 503 换恒空且返回成功）
  - 铁律 24+31: 错误处理 + 降级信号（getStore 降级路径 500 + degraded:true 不回归）
  - 铁律 47/48: 契约优先（JSDoc 更新）+ 测试非空壳（≥8 用例含正常/降级/边界/写后读回）
  - memory 教训: memory/notes/archived/stub-implementation-pattern.md（测试把缺陷写成规格 = 同型错误，T6b 是活例）

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
本任务不建 plan.json（单阶段小任务）；以下约束为执行纪律，全部带 verify 命令：
  - rule: "getPipeline/getStore 必须为 ??= 惰性单例，无每请求 new 残留"
    verify: "grep -n '??=' src/routes/admin-knowledge.ts && ! grep -nE '?? new (FederatedPipeline|KnowledgeStore)' src/routes/admin-knowledge.ts"
  - rule: "T6b 改写为写后读回断言（不再把 200 空列表当正确）"
    verify: "grep -n '写后读回' tests/routes/admin-knowledge.test.ts"
  - rule: "无跨层回归（D391 成果保持，不碰 ../l4）"
    verify: "! grep -rn \"from '../l4\" src/routes/admin-knowledge.ts"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
本任务四决策点已在 spec §4.5 走双参考系并收敛（无分歧）：
  - 修复方式（A 生产注入 setFederatedPipeline / B ??= 惰性单例）→ **B**：K3 转 PASS 条件原文 + DeepSeek 最少机制（一行改，不加启动接线）
  - getStore 是否连带（A 只改 getPipeline / B 两者同修）→ **B**：K3 转 PASS 条件 #1 明列两者 + 第一性原理（同型缺陷同修，不留半套）
  - 持久化深度（A 惰性单例进程内 / B 联邦知识落 DB）→ **A**：K3 只要求写后读回；DB 持久化是 D244 独立演进项（显式排除）
  - T6b 处置（A 保留旧断言 / B 改写为写后读回）→ **B**：K3 点名"T6b 把缺陷写成规格" + 铁律 48
记录格式: 参考：K3 审计 + Anthropic + 第一性原理 + 结论（??= 单例 + getStore 连带 + 进程内 + T6b 改写）

### d) 相关 Note 引用
- [x] memory/notes/implemented/2026-08-18-d402-lazy-singleton-fix.md（本任务决策已沉淀 Note，四字段头 + 与目录状态一致）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/routes/admin-knowledge.ts: getPipeline() 改 federatedPipeline ??= new FederatedPipeline()；getStore() 改 knowledgeStore ??= new KnowledgeStore(getDatabase())；JSDoc 契约同步更新
- tests/routes/admin-knowledge.test.ts: T6b 改写为写后读回断言；新增惰性单例构造计数/注入优先/getStore 单例/getStore 降级不缓存用例；T7 接线断言补 ??= 检查

不做什么：
- 不改 src/services/federated-pipeline.ts — FederatedPipeline 类本体（缺陷根因在实例化，不在类内；DB 持久化是 D244 独立演进项，K3 转 PASS 条件只要求写后读回）
- 不改 src/l4/knowledge-store.ts — KnowledgeStore 类本体
- 不改 src/server.ts — 路由挂载不变（Win Claude 领地）
- 不改 scripts/audit/ — 审计红线（K3 专属）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：FDE 调 `POST /api/admin/knowledge/:id/mark-shareable` 标记知识可共享（admin-knowledge.ts L112 handler）
处理（中间经过哪些步骤）：getPipeline() ??= 惰性单例（首次构造后缓存）→ markShareable 写入同一实例 → 201 返回 entry；GA 随后 GET /api/admin/knowledge/federated/pending → 同一实例 listByStatus 读回该条目
结果（最终展示在哪）：federated/pending 返回非空列表（写后读回断言绿）——不再"201 成功但数据蒸发"（K3 P1-1 闭合）；T6b 从"200 空列表=正确"改为"写后读回可见"

## 架构层: L1
L1 交互层（src/routes/admin-knowledge.ts）——仅改 L1 内实例化逻辑（??= 惰性单例），无跨层 import 变更，无新文件。getStore 依赖 getDatabase()（L5 初始化上下文，既有 import 不变）。
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [x] verify: npx vitest run tests/routes/admin-knowledge.test.ts — 全绿（≥8 用例含写后读回 + 惰性单例 + 注入优先 + 降级不缓存 + 回归）
- [x] verify: grep -n "federatedPipeline ??=" src/routes/admin-knowledge.ts（getPipeline 惰性单例命中）
- [x] verify: grep -n "knowledgeStore ??=" src/routes/admin-knowledge.ts（getStore 惰性单例命中）
- [x] verify: grep -nE "?? new (FederatedPipeline|KnowledgeStore)" src/routes/admin-knowledge.ts 零命中（无每请求 new 残留）
- [x] verify: grep -n "写后读回" tests/routes/admin-knowledge.test.ts（T6b 改写断言存在）
- [x] verify: grep -rn "from '../l4" src/routes/admin-knowledge.ts 零命中（D391 无跨层回归）
- [x] verify: git diff --name-only 与写集一致（src/routes/admin-knowledge.ts + tests/routes/admin-knowledge.test.ts + brief/note/task-state 文档）
