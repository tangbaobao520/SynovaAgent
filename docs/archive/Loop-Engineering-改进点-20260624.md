# Loop Engineering 改进点v2：从 4 个开源项目中直接可用的部分

> 目的：优化 CLAUDE.md 的 Loop Engineering 体系，让 Claude Code 输出更稳定可靠
> 2026-06-24
> 每个改进点包含：来源项目、文件位置、项目做法、咱们场景、改什么

---

## 1. cobusgreyling 的 7 个 pattern（直接可用）

**来源项目：** loop-engineering-cobus
**仓库路径：** D:\Git项目研究\loop-engineering-cobus-main
**项目文件：** patterns/ 目录下的 7 个 .md 文件

这些 pattern 全部是软件开发场景（日常 CI 分诊、PR 监控、issue 管理等），直接适用于咱们用 Claude Code 开发 Synova 的过程。

| Pattern | 项目文件 | 对我们有什么用 |
|---------|---------|-------------|
| daily-triage | patterns/daily-triage.md | 每天早上自动检查 CI 失败、待处理 issue、未合并 PR |
| pr-babysitter | patterns/pr-babysitter.md | PR 提交后自动监控测试状态、检测冲突、提醒 review |
| ci-sweeper | patterns/ci-sweeper.md | CI 失败自动分析根因，尝试修复或升级给人 |
| changelog-drafter | patterns/changelog-drafter.md | 基于 commit 自动生成 CHANGELOG |
| issue-triage | patterns/issue-triage.md | 自动分类 issue、打标签、分配负责人 |
| post-merge-cleanup | patterns/post-merge-cleanup.md | merge 后自动删除分支、同步 issue 状态 |
| dependency-sweeper | patterns/dependency-sweeper.md | 检测依赖过期、安全漏洞、自动升级 PR |

**项目怎么做：**
每个 pattern 是一个 markdown 文件，描述调度配置、matcher 写法、STATE.md 格式。
配合 starters/ 目录下的 CLI 工具 loop-init 可以直接生成可用的配置。

**咱们能用什么：**
这些 pattern 整体上可以借鉴到 CLAUDE.md 中。但咱们的开发方式以 Claude Code 写代码为主，不依赖 CI 自动触发这类模式——更需要的是在每次写代码过程中提升稳定性的机制。所以 7 个 pattern 中最需要的是 pr-babysitter（确保提交质量）和 daily-triage（每天找回状态）。其他 5 个可延后或选择性采纳。

**具体改什么：**
```
借鉴 pr-babysitter 的核心思路，优化 pre-commit：
  当前：pre-commit 5 项硬阻断
  改进：在提交前自检中增加对 Plan 与实际变更的一致性检查
  （参考 cobusgreyling 的 pr-babysitter 中验证环节的模式）
```

---

## 2. 错误扣留机制

**来源项目：** how-claude-code-works
**仓库路径：** D:\Git项目研究\how-claude-code-works-main
**项目文件：** docs/02-agent-loop.md
**具体章节：** 第 2.8 节「错误扣留策略（Withholding）」、第 2.7 节「七个继续点」

**项目做法：**
Claude Code 的 query() 循环对可恢复的 API 错误（PTL 上下文超长、MOT 输出截断）不 yield 给上层。7 个继续点各有精确的恢复策略。用户完全感知不到中间错误。

**咱们场景：**
ConversationEngine 的 processMessage() 对错误处理不是系统化的——错误被 throw/catch，恢复逻辑散落在各处。fault-recovery.ts 有 7 种 BP 场景降级但没有接入 processMessage()。

**改什么：**
```
src/agent/conversation-engine.ts
  在 processMessage() 中增加系统级错误扣留层
  LLM 超时 -> fault-recovery 获取恢复策略 -> 重试/降级/扣留
  只有不可恢复的错误才返回给上层

CLAUDE.md Agent 自检 5 问加一项：
  6. 错误扣留: 所有 catch 路径都有恢复策略吗？
```

---

## 3. 5 级压缩流水线

**来源项目：** how-claude-code-works
**项目文件：** docs/03-context-engineering.md
**具体章节：** 第 3.3 节「五级压缩流水线」

**项目做法：**
每次循环迭代入口处，消息依次经过 5 级压缩：从零成本裁剪到全量摘要，逐级升级。

**咱们场景：**
ContextCompressor 的 summary 策略和 confirmedFacts 参数已实现但 ConversationEngine 用的是 sliding-window。

**改什么：**
```
src/agent/conversation-engine.ts L463-474
  把 ContextCompressor 策略从 sliding-window 改为 summary
  传入 confirmedFacts

src/orchestrator/context-compressor.ts
  已实现——确认 confirmedFacts 被正确集成
```

