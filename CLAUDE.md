# CLAUDE.md �?SynovaAgent

> 组织数字孪生诊断 + 持续增长导航系统。诊断是手段，目的是增长�?> 核心问题：这家企业的增长卡在哪里？现在该做什么？
> Agent，不�?ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行�?> 独立 API 进程。HTTP + MCP 对外服务�?
---

## 数据流总览（每次任务必回顾�?
```
原始数据 �?本体�?电子病历) �?7维度×25测量�?compute)
                                     �?                    按需(FDE触发)          定时(Cron触发)
                    runModules()          Sentinel.check()
                         �?                     �?                    Evidence�?          SentinelFinding[]
                         �?                     �?                    信号聚合引擎 ←←←←←←←←←←←←�?                         �?                    交叉关联 + 严重度升�?+ 专家路由
                         �?              8位专�?strategy/org/finance/tech/marketing/action/business_model/knowledge)
                         �?                    ReAct推理 + 交叉验证
                         �?                    综合诊断报告
                         �?                    FDE 收到警报 + 报告
                    GET /api/sentinel/reports
                    GET /api/sentinel/tickets
```

---

## ⚠️ 每次工作前必�?�?铁律速览

> 以下铁律来自 2026-05 至今的全部实际错误。按优先级排列�?
### 零、协作与流程

**铁律 0. 协作对齐前置——先对齐再动手，禁止假设共识�?*

**铁律 0-2. 测试先行 + 接线验收——spec �?test �?impl �?wire �?review �?merge�?*
Step 5 WIRE CHECK 是硬门禁：`grep -rn "新函数名" src/` �?零结�?= 未完成�?历史�? 次接线失败（组件通过单元测试但从未被生产代码调用）�?
### 一、接线铁�?
**铁律 1. 垂直切片交付�?* 按用户可见的行为拆，不按技术层拆�?**铁律 4. 交付不完整——写了代码没接线�?* 入口 �?交互 �?结果，三环节缺一不可交付�?**铁律 5. 后端能力 �?用户可用的功能�?* 追踪调用链：�?import？谁调用？结果在哪呈现？
**铁律 7. 每次接受任务确认 Done 标准�?* 默认：入口可触达 + 完整链路走�?+ 结果可见�?
### 二、代码质�?
**铁律 8. Mock/TODO 不留到交付代码�?* pre-commit 硬阻断�?**铁律 9. 关键变更 grep 全仓库传播�?* 改完核心定义后检查所有引用�?**铁律 11. 静默降级禁止�?* catch 必须 `log.warn/error` + 返回 `degraded: true`。pre-commit 警告存量�?**铁律 12. 集成测试 cover 真实路由，不 mock 管线�?*

### 三、错误处理与降级

**铁律 24. 异常处理审计——写 catch 时必须确认：**
- [ ] �?log.error/warn（不能空吞）
- [ ] 返回 degraded: true（后端）或显示错�?UI（前端）
- [ ] 区分 ENOENT（正常默认）�?JSON.parse 失败（打 log + degraded�?
**铁律 31. 降级信号传播�?* 每个可独立失败的模块必须返回 degraded 标记，调用方检查，前端展示�?**铁律 32. 错误分类强制�?* catch 块包装为 `.code` + `.phase` + `.retryable` �?Error 子类�?
### 四、自动化优先

**铁律 35. 自动化优先�?* 能变 tsc/oxlint/ESLint 规则的不靠文档，能写 check-*.sh 的不�?review�?**铁律 33. 测试命名约定�?* `*.test.ts` (单元) / `*.integration.test.ts` (集成) / `*.e2e.test.ts` (E2E)�?**铁律 34. Feature Branch 强制�?* `feat/` `fix/` `chore/` 分支，禁止直接在 main �?commit�?**铁律 36. vitest 必须全量通过�?* 零失败才合并�?**铁律 37. Dead code 入仓库即违规�?* 删除旧文�?+ grep 零引用确认�?
### 五、类型安全与架构

**铁律 38. `as any` 零容忍�?* 47 次历史教训。pre-commit 硬阻断，`as any` 代码中零存在�?替代：内联类�?`as { field?: string }` / `Record<string, unknown>` / `unknown` + 类型守卫�?
**铁律 39. 五层架构边界�?* 每层只与相邻层通信�?```
L1 交互 (TUI/CLI/Web) �?L2
L2 编排 (ConversationEngine) �?L1 + L3
L3 洞察 (ExpertAutonomy/Corroboration) �?L2 + L4
L4 本体 (GraphBridge/GraphStore) �?L3 + L5
L5 存储 (SQLite) �?L4
```
pre-commit `check-architecture.sh` 检�?L2→L4 / L3→L5 跨层违规�?
### 六、TUI V2 铁律�?026-06-07 新增 �?基于闪烁修复+流式事故�?
> 以下铁律来自 2026-06-07 TUI V2 闪烁修复和流�?Pipeline 事故�?> 核心原则�?*ink 补丁层已经解决了闪烁，React 层不要过度工程化�?*

