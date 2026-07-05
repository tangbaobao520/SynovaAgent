# AGENTS.md �?SynovaAgent

> 组织数字孪生诊断 + 持续增长导航系统。诊断是手段，目的是增长�?
> 核心问题：这家企业的增长卡在哪里？现在该做什么？
> Agent，不�?ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行�?
> 独立 API 进程。HTTP + MCP 对外服务�?

---

## 数据流总览（每次任务必回顾�?

```
原始数据 �?本体�?电子病历) �?7维度×25测量�?compute)
                                     �?
                    按需(FDE触发)          定时(Cron触发)
                    runModules()          Sentinel.check()
                         �?                     �?
                    Evidence�?          SentinelFinding[]
                         �?                     �?
                    信号聚合引擎 ←←←←←←←←←←←←�?
                         �?
                    交叉关联 + 严重度升�?+ 专家路由
                         �?
              8位专�?strategy/org/finance/tech/marketing/action/business_model/knowledge)
                         �?
                    ReAct推理 + 交叉验证
                         �?
                    综合诊断报告
                         �?
                    FDE 收到警报 + 报告
                    GET /api/sentinel/reports
                    GET /api/sentinel/tickets
```

---

## ⚠️ 每次工作前必�?�?铁律速览

> 以下铁律来自 2026-05 至今的全部实际错误。按优先级排列�?

### 零、协作与流程

**铁律 0. 协作对齐前置——先对齐再动手，禁止假设共识�?*

**铁律 0-2. 测试先行 + 接线验收——spec �?test �?impl �?wire �?review �?merge�?*
Step 5 WIRE CHECK 是硬门禁：`grep -rn "新函数名" src/` �?零结�?= 未完成�?
历史�? 次接线失败（组件通过单元测试但从未被生产代码调用）�?

### 一、接线铁�?

**铁律 1. 垂直切片交付�?* 按用户可见的行为拆，不按技术层拆�?
**铁律 4. 交付不完整——写了代码没接线�?* 入口 �?交互 �?结果，三环节缺一不可交付�?
**铁律 5. 后端能力 �?用户可用的功能�?* 追踪调用链：�?import？谁调用？结果在哪呈现？
**铁律 7. 每次接受任务确认 Done 标准�?* 默认：入口可触达 + 完整链路走�?+ 结果可见�?

### 二、代码质�?

**铁律 8. Mock/TODO 不留到交付代码�?* pre-commit 硬阻断�?
**铁律 9. 关键变更 grep 全仓库传播�?* 改完核心定义后检查所有引用�?
**铁律 11. 静默降级禁止�?* catch 必须 `log.warn/error` + 返回 `degraded: true`。pre-commit 警告存量�?
**铁律 12. 集成测试 cover 真实路由，不 mock 管线�?*

### 三、错误处理与降级

**铁律 24. 异常处理审计——写 catch 时必须确认：**
- [ ] �?log.error/warn（不能空吞）
- [ ] 返回 degraded: true（后端）或显示错�?UI（前端）
- [ ] 区分 ENOENT（正常默认）�?JSON.parse 失败（打 log + degraded�?

**铁律 31. 降级信号传播�?* 每个可独立失败的模块必须返回 degraded 标记，调用方检查，前端展示�?
**铁律 32. 错误分类强制�?* catch 块包装为 `.code` + `.phase` + `.retryable` �?Error 子类�?

### 四、自动化优先

**铁律 35. 自动化优先�?* 能变 tsc/oxlint/ESLint 规则的不靠文档，能写 check-*.sh 的不�?review�?
**铁律 33. 测试命名约定�?* `*.test.ts` (单元) / `*.integration.test.ts` (集成) / `*.e2e.test.ts` (E2E)�?
**铁律 34. Feature Branch 强制�?* `feat/` `fix/` `chore/` 分支，禁止直接在 main �?commit�?
**铁律 36. vitest 必须全量通过�?* 零失败才合并�?
**铁律 37. Dead code 入仓库即违规�?* 删除旧文�?+ grep 零引用确认�?

### 五、类型安全与架构

