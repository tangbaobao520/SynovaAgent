# Task Brief: CT-64 check-architecture.sh 四类漏网形态修补

> 生成: 2026-09-08 23:52:59 | 分支: fix/ct64-arch-gate-patches (worktree .synova-wt-ct64) | as any: 0

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
五层内部拆为独立包：@synova/sog-core（本体图类型）、@synova/sentinel-engine（哨兵调度）、@synova/expert-platform（专家加载）、@synova/connector-registry（数据连接器）。

**扩展解耦：文件驱动，不改代码**
新增能力靠文件，不靠改代码。

流程约束: V4.5.0 — task brief 6 字段强制 + 免疫系统 + plan.json + 8 组物理阻断 + Plan-Actual 闭合 + engine-core 清零 + 时间戳顺序检查。

数据流: L5 存储 → L4 本体 → L3 洞察(哨兵定时+诊断按需) → L2 编排 → L1 交互
L1 入口: POST /api/diagnosis/consult (GA诊断) / Cron→Sentinel.check() (哨兵) / GET /chat (Web) / MCP
五层架构 (只能向下依赖相邻层):
  L1 交互: routes/ tui/ mcp/
  L2 编排: agent/ orchestrator/
  L3 洞察: l3/ sentinel/ expert-platform/ expert/
  L4 本体: l4/ evidence/
  L5 存储: store/ cron/
引擎: packages/engine-core/。禁止src/新增engine-core引用(铁律46)。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
本任务属**基础设施（控制塔门禁）**，不属五层业务代码——改的是铁律 39 的执法脚本本身。
现状假绿实证：`bash scripts/check-architecture.sh` exit 0「全部通过 ✅」，而 2026-09-08 扫描（docs/synova/research/L1跨层违规扫描-20260908.md）实证 68 处 L1 runtime 跨层违规（L1→L3 16 / L1→L4 15 / L1→L5 37；静态 26 + 动态 42）。四类漏网：①动态 import 全逃逸 ②agent-observer|ga-annotations 名字豁免恰中违规文件 ③路径形态不匹配（expert-platform/store/cron/l5/engine-context/sqlite-graph-store 无模式；只扫 routes/+server.ts，mcp/tui/cli/l1/index 全盲区）④soft 不转硬 + `|| true` 吞 grep 自身失败（M1 fail-open）。

### b) 文件审计
- 写集：`scripts/check-architecture.sh`（唯一门禁脚本）；`tests/architecture/`（现有 graphstore-compatibility/graphstore-unify 2 测试，新增门禁行为测试 + 存量基线）
- 调用方（接口审计，grep 实证）：package.json `check:architecture`；`.github/workflows/ci.yml:110` architecture job 直接跑（exit 非 0 → CI 红）；`scripts/control-tower/baseline-check.sh:121`（`|| true` 不阻断）；`scripts/workflow/decide-next.sh:40`（`|| true`）
- pre-commit-check.sh **不调用**本脚本（组 5/7 内联实现）——改本脚本不影响提交链
- 复用：D515/D516 soft_check 语义（pre-commit-check.sh:86-123 先例）；棘轮基线先例（packages/test-kit 05-as-any-audit、D565）
- 冲突：无。scripts/audit/ 零接触（K3 红线）

### c) 决策
复用 soft_check 语义 + 棘轮基线模式；不新建硬编码豁免。裁决（见 Q1c）：存量 68 处进基线文件**可见不阻断**（台账 CT-64 明确"先修脚本→分批修 src/，避免一次性 68 处全红压垮编码线"）；基线外新增违规本地 ⚠️ exit 0 / SYNO_CI=1 ❌ exit 1（对齐 D515/D516）；检查自身失败 exit 2（ctrl-tower-change 模式 1 三态）。

## Q1: 调研 — 决策链 + 执行约束

