# CLAUDE.md — SynovaAgent

> 组织数字孪生诊断 + 持续增长导航系统。诊断是手段，目的是增长。
> 核心问题：这家企业的增长卡在哪里？现在该做什么？
> Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
> 独立 API 进程。HTTP + MCP 对外服务。

---

## 数据流总览（每次任务必回顾）

```
原始数据 → 本体层(电子病历) → 7维度×25测量器(compute)
                                     ↓
                    按需(FDE触发)          定时(Cron触发)
                    runModules()          Sentinel.check()
                         ↓                      ↓
                    Evidence池           SentinelFinding[]
                         ↓                      ↓
                    信号聚合引擎 ←←←←←←←←←←←←←
                         ↓
                    交叉关联 + 严重度升级 + 专家路由
                         ↓
              6位专家(strategy/org/finance/tech/marketing/action)
                         ↓
                    ReAct推理 + 交叉验证
                         ↓
                    综合诊断报告
                         ↓
                    FDE 收到警报 + 报告
                    GET /api/sentinel/reports
                    GET /api/sentinel/tickets
```

---

## ⚠️ 每次工作前必读 — 铁律速览

> 以下铁律来自 2026-05 至今的全部实际错误。按优先级排列。

### 零、协作与流程

**铁律 0. 协作对齐前置——先对齐再动手，禁止假设共识。**

**铁律 0-2. 测试先行 + 接线验收——spec → test → impl → wire → review → merge。**
Step 5 WIRE CHECK 是硬门禁：`grep -rn "新函数名" src/` — 零结果 = 未完成。
历史：4 次接线失败（组件通过单元测试但从未被生产代码调用）。

### 一、接线铁律

**铁律 1. 垂直切片交付。** 按用户可见的行为拆，不按技术层拆。
**铁律 4. 交付不完整——写了代码没接线。** 入口 → 交互 → 结果，三环节缺一不可交付。
**铁律 5. 后端能力 ≠ 用户可用的功能。** 追踪调用链：谁 import？谁调用？结果在哪呈现？
**铁律 7. 每次接受任务确认 Done 标准。** 默认：入口可触达 + 完整链路走通 + 结果可见。

### 二、代码质量

**铁律 8. Mock/TODO 不留到交付代码。** pre-commit 硬阻断。
**铁律 9. 关键变更 grep 全仓库传播。** 改完核心定义后检查所有引用。
**铁律 11. 静默降级禁止。** catch 必须 `log.warn/error` + 返回 `degraded: true`。pre-commit 警告存量。
**铁律 12. 集成测试 cover 真实路由，不 mock 管线。**

### 三、错误处理与降级

**铁律 24. 异常处理审计——写 catch 时必须确认：**
- [ ] 有 log.error/warn（不能空吞）
- [ ] 返回 degraded: true（后端）或显示错误 UI（前端）
- [ ] 区分 ENOENT（正常默认）和 JSON.parse 失败（打 log + degraded）

**铁律 31. 降级信号传播。** 每个可独立失败的模块必须返回 degraded 标记，调用方检查，前端展示。
**铁律 32. 错误分类强制。** catch 块包装为 `.code` + `.phase` + `.retryable` 的 Error 子类。

### 四、自动化优先

**铁律 35. 自动化优先。** 能变 tsc/oxlint/ESLint 规则的不靠文档，能写 check-*.sh 的不靠 review。
**铁律 33. 测试命名约定。** `*.test.ts` (单元) / `*.integration.test.ts` (集成) / `*.e2e.test.ts` (E2E)。
**铁律 34. Feature Branch 强制。** `feat/` `fix/` `chore/` 分支，禁止直接在 main 上 commit。
**铁律 36. vitest 必须全量通过。** 零失败才合并。
**铁律 37. Dead code 入仓库即违规。** 删除旧文件 + grep 零引用确认。

### 五、类型安全与架构

**铁律 38. `as any` 零容忍。** 47 次历史教训。pre-commit 硬阻断，`as any` 代码中零存在。
替代：内联类型 `as { field?: string }` / `Record<string, unknown>` / `unknown` + 类型守卫。

**铁律 39. 五层架构边界。** 每层只与相邻层通信：
```
L1 交互 (TUI/CLI/Web) → L2
L2 编排 (ConversationEngine) → L1 + L3
L3 洞察 (ExpertAutonomy/Corroboration) → L2 + L4
L4 本体 (GraphBridge/GraphStore) → L3 + L5
L5 存储 (SQLite) → L4
```
pre-commit `check-architecture.sh` 检测 L2→L4 / L3→L5 跨层违规。

### 六、TUI V2 铁律（2026-06-07 新增 — 基于闪烁修复+流式事故）

> 以下铁律来自 2026-06-07 TUI V2 闪烁修复和流式 Pipeline 事故。
> 核心原则：**ink 补丁层已经解决了闪烁，React 层不要过度工程化。**

**铁律 40. 闪烁修复不可回退（冻结）。**

