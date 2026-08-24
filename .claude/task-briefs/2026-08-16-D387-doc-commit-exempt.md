# Task Brief: CT-34 文档提交豁免门禁 — 纯文档只跑 Secrets 扫描，12 组代码门禁豁免

> 生成: 2026-08-16 15:37:26 | 分支: main | as any: 0

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
本任务属于三层解耦的哪一层？
- [x] 纵向（改 L1-L5 代码/架构）—— 基础设施（控制塔门禁域，非 L1-L5 业务层）
- [ ] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

本任务属于基础设施（控制塔门禁域）：改 scripts/pre-commit-check.sh（门禁脚本，CODEOWNERS 保护，DSH 地盘）。纯文档提交（docs/、.claude/task-briefs/、memory/、task-state/）被 13 组面向代码的门禁误拦（CT-34），修复 = 按提交内容分流：纯文档仅 Secrets 扫描，混合/配置全量 13 组。

### b) 文件审计
- scripts/pre-commit-check.sh（修改）：GIT_CACHED_* 注入缝（L113-116）+ is_doc_only() 判定函数 + 纯文档早退分支（L120 par_start 前）+ 移除 L189 STAGED_ALL 重复定义
- tests/control-tower/doc-commit-exempt.test.sh（新建）：12 用例 red→green
- 复用：check-secrets.sh 的 SYNO_SECRETS_ROOT 注入缝（D370 已有，L12-13）；today-by-name.test.sh sed 提取函数体模式；secrets-env-exempt.test.sh mktemp 沙箱模式
- 关系: 修改 pre-commit-check.sh（门禁域）+ 新建测试（tests/control-tower/）

### c) 决策
七决策点已收敛（dev doc §3.2，S-12）：①判定方式=目录+扩展名双约束白名单（Anthropic fail-closed）②docs/ 不整体豁免（防藏代码）③技能文件不进白名单（D370 契约）④豁免范围=仅 Secrets（G12c 保留全量路径）⑤早退在 par_start 前（性能）⑥判定函数化（测试可验证性）⑦GATEKEEPER bypass 阻断保留在早退前。



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
  ① SPEC / Done 标准 — 定义「怎么算做完」→ dev doc §10 DS1-DS14（14 项，交付声明逐条标注）
  ② 测试 — 先写 tests/control-tower/doc-commit-exempt.test.sh（12 用例：T1/T2/T4/T5/T7 端到端注入缝 + T3/T6/T10/T12 函数单测 + T8/T9/T11 接线回归）
  ③ 实现 — pre-commit-check.sh 4 处修改（注入缝/is_doc_only/早退分支/移除重复定义），fail-closed（判定失败走全量）
  ④ 接线 — 早退分支消费 is_doc_only + check-secrets.sh；调用链 .git/hooks/pre-commit → pre-commit-check.sh 不变
  ⑤ 验证 — 自检 5 问 + doc-commit-exempt.test.sh 12 全绿 + 真实提交 13 组全过

引用依据：
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 7: 入口可触达 + 完整链路走通 + 结果可见
  - 铁律 24+31: Secrets 失败 exit 1 硬阻断 + fail-closed 降级
  - 铁律 33: 测试命名约定（*.test.sh）
  - 铁律 35: 自动化优先（门禁误杀 → 门禁自保）
  - 台账 CT-34（D362/D366 文档提交反复卡实证）+ D312 secrets 实证 + D328 fail-closed 三态

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
  - rule: "is_doc_only 判定函数必须在 pre-commit-check.sh 中定义且被早退分支消费"
    verify: "grep -c 'is_doc_only' scripts/pre-commit-check.sh | awk '{exit !($1>=2)}'"
  - rule: "纯文档提交豁免必须保留 Secrets 扫描（D312）"
    verify: "grep -n 'check-secrets.sh' scripts/pre-commit-check.sh"
  - rule: "doc-commit-exempt.test.sh 12 用例全绿"
    verify: "bash tests/control-tower/doc-commit-exempt.test.sh"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