### a) Anthropic 决策链
① SPEC/Done：68 处逐行命中 + 干净零误报 + 棘轮语义 + tsc 28=28（见 Done 标准）
② 测试：tests/architecture/check-architecture-gate.test.ts 先行（红）——覆盖矩阵：68 命中/干净零误报/新增转硬/类型位置豁免/L2 合法引用不误报/名字豁免回归/基线棘轮/三态退出码
③ 实现：check-architecture.sh L1 段重写（1b/1c/1d 三段合一管道：精确层模式 × 静态+动态形态 × 类型位置排除 × arch-allow 行内豁免 × 基线对比）；L2→L4、L3→L5、GraphStore、多租户段不动（无假绿实证，避免范围蔓延）
④ 接线：脚本被 package.json/ci.yml/baseline-check.sh/decide-next.sh 四方调用，接口（stdin/argv/env/exit code）向后兼容；新增可选 env SYNO_ARCH_SRC/SYNO_ARCH_BASELINE 供测试沙箱注入
⑤ 验证：自检 6 问 + 验收链（bash -n / vitest / tsc 基线 / pre-commit 自过）

引用依据：
- 铁律 0-2: spec → test → impl → wire → review → merge
- 铁律 35: 自动化优先——能变 check-*.sh 的不靠 review
- 铁律 48: 测试不可为空壳——expect 覆盖正常/降级/边界
- 铁律 49: 治理脚本变更 commit 必须引用 memory/notes/ 四态 Note
- memory 教训: D515（软机制 0% 有效→CI 权威）、D516（SYNO_CI strict）、D542（CI 失败必须点名）、M1（fail-open 假绿）

### b) 本任务执行约束（写入 plan.json principles，pre-commit 组 6 验证）
- rule: "修补后 68 处存量违规必须逐行出现在脚本输出（对照扫描报告 §二 file:line）"
  verify: "npx vitest run tests/architecture/check-architecture-gate.test.ts"
- rule: "存量基线只减不增：基线外新增违规本地 exit 0 软提示、SYNO_CI=1 exit 1"
  verify: "SYNO_CI=1 bash scripts/check-architecture.sh; echo $?（存量状态下必须 0）"
- rule: "tsc 基线不回退（28=28）"
  verify: "npx tsc --noEmit 2>&1 | grep -c 'error TS'"

### c) 决策参考系（遇到难决策/多选项/架构取舍/最佳实践/实现与文档冲突时）
① 第一性原理：门禁的本质 = "新违规不可入"；存量 68 处是迁移债不是门禁问题——最少机制 = 基线棘轮（存量计数只减不增），而非 68 处全红烧毁 CI。
② Anthropic 工程基线：fail-closed（grep 自身失败 exit 2 可见，禁止 || true 吞）；机器可验契约（基线是 git 跟踪的文本文件，可 diff 可审计）。
③ 开源实证：dependency-cruiser / eslint boundaries 的 baseline 模式同构——存量登记 + 新增阻断；仓库内先例 05-as-any-audit 棘轮（D565）。
④ 收敛检查：三参考系同指"棘轮基线"，收敛 → 执行。
决策记录: 参考：Anthropic/DeepSeek/第一性原理 + 结论=存量基线棘轮 + SYNO_CI 转硬 + 三态退出码

### d) 相关 Note 引用
- [x] memory/notes/proposed/2026-09-08-ct64-arch-gate-ratchet-baseline.md（本任务治理决策沉淀，proposed 待 K3/落地）

## Q2: 范围 — 正确的最简方案是什么？

