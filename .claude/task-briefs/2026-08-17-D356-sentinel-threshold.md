# Task Brief: D356 哨兵阈值告警接线 + 降级误报修复 (K3 P0-1/P1-1/P1-3)

> 生成: 2026-08-17（2026-08-16 开工，跨日延续提交） | 分支: feat/win-d356-sentinel-threshold | as any: 0
> dev doc: docs/plans/codex/implementation/SYNOVA-IMPL-D356-哨兵阈值告警接线-降级误报修复-20260816.md
> 审计依据: docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md P0-1/P1-1/P1-3（K3 独立审计）

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统（组织数字孪生诊断 + 持续增长导航系统）。
诊断是手段，增长才是目的。核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。
本任务是 L3 洞察层的哨兵体系缺陷修复：让已写好的阈值告警真正在生产路径触发，同时保证降级/缺数据绝不冒充真实信号。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属于纵向解耦的 **L3 洞察层哨兵体系** 修复（改 src/sentinel/ + extensions/sentinels/ 代码，非文件驱动扩展）。
K3 全链路审计 20260813 发现三缺陷：
- P0-1 生产死代码：src/sentinel/sentinel-loader.ts 的 registerLoadedSentinels() 动态 import 哨兵对象后从未把 manifest 挂到哨兵对象上，而 cash-runway/revenue-health 的阈值 finding 全部包在 `if (this.manifest)` 里 → manifest 恒 null → 阈值告警永不触发（活运行 [A] 组 findings=0）。
- P1-1 降级语义→误报：manifest 一旦挂上，compute 降级时 value=0 穿过阈值门控（0 ≤ critical 6）→ 无数据也报 critical「现金流危急」（K3 活运行 [B] 组已证明）。
- P1-3 部分数据→误报：capital-health 动态 import _extinct 三个退役子哨兵，子哨兵对缺失字段 `Number(x)||0` 兜底成 0 被当真实值产出 critical（K3 T3-a：注入 {revenue:100} 单 Financial 节点 → 2 条假 critical）。
现有模块：sentinel-loader.ts（文件驱动注册，L122-222）、registry.ts（全局单例 SentinelRegistryImpl）、三个 aggregate。本任务是**修复 + 接线**，不新建哨兵、不新建机制。

### b) 文件审计（grep 实测，已写入 .claude/reference-map.md）
- grep "this.manifest" extensions/sentinels/ 实测：仅 cash-runway/aggregate.ts:28-29、revenue-health/aggregate.ts:50-51 两个**非 _extinct** 哨兵读 this.manifest；_extinct/cost-health、_extinct/profit-health 同款但 loader 跳过 `_` 目录不注册，不受本任务影响。
- grep "\.manifest =" src/ 实测：零赋值（P0-1 物理证据，与 K3 报告一致）。
- grep "manifest: null" extensions/sentinels/ 实测：仅 cash-runway/aggregate.ts:14、revenue-health/aggregate.ts:11 声明 manifest 字段 → 挂载守卫 `'manifest' in sentinelObj` 精确覆盖这两个哨兵。
- capitalHealthSentinel 引用 3 处：aggregate.ts:20 定义、manifest.json:63 exportKey、tests/sentinel/sentinel-merge-d15a.test.ts:79 exportKey 映射（不改变 exportKey 即不影响）。
- grep "queryNodes('Financial'" _extinct/capital-*/aggregate.ts 实测：三个子哨兵分别读 revenue/totalRevenue、totalDebt、equity、operatingIncome/operatingCashFlow、interestExpense、totalAssets、accountsReceivable 等字段。
- 复用：loadSentinels()/getSentinelRegistry()/destroySentinelRegistry() 已有；新建：tests/sentinel/sentinel-threshold-wiring.test.ts、tests/sentinel/capital-health-degraded.test.ts。冲突：无。

