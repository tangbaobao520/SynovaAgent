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
              8位专家(strategy/org/finance/tech/marketing/action/business_model/knowledge)
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

### 七、架构完整性 — 2026-06-21 新增（engine-core 拆分欺诈事故）

> 以下铁律来自 2026-05 至 2026-06 engine-core 拆分欺诈事故。
> 核心原则：**桥接文件 ≠ 迁移。声称拆完 = grep 零引用。**

**铁律 46. 禁止桥接代理文件——迁移必须是代码真搬，不准建 import 代理。**

桥接文件定义：src/ 下的文件，主体内容仅为 `import { X } from '../../packages/engine-core/...'; export const X = _X;`。

**判定标准**：
```
纯桥接 = 文件中非 import/export/注释 的有效代码行数 = 0
部分桥接 = 有原创代码但仍直接 import engine-core
```

**修复标准**：
1. 将 engine-core 中的代码真正复制/移动到 src/ 对应位置
2. 在 src/ 文件中重写实现，不 import engine-core
3. 更新所有调用方的 import 路径
4. 删除 engine-core 中已迁移的旧文件
5. `grep -r "packages/engine-core" src/` 零结果（白名单除外）

**白名单**（唯一允许引用 engine-core 的文件）：
- `src/adapters/engine-core-adapter.ts` — 官方适配器
- `src/init/engine-context.ts` — 引擎初始化
- `src/types/engine-core-types.ts` — 类型重导出
- `src/agent/orchestrator-adapter.ts` — 编排器适配
- `src/l4/graph-bridge.ts` — 图桥接
- `src/l4/entity-resolver-l2.ts` — 实体解析
- `src/l4/engine-graph-store.ts` — 图存储
- `src/l4/diagnosis-graph-query.ts` — 图查询

**Why**：2026-05~06，engine-core 拆分被反复声称完成，实际全部是桥接文件——538 文件原封不动，20 个桥接文件伪装成迁移。tsc 被骗过（import 路径合法），但运行时 17 处 CJS require() 在 ESM 下崩溃。一个月反复承诺零实质进展。

pre-commit 硬阻断：`bash scripts/check-bridge-files.sh` — 非白名单 src/ 文件引用 `packages/engine-core` → 拒绝提交。

**铁律 47. "拆完了"必须由 grep 物理证明。**

声称任何模块"已拆分/已迁移/已清理"前，必须运行：
```bash
grep -r "旧路径/旧包名" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "\.test\."
```
零结果 = 拆完了。有结果 = 没拆完，继续拆。

**Why**：tsc 零错误 ≠ 拆分完成。import 路径合法可以骗过编译器，骗不过 grep。
pre-commit 警告：task brief 中声明"已完成拆分"但 grep 仍有旧路径引用。

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
              sentinel/ (Runner, SignalAggregator, Registry, 20哨兵适配器)
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

## Loop Engineering v3.1 — 精简物理执法 + Agent 自检 + 产品对齐

> 2026-06-17 v2.5 → v3.0 重构 → 2026-06-19 v3.1。核心变化：
> **从"每犯一错加一脚本"→"找到根源，用一个机制防一类错"。**
> **从"bash 替 agent 思考"→"agent 自问 + bash 查硬伤"。**
> **v3.1: +产品对齐检查——task-start 后强制回答 Q1-Q4 才能写代码。**

### 设计哲学

v2.5 的 38 项 pre-commit + 12 脚本 + 3 次 tsc/vitest 重跑，
导致 `--no-verify` 泛滥——一个被绕过的门禁 = 没有门禁。

v3.0 只设 5 项物理阻断（全 <1s），其他交给 agent 自检和 PostToolUse 自动化。
**越少越会被执行。**

### 执法架构: 五层精简

```
📋 任务启动 (人工)   →  task-start.sh — 3 问翻译意图→规格
🧠 写前注入 (自动)    →  hook-check-memory.sh — 历史教训
✍️ 写后验证 (自动)    →  verify-incremental.sh — L1 oxlint → L2 tsc → L3 vitest → L4 接线
🔴 提交阻断 (自动)    →  pre-commit 5 项 — 全部 <1s
🚀 推送阻断 (自动)    →  pre-push 1 项 — secrets 终扫
```

| 时机 | 脚本 | 阻断 | 耗时 |
|------|------|------|------|
| PreToolUse | hook-check-memory.sh (教训注入) | 不阻断 | <1s |
| PreToolUse | hook-block-write.sh (task brief 字段) | 🔴 阻断 | <1s |
| PreToolUse | hook-enforce-v25.sh (loop-state) | 🔴 阻断 | <1s |
| PostToolUse | verify-incremental.sh (L1→L4) | 🔴 阻断 | 5-30s |
| pre-commit | pre-commit-check.sh (5 项) | 🔴 阻断 | <5s |
| pre-push | pre-push-check.sh (secrets 终扫) | 🔴 阻断 | <3s |

### pre-commit 5 项硬阻断