**铁律 38. `as any` 零容忍�?* 47 次历史教训。pre-commit 硬阻断，`as any` 代码中零存在�?
替代：内联类�?`as { field?: string }` / `Record<string, unknown>` / `unknown` + 类型守卫�?

**铁律 39. 五层架构边界�?* 每层只与相邻层通信�?
```
L1 交互 (TUI/CLI/Web) �?L2
L2 编排 (ConversationEngine) �?L1 + L3
L3 洞察 (ExpertAutonomy/Corroboration) �?L2 + L4
L4 本体 (GraphBridge/GraphStore) �?L3 + L5
L5 存储 (SQLite) �?L4
```
pre-commit `check-architecture.sh` 检�?L2→L4 / L3→L5 跨层违规�?

### 六、TUI V2 铁律�?026-06-07 新增 �?基于闪烁修复+流式事故�?

> 以下铁律来自 2026-06-07 TUI V2 闪烁修复和流�?Pipeline 事故�?
> 核心原则�?*ink 补丁层已经解决了闪烁，React 层不要过度工程化�?*

**铁律 40. 闪烁修复不可回退（冻结）�?*

任何修改 TUI V2 时，必须确认以下冻结项完好：
```
[ ] patches/ink+5.2.1.patch 存在
[ ] package.json "postinstall": "patch-package" 存在
[ ] React.memo �?Message/StreamingText �?
[ ] 没有引入全量重渲染（forceUpdate / �?token �?setState�?
[ ] 没有 fallback 到旧�?useStreaming 实现
```
pre-commit 硬阻断：patch 文件缺失、postinstall 缺失、React.memo 被移除�?

**铁律 41. 流式 Pipeline 简单直�?�?禁止过度工程化�?*

`useStreaming` hook 只能�?`bufferRef += token` + `setTimeout(flush, 16)` 模式�?
禁止引入：`LineBuffer` / `FrameRateLimiter` / `StreamChunker` 多层嵌套�?
ink 补丁层已解决闪烁，React 层只需简单的 buffer + 60fps flush�?

**Why**：LineBuffer 要求换行才提交→无换行文本永远不可见。三层嵌套→buffer 永远来不�?flush�?
pre-commit 硬阻断：`use-streaming.ts` 中出�?`LineBuffer`/`FrameRateLimiter`/`StreamChunker` 类名�?

**铁律 42. 逐字流必须有延迟�?*

非流�?API 模拟流式时，`for (const ch of content) onToken(ch)` 必须配合 `await sleep(5)`�?
每字符至�?5ms 间隔，留�?UI flush 时间�?

**Why**：零延迟→所�?token 几毫秒内传完→buffer 来不及显示→用户看到空白�?
pre-commit 警告：`tool-loop-executor.ts` �?`for (const ch of` 后无 `sleep`�?

**铁律 43. finishStreaming 调用顺序不可反�?*

必须是：
```
flushBuffer() �?addAgentMessage(reply) �?setState({ isStreaming: false })
```
�?`isStreaming=false` �?`addAgentMessage` �?中间有一帧空白�?

**Why**：顺序反了会在流式结束和新消息之间出现空白帧�?
pre-commit 警告：检�?`setState({ ... isStreaming: false })` �?`addAgentMessage` 之前�?

**铁律 44. ChatPanel 禁止 `justifyContent="flex-end"`�?*

ink 不支持真正的滚动。flex-end 会把旧消息推出可见区域�?
正确做法：消息截断算�?+ `�?上方还有 N 条消息`�?

pre-commit 硬阻断：`chat-panel.tsx` 中出�?`justifyContent.*flex-end`�?

**铁律 45. 注释�?`*/` 必须加空格�?*

JSDoc 或块注释�?`*/` 必须写为 `* /`�?
否则 esbuild �?`*/` 识别为块注释结束符→编译失败�?

**Why**：message.tsx 注释写了 `-/*/+`，esbuild 解析崩溃�?
pre-commit 警告：`.tsx` 文件注释中出�?`*/`（非行尾的块注释结束符）�?

---

## 项目身份

**产品**: SynovaAgent �?组织数字孪生诊断 + 持续增长导航系统�?
**定位**: 独立 Agent 进程，通过 HTTP API + MCP 对外服务。不依赖任何前端或桌面端�?
**市场**: 5-300 人团队的组织诊断与增长导航�?

