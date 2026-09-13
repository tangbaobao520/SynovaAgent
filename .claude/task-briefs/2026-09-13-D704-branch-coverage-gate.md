# Task Brief: D704 分支覆盖准出——改动文件 branch 阈值门禁（K3 W-3）

> 生成: 2026-09-13 14:32:06 | 分支: main | as any: 0

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
本任务在控制塔基础设施层（五层之外的工具链/CI 门禁域），不触 L1-L5 产品代码。
现状（spec §0/§2 @ origin/main 56f062bc 复测）：vitest.config.ts 已有全局 coverage 阈值
（v8 provider，lines 40/functions 45/branches 30/statements 40），但：
① 全局阈值是全仓聚合平均——单文件分支漏测可被平均掩盖（K3 W-1/W-4 真实事故形态）；
② CI 无任何 job 跑 --coverage（grep "coverage" .github/workflows/ci.yml 零命中）→ 阈值在 CI 形同虚设；
③ 无「改动文件」口径、无显式豁免机制。
新增：scripts/ci/branch-coverage-gate.sh（改动文件 branch 准出闸门）+
tests/control-tower/branch-coverage-gate.test.sh（密封测试）；扩展：ci.yml（coverage 准出步骤 +
密封清单）+ vitest.config.ts（追加 json-summary reporter）。
增长导航关联：分支缺口只有变成机器门禁才能防复发——诊断与增长建议的代码质量证据
从「人自查」升级为「机器可验」，增长导航结论的可信度随之提升。

### b) 文件审计
rg "coverage" .github/workflows/ → 零命中；scripts/ci/ 现有 4 文件（check-contract-gaps.sh /
diagnosis-quality-check.sh / golden-case-checker.ts / golden-snapshot-runner.ts），零 coverage 闸门 → 无重复造轮子。
vitest.config.ts coverage 段（v8 provider + include ./src/**/*.ts + 6 组 exclude + thresholds
40/45/30/40）→ 复用不重写。package.json:22 test:coverage、:83 @vitest/coverage-v8 4.1.8 → 已装，
禁止重装（spec §0 校订）。
本地实证（clone 全量 --coverage 实跑 580 文件）：json-summary key 为绝对路径（Win 反斜杠）；
coverage.exclude 命中文件（src/tui|tools|skills）不在报告中；零分支文件 branches.pct=100。
关系：新建 2 文件 + 扩展 2 文件。

### c) 决策
coverage 基建已有 → 复用（provider/reporter 机制/依赖全不动）；无改动文件闸门 → 新建轻量脚本
读 json-summary；判定面 = 本次 PR 改动的 src/**/*.ts（准出闸门，非全仓清库存）。
关键取舍（阈值、CI 运行范围）→ 已走 DECISION-REFERENCE 四步框架，结论记 Q1c。



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
  - 铁律 48: 测试非空壳（每个降级/失败模式都有 expect 类断言，本卡为 bash ok/fail 计数断言）
  - memory/ 中的历史教训文件
本卡特有引用：
  - spec: docs/plans/codex/implementation/SYNOVA-IMPL-D704-branch-coverage-gate-20260911.md（§3.1 写集 / §4 测试 / §6 DS1-DS8）
  - .github/workflows/ci.yml（docs-only 判定 :21-28 / 密封清单 :168-202 / test job 分片 :68-107）
  - vitest.config.ts coverage 段（v8 provider + thresholds 40/45/30/40，实测 @ 56f062bc）
  - memory/2026-09-08-d598-token-meter.md（clone+junction vitest 须 preserve-symlinks；DS3 注释字面量）
  - memory/2026-09-10-d662-expert-residual-sweep.md（tsc 错误集恒等判零新增）
  - memory/2026-09-09-d650-expert-domain-rename-delivery.md（CI 失败归因先对 main 基线 job 级对照）

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
  - rule: "「低于阈值」「报告缺失/损坏」「改动文件不在报告」三失败模式必须 fail-closed exit 1 且点名文件（W1/W4 事故形态机器化）"
    verify: "bash tests/control-tower/branch-coverage-gate.test.sh"
  - rule: "新 shell 测试必须追加进 ci.yml 密封 for 清单（不入列 = 永不执行，正是 W-1 要消灭的形态）"
    verify: "grep -c 'branch-coverage-gate.test.sh' .github/workflows/ci.yml"
  - rule: "vitest.config.ts 既有 thresholds 值逐字不变（本卡是增量闸门；动全局阈值 = 全量 CI 变红，属另一议题）"
    verify: "grep -n 'json-summary' vitest.config.ts"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