### c) 决策
已有覆盖→复用（registry/loader/compute 全复用）。无覆盖→修 bug + 窄修守卫（按 dev doc §4.5 决策：capital-health 入口字段完整性校验，不重写 _extinct 子哨兵——重写是 D358）。冲突→无。
决策参考四步框架结论见 Q1c。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC/Done 标准（dev doc §6 DS1-DS8）→ ② 测试先行 red→green（dev doc §4 要求 red 必须覆盖失败模式：manifest null / degraded 穿门控 / 缺字段假 critical）→ ③ 实现（4 修改 + 2 新建，见 Q2）→ ④ 接线（grep 物理证明，dev doc §5 S-3：生产调用点必须是 loader 真实注册路径，测试手动构造 manifest 不算数）→ ⑤ 验证（自检 6 问）。
引用依据：
- 铁律 0-2（AGENTS.md）：spec → test → impl → wire → review → merge；Step 5 WIRE CHECK 硬门禁
- 铁律 24+31：catch 必须 log + degraded；降级信号传播——degraded 是信号不是噪声，绝不能静默
- 铁律 47/48：契约优先（本任务三个 compute 已有 JSDoc 契约）；测试非空壳（正常/降级/边界三态）
- 铁律 38：as any = 0（loader 动态 import 的 sentinelObj 用 `'manifest' in` 守卫 + 显式类型收窄，不用 as any）
- memory/2026-08-12-D330-kimi-k3-audit-fix.md：fail-open 吞信号=隐藏失效——degraded finding 若 severity=info 会被 formatFindingsForLLM（src/sentinel/registry.ts:92-99 只呈现 critical+warning）过滤掉，等于静默降级复发
- memory/parallel-session-commit-hijack.md（D320）：提交只 add 自己写集的 6 个文件，绝不吞并他 session 的 staged/脏文件

### b) 本任务执行约束
- rule: "degraded 结果不穿过阈值门控——短路改发 severity=warning 的 degraded finding，绝不产出 critical"
  verify: "grep -n 'degraded' extensions/sentinels/cash-runway/aggregate.ts extensions/sentinels/revenue-health/aggregate.ts 阈值判断前有短路"
- rule: "manifest 挂载发生在 registerLoadedSentinels 生产装配路径，且只挂有 manifest 字段的哨兵对象"
  verify: "grep -n 'sentinelObj.manifest = manifest' src/sentinel/sentinel-loader.ts 命中 1 处"
- rule: "capital-health 入口校验 6 组必填字段（revenue|totalRevenue、totalAssets、totalDebt、equity、operatingIncome|operatingCashFlow、interestExpense），缺失→返回 degraded finding 并跳过子哨兵；无 Financial 节点→返回空 findings（维持 K3 T2-b 空库基线行为）"
  verify: "grep -n 'REQUIRED_FIELD_GROUPS' extensions/sentinels/capital-health/aggregate.ts"