**两大核心系统**:
1. **FDE 按需诊断** �?用户触发�?阶段管道，全部测量器+专家 �?综合诊断报告
2. **Sentinel 定时哨兵** �?Cron 自动，基线对�?异常检�?�?信号聚合 �?专家 �?工单

**五层架构**:
```
L1 交互    �?routes/ (API), tui/ (终端), mcp/ (MCP协议)
L2 编排    �?agent/ (ConversationEngine, diagnosis-launcher, sentinel-service)
              orchestrator/ (SubAgentCoordinator, ModuleRunner)
L3 洞察    �?l3/ (ExpertDispatcher, ExpertAutonomy, QualityFirewall)
              sentinel/ (Runner, SignalAggregator, Registry, 20哨兵适配�?
              expert-platform/ (ExpertStore, Validator)
L4 本体    �?l4/ (GraphBridge, EntityResolver, CommunityReports)
              evidence/ (Collector, Corroboration, EvidenceStore)
L5 存储    �?store/ (SessionStore, SQLite)
              cron/ (CronScheduler, 持久化作�?
引擎       �?packages/engine-core/ (543文件, 25测量�?6专家+本体�?
安全       �?security/ (PIIScrubber, DataBoundary)
LLM       �?providers/ (DeepSeek, OpenAI, Gateway)
```

**架构规则**: 只能向下依赖相邻层。L1禁触L3/L4/L5。L2禁触L4/L5。pre-commit `check-architecture.sh` 检测违规�?

---

## Loop Engineering V4.4.1 �?精简物理执法 + Agent 自检 + 产品对齐


> 2026-06-17 v2.5 �� v3.0 �ع� �� ... �� V4.3.0 (pre-commit 8��+����) �� 2026-07-05 V4.4.1��
> V4.4.1 ���ı仯������ Loop Engineering ��׼�ӿ� (LOOP.md / loop-run-log / loop-sync / loop-context / post-merge-cleanup / loop-score / check-brief-vs-code)��
> Loop Ready Score: 100/100 �� L3 ��������
> **v3.1: +��Ʒ�����顪��task-start ��ǿ�ƻش� Q1-Q4 ����д���롣**
### 设计哲学

v2.5 �?38 �?pre-commit + 12 脚本 + 3 �?tsc/vitest 重跑�?
导致 `--no-verify` 泛滥——一个被绕过的门�?= 没有门禁�?

v3.0 只设 5 项物理阻断（�?<1s），其他交给 agent 自检�?PostToolUse 自动化�?
**越少越会被执行�?*

### 执法架构: 五层精简

```
📋 任务启动 (人工)   �? task-start.sh �?3 问翻译意图→规格
🧠 写前注入 (自动)    �? hook-check-memory.sh �?历史教训
✍️ 写后验证 (自动)    �? verify-incremental.sh �?L1 oxlint �?L2 tsc �?L3 vitest �?L4 接线
🔴 提交阻断 (自动)    �? pre-commit 5 �?�?全部 <1s
🚀 推送阻�?(自动)    �? pre-push 1 �?�?secrets 终扫
```