按 DECISION-REFERENCE 四步框架（docs/synova/coordination/DECISION-REFERENCE.md）执行，并将结论记录在本字段：
  ① 第一性原理 — 问题的最简本质是什么？最少机制能解决吗？
  ② Anthropic 工程基线 — 隔离/失败即关闭/脚本验证/机器可验契约，哪条适用？
  ③ 开源实证 — 有可克隆的代码/架构参考吗？clone 下来看实际做法
  ④ 收敛检查 — 两参考系是否指向同一答案？收敛 = 大概率正确；分歧 = 值得深挖
决策记录格式（K3 审计可核）: 参考：Anthropic/DeepSeek/第一性原理 + 结论
简单决策（无冲突、单一路径）只需记录参考系名。

本卡决策记录：
决策点 1（阈值默认值与豁免形态）：参考：第一性原理（门禁判断面 = 本次改动文件而非全仓平均，
最少机制拦真实事故）+ Anthropic（fail-closed + 机器可验契约）+ 业界惯例（branch 准出 80%）+
结论：默认 80，BRANCH_COVERAGE_MIN 可覆盖（便于测试注入与后续灰度收紧）；豁免必须显式
`branch-coverage-exempt: <理由>` 注释且闸门打印理由（不静默）。
决策点 2（CI 覆盖率运行范围 × 全局阈值）：本地实跑证据——subset 跑 --coverage 时 all=true 使
未加载文件以 0% 计入聚合，全局阈值（lines 40）必红；而全局阈值在改动前从未于 CI 执行，
不存在「被本卡关掉」的回归。参考：Anthropic（一步只做一件事，门禁信号不混淆）+ 第一性原理
（本卡判断面 = 改动文件）+ 结论：CI coverage 步骤跑全量 vitest --coverage（spec §3.1 字面），
但该次调用以 CLI 参数禁用全局阈值（vitest.config.ts 配置不动），由改动文件闸门做该步骤
唯一权威；偏离点在 spec §3.2 同 commit 回填。
收敛检查：两决策点均指向「判断面最小化 + fail-closed + 不动存量配置」，收敛。

### d) 相关 Note 引用
- [ ] memory/notes/<四态>/YYYY-MM-DD-<主题>.md（本任务决策沉淀到哪条 Note；无则新建 proposed）

## Q2: 范围 — 正确的最简方案是什么？

做什么（写集 2 新建 + 2 修改，另加 brief 簿记 + spec §3.2 回填）：
- scripts/ci/branch-coverage-gate.sh
- tests/control-tower/branch-coverage-gate.test.sh
- .github/workflows/ci.yml
- vitest.config.ts
- .claude/task-briefs/2026-09-13-D704-branch-coverage-gate.md
- docs/plans/codex/implementation/SYNOVA-IMPL-D704-branch-coverage-gate-20260911.md

不做什么（排除项）：
- 不改 package.json （@vitest/coverage-v8 4.1.8 已装，spec §0 禁止重装）
- 不改 package-lock.json （依赖冻结）
- 不改 scripts/pre-commit-check.sh （既有 8 组门禁不动）
- 不改 scripts/control-tower/verify-parallel.sh （门禁判定属控制塔域，铁律 0-5）
- 不改 src/server.ts （DS6 显式 descope：本卡零 TS 源码变更，src/ 全部不在写集）
- 不改 scripts/control-tower/check-canary-drift.sh （密封清单漂移告警脚本不改）
- 不做 AST 级「断言强度」检查 （K3 W-3 第③点，spec §3.3 descope 为后续卡）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：
① CI：PR 且 src/ 有改动 → coverage 准出步骤：npx vitest run --coverage
   --coverage.reporter=json-summary（该次调用 CLI 禁用全局阈值，config 不动）→
   bash scripts/ci/branch-coverage-gate.sh（改动清单默认 git diff --name-only
   --diff-filter=d origin/main...HEAD）。