### c) 决策参考系（D333）
决策点 1（dev doc §4.5 已定 + 实现细化）：capital-health P1-3 用「入口字段完整性校验」，且必填字段组按 K3 T3-a 假 critical 机制逐条推演确定：ICR 假 critical 源于 operatingIncome+interestExpense 双缺失→icr=0；资产周转率假 critical 源于 totalAssets 缺失→turnover=0；资本周转率/D-E 假 critical 源于 totalDebt+equity 缺失→totalCapital=0；revenue 缺失则 capital-efficiency 内部 return [] 但 capital-turnover 仍会 turnover=0 假 critical。
参考：第一性原理（缺字段=数据不可用，不得被 Number(x)||0 兜底成真实 0）+ Anthropic 工程基线（降级可观测，degraded 标记显式传播）+ DeepSeek（最少机制——窄修守卫，不重写 _extinct，重写是 D358）。
结论：REQUIRED_FIELD_GROUPS 六组字段 + 存在性判定（undefined/null/'' 视为缺失；显式 0 是合法数据不拦）。
决策点 2（实现新增）：degraded finding 的 severity 选 warning 还是 info（talent-density 先例是 info）。
参考：第一性原理（降级提示的目的就是被看见）+ Anthropic 工程基线（formatFindingsForLLM src/sentinel/registry.ts:92-99 只把 critical/warning 呈现给专家 prompt——info 降级 finding 对诊断链不可见，等于静默降级复发，恰好是 P1-1 要消灭的失败模式）+ 开源实证（talent-density 的 info 是「空数据」提示，本任务是「部分数据不可信」警示，语义不同）。
结论：degraded finding 一律 severity=warning（可见、可区分于 critical 误报、进入专家 prompt）。
决策点 3（实现新增）：manifest 挂载守卫用 `'manifest' in sentinelObj`（dev doc §3.1 指定）。
参考：第一性原理（只给声明了 manifest 字段的对象挂载，capital-health 等无 manifest 哨兵不注入多余状态）+ Anthropic 工程基线（grep 实测仅 2 个非 _extinct 哨兵声明 manifest 字段，守卫精确闭合）。
结论：`if ('manifest' in sentinelObj) { sentinelObj.manifest = manifest; }` 放在 check() 方法校验之后、registry.register 之前。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- src/sentinel/sentinel-loader.ts: check() 校验后、registry.register 前加 manifest 挂载（P0-1）
- extensions/sentinels/cash-runway/aggregate.ts: runway/overdue 阈值门控前加 degraded 短路，改发 cr-runway-degraded / cr-overdue-degraded finding（P1-1）
- extensions/sentinels/revenue-health/aggregate.ts: growthResult.degraded 短路，改发 rev-growth-degraded finding（P1-1）
- extensions/sentinels/capital-health/aggregate.ts: 入口字段完整性校验 REQUIRED_FIELD_GROUPS + 缺失返回 ch-degraded finding（P1-3）
- tests/sentinel/sentinel-threshold-wiring.test.ts: 新建，≥4 断言（loader 挂载 / 经 registry 端到端阈值可达 / degraded 不产 critical / 正常值仍产 critical 回归）
- tests/sentinel/capital-health-degraded.test.ts: 新建，≥4 断言（K3 T3-a 复现缺字段不产 critical / 完整字段仍产 finding / 空库返回空 / 存储抛错不误报）

不做什么（含文件路径）：
- 不重写 extensions/sentinels/_extinct/capital-efficiency/aggregate.ts、capital-structure/aggregate.ts、capital-turnover/aggregate.ts（重写是 D358，本任务只加入口守卫）
- 不修改 extensions/sentinels/_extinct/cost-health/aggregate.ts、profit-health/aggregate.ts（同款 this.manifest 但 _ 目录不注册，不属本任务）
- 不修改 extensions/sentinels/customer-demand-shift/aggregate.ts 硬编码阈值（P2-2，另列任务）
- 不修改 src/sentinel/types.ts、src/sentinel/registry.ts（SentinelCheckResult.degraded 字段传播属后续任务，本任务 degraded 信号由 finding 携带）
- 不 bump VERSION.md（纯产品代码 bug 修复，非门禁/工具行为变化，dev doc 自检清单明示）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：cron 定时 → SentinelRegistry 中经 registerLoadedSentinels() 注册的哨兵 wrapper check → 动态调用 extensions/sentinels/{name}/aggregate.ts 的 check()；测试入口 npx vitest run tests/sentinel/sentinel-threshold-wiring.test.ts tests/sentinel/capital-health-degraded.test.ts。
处理（中间经过哪些步骤）：loader 注册时把 manifest 挂到哨兵对象 → cash-runway/revenue-health 的 this.manifest 阈值路径在生产装配下可达 → compute 正常时按阈值产出 critical/warning；compute 降级时短路门控改发「数据不完整」warning finding → capital-health 在调用 _extinct 子哨兵前校验 Financial 节点必填字段，缺失返回 degraded finding 跳过子哨兵。
结果（最终展示在哪）：修复后，越阈财务数据经 cron 轮巡在 GET /api/sentinel/reports 与 sentinel_tickets 中真实出现 critical/warning 告警（此前恒为空——死代码）；无数据/部分数据时出现 warning「数据不完整」提示而非 critical 误报（K3 [A]/[B]/T3-a 三组实验全部反转）。