| 时机 | 脚本 | 阻断 | 耗时 |
|------|------|------|------|
| PreToolUse | hook-check-memory.sh (教训注入) | 不阻�?| <1s |
| PreToolUse | hook-block-write.sh (task brief 字段) | 🔴 阻断 | <1s |
| PreToolUse | hook-enforce-v25.sh (loop-state) | 🔴 阻断 | <1s |
| PostToolUse | verify-incremental.sh (L1→L4) | 🔴 阻断 | 5-30s |
| pre-commit | pre-commit-check.sh (5 �? | 🔴 阻断 | <5s |
| pre-push | pre-push-check.sh (secrets 终扫) | 🔴 阻断 | <3s |

### pre-commit 5 项硬阻断

| # | 检�?| 历史事故 | 耗时 |
|---|------|---------|------|
| 1 | `as any` = 0 | 47 �?| <1s |
| 2 | empty catch �?log.warn | 静默吞异�?| <1s |
| 3 | secrets 扫描 | API key 暴露 | <1s |
| 4 | 新文件有测试 | 4 次接线失�?| <1s |
| 5 | �?export 有调用方 | 4 次接线失�?| <1s |

### �?Agent 自检 5 问（每次写完代码必答�?

> 以下检查由 agent �?AGENTS.md 指令下自我执行，不依�?bash 脚本�?
> agent 能做语义理解——bash 只会 grep 模式匹配（误报如 `'community'` 被识别为硬编码凭证）�?

写完代码后，必须在回复中逐项回答�?

```
1. 接线检�? �?export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch �?log + degraded？（铁律 24+31�?
3. 类型安全: as any = 0？（铁律 38�?
4. 测试覆盖: 测试�?expect() 断言？（不是空壳�?
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

**Why agent 自检�?bash �?*: agent 知道 `'community'` 是模�?ID 不是密码�?
grep 脚本会产生误报，误报会产生噪音，噪音会导致整条门禁链被绕过�?

### task-start.sh 3 问（任务启动时回答）

```
Q1 调研: a) 业界最佳实�?b) 顶级团队怎么�?c) memory/ 里我们犯过的�?
Q2 范围: 最简实现是什么？什么可以不做？
Q3 验收: 入口→交互→结果，三环节各是什么？
```

### Windows 兼容�?

- pre-commit 仅含 grep�?5s），不含 tsc/vitest（已�?PostToolUse 跑）
- 严禁 `taskkill //IM node.exe` �?会杀死所�?Node 进程（含其他 Codex 实例�?
- `--no-verify` �?v3.0 下不应再需要（pre-commit <5s�?

### 删除的脚本（v3.0 清理�?

| 脚本 | 删除原因 |
|------|---------|
| check-manual-drift.sh | 文档硬编码数�?�?每次改代码都要改文档 |
| check-vertical-slice.sh | 入口→结�?三环�?�?agent 自检 Q3 验收 |
| generate-state-md.sh | STATE.md 无人阅读 |
| check-reality.sh | @state 注释 �?正确�?|
| hook-check-brief.sh | task brief 提醒�?task-start.sh 覆盖 |

**净效果: 12 脚本 �?8 脚本, 38 项检�?�?5 �? 提交耗时 90s �?<5s�?*

---

## 常用命令

```bash
npm run dev              # 开发模�?(tsx src/index.ts)
npm run test             # 全量测试 (vitest run)
npm run tui              # TUI 终端界面
npm run lint             # TypeScript 检�?(tsc --noEmit)
npm run check:iron-laws   # 铁律门禁 (6 硬阻�?
npm run check:architecture # 架构边界检�?
npm run check:all         # pre-push 全部门禁 (tsc + vitest + iron-laws)
npm run hooks:install     # 安装 Git hooks
npm run workflow:start    # 任务启动检查点 (开始写代码�?
npm run workflow:impl     # 实现完成检查点 (声称完成�?
npm run workflow:design   # 设计对齐检查点 (写代码前)
npm run workflow:deploy   # 部署后验�?
```

---

## �?Anthropic 工程工作�?(7 节点自动触发)

> 详细设计: `docs/workflow/ANTHROPIC-WORKFLOW.md`

### 触发机制 �?全部物理强制，零 AI 自律

```
�?任务开�?�?pre-commit 强制 (Gate 0: task brief 不存�?+ 未填�?�?拒绝提交)
�?设计完成 �?pre-commit 强制 (Gate 1: SPEC.md + 设计文档不存�?�?拒绝提交)
�?实现完成 �?pre-commit 强制 (Gate 2: 5 项物理阻�?+ task brief 完整)
�?提交�?  �?Git Hook (.git/hooks/pre-commit) 5 项硬阻断（全 <5s）—�?无超时逃生�?
�?推送前   �?Git Hook (.git/hooks/pre-push) 1 道门禁（secrets 终扫�?
�?部署�?  �?人工触发 (checkpoint-deploy.sh)
�?线上     �?Cron
```

### 物理强制说明

