# Task Brief: D300: 黄金数据集接入 pre-push 门禁 — golden-case-checker.ts (F1 评分器) + diagnosis-quality-check.sh (结构质量检查) 接入 pre-push + ci.yml，新建接线测试与破坏态测试 (A线 C-G1 修复)

> 生成: 2026-08-02 | 分支: feat/prompt-architecture | as any: 0
> ⚠️ 本文件独立命名（D300-golden-case-gate.md）— 2026-08-02 01:47 并行 session D292 覆盖了自动生成文件，按认领制 v2 隔离

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

流程约束: V4.5.1 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

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
- [x] 纵向（改 L1-L5 代码/架构）— 无，本任务**不碰 src/**，只改 CI/门禁脚本
- [ ] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

本任务属于**基础设施/CI 门禁**系统（不属 GA诊断/哨兵代码）。权威文档09 §5.2 要求：用 5 个黄金案例的冻结快照跑完整诊断 → F1-Score 匹配（关键边命中率+根因节点匹配率+告警级别一致率三者均=100%）作为 CI 门禁。A线产品完整性审计 C-G1 定案：**黄金数据集机制已完整（10 用例 + checker + quality-check）但从未接入任何门禁** → 防无声退化失效。

### b) 文件审计（2026-08-02 全部实测，非凭记忆）
grep 本任务关键词（golden-case / diagnosis-quality-check）在 scripts/ 与 .github/ 中：

| 资产 | 位置 | 实测状态 |
|------|------|---------|
| 黄金用例 fixture | `tests/fixtures/golden-cases/golden-case-01~10.json` | ✅ 10 个，JSON 可解析 |
| F1 评分器 | `scripts/ci/golden-case-checker.ts` (D51) | ✅ 仅 import fs/path，纯静态；`npx tsx` 运行 exit 0 (10/10 全过) |
| 结构质量检查 | `scripts/ci/diagnosis-quality-check.sh` (D100) | 🔴 **当前 exit 3** — 3 项失败（见下方） |
| checker 单元测试 | `tests/ci/golden-case-checker.test.ts` | ✅ 存在 11 个测试 |
| pre-push 接线 | `scripts/pre-push-check.sh` | ❌ grep golden-case = **0 匹配** → C-G1 核心缺口 |
| CI job | `.github/workflows/ci.yml` | ⚠️ **已有 golden-case job（D51 0f7cd8f 提交时就有）**，只跑 checker，不跑 quality-check |
| pre-commit 接线 | `scripts/pre-commit-check.sh` | ❌ 0 匹配 — 符合文档（pre-commit <5s 约束不挂，门禁选 pre-push） |

**⚠️ 与任务文档的差异（如实记录）**：文档 §2.2 断言"ci.yml 0 匹配"，实测 ci.yml 已有 golden-case job（D51 就加了）。文档作者只读了头部未实测。实际缺口 = pre-push 无接线 + ci.yml job 不跑 quality-check。

**🔴 重大发现 — diagnosis-quality-check.sh 当前是红的（exit 3）**：
1. **Check 2 (evidence refs)**：`grep evidence|证据|severity|严重` 在 7 个启用专家 PROMPT.md 只有 1/7 命中。根因：D236/D282 专家体系 9→7 重构后，5 个新 cycle 专家（capital-cycle/customer-cycle/talent-cycle/finance-structure/competitive-strategy）PROMPT.md 是简化格式（`## 角色/## 核心职责/## 输出格式`），无 M1-M6 段、无 evidence 词；仅 host/tech 是 M1-M6 新格式。`_deprecated/` 下 7 个旧专家全部是 M1-M6 格式 → **M1-M6 是权威格式，5 个新专家未完成迁移（D236 欠账）**。
2. **Check 3 (action keywords)**：`timeline|deadline|impact|建议|推荐` 只有 3/7 命中（需要 >=5）。同样根因：简化格式无这些词。
3. **Check 6 (D95 路径)**：纯路径 bug — 检查 `src/l4/cross-scale-validator.ts`，但 D95 实际交付在 `src/cycles/cross-scale-validator.ts`。

**决策（用户 2026-08-02 已确认）**：修复 diagnosis-quality-check.sh 3 项失败后接线（选项 1）：
- Check 6: 路径 bug 修复 src/l4 → src/cycles（无争议）
- Check 2/3: 更新为新专家结构检查（结构完整性：角色定义段 + 输出结构段存在性），门禁真实有效（正常态绿、破坏态红）后接线
- 不迁移 5 个专家 PROMPT.md 到 M1-M6（expert/ 下的 capital-cycle/customer-cycle/talent-cycle/finance-structure/competitive-strategy — D236 欠账，用户否决在本任务处理）

### c) 决策
- 复用：golden-case-checker.ts 本体（机制已对，不碰）
- 修复后复用：diagnosis-quality-check.sh（修 3 项失败，不重写检查意图）
- 新建：tests/ci/golden-case-gate.test.ts + tests/ci/golden-case-break-test.sh
- 扩展：pre-push-check.sh + ci.yml 接线
- 冲突：无（D286/D292 并行任务零共享文件，已验证；D292 正活跃占用 auto.md brief，本任务独立命名隔离）

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — 文档 §6 完成标准 8 条（见 Done 标准）
  ② 测试 — 先写 golden-case-gate.test.ts（接线断言，迁移前失败 → red）
  ③ 实现 — 修 quality-check 3 项失败 + 接 pre-push + ci.yml
  ④ 接线 — pre-push 触发门禁，grep 物理验证（完成标准 1/2）
  ⑤ 验证 — 自检 6 问 + 破坏态测试 + tsc + vitest + 手动跑 checker

引用依据（至少引用两项）：
  - 铁律 0-2: spec → test → impl → wire → review → merge（文档 §4 明确测试优先三步）
  - 铁律 7: 入口可触达（pre-push 触发）+ 完整链路走通（checker→F1→exit code）+ 结果可见（diff 输出）
  - 铁律 33: 测试命名约定（golden-case-gate.test.ts 单元 / golden-case-break-test.sh shell 回归）
  - memory/ 历史教训: [[plan-actual-closure]] — 声明完成必须对比文档完成标准；[[stub-implementation-pattern]] — 空壳测试不得交付
  - 任务文档 §2.2 教训: 文档"实测"结论须复测（文档说 ci.yml 0 匹配，实测已有 job）— 不凭记忆，以实测为准

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
  - rule: "golden-case-checker.ts 必须被 pre-push-check.sh 引用"
    verify: "grep -n 'golden-case-checker' scripts/pre-push-check.sh"
  - rule: "diagnosis-quality-check.sh 必须被 pre-push-check.sh 引用"
    verify: "grep -n 'diagnosis-quality-check' scripts/pre-push-check.sh"
  - rule: "quality-check 修复后必须 exit 0（正常态绿）"
    verify: "bash scripts/ci/diagnosis-quality-check.sh && echo OK"
  - rule: "破坏态测试必须存在且 trap 还原生效"
    verify: "test -f tests/ci/golden-case-break-test.sh"

## Q2: 范围 — 正确的最简方案是什么？

做什么（严格按文档 §3.1 写集 + 用户批准的修复）：
- scripts/pre-push-check.sh：追加 golden-case F1 门禁 + diagnosis-quality 结构检查（失败即 exit 1 阻断 push）
- .github/workflows/ci.yml：golden-case job 补充 `bash scripts/ci/diagnosis-quality-check.sh` 步骤（job 已存在 D51，只补步骤）
- tests/ci/golden-case-gate.test.ts：新建（接线断言：门禁脚本含 golden-case-checker 调用 + fixture 10 用例可解析 + 门禁脚本含 diagnosis-quality-check 调用）
- tests/ci/golden-case-break-test.sh：新建（备份 golden-case-01.json → 篡改 expected 值 → checker 断言 exit 1 → trap 还原 → 断言 exit 0；夹具损坏即测试失败，防误删）
- scripts/ci/diagnosis-quality-check.sh：修复 3 项失败（Check 6 路径 src/l4→src/cycles；Check 2/3 更新为新专家结构检查 — 角色定义段 + 输出结构段存在性）

不做什么（含文件路径）：
- 不改 scripts/ci/golden-case-checker.ts（机制已对，文档明令不碰）
- 不改 scripts/pre-commit-check.sh（pre-commit <5s 硬约束，D291 已 Python 化）
- 不改 src/cycles/cross-scale-validator.ts（D95 本体 — 只修检查脚本的路径，不修本体）
- 不迁移专家 PROMPT.md 到 M1-M6 格式（不改 expert/capital-cycle/PROMPT.md、expert/customer-cycle/PROMPT.md、expert/talent-cycle/PROMPT.md、expert/finance-structure/PROMPT.md、expert/competitive-strategy/PROMPT.md — D236 欠账，用户否决在本任务处理）
- 不改 tests/fixtures/golden-cases/golden-case-01-cashflow-crisis.json（及 02~10 全部 fixture）
- 不改 tests/ci/golden-case-checker.test.ts（已有测试，不动）
- 不改 .claude/task-briefs/2026-08-02-auto.md（D292 并行 session 的文件）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：`git push`（pre-push hook 自动触发）；CI push 事件（golden-case job 自动触发）

处理（中间经过哪些步骤）：
1. pre-push-check.sh → secrets 终扫 → vitest --changed → **golden-case F1 门禁**（npx tsx scripts/ci/golden-case-checker.ts）→ **diagnosis-quality 结构检查**（bash scripts/ci/diagnosis-quality-check.sh）
2. checker 扫描 tests/fixtures/golden-cases/*.json → deriveActual → computeF1Score → 三者均=1.0 才算通过，否则详细 diff 输出 + exit 1
3. ci.yml golden-case job: npm ci → checker → quality-check（与 test job 并行）

结果（最终展示在哪）：
- push 通过时控制台显示 ✅ 全部门禁通过；失败时显示 ❌ + 具体 diff（缺失边/节点/级别）且 push 被拒绝
- GitHub Actions golden-case job 绿/红状态

## 架构层: 基础设施
L1-L5 之外 — 基础设施 CI 门禁（scripts/ + .github/）。不触架构层代码。

## Done 标准
- [ ] 入口可触达: git push 触发 pre-push-check.sh → golden-case 门禁执行（grep -n "golden-case-checker" scripts/pre-push-check.sh 命中且 exit 1 阻断）
- [ ] 链路走通: npx tsx scripts/ci/golden-case-checker.ts 手动运行 exit 0（10/10 通过）；diagnosis-quality-check.sh 修复后 exit 0；人为篡改 fixture → pre-push 拒绝（还原后恢复）
- [ ] 结果可见: push 拒绝/放行有明确输出；ci.yml golden-case job 绿
- [ ] ci.yml 含 golden-case job 且含 diagnosis-quality-check 步骤（grep 验证）
- [ ] tsc 零新增错误 | vitest 零新增失败（新测试有真实断言，非空壳）
- [ ] DS7: tests/ci/golden-case-break-test.sh 可运行且 trap 还原生效（运行两次，第二次仍 exit 0）
- [ ] DS8 范围检查: git diff --name-only 仅含 pre-push-check.sh / ci.yml / golden-case-gate.test.ts / golden-case-break-test.sh / diagnosis-quality-check.sh