**铁律 40. 闪烁修复不可回退（冻结）�?*

任何修改 TUI V2 时，必须确认以下冻结项完好：
```
[ ] patches/ink+5.2.1.patch 存在
[ ] package.json "postinstall": "patch-package" 存在
[ ] React.memo �?Message/StreamingText �?[ ] 没有引入全量重渲染（forceUpdate / �?token �?setState�?[ ] 没有 fallback 到旧�?useStreaming 实现
```
pre-commit 硬阻断：patch 文件缺失、postinstall 缺失、React.memo 被移除�?
**铁律 41. 流式 Pipeline 简单直�?�?禁止过度工程化�?*

`useStreaming` hook 只能�?`bufferRef += token` + `setTimeout(flush, 16)` 模式�?禁止引入：`LineBuffer` / `FrameRateLimiter` / `StreamChunker` 多层嵌套�?ink 补丁层已解决闪烁，React 层只需简单的 buffer + 60fps flush�?
**Why**：LineBuffer 要求换行才提交→无换行文本永远不可见。三层嵌套→buffer 永远来不�?flush�?pre-commit 硬阻断：`use-streaming.ts` 中出�?`LineBuffer`/`FrameRateLimiter`/`StreamChunker` 类名�?
**铁律 42. 逐字流必须有延迟�?*

非流�?API 模拟流式时，`for (const ch of content) onToken(ch)` 必须配合 `await sleep(5)`�?每字符至�?5ms 间隔，留�?UI flush 时间�?
**Why**：零延迟→所�?token 几毫秒内传完→buffer 来不及显示→用户看到空白�?pre-commit 警告：`tool-loop-executor.ts` �?`for (const ch of` 后无 `sleep`�?
**铁律 43. finishStreaming 调用顺序不可反�?*

必须是：
```
flushBuffer() �?addAgentMessage(reply) �?setState({ isStreaming: false })
```
�?`isStreaming=false` �?`addAgentMessage` �?中间有一帧空白�?
**Why**：顺序反了会在流式结束和新消息之间出现空白帧�?pre-commit 警告：检�?`setState({ ... isStreaming: false })` �?`addAgentMessage` 之前�?
**铁律 44. ChatPanel 禁止 `justifyContent="flex-end"`�?*

ink 不支持真正的滚动。flex-end 会把旧消息推出可见区域�?正确做法：消息截断算�?+ `�?上方还有 N 条消息`�?
pre-commit 硬阻断：`chat-panel.tsx` 中出�?`justifyContent.*flex-end`�?
**铁律 45. 注释�?`*/` 必须加空格�?*

JSDoc 或块注释�?`*/` 必须写为 `* /`�?否则 esbuild �?`*/` 识别为块注释结束符→编译失败�?
**Why**：message.tsx 注释写了 `-/*/+`，esbuild 解析崩溃�?pre-commit 警告：`.tsx` 文件注释中出�?`*/`（非行尾的块注释结束符）�?
### 七、架构完整�?�?2026-06-21 新增（engine-core 拆分欺诈事故�?
> 以下铁律来自 2026-05 �?2026-06 engine-core 拆分欺诈事故�?> 核心原则�?*桥接文件 �?迁移。声称拆�?= grep 零引用�?*

**铁律 46. 禁止桥接代理文件——迁移必须是代码真搬，不准建 import 代理�?*

桥接文件定义：src/ 下的文件，主体内容仅�?`import { X } from '../../packages/engine-core/...'; export const X = _X;`�?
**判定标准**�?```
纯桥�?= 文件中非 import/export/注释 的有效代码行�?= 0
部分桥接 = 有原创代码但仍直�?import engine-core
```

**修复标准**�?1. �?engine-core 中的代码真正复制/移动�?src/ 对应位置
2. �?src/ 文件中重写实现，�?import engine-core
3. 更新所有调用方�?import 路径
4. 删除 engine-core 中已迁移的旧文件
5. `grep -r "packages/engine-core" src/` 零结果（白名单除外）

