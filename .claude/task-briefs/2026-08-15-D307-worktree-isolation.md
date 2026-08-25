# Task Brief: D307 session级 worktree 隔离: 新建 worktree-manager.py(create/finish/list/status) + attach.py 并行模式检测提示 + session_registry worktree 字段 + synova-commit worktree 提示 + V4.8.0

> 生成: 2026-08-15 03:33:00 | 分支: feat/d307-worktree-isolation | as any: 0

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统（组织数字孪生诊断 + 持续增长导航系统）。
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
本任务属于**基础设施（控制塔）**——不在 L1-L5 TS 架构内，改 scripts/control-tower/ 脚本。
现有模块（复用/扩展对象）:
- session_registry.py (D311) — 会话注册表，本任务加 worktree_path/worktree_branch 字段 + worktree CLI
- attach.py (D314/D329) — SessionStart 轻量 attach，本任务加并行模式检测提示（不切目录）
- synova-commit (D201+D311) — 提交唯一路径，本任务加 worktree 内 finish 提示 + session/* 分支推送保护
- staging_guard/wait_manager/check-branch-sync (D311/D335) — 不动，worktree 隔离后按其现有逻辑工作
新建: worktree-manager.py（worktree 生命周期 create/finish/list/status）
关系: **扩展**（在既有协调底座上加物理隔离层），非替换。

### b) 文件审计
grep "worktree" 现状:
- AGENTS.md 铁律 0-3 已有 `git worktree add ../synova-wt-<任务名>` 方向描述（无脚本落地）
- .git/worktrees 已有旧 worktree（session/01-04、agents/collaborative-workspace-setup 等 8 个，非本任务产物）
- hooks 共享 .git/hooks（worktree 内提交触发同一套 12 组门禁——已有机制，本任务测试回归确认）
- check-branch-sync.sh 不感知 worktree（session/ 分支按非 main 分支规则走，无需改）
结论: 无 worktree 管理代码 → **新建** worktree-manager.py；无冲突。

### c) 决策
无已有覆盖 → 新建。两个架构取舍已在 dev doc §4.5 决策点 1/2 记录（session 分支+finish merge / attach 只提示不自动 create），结论写入 Q1c。



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
  - 铁律 0-2: spec → test → impl → wire → review → merge（测试先行，red→green 物理证明）
  - 铁律 7: 入口可触达 + 完整链路走通 + 结果可见
  - 铁律 24+31: 每个 catch 有 log + degraded 信号，降级显式传播
  - 铁律 33: 测试命名约定（dev doc 指定 tests/control-tower/worktree-manager.test.py）
  - memory: 2026-08-12-D330-kimi-k3-audit-fix（fail-open 吞信号=隐藏失效、command -v 只验存在性）
  - memory: parallel-session-stash-conflict + 2026-08-11-D329-session-identity（共享暂存区劫持根因=本任务要根治的问题）
  - skill: ctrl-tower-change（三态退出码/中文全角标点变量边界/测试注入沙箱）+ windows-compat（自包含 bash 环境/UTF-8）

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
  - rule: "worktree-manager 全部 git 操作失败必须显式报错（fail-closed），绝不静默假装成功"
    verify: "grep -rn 'check=True' scripts/control-tower/worktree-manager.py && python tests/control-tower/worktree-manager.test.py"
  - rule: "attach 并行检测只提示，绝不 os.chdir（hook 无法改变宿主进程 cwd）"
    verify: "grep -c 'os.chdir' scripts/control-tower/attach.py → 0"
  - rule: "session/* 分支为本地隔离分支，synova-commit 禁止 auto-push/auto-tag，必须有显式提示"
    verify: "grep -rn 'session/' scripts/control-tower/synova-commit"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
决策点 1（dev doc §4.5）: worktree 隔离 = session 分支 + finish merge 回主。
参考：第一性原理（git worktree 硬约束"两 worktree 不能 checkout 同分支"→ 独立分支是唯一物理解）+ DeepSeek 开源实证（git 官方 worktree 标准用法即分支级隔离+合并回主）。收敛。
结论：create 时 `git worktree add -b session/<sid>`；finish 时主 worktree merge session 分支再清理。

决策点 2（dev doc §4.5）: attach 并行模式 = 检测提示，不自动 create。
参考：Anthropic 工程基线（SessionStart hook 无法改变宿主进程 cwd；失败即关闭——不能做的就不假装做，降级为显式提示）+ DeepSeek 最少机制（提示由 task-start 在目标 worktree 目录启动，一层机制不叠两层）。收敛。
结论：attach 只 detect + degraded 提示，0 处 os.chdir。

决策点 3（实现新增）: create 的 base 分支默认值。dev doc 示例硬编码 "feat/prompt-architecture"（2026-08-12 快照，已过期，当前分支为 feat/docs-sync-20260814）。
参考：第一性原理（最新事实来源是主 worktree 当前 HEAD）+ Anthropic 工程基线（显式可验证优于隐藏常量）。
结论：--base 可选参数，默认 = 主 worktree 当前分支（`git rev-parse --abbrev-ref HEAD`），dev doc 示例仅作示意。

决策点 4（实现新增）: finish 合并前的安全检查。merge 是破坏性操作，失败时不能丢数据。
参考：Anthropic 工程基线（失败即关闭 fail-closed；数据安全优先于便利）。
结论：主 worktree 或 session worktree 有未提交变更 → block（exit 1）不合并；merge 冲突 → merge --abort + 保留 worktree/分支 + 显式报错。
格式：参考：Anthropic/DeepSeek/第一性原理 + 结论（已按此记录）。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- scripts/control-tower/worktree-manager.py — 新建。create/finish/list/status 四命令，JSON 输出，三态退出码 (0 ok / 1 业务阻断 / 2 降级)
- scripts/control-tower/session_registry.py — 修改。register 新记录加 worktree_path/worktree_branch 字段；新增 worktree CLI (--path/--branch/--clear)
- scripts/control-tower/attach.py — 修改。_run_parallel_hint: registry 有活跃 session 或 --parallel 且当前非 worktree → degraded 提示 (0 处 os.chdir)
- scripts/control-tower/synova-commit — 修改。worktree 内提交后 finish 指引；session/* 分支不执行 auto-tag/auto-push，改为显式提示
- .codex/control-tower/VERSION.md — 修改。追加 V4.8.0 (MINOR, 新机制 worktree 隔离)
- tests/control-tower/worktree-manager.test.py — 新建。≥6 用例 (dev doc §4: create/独立 index/互不干扰/finish 合并清理/hooks 共享生效/registry 字段)
- docs/synova/audit-reports/2026-08-15-D307-delivery.md — 新建。交付报告（DS1-DS10 判定 + 决策记录 4 点 + 实现中发现的缺陷），D333 框架要求，K3 审计可核

不做什么：
- 不修改 scripts/pre-commit-check.sh (12 组门禁本体, dev doc §3.3)
- 不修改 scripts/pre-push-check.sh
- 不修改 scripts/audit/ 下任何文件 (审计红线, K3 专属)
- 不强制主 worktree 只读 (单 session 可直接用主 worktree)
- 不改 CI/部署路径
- 不清理现存旧 worktree (session/01-04 等非本任务产物)
- 不做 attach 自动 create worktree (决策点 2)

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：主 worktree 执行 python scripts/control-tower/worktree-manager.py create <sid>；SessionStart 时 attach.py 自动检测并行模式并提示
处理（中间经过哪些步骤）：create 建 ../synova-wt-<sid> + session/<sid> 分支 + registry 记 worktree 字段 → session 在 worktree 内开发/提交（hooks 共享 .git/hooks，12 组门禁自动覆盖）→ synova-commit 提示 finish → 主 worktree 执行 finish：安全检查 → merge session 分支 → worktree remove → branch -d → registry 清理
结果（最终展示在哪）：git worktree list 含/不含独立 worktree（create/finish 前后）；双 session 暂存区互不可见（DS2）；merge 后主分支含 session 提交（DS3/DS4）；worktree 内提交触发 12 组门禁（DS5）

## 文档引用
- docs/plans/codex/implementation/SYNOVA-IMPL-D307-session级worktree隔离-20260812.md — dev doc §1 背景/§3 写集/§4 验收 DS1-DS10
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md — 铁律 0-3 PR 工作流规范全文
- docs/synova/coordination/TASK-ROUTING.md — 多 Agent 协作任务路由

## 接口审计（从代码 grep，非凭记忆）
- session_registry.py:register — 新记录含 worktree_path/worktree_branch 字段（D307 修改点）
- session_registry.py:set_worktree — 新增 worktree 绑定写入（worktree-manager create/finish 调用）
- attach.py:_detect_parallel — 新增并行模式检测（registry 其他活跃 session，24h 内非 DONE）
- attach.py:_in_worktree — 新增链接 worktree 判定（absolute-git-dir != git-common-dir）

## 架构层: 基础设施
控制塔脚本（scripts/control-tower/，非 L1-L5 TS 架构）
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] DS1 入口可触达: worktree-manager.test.py ≥6 用例全过（red→green 已证）；create/finish/list/status 四命令可执行
- [ ] DS2 链路走通: 双 worktree 独立 index 实测互不可见；双 session 并行提交互不干扰（端到端模拟）
- [ ] DS3 结果可见: finish 后合并回主分支 + worktree list 清空；worktree 内提交触发 12 组 pre-commit；registry 记录 worktree_path/branch
- [ ] DS4 版本: VERSION.md 含 V4.8.0 + version.log 追加（同 commit）
- [ ] DS5 门禁: 12 组 pre-commit 全过、无 --no-verify、git diff --name-only 与写集一致、audit 基线 439 FAIL 不变、as any = 0
