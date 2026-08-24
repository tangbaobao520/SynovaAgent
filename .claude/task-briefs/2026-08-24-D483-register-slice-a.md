# Task Brief: D483 register 认证闭环切片A——匿名注册可达（isWhitelisted 加 register + 移除测试 bootstrap 绕过）

> 生成: 2026-08-24 16:43:54 | 分支: feat/win-d483-register-slice-a | as any: 0
> 权威文档: docs/plans/codex/implementation/SYNOVA-IMPL-D483-register-auth-slice-a-20260824.md（dev doc，已实测复核其全部 file:line claim）

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
五层内部划分为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。每个包接口边界明确，拆卸一个不影响其余 19 个。核心包已落地运行；已存在的功能规划从 src/ 移到独立包；未来新增须遵循此结构。

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
引擎: packages/engine-core/ (Novis遗产,逐步搬迁)。禁止src/新增engine-core引用(铁律46)。
安全: security/ (PIIScrubber, DataBoundary)
LLM: providers/ (DeepSeek, OpenAI, Gateway)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
- [x] 纵向（改 L1-L5 代码/架构）——L1 交互层认证中间件（src/middleware/auth.ts isWhitelisted）+ L1 测试。
- [ ] 横向（搬迁到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

系统: 基础设施/认证（JWT 认证闭环）。触及 L1（middleware + routes 挂载层）。
现有模块: src/middleware/auth.ts（jwtAuthMiddleware + isWhitelisted 白名单，白名单唯一来源，server.ts L290 全局挂载消费）、src/routes/auth.ts（register/login/refresh/revoke/validate 路由，register 业务逻辑已完整实现——校验/bcrypt/去重/token 签发）。
本任务 = **修复**（扩展白名单 1 个路径分支 + 测试去绕过），非新增模块。

### b) 文件审计
grep "register|whitelist|jwtAuth" 在 expert/ sentinel/ extensions/ knowledge/ theory/ skills/ → 零命中（认证属 src/middleware 基础设施，无文件驱动模块覆盖）。
grep "api/auth/register" src/ → 仅 src/routes/auth.ts（路由定义 L67）与 tests/（D481 集成测试 bootstrap 绕过）。无冲突。

### c) 决策
已有覆盖→复用: register 路由逻辑完整（D102/D479 契约），**零改动复用**；缺口仅在认证白名单 1 行。
冲突取舍见 Q1c（加白名单 vs 邀请令牌）。

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
① SPEC/Done 标准 = dev doc DS1-DS7（白名单接线 / 单元绿 / 集成 10 绿无绕过 / 零回归 / 范围一致 / 无 bypass / 推送+CI）。
② 测试先行: 单元新增 register 白名单用例 + 集成移除 bootstrap 绕过改匿名直连——**先跑红**（现状 register 被拦 401 → 用例失败），再改 auth.ts 变绿。
③ 实现: isWhitelisted L87 后加 `path === '/api/auth/register'`（1 行，与 login 并列），注释同步。
④ 接线: jwtAuthMiddleware 消费 isWhitelisted → server.ts L290 全局挂载（生产链路既有，grep 验证分支存在）。
⑤ 验证: 自检 6 问 + DS1-DS7 逐条跑命令留证。

引用依据:
- 铁律 0-2: spec → test → impl → wire → review → merge（本任务按此序执行）
- 铁律 7: 入口可触达（匿名 POST register 可达）+ 链路走通（白名单→路由→201）+ 结果可见（201 + payload）
- 铁律 33: 测试命名 *.test.ts / *.integration.test.ts（沿用既有两文件，不新建）
- memory 历史教训: 2026-08-22-d470（auto brief 不可见须追踪名）、2026-08-23-d479（Q2 路径 `- ` 行格式、Done 项 verify: 格式）

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
- rule: "isWhitelisted 必须含 register 分支且与 login 并列"
  verify: "grep -n \"api/auth/register\" src/middleware/auth.ts"
- rule: "集成测试零 signJwtToken（bootstrap 绕过彻底移除，过期 token 用例用 createHmac 构造）"
  verify: "grep -c \"signJwtToken\" tests/middleware/auth.integration.test.ts"
- rule: "写集仅 3 文件，不碰 routes/auth.ts 业务逻辑与 DSH 线"
  verify: "git diff --name-only origin/main...HEAD"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
决策点（沿用 dev doc §4.5 已定结论）: 加白名单 vs 邀请令牌验证？
参考：第一性原理 + Anthropic + 结论=本切片加白名单（register 路由已完整实现仅被认证层挡住；"注册可达"是 onboarding 底座，邀请令牌是安全增强留切片 B；测试移除 bootstrap 绕过=Anthropic"测试反映真实用户路径"，不再掩盖生产缺陷）。
决策点: 测试是否保留 bootstrap 绕过？同上=移除，匿名直连红→绿。

### d) 相关 Note 引用
- [ ] memory/notes/implemented/2026-08-24-D483-register-whitelist.md（交付后沉淀）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/middleware/auth.ts：isWhitelisted 加 `path === '/api/auth/register'`（与 login 并列）+ 注释同步（白名单含 login/register，邀请令牌收紧留切片 B）
- tests/middleware/auth.test.ts：白名单 describe 新增 1 用例 `whitelisted path /api/auth/register → pass through`
- tests/middleware/auth.integration.test.ts：registerAndLogin 移除 bootstrap 绕过（signJwtToken import + 签发 + 相关注释）→ 匿名 POST register 断言 201；保留 login；断言 payload 结构不变

不做什么：
- 不修改 src/routes/auth.ts（register 业务逻辑 D479 已收敛 + login 契约，零改动）
- 不修改 src/server.ts（白名单唯一来源是 auth.ts，挂载逻辑不动）
- 不修改 tests/routes/auth.test.ts（零回归只跑不改）
- 不修改 scripts/
- 不修改 src/sentinel/（DSH 线零交集）
- 不修改 VERSION.md（功能修复，非门禁/工具行为变化，S-8 不 bump；邀请令牌验证留切片 B/D484 产品决策）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）: 匿名客户端 POST /api/auth/register（无 Authorization 头）——生产 server.ts L290 jwtAuthMiddleware 全局挂载下。
处理（中间经过哪些步骤）: jwtAuthMiddleware → isWhitelisted 命中 register → next() → register 路由（校验/bcrypt/去重）→ signJwtToken。
结果（最终展示在哪）: HTTP 201 `{ ok: true, token, payload: { userId, role, orgId } }`——匿名注册从 401 变 201；集成测试以匿名直连断言（不再 bootstrap 掩盖）。

## 架构层: L1（middleware/routes 交互层；测试配套）
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] 入口可触达: isWhitelisted 含 register 分支 —— verify: grep -n "api/auth/register" src/middleware/auth.ts
- [ ] 链路走通: 匿名 POST register 201（集成测试 10/10 绿） —— verify: npx vitest run tests/middleware/auth.integration.test.ts
- [ ] 结果可见: bootstrap 绕过零残留 —— verify: grep -c "signJwtToken" tests/middleware/auth.integration.test.ts
- [ ] 零回归: 单元+路由测试绿 + tsc 28=28 —— verify: npx vitest run tests/middleware/auth.test.ts tests/routes/auth.test.ts && npx tsc --noEmit