**白名�?*（唯一允许引用 engine-core 的文件）�?- `src/adapters/engine-core-adapter.ts` �?官方适配�?- `src/init/engine-context.ts` �?引擎初始�?- `src/types/engine-core-types.ts` �?类型重导�?- `src/agent/orchestrator-adapter.ts` �?编排器适配
- `src/l4/graph-bridge.ts` �?图桥�?- `src/l4/entity-resolver-l2.ts` �?实体解析
- `src/l4/engine-graph-store.ts` �?图存�?- `src/l4/diagnosis-graph-query.ts` �?图查�?
**Why**�?026-05~06，engine-core 拆分被反复声称完成，实际全部是桥接文件—�?38 文件原封不动�?0 个桥接文件伪装成迁移。tsc 被骗过（import 路径合法），但运行时 17 �?CJS require() �?ESM 下崩溃。一个月反复承诺零实质进展�?
pre-commit 硬阻断：`bash scripts/pre-commit-check.sh` �?非白名单 src/ 文件引用 `packages/engine-core` �?�?5 组硬阻断，拒绝提交�?
**铁律 47. "拆完�?必须�?grep 物理证明�?*

声称任何模块"已拆�?已迁�?已清�?前，必须运行�?```bash
grep -r "旧路�?旧包�? src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "\.test\."
```
零结�?= 拆完了。有结果 = 没拆完，继续拆�?
**Why**：tsc 零错�?�?拆分完成。import 路径合法可以骗过编译器，骗不�?grep�?pre-commit 警告：task brief 中声�?已完成拆�?�?grep 仍有旧路径引用�?
---

## 项目身份

SynovaAgent 是一个驻扎企业的 AI 诊断系统�?诊断是手段，增长才是目的�?核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不�?ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行�?
**目标**: 成为组织诊断�?AWS。每个新客户、新行业、新数据�?�?加文件即可，不改代码�?能文件化的必须文件化。不能文件化的必须有明确的扩展点�?
**流程约束: V4.3.0 �?task brief 6字段 + 免疫系统 + plan.json + 8组物理阻�?+ Plan-Actual闭合 + engine-core清零 + 时间戳顺序检�?+ Q2排除项验�?+ verify执行

**数据�?*:
```
L5 存储 �?L4 本体 �?L3 洞察(哨兵定时 + 诊断按需) �?L2 编排 �?L1 交互
   �?                                                             �?   └─────── 反馈闭环 (GA评审/客户反馈 �?记忆�?�?数据�? ←────────�?                                                              �?                        Sentinel Finding[] ──�?诊断引擎 Phase 2 ──�?专家解读
                                                              �?                                                       8 位文件驱动专�?                                                     解读 Finding �?产出分析
```

**L1 交互层入�?*:
- `POST /api/diagnosis/consult` �?GA 诊断（六阶段→报告）
- Cron �?`Sentinel.check()` �?哨兵定时（发现异常→专家→工单）
- `GET /chat` �?Web 对话界面
- MCP 协议 �?外部工具调用

**五层架构** (只能向下依赖相邻�?:
```
L1 交互: routes/ (API), tui/ (终端), mcp/ (MCP协议)
L2 编排: agent/ (ConversationEngine, diagnosis-launcher, sentinel-service)
         orchestrator/ (SubAgentCoordinator, ModuleRunner)
L3 洞察: l3/ (ExpertDispatcher, ExpertAutonomy, QualityFirewall)
         sentinel/ (Runner, SignalAggregator, Registry, 哨兵适配�?
         expert-platform/ (ExpertStore, Validator)
         expert/ (8 位文件驱动专�? strategy/org/finance/tech/marketing/action/business_model/knowledge)
L4 本体: l4/ (GraphBridge, EntityResolver, CommunityReports)
         evidence/ (Collector, Corroboration, EvidenceStore)
         企业事实�? AgentMemoryStore (enterprise_fact, 版本�?+ superseded_by �?
L5 存储: store/ (SessionStore, SQLite)
         cron/ (CronScheduler)
```

**三层粒度** (专家→哨兵→计算):
一个专家管�?N 个哨兵。一个哨兵包�?N �?compute 指标�?哨兵 = 可独立告警的最小子领域。compute = 纯数学函数，不碰数据库�?�? 财务专家 �?成本哨兵/收入哨兵/现金流哨�?利润哨兵 �?每个哨兵�?N �?compute.ts

**L0 进化** (独立于五层，自我迭代):
```
evolution/ (SessionLearningEngine, FeedbackCollector, OntologyAdapter)
两路反馈 �?候选池 �?确认/执行验证 �?写入知识�?权重模型
分歧记录 �?三个月后自动验证 �?更新/降级
```

**文件化扩�?* (不改代码):
- `expert/` �?新增专家 = 新建目录 + 8 个文�?�?自动注册
- `expert/expert-registry.yaml` �?声明哪些专家启用、用什么工�?- `knowledge/shared/` �?共享知识单源。专�?KNOWLEDGE.md 只引用不复制
- `theory/` �?理论基础。每个文件对应一个学科模�?
**技能扩�?*:
- `skills/` �?SKILL.md 定义完整方法论。按需加载。新�?skill = 新建目录 + SKILL.md �?ExpertDispatcher 自动发现

**数据安全**:
- L0 公开摘要 �?所有人可见
- L1 聚合信号 �?GA + 客户可见
- L2 脱敏证据 �?GA + 客户可见（人�?金额已脱敏）
- L3 原始数据 �?仅客户企业内�?Agent 可见。GA 永久不可�?
**引擎**: `packages/engine-core/` (Novis 遗产, 538文件, 逐步迁移�?src/l3 + src/l4)�?禁止 src/ 新增 engine-core 引用（铁�?46）。pre-commit 物理阻断�?
**安全**: `security/` (PIIScrubber, DataBoundary)
**LLM**: `providers/` (DeepSeek, OpenAI, Gateway)

**架构规则**: 只能向下依赖相邻层。L1禁触L3/L4/L5。L2禁触L4/L5。pre-commit `check-architecture.sh` 检测违规�?
---

## Loop Engineering V4.3.0 �?L4 本体层图遍历哲学 + 免疫系统 + Plan-Actual 闭合

> 2026-06-17 v2.5 �?v3.0 �?v3.1 �?v3.5 �?v3.6 �?v3.7 �?v3.8 �?v3.9 �?V4.1 �?V4.1.1 �?V4.1.2 �?V4.2.2 �?V4.2.3 �?V4.2.4 �?V4.2.5 �?**V4.4.1 (2026-07-05)**�?>
> **v3.6 的核心教�?*：把需要语义理解的事交�?grep = 17 次折腾才提交成功�?> **V3.9 的核心教�?*：硬阻断 100% 有效，软机制 0% 有效。信息注入型检查对 agent 不可见�?> **V4.1 的解�?*：每次记录一个错�?�?植入一个免疫细胞（bash constraint）�?>
> ### V4.2.3 变更 (2026-06-24)
> - 新增免疫细胞 #9: plan-actual-closure（声明完成须对比文档�?> - q0c-cancelled-without-followup 升级 warn→block（取消不补＝不准提交�?> - 所�?9 个免疫细胞增�?remediation 字段�?怎么做才�?修复提示�?> - CHANGELOG 增加"已知缺口"章节（当前覆盖率 45%，追�?8 项缺口）
>
> ### V4.2.4 变更 (2026-06-25)
> - engine-core 全面清零�?个白名单桥接文件删除�?个消费者重写（src/ �?engine-core 引用�?> - 11个@deprecated旧适配器删除（Task 0.0�?> - 11个stub哨兵目录删除（Task 0.1�?> - cash-flow-sentinel.ts 空import悬挂修复：内联computeCashFlowMetrics替代已删除桥�?> - **settings.json hook配置审计修复**：PreToolUse 指向 `hook-block-no-q0.sh`（旧版，只查Q0）→ `hook-block-write.sh`（完整版，查Q0+Q2+Q3+接口审计+层级确认）。这是V4.2.4新增检查项：hook配置一致性�?> - 旧版hook边界修复：Q0存在性检�?`-lt 10` �?`-le 5`
> - CLAUDE.md/STATE.md/pre-commit/hook 全部同步�?V4.2.4
>
> ### V4.2.5 变更 (2026-06-25)
> - **时间戳顺序检查（新免疫细�?#18）：** PreToolUse hook �?brief 未填而写代码时，记录证据�?`/tmp/.synova-before-brief`（git 外不可抹除）。pre-commit �?6 检查此文件，存在则硬阻断。阻断后�?`rm /tmp/.synova-before-brief && git checkout -- .` �?task-start 重新开始�? 次测试证�?exit code �?VSCode Extension 中被忽略——这是一个环境感知修复�?> - **项目身份重构�?* 新增三层解耦体系（纵向五层物理隔离 / 横向 Monorepo �?/ 扩展文件驱动）。Q0 增加三层解耦勾选项。Q1 重构�?Anthropic 决策链（5 步序：SPEC→测试→实现→接线→验证�? 执行约束（plan.json principles）�?> - 模板 `generate-task-brief.py` 更新�?V4.2.5 新格�?> - 版本�?CLAUDE.md/STATE.md/pre-commit/hook 全部同步�?V4.2.5
>
> ### V4.2.6 变更 (2026-06-26)
> - **Q2排除项物理验证（新免疫细�?#19）：** pre-commit 自动解析 Q2 中「不�?X」模式，提取文件路径，检�?git diff 是否包含这些文件。包含则硬阻断�?> - **verify命令自动生成与执行（新免疫细�?#20）：** Q2排除项、Q3验收项中的可验证内容自动生成 bash verify 命令，在 pre-commit �?6 执行�?> - **check-verifiable-done.sh 解析bug修复�?* awk 范围模式 /^## Done 标准/,/^## / 中开始行也匹配结束条件，Done 内容从未被读取。修复为从匹配行之后开始�?> - **版本号统一�?* scripts/ �?10 个残�?V4.2.1 文件全部同步�?V4.2.6
>
> ### V4.2.7 变更 (2026-06-27)
> - **日期边界bug修复�?* BRIEF查找改为取最�?.md)而非当天，解决跨天提交时brief找不到的问题�?> - **层字段检查修复：** "L3"过短(2字符)导致6核心字段误阻断�?> - **current-brief 绑定�?* task-start.sh 将brief文件名写�?claude/current-brief�?> - **模板残留检查：** grep <!-- 在brief�?�?未认真填 �?阻断�?> - **Q2排除项必须含文件路径�?* 排除项需引用具体文件�?.ts/.sh/.json)�?> - **trivial verify阻断�?* echo/true等永远exit 0的命令→硬阻断�?>
> ### V4.2.9 变更 (2026-06-28)
> - **maker/checker 分离�?* checker-review.sh 独立验证器，GitHub Actions PR触发�?> - **19个stub compute全部修复�?* S1-S3, O1-O10, T4-T9 替换为真实算法�?> - **专家路由改为layer基：** �?category 改为 layer 路由�?> - **SentinelConfig 补全4字段�?* layer/auxiliaryExperts/computeKind/technoEconomicPhaseCalibration�?> - **全部版本号同步到 V4.2.9**
>
> ### V4.3.0 变更 (2026-07-03)
> - **L4 本体层设计哲学明确化**：本体层是企业知识图谱（22 节点类型 + 17 边类型），compute 函数必须使用图遍历思维，不能退化为 KV 读取�?> - **compute 函数签名标准�?*：`(store: GraphStoreReader, teamId: string) => ComputeResult`，store 提供 queryNodes/queryEdges/traverse 三个图操作原语�?> - **已知问题与演进方�?*：Financial 节点 17 �?optionalProps 需拆分为语义子节点�? 条缺失边类型需补充�?> - **全部版本号同步到 V4.3.0**

### 设计哲学 (V3.7 核心修正)

```
V3.6 的错�? �?这个函数是否在正确的调用链中"交给 grep 判断
             �?动�?import 检测不�?�?5 次接线误�?             �?分阶段任务未接线文件被硬阻断 �?架构步骤被打�?
V3.7 的修�? grep 只回�?这个符号在文件外部出现过吗？"（物理事实）
             agent 自检回答"这个符号在正确的调用链中吗？"（语义判断）
             plan.json 声明"这个文件处于架构步骤中，接线在后续阶�?（结构化计划�?```

### L4 本体层设计哲学（V4.3.0�?
本体层不�?KV 数据库，是一�?*企业知识图谱**�?2 种节点类型（Financial/Client/Person/Process/Tool/Goal/Market/Product...）和 17 种边类型（COST_DRIVEN_BY/REVENUE_FROM/OWNS/PROVIDES/DEPENDS_ON/INTERACTS_WITH/TRIGGERS...）共同构成对一家企业的语义建模�?
设计哲学：边承载语义，节点承载状态�?
- 哨兵�?融资约束如何"——不是读 Financial.operatingCashFlow，而是�?GENERATES 边找现金流子节点、沿 OWES 边找债务结构、沿 BACKED_BY 边找权益，在图遍历结果上运行 KZ 公式
- 哨兵�?砍掉低产客户群会怎样"——不是读 revenue 数字，而是�?REVENUE_FROM 边找客户收入贡献，沿 COST_DRIVEN_BY 边追踪成本线归属

compute 函数签名统一�?`(store: GraphStoreReader, teamId: string) => ComputeResult`。store 提供 queryNodes/queryEdges/traverse 三个图操作原语。compute 不应该自�?知道"数据在哪——它应该沿图中已定义的边走过去�?
**已知问题与演进方�?*�?- Financial 节点 17 �?optionalProps 需拆分�?CashFlowStatement/BalanceSheet/IncomeStatement/CapitalStructure/CostCenter 等语义子节点
- 缺失 5 条边类型：COMPENSATES/ALLOCATES_TO/BUDGETS/PARTICIPATES_IN/GENERATES

### 三权分立

| 层级 | 谁做 | 判断什�?| 不可靠时怎么�?|
|------|------|---------|--------------|
| **bash 物理验证** | pre-commit | 文件存在、符号被引用、模式可见、语法合�?| 硬阻�?�?物理事实不容争辩 |
| **plan.json 结构** | 人类审批 | 文件清单、阶段顺序、deferred checks | 锁定�?plan 覆盖 bash |
| **agent 自检** | agent | 调用链正确、退化诚实、架构边界、接线完�?| 自检结果�?commit message |

### 执法架构: 五层精简

```
📋 任务启动 (人工)   �? task-start.sh �?6 核心字段 + 可�?plan.json
🧠 写前注入 (自动)    �? hook-check-memory.sh �?历史教训
✍️ 写后验证 (自动)    �? verify-incremental.sh �?L1 oxlint �?L2 tsc �?L3 vitest �?L4 接线
🔴 提交阻断 (自动)    �? pre-commit 8 �?�?bash 只做物理验证
🚀 推送阻�?(自动)    �? pre-push 1 �?�?secrets 终扫
🎯 提交后检�?(自动)  �? post-commit �?--no-verify 绕过检�?+ 决策建议
```

| 时机 | 脚本 | 阻断 | 耗时 |
|------|------|------|------|
| PreToolUse | hook-check-memory.sh | 不阻�?| <1s |
| PreToolUse | hook-block-write.sh | 🔴 阻断 | <1s |
| PreToolUse | hook-enforce-loop.sh | 🔴 阻断 | <1s |
| PostToolUse | verify-incremental.sh (L1→L4) | 🔴 阻断 | 5-30s |
| pre-commit | pre-commit-check.sh (8 �? | 🔴 阻断 | <8s |
| post-commit | post-commit (bypass 检�? | 不阻�?| <1s |
| pre-push | pre-push-check.sh (secrets 终扫) | 🔴 阻断 | <3s |

### pre-commit 8 组硬阻断（V3.7 �?bash 只做物理验证�?
| �?| 检查内�?| bash 判断 | agent 自检判断 |
|----|---------|----------|--------------|
| **1** | **类型安全 + 硬编码数�?* | as any 在代码行（跳过注释行）| 硬编码数据是否合�?|
| **2** | **测试质量** | 文件配对 + empty catch �?degraded/throw/log | 测试质量 + 跨模块覆�?|
| **3** | **Secrets** | 全工作区模式匹配 | �?|
| **4** | **接线完整�?* | �?export 是否被任�?src/ 文件引用 | 引用是否在正确的调用链中 |
| **5** | **架构边界 + 桥接** | 跨层 import + engine-core 引用 | 跨层调用是否通过合法桥接 |
| **6** | **Task Brief** | 存在 + 6 核心字段 (Q0/Q1/Q2/Q3/架构�?Done) | 分阶段计划合理�?|
| **7** | **架构合规** | DiagnosticModule + 专家配置 + 数据�?| 降级是否诚实 |
| **8** | **文件驱动完整�?* | manifest schema + tags + 目录结构 | 新类型是否应该文件驱�?|

### plan.json �?分阶段任务的结构化支�?
当任务声明为分阶段执行时，创�?`.claude/plan.json` 声明各阶段的文件清单�?`deferred` 检查：

```json
{
  "version": "1.0",
  "current_phase": 1,
  "phases": [
    {
      "step": 1, "action": "create",
      "files": ["src/locale/locale-loader.ts", "src/l3/framework-loader.ts"],
      "checks": { "wiring": "deferred", "test_pairing": "deferred" }
    },
    {
      "step": 2, "action": "wire",
      "files": ["src/server.ts"],
      "checks": { "wiring": "enforce", "test_pairing": "enforce" }
    }
  ]
}
```

- `checks.wiring: deferred` �?接线检查对该文件降级为警告
- `checks.test_pairing: deferred` �?测试配对检查对该文件降级为警告
- agent 不能改这个文�?�?�?EnterPlanMode 时生成，人类审批后锁�?- plan.json 不存在时 �?所有检查正常硬阻断（和 V3.6 一致）

### 双日志审�?�?门禁故障 �?人为绕过

| 日志 | 写入�?| 含义 | 审计行为 |
|------|-------|------|---------|
| `.claude/pre-commit-failures.log` | pre-commit hook (exit != 0) | 门禁本身拒绝了提�?| >10 �?24h �?警告（门禁太激进） |
| `.claude/bypass.log` | post-commit hook | `--no-verify` 跳过�?pre-commit | �? �?24h �?硬阻�?|

**检测原�?*：pre-commit hook 通过时写时间戳到 `.claude/last-precommit-success`。post-commit hook 检查：如果上次成功时间戳在 120 秒之�?�?本次 commit 可能用了 `--no-verify` �?写入 bypass.log�?
### �?Agent 自检 6 问（每次写完代码必答 �?v3.7 新增文件驱动检查）

> 以下检查由 agent �?CLAUDE.md 指令下自我执行，不依�?bash 脚本�?> agent 能做语义理解——bash 只会 grep 模式匹配（误报如 `'community'` 被识别为硬编码凭证）�?
写完代码后，必须在回复中逐项回答�?
```
1. 接线检�? �?export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch �?log + degraded？（铁律 24+31�?3. 类型安全: as any = 0？（铁律 38�?4. 测试覆盖: 测试�?expect() 断言？（不是空壳�?5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
6. 🆕 文件驱动: 新增了硬编码类型吗？新扩展有 manifest.json 吗？tags �?tags.json 中吗�?```

**Why agent 自检�?bash �?*: agent 知道 `'community'` 是模�?ID 不是密码�?grep 脚本会产生误报，误报会产生噪音，噪音会导致整条门禁链被绕过�?
### task-start.sh 6 核心字段（任务启动时填写 �?v3.7 新增 Q0 项目背景+文件审计�?
```
Q0 定位: a) 项目拼图 �?
             Synova = AI 诊断 Agent。五层架�?L1→L5�? 专家 7 维度�?             本任务在哪一层？该层现在有哪些模块在运行？（列出文件名）
             本任务的上下层各有哪些模块？（L(N-1) �?L(N+1)�?             本任务是新增、替换、还是扩展已有模块？
         b) 文件审计 �?
             grep 本任务涉及的关键词在 expert/ sentinel/ extensions/ 中�?             列出找到的已有文件驱动模块�?             本任务和它们的关系：复用 / 扩展（加文件�? 新建（无覆盖�? 冲突（重复了�?         c) 决策 �?
             已有覆盖 �?必须复用，不准新建硬编码替代�?             无覆�?�?新建走文件驱动（manifest.json + 独立文件），不准硬编码在 TS 里�?             冲突 �?本任务取消，直接复用已有的�?Q1 调研: a) 业界最佳实�?b) Anthropic 团队怎么�?c) memory/ 里我们犯过的�?Q2 范围: 正确的最简方案是什么？必须符合现有架构、复用已有模块。明确列出不做的事�?Q3 验收: 入口→交互→结果，三环节各是什么？
架构层级: 本任务涉及哪几层？（L1-L5�?Done 标准: 至少一条可验证的完成标�?```

### Windows 兼容�?
- pre-commit 8 组合�?grep�?8s），不含 tsc/vitest（已�?PostToolUse 跑）
- 严禁 `taskkill //IM node.exe` �?会杀死所�?Node 进程（含其他 Claude Code 实例�?- `--no-verify` �?V4.1 下不应再需要（pre-commit <8s�?- 轻量变更（≤5 行或纯非 TS 文件）跳�?tsc/vitest，仍�?oxlint + 接线审计

### V3.6/V3.7 新增脚本

| 脚本 | 用�?|
|------|------|
| check-file-driven.sh | 文件驱动架构完整性（manifest/tags/回归/目录/pizza-chain）�?pre-commit �?8 �?|

### 删除的脚本（v3.0 清理�?
| 脚本 | 删除原因 |
|------|---------|
| check-manual-drift.sh | 文档硬编码数�?�?每次改代码都要改文档 |
| check-vertical-slice.sh | 入口→结�?三环�?�?agent 自检 Q3 验收 |
| generate-state-md.sh | STATE.md 无人阅读 |
| check-reality.sh | @state 注释 �?正确�?|
| hook-check-brief.sh | task brief 提醒�?task-start.sh 覆盖 |

**净效果: v2.5 38 �?�?v3.0 5 �?�?v3.5 20 项（漂移）→ v3.6 8 组（合并归位）。提交耗时 v2.5 90s �?v3.6 <8s�?*

---

## 常用命令

```bash
npm run dev              # 开发模�?(tsx src/index.ts)
npm run test             # 全量测试 (vitest run)
npm run tui              # TUI 终端界面
npm run lint             # TypeScript 检�?(tsc --noEmit)
npm run check:iron-laws   # 铁律门禁 (6 硬阻�?
npm run check:architecture # 架构边界检�?npm run check:all         # pre-push 全部门禁 (tsc + vitest + iron-laws)
npm run hooks:install     # 安装 Git hooks
npm run workflow:start    # 任务启动检查点 (开始写代码�?
npm run workflow:impl     # 实现完成检查点 (声称完成�?
npm run workflow:design   # 设计对齐检查点 (写代码前)
npm run workflow:deploy   # 部署后验�?```

---

## �?Anthropic 工程工作�?(7 节点自动触发)

> 详细设计: `docs/workflow/ANTHROPIC-WORKFLOW.md`

### 触发机制 �?全部物理强制，零 AI 自律

```
�?任务开�?�?pre-commit 强制 (Gate 0: task brief 不存�?+ 未填�?�?拒绝提交)
�?设计完成 �?pre-commit 强制 (Gate 1: SPEC.md + 设计文档不存�?�?拒绝提交)
�?实现完成 �?pre-commit 强制 (Gate 2: 8 组物理阻�?+ task brief 完整)
�?提交�?  �?Git Hook (.git/hooks/pre-commit) 8 组硬阻断（全 <8s）—�?无超时逃生�?�?推送前   �?Git Hook (.git/hooks/pre-push) 1 道门禁（secrets 终扫�?�?部署�?  �?人工触发 (checkpoint-deploy.sh)
�?线上     �?Cron
```

### 物理强制说明

> pre-commit 是唯一物理阻断点。①②③ 的产出物检查已全部集成�?pre-commit�? 组硬阻断）：
> - �?task brief �?不准 commit
> - �?SPEC.md / 设计文档 �?不准 commit
> - �?export 未接�?�?不准 commit
> - 新文件无测试 �?不准 commit
> - 🆕 manifest 不完�?/ tags 非法 / 硬编码类型回�?�?不准 commit
>
> SessionStart + PostToolUse hooks 在写代码时持续提醒�?
⚠️ 每次 git push 成功后，必须提醒:
   "部署已完成。请运行: bash scripts/workflow/checkpoint-deploy.sh [服务器URL]"
```

### 人工触发命令

```bash
# 节点 �? 设计文档写完�?bash scripts/workflow/checkpoint-design.sh docs/research/my-feature.html

# 节点 �? 部署到服务器�?bash scripts/workflow/checkpoint-deploy.sh https://your-server.com

# 节点 �? 设置定时监控
crontab -e  # 添加: */30 * * * * bash /path/to/scripts/workflow/checkpoint-runtime.sh
```

---

## 门禁系统 (全部物理强制，零 AI 自律)

### PreToolUse Hook (写代码前)
- Task brief 存在 + 6 核心字段质量检查（Q0定位/Q1调研/Q2范围/Q3验收/架构层级/Done标准）�?V3.8 全面升级 Q0 为项目拼�?文件审计
- 接口真实性反向验证（grep 确认函数签名真实存在�?- 例外: `.claude/task-briefs/` `.claude/settings` `scripts/workflow/hook-`

### PostToolUse Hook (写代码后)
- `verify-incremental.sh`: L1 oxlint �?L2 tsc --incremental �?L3 vitest --changed �?L4 接线审计
- `.claude/loop-state.json`: 循环计数，最�?�?
> PostToolUse �?tsc + vitest 唯一一次执行的位置。pre-commit �?pre-push 不重复跑�?
### Git Hooks

| Hook | 触发时机 | 内容 |
|------|---------|------|
| pre-commit | `git commit` | 8 组硬阻断 (类型安全+测试+Secrets+接线+架构+TaskBrief+合规+文件驱动) |
| commit-msg | `git commit` | Conventional Commits 格式强制 |
| post-commit | `git commit` | 决策流程建议 (decide-next.sh) |
| pre-push | `git push` | 1 道门�?(secrets 终扫) |

---

## 执行原则

- **先读再改** �?不假设代码内容。读 CLAUDE.md + task brief + 全量对齐手册相关章节
- **task brief 必须先填** �?PreToolUse hook 强制�?核心字段(Q0定位/Q1调研/Q2范围/Q3验收/架构层级/Done标准) 全部非空才能写代�?- **接口审计从代�?grep，不凭记�?* �?hook 反向验证，虚假接口拒绝写代码
- **每写一个文件，自动验证** �?PostToolUse hook �?vitest --related + 接线审计。失败自动进入修正循�?- **循环最�?�?* �?verify-incremental.sh 记录轮次�?轮不过停止等人工
- **接线审计是硬门禁** �?�?export 必须在生产入口有引用
- **逐项 commit** �?单模块独立提交，不批�?- **改完列清�?* �?文件 + 行号 + 为什么改
- **部署后验�?* �?`bash scripts/workflow/checkpoint-deploy.sh` curl 外部 URL