## Q4: 历史教训（scope-check 匹配 + 主动排查）

- memory/parallel-session-commit-hijack.md（D320 提交劫持）：本树含他 session 的 staged/脏文件，提交时用 synova-commit pathspec 只提交本任务 6 文件
- memory/2026-08-12-D330-kimi-k3-audit-fix.md：fail-open 吞信号=隐藏失效——degraded finding 必须可见（本任务 severity=warning 决策由此而来）
- memory/2026-08-05-D313-D315-closeout-session.md：current-brief 须完整文件名；brief Q2 行禁全角括号（本 brief Q2 已用 ASCII 括号）
- memory/2026-08-16-d363-llm-failover-delivery.md：push 时序竞态致 bypass 误拒→若被拦手动重推并核对 bypass.log
- 本任务不改 bash 脚本、无子进程管道，D366 子进程风暴教训不涉及

## 文档引用
- docs/plans/codex/implementation/SYNOVA-IMPL-D356-哨兵阈值告警接线-降级误报修复-20260816.md — §2 缺陷实测（file:line）/§3 写集/§4 测试要求/§4.5 决策/§5 接线要求/§6 DS1-DS8/§7 自检清单
- docs/synova/audit-reports/AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813.md — P0-1（§六）/P1-1/P1-3（§六）/T2-b/T3-a（§五）/建议修复顺序（§七）/防线缺口（§八 发现1）
- AGENTS.md 铁律 0-2（接线验收）/铁律 24+31（错误处理+降级传播）/铁律 47/48（契约+测试非空壳）/铁律 38（as any 零容忍）
- docs/synova/coordination/DECISION-REFERENCE.md — 决策参考四步框架（Q1c 已记录）
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md — 铁律 0-3 一人一事一分支

## 接口审计（从代码 grep，非凭记忆）
- src/sentinel/sentinel-loader.ts:registerLoadedSentinels
- src/sentinel/registry.ts:getSentinelRegistry
- src/l4/graph-traversal.ts:createGraphTraversal
- extensions/sentinels/cash-runway/aggregate.ts:cashRunwaySentinel
- extensions/sentinels/revenue-health/aggregate.ts:revenueHealthSentinel
- extensions/sentinels/capital-health/aggregate.ts:capitalHealthSentinel

## 架构层: L3
src/sentinel/ 属 L3 洞察层；extensions/sentinels/ 为 L3 文件驱动扩展（loader 动态注册路径）；tests/ 为测试层不受层级约束。
#CRITERIA: A

## Done 标准
- [ ] DS1 测试绿：`npx vitest run tests/sentinel/sentinel-threshold-wiring.test.ts tests/sentinel/capital-health-degraded.test.ts` 全绿；red 先行已证（修复前运行输出：manifest null / degraded 产 critical / 缺字段产 2 critical）
- [ ] DS2 P0-1 接线：`grep -n "sentinelObj.manifest = manifest" src/sentinel/sentinel-loader.ts` 命中 1 处（生产装配路径，非测试构造）
- [ ] DS3 P1-1 降级拦截：`grep -n "degraded" extensions/sentinels/cash-runway/aggregate.ts` 显示阈值判断前有 degraded 短路；revenue-health/aggregate.ts 同款
- [ ] DS4 P1-3 缺字段守卫：`grep -n "REQUIRED_FIELD_GROUPS" extensions/sentinels/capital-health/aggregate.ts` 命中；部分字段注入不产 critical（测试断言）
- [ ] DS5 零回归：`bash scripts/control-tower/baseline-check.sh` tsc/测试/审计三基线无新增（存量 32 条 tsc 错误不变）
- [ ] DS6 范围一致：`git diff --name-only HEAD^` 与 Q2 写集一致（4 修改 + 2 新建），无越界文件
- [ ] DS7 无绕过：pre-commit 12 组全过，bypass.log 无 --no-verify；提交走 synova-commit（仅本任务 6 文件）
- [ ] DS8 推送 + CI：git push 后远端分支含提交；PR 创建；CI 任务相关 job 绿