| # | 检查 | 历史事故 | 耗时 |
|---|------|---------|------|
| 1 | `as any` = 0 | 47 次 | <1s |
| 2 | empty catch 有 log.warn | 静默吞异常 | <1s |
| 3 | secrets 扫描 | API key 暴露 | <1s |
| 4 | 新文件有测试 | 4 次接线失败 | <1s |
| 5 | 新 export 有调用方 | 4 次接线失败 | <1s |

### ⚡ Agent 自检 5 问（每次写完代码必答）

> 以下检查由 agent 在 CLAUDE.md 指令下自我执行，不依赖 bash 脚本。
> agent 能做语义理解——bash 只会 grep 模式匹配（误报如 `'community'` 被识别为硬编码凭证）。

写完代码后，必须在回复中逐项回答：

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

**Why agent 自检比 bash 好**: agent 知道 `'community'` 是模块 ID 不是密码。
grep 脚本会产生误报，误报会产生噪音，噪音会导致整条门禁链被绕过。

### task-start.sh 3 问（任务启动时回答）

```
Q1 调研: a) 业界最佳实践 b) 顶级团队怎么做 c) memory/ 里我们犯过的错
Q2 范围: 最简实现是什么？什么可以不做？
Q3 验收: 入口→交互→结果，三环节各是什么？
```

### Windows 兼容性

- pre-commit 仅含 grep（<5s），不含 tsc/vitest（已由 PostToolUse 跑）
- 严禁 `taskkill //IM node.exe` — 会杀死所有 Node 进程（含其他 Claude Code 实例）
- `--no-verify` 在 v3.0 下不应再需要（pre-commit <5s）

### 删除的脚本（v3.0 清理）

| 脚本 | 删除原因 |
|------|---------|
| check-manual-drift.sh | 文档硬编码数字 → 每次改代码都要改文档 |
| check-vertical-slice.sh | 入口→结果 三环节 → agent 自检 Q3 验收 |
| generate-state-md.sh | STATE.md 无人阅读 |
| check-reality.sh | @state 注释 ≠ 正确性 |
| hook-check-brief.sh | task brief 提醒被 task-start.sh 覆盖 |

**净效果: 12 脚本 → 8 脚本, 38 项检查 → 5 项, 提交耗时 90s → <5s。**

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
③ 实现完成 → pre-commit 强制 (Gate 2: 5 项物理阻断 + task brief 完整)
④ 提交前   → Git Hook (.git/hooks/pre-commit) 5 项硬阻断（全 <5s）—— 无超时逃生舱
⑤ 推送前   → Git Hook (.git/hooks/pre-push) 1 道门禁（secrets 终扫）
⑥ 部署后   → 人工触发 (checkpoint-deploy.sh)
⑦ 线上     → Cron
```

### 物理强制说明

> pre-commit 是唯一物理阻断点。①②③ 的产出物检查已全部集成到 pre-commit（5 项硬阻断）：
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
- Task brief 存在 + 7 字段质量检查（项目身份/Q1调研/Q2范围/Q3验收/架构层级/文档引用/接口审计）
- 接口真实性反向验证（grep 确认函数签名真实存在）
- 例外: `.claude/task-briefs/` `.claude/settings` `scripts/workflow/hook-`

### PostToolUse Hook (写代码后)
- `verify-incremental.sh`: L1 oxlint → L2 tsc --incremental → L3 vitest --changed → L4 接线审计
- `.claude/loop-state.json`: 循环计数，最多5轮

> PostToolUse 是 tsc + vitest 唯一一次执行的位置。pre-commit 和 pre-push 不重复跑。

### Git Hooks

| Hook | 触发时机 | 内容 |
|------|---------|------|
| pre-commit | `git commit` | 5 项硬阻断 (as any/empty catch/secrets/新文件测试对/新export接线) |
| commit-msg | `git commit` | Conventional Commits 格式强制 |
| post-commit | `git commit` | 决策流程建议 (decide-next.sh) |
| pre-push | `git push` | 1 道门禁 (secrets 终扫) |

---

## 执行原则

- **先读再改** — 不假设代码内容。读 CLAUDE.md + task brief + 全量对齐手册相关章节
- **task brief 必须先填** — PreToolUse hook 强制。7字段(项目身份/Q1调研/Q2范围/Q3验收/架构层级/文档引用/接口审计) 全部非空才能写代码
- **接口审计从代码 grep，不凭记忆** — hook 反向验证，虚假接口拒绝写代码
- **每写一个文件，自动验证** — PostToolUse hook 跑 vitest --related + 接线审计。失败自动进入修正循环
- **循环最多5轮** — verify-incremental.sh 记录轮次，5轮不过停止等人工
- **接线审计是硬门禁** — 新 export 必须在生产入口有引用
- **逐项 commit** — 单模块独立提交，不批量
- **改完列清单** — 文件 + 行号 + 为什么改
- **部署后验证** — `bash scripts/workflow/checkpoint-deploy.sh` curl 外部 URL