参考：Anthropic（fail-closed：误放行代价 >> 误拦代价；白名单更保守）+ DeepSeek（第一性原理：最少机制——一个正则 + 一个早退分支）。七决策点均单参考系收敛，无分歧（dev doc §3.2 S-12）。"豁免范围 A"是对创始人清单的精确化：G12c 在 spec 阶段必然误拦（(b) 变更命中要求实现文件在 diff 中），写集对账时机在实现提交——保留在全量路径，不违背决策本意。

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- scripts/pre-commit-check.sh
- tests/control-tower/doc-commit-exempt.test.sh
- .claude/task-briefs/2026-08-16-D387-doc-commit-exempt.md
- task-state/D387.json

（scripts/pre-commit-check.sh 修改 4 处：①GIT_CACHED_* 四行改 SYNO_GIT_CACHED_* 注入缝（默认真实 git，fail-closed）②新增 is_doc_only() 判定函数 + DOC_PREFIX_RE 白名单正则 + STAGED_ALL 提前 + DOC_ONLY ③纯文档早退分支（par_start 前，仅 Secrets）④移除原 L189 STAGED_ALL 重复定义；tests/control-tower/doc-commit-exempt.test.sh 新建 12 用例）

不做什么：
- 不改 scripts/check-secrets.sh 逻辑（Secrets 是唯一保留项，D312/D370 已打磨）
- 不改 scripts/pre-commit-check.sh 中 G12 skip_re 豁免表（L893，已天然豁免 docs/）
- 不豁免 .claude/skills/、.dsh/skills/（D370 同步契约；技能提交保持组 13）
- 不豁免 .codex/（组 9 契约依赖）、.github/（CI 配置）、.claude/settings.json（token 风险 D312）
- 不改 scripts/workflow/hook-block-write.sh（PreToolUse 已天然不拦文档写入）
- 不修 pre-commit-check.sh 中组 10 幽灵变量 CHANGED_FILES（L725，既存缺陷 CT-33 批次）
- 不做 branch-brief 对账（CT-33 独立任务，见 docs/synova/audit-reports/2026-08-15-D366.md P2-5）
- 不改 scripts/workflow/check-dev-doc-write-set.sh（G12c 本身逻辑——保留全量路径）
- 不改 scripts/audit/ 任何文件（K3 专属红线，违反 = 事故）
- 不新增版本号变更（不改 VERSION.md / version.log / git tag）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：`git commit` 纯文档暂存集（docs/、.claude/task-briefs/、memory/、task-state/、根级 *.md 等）→ pre-commit hook → scripts/pre-commit-check.sh

处理（中间经过哪些步骤）：GIT_CACHED 注入缝读暂存集 → is_doc_only() 判定（目录+扩展名双约束白名单正则）→ DOC_ONLY=1 早退分支（仅 Secrets 扫描 + GATEKEEPER bypass 阻断保留在早退前）

结果（最终展示在哪）：
- (a) 输出 `纯文档提交 (CT-34/D387): 豁免 12 组 — 仅 Secrets 扫描` 豁免标记
- (b) Secrets 仍全量扫描（含工作区，D312 实证）
- (c) 混合提交 / 配置文件提交 → 无豁免标记 → 全量 13 组
- (d) tests/control-tower/doc-commit-exempt.test.sh 12 用例全绿（red 已证）

## 架构层: 基础设施（控制塔门禁域，非 L1-L5 业务层；scripts/pre-commit-check.sh 属 Mac DSH 地盘）
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [x] verify: bash tests/control-tower/doc-commit-exempt.test.sh（12 用例 + 正反矩阵全绿 exit 0；T1/T2/T4/T5 端到端注入缝物理证明纯文档提交走豁免）
- [x] verify: grep -c 'is_doc_only' scripts/pre-commit-check.sh ≥ 2（定义 + DOC_ONLY 赋值 + 早退分支消费；混合提交无豁免标记）
- [x] verify: bash scripts/pre-commit-check.sh 真实暂存区冒烟（纯文档 → CT-34 标记 + Secrets 通过 + exit 0；DS13 提交环境 13 组全过无 --no-verify）