任何修改 TUI V2 时，必须确认以下冻结项完好：
```
[ ] patches/ink+5.2.1.patch 存在
[ ] package.json "postinstall": "patch-package" 存在
[ ] React.memo 在 Message/StreamingText 上
[ ] 没有引入全量重渲染（forceUpdate / 逐 token 的 setState）
[ ] 没有 fallback 到旧的 useStreaming 实现
```
pre-commit 硬阻断：patch 文件缺失、postinstall 缺失、React.memo 被移除。

**铁律 41. 流式 Pipeline 简单直接 — 禁止过度工程化。**

`useStreaming` hook 只能用 `bufferRef += token` + `setTimeout(flush, 16)` 模式。
禁止引入：`LineBuffer` / `FrameRateLimiter` / `StreamChunker` 多层嵌套。
ink 补丁层已解决闪烁，React 层只需简单的 buffer + 60fps flush。

**Why**：LineBuffer 要求换行才提交→无换行文本永远不可见。三层嵌套→buffer 永远来不及 flush。
pre-commit 硬阻断：`use-streaming.ts` 中出现 `LineBuffer`/`FrameRateLimiter`/`StreamChunker` 类名。

**铁律 42. 逐字流必须有延迟。**

非流式 API 模拟流式时，`for (const ch of content) onToken(ch)` 必须配合 `await sleep(5)`。
每字符至少 5ms 间隔，留出 UI flush 时间。

**Why**：零延迟→所有 token 几毫秒内传完→buffer 来不及显示→用户看到空白。
pre-commit 警告：`tool-loop-executor.ts` 中 `for (const ch of` 后无 `sleep`。

**铁律 43. finishStreaming 调用顺序不可反。**

必须是：
```
flushBuffer() → addAgentMessage(reply) → setState({ isStreaming: false })
```
先 `isStreaming=false` 后 `addAgentMessage` → 中间有一帧空白。

**Why**：顺序反了会在流式结束和新消息之间出现空白帧。
pre-commit 警告：检测 `setState({ ... isStreaming: false })` 在 `addAgentMessage` 之前。

**铁律 44. ChatPanel 禁止 `justifyContent="flex-end"`。**

ink 不支持真正的滚动。flex-end 会把旧消息推出可见区域。
正确做法：消息截断算法 + `⋯ 上方还有 N 条消息`。

pre-commit 硬阻断：`chat-panel.tsx` 中出现 `justifyContent.*flex-end`。

**铁律 45. 注释中 `*/` 必须加空格。**

JSDoc 或块注释中 `*/` 必须写为 `* /`。
否则 esbuild 把 `*/` 识别为块注释结束符→编译失败。

**Why**：message.tsx 注释写了 `-/*/+`，esbuild 解析崩溃。
pre-commit 警告：`.tsx` 文件注释中出现 `*/`（非行尾的块注释结束符）。

---

## 项目身份

**产品**: SynovaAgent — 组织数字孪生诊断 + 持续增长导航系统。
**定位**: 独立 Agent 进程，通过 HTTP API + MCP 对外服务。不依赖任何前端或桌面端。
**市场**: 5-300 人团队的组织诊断与增长导航。

**两大核心系统**:
1. **FDE 按需诊断** — 用户触发，6阶段管道，全部测量器+专家 → 综合诊断报告
2. **Sentinel 定时哨兵** — Cron 自动，基线对比+异常检测 → 信号聚合 → 专家 → 工单

**五层架构**:
```
L1 交互    → routes/ (API), tui/ (终端), mcp/ (MCP协议)
L2 编排    → agent/ (ConversationEngine, diagnosis-launcher, sentinel-service)
              orchestrator/ (SubAgentCoordinator, ModuleRunner)
L3 洞察    → l3/ (ExpertDispatcher, ExpertAutonomy, QualityFirewall)
              sentinel/ (Runner, SignalAggregator, Registry, 15哨兵适配器)
              expert-platform/ (ExpertStore, Validator)
L4 本体    → l4/ (GraphBridge, EntityResolver, CommunityReports)
              evidence/ (Collector, Corroboration, EvidenceStore)
L5 存储    → store/ (SessionStore, SQLite)
              cron/ (CronScheduler, 持久化作业)
引擎       → packages/engine-core/ (543文件, 25测量器+6专家+本体层)
安全       → security/ (PIIScrubber, DataBoundary)
LLM       → providers/ (DeepSeek, OpenAI, Gateway)
```

**架构规则**: 只能向下依赖相邻层。L1禁触L3/L4/L5。L2禁触L4/L5。pre-commit `check-architecture.sh` 检测违规。

---

## Loop Engineering 系统

### L1: 会话内自动循环（写一步验一步）

```
Write → PostToolUse hook → verify-incremental.sh
  → vitest --related + 接线审计
  → 失败 → 错误输出终端 → AI修正 → 再次Write → 再次验证
  → .claude/loop-state.json 记录轮次 (最多5轮)
```

### L2: 双智能体交叉验证

```
pre-push → RUN_ARCH_AUDIT=1 → ArchitectureAuditor Agent
  → 接口真实性 / 架构边界 / 数据流完整性 / 哨兵信号消费
  → FAIL → 拒绝推送
```

