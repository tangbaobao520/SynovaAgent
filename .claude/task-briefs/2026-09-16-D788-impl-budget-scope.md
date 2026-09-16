# Task Brief — D788 预算门禁口径修正（impl 阶段：只计审查面）

> 2026-09-16 | 执行方: 并行 CTO session（synova-cto）| 基线: docs/d788-budget-scope（PR #589 派单侧）；工作分支 feat/d788-budget-impl（同步 origin/main, behind=0）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔门禁域。D734 PR 预算门禁的**计数口径**修正：只计审查面（治理产物不计入 ①②），上限 12 不变。前置事实（K3 前置审 F1，本 session 亲证）：该门禁对 docs-only PR 无自动执行点——CI 被 D515 跳过（ci.yml docsonly 正则全匹配即 skip Iron laws）、本地 soft_check + CT-34 早退。本单性质 = 修摩擦 + 补口径，非拆锁。

### b) 文件审计
- `scripts/control-tower/check-pr-budget.sh`（155 行）: ① 计数无分类（全文件计）② 域判定传全量 FILES ③ :122 N_FILES=0 分支在新口径下失真
- `tests/control-tower/check-pr-budget.test.sh`（126 行 24 项）: 既有豁免用例 :64-67（bypass.log/D758 证据目录）不得回归
- 派单侧 brief（2026-09-16-D788-budget-scope.md）Q2 已声明「不改 check-pr-budget.sh（执行方改）」→ 本 impl brief 认领该写集

### c) 决策
复用既有脚本结构（--files 注入缝/降级链/三态退出码不动），只插入显式治理排除表 + 双计数输出；不加环境变量旁路（env 缝 = 生产逃逸通道，D390 教训）——反向验证用沙箱副本 sed/python 变异。

## Q1: 调研 — 决策链 + 执行约束

- 参考：第一性原理（门禁应拦「会冲突的改动」而非「文件多」）+ Anthropic 基线（口径变化必须可测可见）→ 结论同派单
- 铁律 11（口径变化显性打印）/ 铁律 35（能变 check 的不靠 review）/ 铁律 47（契约先行）/ F2 fail-closed（未列路径默认计入）
- D370 全角标点贴变量必须 ${VAR}（本次实现中亲踩一次，已全文件排查清零）
- K3 前置审报告 §5 十条清单 = 本单验收网（audit/k3-20260916-d788-precheck 分支）

## Q2: 范围 — 正确的最简方案

做什么：
- `scripts/control-tower/check-pr-budget.sh` — 治理排除表 GOV_PREFIX_RE + 审查面/治理双计数显性输出 + ② 域判定只传审查面 + 头注释写明适用范围（D515 docs-only 跳过 = 显性口径）
- `tests/control-tower/check-pr-budget.test.sh` — 第 9 节 15 断言（12+30 放行/13 拦/跨域拦/fail-closed 未知目录/N_FILES 语义/字面输出/沙箱副本反向验证）
- `scripts/control-tower/pre-dispatch-check.sh` — 仅 ⑩ 注释补锚点语义（F4；逻辑零改动）
- `docs/synova/coordination/派单模板.md` — F4 锚点语义行
- `docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md` — 任务1 适用范围显性化（门禁表新增一行）
- `docs/synova/coordination/派单-D788-预算门禁口径修正-20260916.md` — 3 处裸文件名引用补全路径（可机械核验；语义零改动）
- `memory/notes/implemented/2026-09-16-d788-budget-scope.md` — D534 Note
- `task-state/D788.json` — impl 回填

不做什么（含文件路径）：
- 不改上限（MAX_FILES=12 保持）；不改 .github/workflows/ci.yml（适用范围仅文档化，强跑 docs-only 交 CTO 裁决）
- 不改 D708 合并级写集对账、不改 G12 写集一致性（各管一段）
- 不碰 scripts/audit/**（K3 红线）；不新增环境变量注入缝（防生产旁路）

## Q3: 验收 — 入口 → 交互 → 结果

入口：任何 PR 的预算门禁（--files 注入 / 真 git base...HEAD 双模式）
处理：治理排除表（docs/task-state/.claude/memory）分流 → ① 只数审查面 ② 只判审查面域 → 双计数显性打印
结果：#572（51 治理 0 审查面）双模式 PASS；13 审查面仍拦；跨域审查面仍拦；未知目录默认计入

## 架构层: 控制体系（scripts/control-tower + 协调文档；不触 L1-L5 产品代码）

## Done 标准

- [ ] 入口可触达: verify: **在与 origin/main 同步的 worktree（behind=0）中**跑 `bash tests/control-tower/check-pr-budget.test.sh` → `全部通过: 39 项`（F5 纪律：工作树滞后会假红）
- [ ] 链路走通: verify: `grep -n 'MAX_FILES=12' scripts/control-tower/check-pr-budget.sh` → 命中（上限未放宽）
- [ ] 结果可见: verify: 对 #572 双模式跑 → 均 PASS 且输出含字面「治理产物 51 件（不计入）」
- [ ] 红线未越: verify: `git -c core.quotepath=false diff --name-only origin/main...HEAD | grep -c "scripts/audit/"` → 0

## 写集（机器生成，禁手改）

| 文件 | 类型 |
|---|---|
| .claude/bypass.log | builtin（hook 运行期产物，自动豁免） |
| .claude/task-briefs/2026-09-16-D788-budget-scope.md | task |
| .claude/task-briefs/2026-09-16-D788-impl-budget-scope.md | task |
| docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md | task |
| docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md | task |
| docs/synova/coordination/批六-待派-20260916.md | task |
| docs/synova/coordination/派单-D788-预算门禁口径修正-20260916.md | task |
| docs/synova/coordination/派单模板.md | task |
| memory/notes/implemented/2026-09-16-d788-budget-scope.md | task |
| scripts/control-tower/check-pr-budget.sh | task |
| scripts/control-tower/pre-dispatch-check.sh | task |
| task-state/D788.json | task |
| tests/control-tower/check-pr-budget.test.sh | task |