---

## 4. Feature Flag 构建时消除

**来源项目：** how-claude-code-works
**项目文件：** docs/02-agent-loop.md
**具体章节：** 第 2.6 节「Feature Flag 条件加载」

**项目做法：**
query.ts 使用 6 个 Feature Flag。外部构建中 feature() 返回 false，整个分支在编译时 tree-shaking 移除。

**咱们场景：**
engine-core 旧代码和新代码同时存在，运行时 if-else 切换。

**改什么：**
```
当前: if (useNewPath) { newImpl() } else { oldImpl() }
改进: 构建配置决定编译版本
      不用的代码物理不存在
      在下次 engine-core 拆分时用
```

---

## 5. 流式并行工具执行

**来源项目：** how-claude-code-works
**项目文件：** docs/02-agent-loop.md
**具体章节：** 第 2.4.1 节「流式处理与并行工具执行」

**项目做法：**
StreamingToolExecutor 在 API 流式响应期间每当 tool_use block 解析完成就立即执行。并发安全分类。Bash 错误级联。

**咱们场景：**
ExpertDispatcher 用了 Promise.allSettled 并行调度——这个是好的。但每个专家内部的 ReAct 循环是串行的。

**改什么：**
```
当前影响不大（专家总数只有 7 位），可后期优化
不需立即改动
```

---

## 6. 四笔代价检查

**来源项目：** loop-engineering-orange-book
**仓库路径：** D:\Git项目研究\loop-engineering-orange-book-main
**项目文件：** Loop-Engineering橙皮书-v260615.pdf
**具体章节：** 第 6 章

**项目内容：**
- 验证债：产出速度 > 验证能力
- 理解腐烂：中间产物太多没人看
- Token 失控：loop 每转一圈消耗 Token
- 认知投降：开发者放弃理解系统

**咱们场景：**
task-start 3 问没有对 Loop 本身的风险检查。

**改什么：**
```
CLAUDE.md task-start 3 问 -> 改为 5 问
  在 Q3 验收后加：
  Q4 验证债: 这次改动的验证够吗？
  Q5 理解腐烂: 中间产物太多吗？
```

---

## 7. 四层栈映射

**来源项目：** loop-engineering-orange-book
**项目文件：** Loop-Engineering橙皮书-v260615.pdf
**具体章节：** 第 2 章

**项目内容：**
Prompt Layer -> Context Layer -> Harness Layer -> Loop Layer。

**咱们场景：**
CLAUDE.md 的数据流总览和五层架构重叠，新人需要理解两个模型。

**改什么：**
```
CLAUDE.md 数据流总览段末尾加：
  四层栈映射：
  Prompt = CLAUDE.md + expert/ 文件
  Context = 企业事实层 + 知识库
  Harness = 哨兵 + 专家管线
  Loop = ConversationEngine + SentinelRunner
```

---

## 8. Pattern + Starter 模板

**来源项目：** loop-engineering-cobus
**项目文件：** starters/ 目录（多个子目录）

**项目做法：**
每个 pattern 对应一个 starter 目录，包含 SKILL.md、STATE.md、matcher 配置。

**咱们场景：**
开发任务有固定的 task brief starter 需求但没有系统化整理。

**改什么：**
```
新建 docs/starter/ 目录
  engine-core-migration.md
  expert-add.md（待定）
  sentinel-add.md（待定）
  slice-plan.md（待定）
每个模板：Q1/Q2/Q3 示例、禁止触碰区、验收标准
```

---

## 不采用的

- how-claude-code-works 的缓存四层防御（客户本地单实例部署，不需要 KV Cache）
- cobusgreyling 的 loop-audit npm 包（运行在自己开发机上）
- agentic-ai-engineering（入门教程，太浅）

---

## 汇总：改 CLAUDE.md 什么地方

| 改动 | 具体位置 | 来自 |
|------|---------|------|
| 自检 5 问加第 6 项：错误扣留检查 | Agent 自检 5 问段 | how-claude-code-works |
| task-start 3 问改为 5 问：加验证债+理解腐烂 | task-start 3 问段 | orange-book |
| 数据流总览末尾加四层栈映射 | 数据流总览段 | orange-book |
| pre-commit 增加 Plan-Actual 一致性检查 | pre-commit 5 项硬阻断段 | cobusgreyling |
| fault-recovery 接入 conversation-engine | 需改代码 | how-claude-code-works |
| ContextCompressor 用 summary 策略 | 需改代码 | how-claude-code-works |
| 新建 docs/starter/ 模板目录 | 新建目录 | cobusgreyling |
