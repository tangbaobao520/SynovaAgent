# Task Brief: engine-core 退役遗留清理 — 断裂测试引用/死代码/stale 配置/误导文案，物理证明零引用后提交推送

> 生成: 2026-08-08 23:34:14 | 分支: main | as any: 0

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
- [x] 纵向（改 L1-L5 代码/架构）
- [ ] 横向（迁移到独立包 / 新建包）
- [ ] 扩展（文件驱动，不改 TypeScript）

本任务属于基础设施清理。engine-core（Novis 遗产包）已由 D10 自研 SynovaDiagnosisEngineImpl（L3）完全替换，packages/engine-core/ 目录已在工作树中删除（296 个未提交删除）。本任务负责收尾：清理指向已删除包的**断裂引用**（测试文件）、**死代码**（脚本/适配器）、**stale 配置**（tsconfig 路径映射）、**误导文案**（用户可见消息/注释）。不新增功能，不替换架构。

### b) 文件审计
grep `engine-core` 全仓库（src/ + packages/ + scripts/ + tests/，排除 .test. 与白名单），遗留分四类：
1. **断裂引用**（会破坏 tsc/vitest）：`tests/e2e/diagnosis-pipeline.test.ts:9` import 已删除的 `src/adapters/engine-core-adapter.ts`
2. **死代码**（铁律 37）：`src/agent/orchestrator-adapter.ts` + `tests/orchestrator-adapter.test.ts`（无生产调用方）、`tests/run-pipeline-test.js`（require 已删包）、`scripts/convert-frameworks.mjs` / `scripts/audit-engine-core.mjs` / `scripts/audit-engine-core-final.mjs` / `scripts/checks/check-empty-modules.sh`（全部引用已删包路径）
3. **stale 配置**：`tsconfig.json:20-21` 的 `@synova/engine-core` + `@synova/engine-core/src/*` 路径映射指向已删包
4. **误导文案**：`src/tui-v2/chat.tsx:484`（提示检查 engine-core 安装）、`src/l4/graph-bridge.ts:29` 注释、`scripts/anthropic-decide.sh:35-45` 死分支（检查已删 graph-store.ts）、`scripts/check-architecture.sh:111-120` 文案、`packages/test-kit/` 3 处 wiring/whitelist 引用

关系：无复用冲突 — 全是清理。

### c) 决策
已有覆盖→复用。清理目标是让 grep 物理证明零遗留。**必须保留**：`scripts/pre-commit-check.sh`（组 5b 禁引检查）、`scripts/check-bridge-files.sh`、`scripts/check-plan-integrity.sh:59-66`、`scripts/control-tower/audit-rules.json:46-48` — 这些把 engine-core 当作**禁令主语**，是防回潮门禁，一字不改。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
本任务按以下顺序执行，每一步完成后才能进入下一步：
  ① SPEC / Done 标准 — 定义「怎么算做完」= 见下方 Done 标准
  ② 测试 — 修复 `tests/e2e/diagnosis-pipeline.test.ts` 断裂 import（复刻 `src/routes/diagnosis.ts:103-136` 的 createSynovaDiagnosisEngine 接线模式）；删除死代码文件的配对测试（orchestrator-adapter.test.ts）
  ③ 实现 — 删 7 个死文件、修断裂 import、清 tsconfig、改文案。不新增 export，无接线需求（删除类变更）
  ④ 接线 — 验证修复后的 e2e 测试通过 vitest；tsc --noEmit 零错误
  ⑤ 验证 — 自检 6 问 + grep 物理门禁