### L3: 哨兵工单闭环

```
Cron → Sentinel → SignalAggregator → ExpertDispatcher
  → critical → 自动创建工单 (SQLite sentinel_tickets)
  → GET /api/sentinel/tickets → FDE 查询
```

---

## 常用命令

```bash
npm run dev              # 开发模式 (tsx src/index.ts)
npm run test             # 全量测试 (vitest run)
npm run tui              # TUI 终端界面
npm run lint             # TypeScript 检查 (tsc --noEmit)
npm run check:iron-laws   # 铁律门禁 (6 硬阻断)
npm run check:architecture # 架构边界检查
npm run check:all         # pre-push 全部门禁 (tsc + vitest + iron-laws)
npm run hooks:install     # 安装 Git hooks
npm run workflow:start    # 任务启动检查点 (开始写代码前)
npm run workflow:impl     # 实现完成检查点 (声称完成前)
npm run workflow:design   # 设计对齐检查点 (写代码前)
npm run workflow:deploy   # 部署后验证
```

---

## ⚡ Anthropic 工程工作流 (7 节点自动触发)

> 详细设计: `docs/workflow/ANTHROPIC-WORKFLOW.md`

### 触发机制 — 全部物理强制，零 AI 自律

```
① 任务开始 → pre-commit 强制 (Gate 0: task brief 不存在 + 未填写 → 拒绝提交)
② 设计完成 → pre-commit 强制 (Gate 1: SPEC.md + 设计文档不存在 → 拒绝提交)
③ 实现完成 → pre-commit 强制 (Gate 2: 接线审计 + tsc + test-first + 铁律门禁)
④ 提交前   → Git Hook (.git/hooks/pre-commit) 33 项硬阻断，无超时逃生舱
⑤ 推送前   → Git Hook (.git/hooks/pre-push) 6 道门禁
⑥ 部署后   → 人工触发 (checkpoint-deploy.sh)
⑦ 线上     → Cron
```

### 物理强制说明

> pre-commit 是唯一物理阻断点。①②③ 的产出物检查已全部集成到 pre-commit：
> - 无 task brief → 不准 commit
> - 无 SPEC.md / 设计文档 → 不准 commit
> - 新 export 未接线 → 不准 commit
> - 新文件无测试 → 不准 commit
>
> SessionStart + PostToolUse hooks 在写代码时持续提醒。

⚠️ 每次 git push 成功后，必须提醒:
   "部署已完成。请运行: bash scripts/workflow/checkpoint-deploy.sh [服务器URL]"
```

### 人工触发命令

```bash
# 节点 ②: 设计文档写完后
bash scripts/workflow/checkpoint-design.sh docs/research/my-feature.html

# 节点 ⑥: 部署到服务器后
bash scripts/workflow/checkpoint-deploy.sh https://your-server.com

# 节点 ⑦: 设置定时监控
crontab -e  # 添加: */30 * * * * bash /path/to/scripts/workflow/checkpoint-runtime.sh
```

---

## 门禁系统 (全部物理强制，零 AI 自律)

### PreToolUse Hook (写代码前)
- Task brief 存在 + 6 字段质量检查
- 接口真实性反向验证（grep 确认函数签名真实存在）
- 例外: `.claude/task-briefs/` `.claude/settings` `scripts/workflow/hook-`

### PostToolUse Hook (写代码后)
- `verify-incremental.sh`: vitest --related + 接线审计
- `.claude/loop-state.json`: 循环计数，最多5轮

### Git Hooks

| Hook | 触发时机 | 内容 |
|------|---------|------|
| pre-commit | `git commit` | 33 项硬阻断 (as any/Mock/CJS/.only/secrets/file size/wire/tsc/空catch/TUI铁律/决策树/架构边界/SPEC/task brief/test-first/单模块/new-file-pairing...) |
| commit-msg | `git commit` | Conventional Commits 格式强制 |
| post-commit | `git commit` | 决策流程建议 (decide-next.sh) |
| pre-push | `git push` | 6 道门禁 (决策树+tsc+vitest+iron-laws+接线审计+架构边界) + ArchitectureAuditor (RUN_ARCH_AUDIT=1 启用) |

---

## 执行原则

- **先读再改** — 不假设代码内容。读 CLAUDE.md + task brief + 全量对齐手册相关章节
- **task brief 必须先填** — PreToolUse hook 强制。6字段(项目身份/架构层级/文档引用/接口审计/数据流/用户旅程) 全部非空才能写代码
- **接口审计从代码 grep，不凭记忆** — hook 反向验证，虚假接口拒绝写代码
- **每写一个文件，自动验证** — PostToolUse hook 跑 vitest --related + 接线审计。失败自动进入修正循环
- **循环最多5轮** — verify-incremental.sh 记录轮次，5轮不过停止等人工
- **接线审计是硬门禁** — 新 export 必须在生产入口有引用
- **逐项 commit** — 单模块独立提交，不批量
- **改完列清单** — 文件 + 行号 + 为什么改
- **部署后验证** — `bash scripts/workflow/checkpoint-deploy.sh` curl 外部 URL
