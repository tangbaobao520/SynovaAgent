# D791 实现: 线 3 报告体系 — 一页纸四槽位 + 各维度循环结论 + 结论可溯源

> 派单: docs/synova/coordination/派单-批六首批三卡-20260916.md 卡 2（域: win）
> spec（唯一契约）: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D791-line3-report-onepager-20260917.md
> 阶段: dev-doc（spec_done）→ **本 brief = 实现阶段**（worktree `.synova-wt-d791` / 分支 feat/d791-line3-onepager）
> 基线: origin/main @ 0f59e514（spec 基线 6a06e853，行号已逐条重 grep 复核：漂移仅 overflow-dashboard 排序行 :147→:149）

#CRITERIA: A

## 域
win（代行期 Mac 侧执行，域声明不变；产物 = src/ + tests/ + scripts/golden-scenarios/ + 证据）

## 主线贡献: line-3/3-1,3-7
支柱②「报告可溯源」：一条诊断报告能溯源到 ≥1 条报告之外的物理记录（循环快照）。

## Q0: 定位 — 项目拼图 + 文件审计
三层「报告最后一公里」：L1 src/routes/diagnosis.ts（报告读取端点，2 处 renderOnePager 调用点）→ L2 src/agent/report-assembler.ts（装配 + 一页纸）+ 新建 src/agent/cycle-conclusion-service.ts（循环结论派生）+ src/agent/report-onepager-trace.ts（指针纯函数）→ L3 src/l3/report-templates.ts（executive_summary 版式）。
文件审计实测（本 worktree grep）：`buildCycleConclusions` / `report-onepager-trace` 全仓零命中（本任务新建）；`renderOnePager` 生产调用点 2（diagnosis.ts:553 / :701）；`cycleRegistry` 生产调用方 2（routes/overflow.ts、agent/loop-handlers.ts）；`getSentinelExpertReports` 生产调用方 1（routes/sentinel.ts:84）。复用既有 `generateOverflowDashboard` / `registerLoadedCycles` / `getSentinelExpertReports`——零新指标、零新算法。
**实测更正**：spec §5.1 计数口径「6 修改 + 3 目录级新建 = 12 文件」实际为 **6 + 5 = 11 文件**（spec 算术笔误，回填时更正；11 ≤ D734 上限 12，不超限）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
业界：BLUF/金字塔四件套（结论/证据/分维度状态/行动），管理报告的证据必须是**可回查的指针**而非形容词。Anthropic：fail-closed + 机器可验契约（`resolvePointers` 三态 resolved/unresolved/unknown——「判不了」≠「判过了」）。memory 教训：接线失败 4 次（铁律 0-2，每条新 export 写死生产调用点）· D286 写集漂移 · D480 既有 5 用例 = 回归红线（`not.toContain('降级')` → 新降级标记必须 ASCII `[degraded]`）· D749/D750 假绿（assert.ts error 态不得当通过）· D524 照旧行号写测试会红。
**实测新增教训（calc-progress 语义）**：`status_for_point` 的 **machine 路径**（scenario/test/ci/task_redeem）调 `git_touched_after(modules, latest["date"])` 且 **不消费 `at`**（calc-progress.py:216-232，D790 未合入 main）⇒ 证据 date 与 `src/l3/` 提交同日 → `--since=<date>T00:00:00` 命中当日提交 → `stale`。CT-62 的 `at` 只作用于 k3 路径（`freshness_gate`）。
参考: Anthropic（fail-closed + 机器可验）/ DeepSeek（最少机制、复用既有）/ 第一性原理（结论必须能回查）+ 结论: 四槽位 + ASCII 指针 + 零新指标。

## Q2: 范围 — 正确的最简方案
做什么（= spec §5.1 写集，逐文件）：
- src/l3/report-templates.ts
- src/agent/report-assembler.ts
- src/routes/diagnosis.ts
- src/agent/cycle-conclusion-service.ts
- src/agent/report-onepager-trace.ts
- tests/agent/report-onepager-trace.test.ts
- tests/agent/cycle-conclusion-service.test.ts
- scripts/golden-scenarios/GS-08-report-readable/run.sh
- scripts/golden-scenarios/GS-08-report-readable/expect.json
- scripts/golden-scenarios/GS-08-report-readable/README.md
- scripts/golden-scenarios/GS-08-report-readable/render-onepager.ts
- scripts/golden-scenarios/GS-08-report-readable/fixtures/diagnosis-report.json
- scripts/golden-scenarios/evidence/GS-08-2026-09-17.json
- docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D791-line3-report-onepager-20260917.md
- docs/synova/product-lines/evidence/scenario-2026-09-17.json
- task-state/D791.json