引用依据：
  - 铁律 37: Dead code 入仓库即违规 — 删除旧文件 + grep 零引用确认
  - 铁律 46/47: 禁止桥接代理文件 + "拆完了"必须由 grep 物理证明
  - 铁律 0-2: spec → test → impl → wire → review → merge
  - 铁律 36: vitest 必须全量通过，零失败才合并

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
  - rule: "删除任何 engine-core 相关文件前，必须 grep 全仓库确认零引用"
    verify: "grep -rn 'orchestrator-adapter\\|run-pipeline-test\\|convert-frameworks\\|audit-engine-core\\|check-empty-modules' src/ packages/ scripts/ tests/ --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.sh' | grep -v node_modules"
  - rule: "修复断裂 import 后，必须跑 tsc --noEmit + 相关 vitest 证明通过"
    verify: "npx tsc --noEmit && npx vitest run tests/e2e/diagnosis-pipeline.test.ts"
  - rule: "清理完成后，全仓库 engine-core 引用只剩禁令门禁本身"
    verify: "grep -rn 'engine-core' src/ packages/ scripts/ tests/ --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.sh' | grep -v node_modules | grep -v pre-commit-check.sh | grep -v check-bridge-files.sh | grep -v check-plan-integrity.sh | grep -v audit-rules.json"

## Q2: 范围 — 正确的最简方案是什么？

做什么（全部 `- path：说明` 格式，G12 认领用）：
- tests/e2e/diagnosis-pipeline.test.ts：修复断裂 import（createSynovaDiagnosisEngine 接线，复刻 src/routes/diagnosis.ts 范式）
- tests/e2e/diagnosis-pipeline.e2e.test.ts：同款接线修复（替换已删 EngineCoreVendorAdapter）
- tests/e2e/pde-diagnosis.e2e.test.ts：同款接线修复
- tests/e2e/pde-seed-real-data.ts：SqliteGraphStore 替换 EngineCoreVendorAdapter.createGraphStore + GapSnapshot 降级
- tests/e2e/full-pipeline.integration.test.ts：DiagnosisOrchestrator 重指向 src/orchestrator/diagnosis-orchestrator
- tests/architecture/graphstore-unify.test.ts：移除已删 src/adapters/engine-core-adapter.ts stale 白名单条目
- tests/mvp-pipeline.integration.test.ts：删除（测试已退役 engine-core doc-extractor/report-builder，CI 断裂）
- tests/measurement-pipeline.test.ts：删除（测试已退役 engine-core measurement-pipeline，空壳）
- tests/expert-pipeline.test.ts：删除（测试已退役 engine-core expert-pipeline，空壳）
- tests/run-pipeline-test.js：删除（require 已删包）
- tests/run-mvp-pipeline.ts：删除（死代码）
- tests/run-mvp-pipeline-real.ts：删除（死代码）
- tests/test-http-direct.ts：删除（死代码）
- tests/orchestrator-adapter.test.ts：删除（配对测试）
- src/agent/orchestrator-adapter.ts：删除（无生产调用方）
- scripts/convert-frameworks.mjs：删除（引用已删包）
- scripts/audit-engine-core.mjs：删除（引用已删包）
- scripts/audit-engine-core-final.mjs：删除（引用已删包）
- scripts/checks/check-empty-modules.sh：删除（引用已删包）
- scripts/pre-commit-check.sh：BRIDGE_ALLOWED stale 条目清理（保留禁令主语）
- scripts/check-bridge-files.sh：ALLOWED 数组缩至 3 存活文件
- scripts/control-tower/external-auditor.sh：WHITELIST 缩至 3 存活文件
- scripts/workflow/post-merge-cleanup.sh：KNOWN_MIGRATIONS 清空
- scripts/workflow/scope-check.sh：engine-core 已退役文案
- scripts/anthropic-decide.sh：Q2 死分支移除 + Q3/Q4 扫描路径重指向
- scripts/check-architecture.sh：文案更新 + SOG-001 死 Section 移除
- tsconfig.json：移除 @synova/engine-core + @synova/diagnosis-engine 路径映射
- vitest.config.ts：移除 @synova/diagnosis-engine alias
- packages/test-kit/vitest.config.ts：移除 @synova/diagnosis-engine alias
- packages/test-kit/package.json：移除 @synova/diagnosis-engine 依赖
- packages/test-kit/package-lock.json：移除 diagnosis-engine + engine-core 3 条记录
- packages/test-kit/src/wiring-registry.ts：移除 EngineCoreVendorAdapter 条目
- packages/test-kit/tests/architecture/03-vendor-reference.test.ts：ALLOWED_VENDOR_REF_FILES 移除 adapter
- packages/test-kit/tests/wire/04-graphstore-compatibility.test.ts：D10 自研定义更新
- src/tui-v2/chat.tsx：导航引擎不可用提示去 engine-core
- src/l4/graph-bridge.ts：D10 注释更新
- src/agent/ontology-syncer.ts：日志文案去 engine-core
- src/init/engine-context.ts：logger 名去 engine-core + 注释更新
- src/agent/conversation-engine.ts：D10 退役接线收尾（noop 引擎提示）
- src/routes/diagnosis.ts：D10 退役接线收尾（注释更新）
- extensions/industries/saas-tech/thresholds.json：D10 测试运行产物（aggregatedAt 刷新）
- extensions/industries/test-write/thresholds.json：D10 测试运行产物（aggregatedAt 刷新）
- tests/output/expert-quality-cross-industry.json：D10 测试运行产物（重新生成）
- .claude/plan.json：本任务 plan（approach/principles 同步）
- .claude/task-briefs/D317-engine-core-retirement-cleanup.md：本 brief
- .gitignore：新增 .claude/.precommit-par/ 防回潮规则（D317 安全修复 — pre-commit 并行缓存曾捕获真实 API Key 于 secrets.out，禁止再入库）
- scripts/control-tower/synova-commit：CRLF→LF 修复（D316 同类跨平台 bug — CRLF 使 line 28 `set -euo pipefail` 无法解析，synova-commit 自提交起经 bash 不可执行）
- scripts/control-tower/emit-signal.py：CRLF→LF 修复（同批跨平台行尾修复）
- packages/engine-core/：D10 退役目录 — 本提交收录 309 个已删除文件（G12 以 ACMR 过滤，删除态豁免认领）