做什么：
- scripts/check-architecture.sh：重写 1b/1c/1d 三段（L1→L3/L4/L5）——扫描范围扩到附录 A 全 L1 文件集；匹配形态补 import(/require( 动态形态（不依赖 from 关键词）；精确层路径模式（/l3/ /sentinel/ /expert-platform/ /expert/ | /l4/ /evidence/ /adapters/sqlite-graph-store graph-bridge | /store/ /cron/ /l5/ init/engine-context better-sqlite3）；删除 agent-observer|ga-annotations 名字豁免（改为 // arch-allow(reason) 行内标注豁免，当前零使用）；类型位置排除（import type / : import( / as import( / type X = import( ）；存量基线棘轮对比；SYNO_CI=1 新增转硬；扫描目标缺失 exit 2（fail-closed，根除 || true 吞失败）
- tests/architecture/l1-cross-layer-baseline.txt：新增——68 处存量登记（分方向 file=count 格式，git 跟踪可 diff）
- tests/architecture/check-architecture-gate.test.ts：新增——门禁行为测试（覆盖矩阵见 Q1a②，expect 覆盖正常/降级/边界）
- .claude/task-briefs/2026-09-08-auto.md：本 brief
- memory/notes/proposed/2026-09-08-ct64-arch-gate-ratchet-baseline.md：铁律 49 治理决策 Note
- task-state/ct-64.json：D382 任务状态机登记
- .claude/task-briefs/2026-09-08-CT-64-arch-gate-patches.md：本 brief（入库版，供 CI G12 认领）
- .claude/bypass.log：synova-commit 链自动 COMMITTED 登记（D521 hook 产物，非手工编辑）

不做什么：
- 不修 src/ 下 68 处存量违规本身（另案分簇派单，见扫描报告 §三；本任务只修门禁可见性）
- 不改 scripts/pre-commit-check.sh（组 5/7 内联架构检查维持现状，避免双门禁漂移）
- 不改 .github/workflows/ci.yml（architecture job 的 SYNO_CI=1 env 注入为后续一行接线项，交付报告说明）
- 不改 scripts/control-tower/、scripts/workflow/ 下调用方（baseline-check.sh/decide-next.sh 的 || true 是其调用姿势，不属本脚本三态语义）
- 不动脚本内 L2→L4、L3→L5、GraphStore、多租户四段（无假绿实证，不在四类漏网范围）
- 不改 scripts/audit/（K3 红线，零接触）

## Q3: 验收 — 入口 → 交互 → 结果

入口（用户从哪触发）：bash scripts/check-architecture.sh / npm run check:architecture / CI architecture job / baseline-check.sh
处理（中间经过哪些步骤）：L1 全文件集 × 全 import 形态（静态 from + 动态 import( + require() × 精确层模式 → 排除类型位置与 arch-allow → 与基线对比 → 分类为存量（可见不阻断）/ 新增（本地⚠️/CI❌）
结果（最终展示在哪）：按方向逐行打印违规（file:line:内容，对照扫描报告逐行可核）+ 存量/新增计数 + 基线收紧提示；exit 0（通过或存量内）/ exit 1（新增违规且 SYNO_CI=1）/ exit 2（检查自身失败）

## 架构层: 基础设施（门禁脚本，非业务五层）
#CRITERIA: A
<!-- #CRITERIA: A/B/C/D 条件归属（v3-FINAL），必填；pre-commit G10 + hook-block-write CP1 + pre-doc-audit CP2 消费 -->

## Done 标准
- [ ] 68 处存量违规逐行出现在脚本输出（对照 L1跨层违规扫描-20260908.md §二 file:line 逐一核对）verify: npx vitest run tests/architecture/check-architecture-gate.test.ts
- [ ] 干净文件零误报：vitest tests/architecture/ 全绿（含现有 graphstore 2 测试）verify: npx vitest run tests/architecture/
- [ ] tsc 28=28 基线 verify: npx tsc --noEmit 2>&1 | grep -c "error TS"（输出 28）
- [ ] 新增违规 fixture：本地 exit 0 + ⚠️；SYNO_CI=1 exit 1 + ❌（D515/D516 语义）verify: 同上测试文件断言
- [ ] 名字豁免回归：agent-observer/ga-annotations 文件内违规必须命中 verify: 同上测试文件断言（对照扫描报告 2.1#11 + 2.2#4）
- [ ] 存量状态下 SYNO_CI=1 bash scripts/check-architecture.sh exit 0（不烧毁 CI）verify: SYNO_CI=1 bash scripts/check-architecture.sh; echo $?