不做什么：
- 不改 tests/agent/report-assembler.test.ts（D480 既有 5 用例 = 回归红线，禁改断言）
- 不改 src/cycles/overflow-dashboard.ts（纯复用；改了 3-7 的「既有」变「新造」）
- 不改 src/cycles/overflow-compute.ts（同上，纯复用）
- 不改 src/cycles/cycle-loader.ts（同上，纯复用）
- 不改 src/l3/report-template-loader.ts（.hbs HTML 轨保持现状）
- 不改 src/agent/sentinel-service.ts（只用既有 getSentinelExpertReports 只读面）
- 不改 src/evidence/evidence-store.ts（证据池接入属支柱② 下一阶段，需 L3 provider）
- 不改 scripts/product-lines/calc-progress.py（D790 在飞同目录；只调用不改口径）
- 不改 scripts/product-lines/evidence-writer.py（同上，只调用）
- 不改 docs/synova/product-lines/product-lines.yaml（locked 字段属创始人确认）
- 不改 scripts/audit/audit-check.py（K3 专属红线，一字不碰）
- 不改 .github/workflows/ci.yml（CI 冻结）

## Q3: 验收 — 入口 → 交互 → 结果
入口: `GET /api/diagnosis/consult/:reportId/report?format=markdown`（生产路由；SSE 完成路径 POST /api/diagnosis/consult 同源）。
处理: 路由取 `req.app.locals.graphStore` + `getSentinelExpertReports()` → `buildCycleConclusions(orgId, store)`（registry 空时自加载 → `generateOverflowDashboard` → 纯映射既有 DashboardRow 字段）→ `renderOnePager(report, depth, inputs)` 渲染四槽位 markdown（每条目带 `[src:...]` 指针）→ 覆盖审计 + 解析审计。
结果: ① 一页纸四槽位齐备、篇幅 ≤1200、单行 ≤60、条条带指针、≥1 条指针解析到报告之外的物理记录；② `bash scripts/golden-scenarios/GS-08-report-readable/run.sh` exit 0（14 条断言含 3 条负向）；③ 点级证据入库 → `product-progress.json` 线 3 的 3-1/3-7 状态判定。

## 架构层: L1 + L2 + L3
L1 src/routes/diagnosis.ts（装配与传递；store 经 `req.app.locals` + `type X = import(...)` 类型位置豁免）· L2 src/agent/*（编排与派生；循环服务用 `type GraphStoreLike = import('../l4/graph-bridge').GraphStore` 形态，禁写 `from '../l4/...'`——先例 src/agent/loop-handlers.ts:670）· L3 src/l3/report-templates.ts（版式；只描述槽位与裁剪，不取数据）。

## Done 标准: 物理命令可验（非自述）
- [ ] DS-A: `npx vitest run tests/agent/report-onepager-trace.test.ts tests/agent/cycle-conclusion-service.test.ts` 全绿（18 用例，expect 非空壳）→ exit 0
- [ ] DS-B: `npx vitest run tests/agent/report-assembler.test.ts` D480 既有 5 用例仍全绿（零回归）→ exit 0
- [ ] DS-C: `bash scripts/golden-scenarios/GS-08-report-readable/run.sh` → exit 0（14 条断言全 pass，含负向 3 条）
- [ ] DS-D: `bash scripts/check-architecture.sh` → 全部通过 ✅（零新增 L2→L4 命中）
- [ ] DS-E: `bash scripts/workflow/check-dev-doc-write-set.sh docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D791-line3-report-onepager-20260917.md` → 漂移 0
- [ ] DS-F: `python3 scripts/product-lines/calc-progress.py` → 线 3 的 3-1/3-7 状态判定（预期 pending_k3；同日失效 → stale 须显式报告根因）
- [ ] DS-G: `npx tsc --noEmit` exit 0 + `bash scripts/pre-commit-check.sh` 13 组过（禁 --no-verify）