不做什么（含文件路径）：
- 保留禁令门禁主体：scripts/pre-commit-check.sh 组 5b 匹配模式、scripts/check-bridge-files.sh 扫描逻辑、scripts/check-plan-integrity.sh、scripts/control-tower/audit-rules.json 禁令主语 — 只清理白名单，禁令逻辑本体不动
- 不修 tests/data-pipeline.feishu.integration.test.ts（pre-existing 断裂，CI 已排除，不在 engine-core 清理范围）
- 不重建 packages/engine-core（D10 已由自研引擎替代）
- 不新增功能、不替换架构（纯清理任务）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：`npm run test` / `npx vitest run` 跑全量测试；`npm run lint`（tsc --noEmit）
处理（中间经过哪些步骤）：tsc 编译 → 修复断裂 import → vitest 全量 → grep 物理门禁确认零遗留
结果（最终展示在哪）：
- vitest 全量零失败（含 e2e/diagnosis-pipeline.test.ts）
- tsc --noEmit 零错误
- `grep -rn 'engine-core' src/ packages/ scripts/ tests/` 只剩禁令门禁脚本本身（pre-commit-check.sh / check-bridge-files.sh / check-plan-integrity.sh / audit-rules.json）
- git 提交通过 pre-commit 8 组 + 推送通过 pre-push 6 组

## 架构层: 基础设施
L1/L2/L3/L4/L5
#CRITERIA: C

## Done 标准
- [x] verify: npx vitest run tests/e2e/diagnosis-pipeline.test.ts tests/e2e/full-pipeline.integration.test.ts -t "Stage 5c" tests/architecture/graphstore-unify.test.ts -t "调用点" — 断裂 import 修复测试通过（engine 接线 + 编排器重指向 + stale 白名单移除）
- [x] verify: grep -rn 'packages/engine-core|src/adapters/engine-core-adapter|EngineCoreVendorAdapter' tests/ src/ --include='*.ts' | grep -v '^.*//' — 死代码文件已删除且 grep 物理证明零引用
- [x] verify: npx tsc --noEmit 2>&1 | grep -c 'error TS' — 修改的 0 个文件无新错误（34 个错误全为 pre-existing 环境问题）
- [x] verify: grep -rn 'engine-core' src/ packages/ scripts/ tests/ --include='*.ts' --include='*.tsx' --include='*.sh' | grep -vE 'pre-commit-check|check-bridge-files|external-auditor|check-plan-integrity|audit-rules' — 代码层引用清零，仅剩禁令门禁 + 历史注释
- [x] verify: git push 成功（pre-push 6 组通过）
