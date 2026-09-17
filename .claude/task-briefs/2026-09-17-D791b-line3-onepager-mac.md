# D791 PR-B（mac）：线3 报告体系——GS-08 生产路径改造 + 点级证据入库

> 派单: docs/synova/coordination/派单-批六首批三卡-20260916.md 卡 2
> spec（唯一契约）: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D791-line3-report-onepager-20260917.md
> **D734 拆单（CTO 2026-09-17 裁决）**: 本 PR = **B 组（mac，场景 + 证据 + 编码指令）**；A 组（win 产品代码）已在 **PR-A #617** 落盘，本 PR **基于 A 分支**，A 合入 main 后开 PR。
> worktree: `.synova-wt-d791b` / 分支 `feat/d791b-onepager-mac`

#CRITERIA: A

## 域
mac（GS-08 黄金场景 + 证据面）。写集 10 文件：mac 7 + 域判定豁免 3（`.gitignore` / `docs/synova/product-lines/evidence/**` / `task-state/**`）。`check-ownership.py` 实测 `✅ PASS 7 个文件同域: mac（域判定豁免 3）`。
`docs/synova/coordination/**` 归 mac（ownership.yaml），故原属 dev-doc 交付件的「编码指令」随本 PR 走。

## 主线贡献: line-3/3-1,3-7
支柱②「报告可溯源」：一条诊断报告能溯源到 ≥1 条报告之外的物理记录（循环快照节点）。

## Q0: 定位 — 项目拼图 + 文件审计
验收基建层（非产品五层）：GS-08 场景从「.hbs 模板加载器契约级」升级为「生产 HTTP 报告端点 + 真实渲染/读取路径」。
文件审计实测（改前）：`scripts/golden-scenarios/GS-08-report-readable/run.sh:54` 为死代码（require dist 产物 + `|| true` 吞错，铁律 37/11）；`expect.json` 的 `evidence_map` 用场景私有标签 `S8-1`/`S8-2`，与产品线点 id `3-1`/`3-7` 不匹配（全仓无映射层）⇒ 证据落在 calc-progress 不扫的目录 + id 不匹配 = 「绿了不算分」（spec §4 缺陷 A/B 实测）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
Anthropic：fail-closed + 机器可验契约——`assert.ts` 三态（pass/fail/error），**查询失败 ≠ 真空结果 ≠ 通过**（K3 P0-3 fail-open 教训），断言只认物理输出。memory：D449 本场景为模板契约级（本次升级其断言面，保留 .hbs 回归断言不回退）；D749/D750 假绿（`检查未执行 ≠ 检查通过`）；D734 单域预算（本 PR 即其产物）。
参考: Anthropic（fail-closed + 机器可验）/ DeepSeek（最少机制、复用既有 GSS 基建）/ 第一性原理（证据必须可独立重跑）+ 结论: 生产 HTTP 路径 + 3 条负向断言 + 24 条机器断言 + 幂等工件。

## Q2: 范围 — 正确的最简方案
做什么（= spec §5.1 B 组 + 证据面，10 文件）：
- scripts/golden-scenarios/GS-08-report-readable/run.sh
- scripts/golden-scenarios/GS-08-report-readable/expect.json
- scripts/golden-scenarios/GS-08-report-readable/README.md
- scripts/golden-scenarios/GS-08-report-readable/render-onepager.ts
- scripts/golden-scenarios/GS-08-report-readable/fixtures/diagnosis-report.json
- scripts/golden-scenarios/evidence/GS-08-2026-09-17.json
- docs/synova/product-lines/evidence/scenario-2026-09-17.json
- docs/synova/coordination/编码指令-D791-线3报告体系-20260917.md
- .gitignore
- task-state/D791.json

不做什么：
- 不改 src/l3/report-templates.ts（A 组，PR-A #617 已落盘）
- 不改 src/agent/report-assembler.ts（同上）
- 不改 src/agent/cycle-conclusion-service.ts（同上）
- 不改 src/agent/report-onepager-trace.ts（同上）
- 不改 src/routes/diagnosis.ts（同上）
- 不改 tests/agent/cycle-conclusion-service.test.ts（同上）
- 不改 scripts/product-lines/calc-progress.py（D790 在飞同目录；本 PR 只调用不改口径——判据零改动）
- 不改 docs/synova/product-lines/product-lines.yaml（locked 字段属创始人确认）
- 不改 scripts/audit/audit-check.py（K3 专属红线，一字不碰）
- 不改 .github/workflows/ci.yml（CI 冻结）

## Q3: 验收 — 入口 → 交互 → 结果
入口: `bash scripts/golden-scenarios/GS-08-report-readable/run.sh`。
处理: JWT 自举 → fresh-db（系统临时区隔离）→ seed（真实 `SqliteGraphStore` 写 2 条循环快照 + 真实 `SessionStore.saveDiagnosisCheckpoint` 写 phase=5 归档行）→ bootstrap 真实服务 → `curl GET /api/diagnosis/consult/rpt-gs08-001/report?format=markdown` → audit（指针/维度/篇幅/确定性工件）→ assert.ts 24 条断言 → 点级证据入库（幂等）。
结果: ① run.sh **exit 0**（24/24 断言，含 4 条负向 + 1 条端到端等价性）；② 审计工件落 `scripts/golden-scenarios/evidence/GS-08-<date>/`（同日重跑逐字节幂等）；③ 点级证据落 `docs/synova/product-lines/evidence/scenario-<date>.json`（calc-progress 唯一扫描面）。

## 架构层: 验收基建（非产品五层）
GSS 场景与断言引擎域——驱动脚本可直连真实类（`SqliteGraphStore`/`SessionStore`），不受五层约束（测试/脚本域）。不引入任何产品层跨层依赖。

## Done 标准: 物理命令可验（非自述）
- [ ] DS-B1: `bash scripts/golden-scenarios/GS-08-report-readable/run.sh` → exit 0（24/24 断言）
- [ ] DS-B2: 同日重跑逐字节幂等（工件 sha 全等）
- [ ] DS-B3: `bash scripts/control-tower/check-pr-budget.sh` → 单域 mac + 文件数 ≤12
- [ ] DS-B4: `bash scripts/pre-commit-check.sh` 13 组过（禁 --no-verify）
- [ ] DS-B5: 点级证据含 `at` 全量 ISO（`python3 -c` 读 `scenario-<date>.json` 断言 `at` 存在）→ exit 0
- [ ] DS-B6: 死代码零命中 `grep -rn "dist/l3/report-template-loader" scripts/golden-scenarios/` → 零结果