> pre-commit 是唯一物理阻断点。①②③ 的产出物检查已全部集成�?pre-commit�? 项硬阻断）：
> - �?task brief �?不准 commit
> - �?SPEC.md / 设计文档 �?不准 commit
> - �?export 未接�?�?不准 commit
> - 新文件无测试 �?不准 commit
>
> SessionStart + PostToolUse hooks 在写代码时持续提醒�?

⚠️ 每次 git push 成功后，必须提醒:
   "部署已完成。请运行: bash scripts/workflow/checkpoint-deploy.sh [服务器URL]"
```

### 人工触发命令

```bash
# 节点 �? 设计文档写完�?
bash scripts/workflow/checkpoint-design.sh docs/research/my-feature.html

# 节点 �? 部署到服务器�?
bash scripts/workflow/checkpoint-deploy.sh https://your-server.com

# 节点 �? 设置定时监控
crontab -e  # 添加: */30 * * * * bash /path/to/scripts/workflow/checkpoint-runtime.sh
```

---

## 门禁系统 (全部物理强制，零 AI 自律)

### PreToolUse Hook (写代码前)
- Task brief 存在 + 7 字段质量检查（项目身份/Q1调研/Q2范围/Q3验收/架构层级/文档引用/接口审计�?
- 接口真实性反向验证（grep 确认函数签名真实存在�?
- 例外: `.Codex/task-briefs/` `.Codex/settings` `scripts/workflow/hook-`

### PostToolUse Hook (写代码后)
- `verify-incremental.sh`: L1 oxlint �?L2 tsc --incremental �?L3 vitest --changed �?L4 接线审计
- `.Codex/loop-state.json`: 循环计数，最�?�?

> PostToolUse �?tsc + vitest 唯一一次执行的位置。pre-commit �?pre-push 不重复跑�?

### Git Hooks

| Hook | 触发时机 | 内容 |
|------|---------|------|
| pre-commit | `git commit` | 5 项硬阻断 (as any/empty catch/secrets/新文件测试对/新export接线) |
| commit-msg | `git commit` | Conventional Commits 格式强制 |
| post-commit | `git commit` | 决策流程建议 (decide-next.sh) |
| pre-push | `git push` | 1 道门�?(secrets 终扫) |

---

## 执行原则

- **先读再改** �?不假设代码内容。读 AGENTS.md + task brief + 全量对齐手册相关章节
- **task brief 必须先填** �?PreToolUse hook 强制�?字段(项目身份/Q1调研/Q2范围/Q3验收/架构层级/文档引用/接口审计) 全部非空才能写代�?
- **接口审计从代�?grep，不凭记�?* �?hook 反向验证，虚假接口拒绝写代码
- **每写一个文件，自动验证** �?PostToolUse hook �?vitest --related + 接线审计。失败自动进入修正循�?
- **循环最�?�?* �?verify-incremental.sh 记录轮次�?轮不过停止等人工
- **接线审计是硬门禁** �?�?export 必须在生产入口有引用
- **逐项 commit** �?单模块独立提交，不批�?
- **改完列清�?* �?文件 + 行号 + 为什么改
- **部署后验�?* �?`bash scripts/workflow/checkpoint-deploy.sh` curl 外部 URL
## Worktree 工作流 (V4.4.1)

每个 worktree session 有独立的目录和分支。

### 工作流

1. **进入 worktree**: `EnterWorktree` 工具自动创建隔离目录
2. **工作**: 在 worktree 中正常 commit
3. **推送**: `bash scripts/workflow/loop-sync.sh push` → 推送到 `session/03` 分支
4. **合并**: 在 GitHub 上提 PR: `session/03` → `feat/prompt-architecture`

### 铁律

- 🚫 禁止从 worktree 直接 `git push origin HEAD:feat/prompt-architecture`
- ✅ 允许从 worktree `git push origin HEAD:session/03`
- ✅ 从主仓库（非 worktree）可以直接推 `feat/prompt-architecture`
- 🚫 禁止 `git reset --hard` — 会丢弃本地未推送的 commit
- 如需恢复: `git stash push -m "save" && git checkout -B <branch> origin/feat/prompt-architecture && git stash pop`

### 分支命名

```
worktree 路径                        推送分支
.claude/worktrees/session+03     →   session/03
synova-session-01                →   session/01
synova-session-02                →   session/02
```