② 本地：bash tests/control-tower/branch-coverage-gate.test.sh（密封）；
   bash scripts/ci/branch-coverage-gate.sh <报告> <清单文件>（手动单测）。
处理（中间经过哪些步骤）：读 json-summary → key 归一化（反斜杠→斜杠；绝对路径按
改动文件相对路径后缀匹配）→ 逐改动 src/**/*.ts 判定：文件内含 branch-coverage-exempt:
注释 → 跳过并打印理由；不在报告 → 按 0%；branches pct < BRANCH_COVERAGE_MIN
（默认 80）→ 点名文件；报告缺失/损坏 → fail-closed exit 1。
结果（最终展示在哪）：全部达标 → exit 0（逐文件达标行 + 通过摘要）；任一失败 →
exit 1 + 逐文件点名（CI 步骤红，error 输出可直接定位文件）；密封测试输出
「结果: 通过 N / 失败 M」逐断言可见。

## 架构层: 基础设施（控制塔 CI 门禁域，五层之外，不触产品代码）
L1/L2/L3/L4/L5 均不涉及（无 TS 变更，DS6 显式 descope）
#CRITERIA: A

## 文档引用
- docs/plans/codex/implementation/SYNOVA-IMPL-D704-branch-coverage-gate-20260911.md（编码唯一契约：§3.1 写集 / §4 测试 / §6 DS1-DS8 / §0 派单前校订）
- .github/workflows/ci.yml :21-28（docs-only 判定）、:68-107（test 分片 job）、:148-215（control-tower-tests 密封清单）
- vitest.config.ts coverage 段（provider v8 / include / 6 组 exclude / thresholds）
- docs/synova/coordination/Win侧代码质量提升建议-20260909.md（W-3 权威来源）
- docs/synova/coordination/DECISION-REFERENCE.md（决策参考四步框架）

## 接口审计
- vitest json-summary 产物 schema：{"total":{...},"<文件>":{"lines":...,"branches":{"total","covered","skipped","pct"}}}
  ——clone 实跑 coverage/coverage-summary.json 实证；key 为平台相关绝对路径（Win 反斜杠 /
  CI POSIX），门禁做归一化 + 仓库相对后缀匹配；零分支文件 pct=100；exclude 命中文件缺席报告
- vitest coverage.exclude 六组：'./src/tui/**','./src/tools/**','./src/skills/**','./src/cli.ts','./src/setup.ts','./src/monitoring/**'
  （vitest.config.ts 实测存在）→ 闸门镜像同组 skip，脚本头注释注明同步源
- git diff --name-only --diff-filter=d origin/main...HEAD（既有 git 能力，非新接口）
- BRANCH_COVERAGE_MIN env（新约定，脚本文件头注释声明；仅数字 0-100 合法，非法值 fail-closed）

## Done 标准
- [ ] verify: bash tests/control-tower/branch-coverage-gate.test.sh 全绿（≥4 断言，先 red 后 green 有实测输出）
- [ ] verify: bash scripts/ci/branch-coverage-gate.sh <60%报告> <清单文件> exit 1 且输出点名文件（DS3）
- [ ] verify: grep -c "branch-coverage-gate" .github/workflows/ci.yml 命中 ≥2（coverage 步骤 + 密封清单，DS2）
- [ ] verify: npx tsc --noEmit 报错集与基线逐条恒等（零新增，DS5）
- [ ] verify: git diff origin/main...HEAD -- vitest.config.ts 仅新增 reporters 行（thresholds 40/45/30/40 逐字不变，DS5）
- [ ] verify: git push 后 CI task-relevant jobs job 级绿（DS8）
