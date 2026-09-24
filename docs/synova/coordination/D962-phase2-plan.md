# D962 — 阶段 2 前置计划（46 脚本去向 + 目标值分解）

> D962-A2（task-4）。只读盘点，未改任何代码。CTO 确认后才进阶段 2 实施。
> 调用方证据 = `grep -rn "<脚本名>" scripts/ .github/workflows/ package.json`（排除自身与 tests/，tests 单列）。

## 〇、前提实测

| 前提 | 命令 | 输出摘要 |
|---|---|---|
| check-* 总数 46 | `find scripts -maxdepth 3 -name 'check-*' -type f \| sort \| wc -l` | **46**（与 CTO 口径一致） |
| 分布 | 同上去掉 wc | 根 18（含 audit 1）/ checks 1 / ci 1 / control-tower 12 / doc-system 1 / product-lines 1 / workflow 12 |
| pre-commit 行数 | `wc -l scripts/pre-commit-check.sh` | `1529` |
| 红线确认 | scripts/audit/check-gates-v2.py 存在 | 调用方 = agent-start.sh:61-62 + 看板提示；**不碰** |

## 一、46 脚本逐个：调用方 × 去向表项 × 阶段 2 处置

> 处置枚举沿用 D962 卡 7 枚举。"合并到X" = 文件消失但防护由 X 承接（搬家≠减负，逐条给承接）。

| # | 脚本 | 调用方（grep 原始证据） | 去向表项 | 阶段2处置 |
|---|---|---|---|---|
| 1 | scripts/audit/check-gates-v2.py | agent-start.sh:61-62（`--quiet`） | 红线 | **保留**（审计红线，不碰） |
| 2 | scripts/check-acceptance-ci.sh | pre-commit:417（par_start） | #35 | **合并到 check-file-driven.sh**（验收 CI 与文件驱动同域；#35 判定逻辑随 33 项迁 CI） |
| 3 | scripts/check-architecture.sh | ci.yml:174（architecture job, SYNO_CI=1）+ baseline-check:121 + decide-next:43 + npm check:architecture | #14 | **保留**（#14 的合并单点；另吸收 #28 sentinel-type-net 见行 40） |
| 4 | scripts/check-as-any.sh | 仅 package.json:28（`check:as-any` 手动入口），零生产调用 | #1 | **退役**（防护去向：#1 判定已在 pre-commit L485-493 内联实现并随 33 项迁 CI quality job；npm 手动入口由 CI 替代） |
| 5 | scripts/check-bridge-files.sh | 零调用（tests 引用=0） | #15 | **退役**（防护去向：铁律46 三重扫描已由 pre-commit L730-767 内联同逻辑实现，迁 CI 后仍在；本脚本为死代码，铁律37） |
| 6 | scripts/check-brief-vs-code.sh（根） | 零生产调用（真身=workflow 版，ci.yml:309） | #40 | **退役**（防护去向：scripts/workflow/check-brief-vs-code.sh 同名真身保留并在 CI；根目录版为孤儿副本） |
| 7 | scripts/check-deprecated-mapping.sh | pre-commit:412（par_collect 纯打印）+ loop-score:76 | #4 | **退役**（防护去向：#4 已裁旁路看板指标——gate-hits/gate-stats 聚合承接观测；@deprecated 存量 V4.2.4 已清零） |
| 8 | scripts/check-fde-terms.sh | 仅 package.json:29，零生产调用 | —（D573） | **退役**（防护去向：FDE 术语 grep 一步并入 CI quality job 既有 grep 链；D573 防回归不变） |
| 9 | scripts/check-file-driven.sh | pre-commit:418（par_start） | #36 | **保留**（域宿主：吸收 acceptance-ci、hardcoded[linter 化前]，见行 2/16） |
| 10 | scripts/check-file-hell.sh | 零调用（tests=0） | #36 | **退役**（防护去向：其自述"新目录检查由 check-file-driven.sh 覆盖，此处做全量验证"——全量验证职责归 check-file-driven.sh CI 版） |
| 11 | scripts/check-hardcoded.sh | pre-commit:411（par_start） | #3 | **合并到 check-file-driven.sh**（linter 化落地前暂宿；§五 linter 化后随规则退役） |
| 12 | scripts/check-integrity-startup.sh | 零生产调用（tests=1） | —（V4.1 T5） | **退役**（防护去向：启动自检域由 check-gates-v2.py --quiet（agent-start Step 0）+ check-file-driven CI 版承接；配套测试同删） |
| 13 | scripts/check-lessons-learned.sh | 零生产调用（tests=1） | #25 | **退役**（防护去向：#25 q0c 取消跟踪判定迁 CI（check-plan-integrity 宿主内）；错误沉淀动作由 #22 Notes 四态门禁承接） |
| 14 | scripts/check-plan-integrity.sh | pre-commit:414（par_start）+ **synova-commit:433** | #23 | **保留**（brief 声明完整性域宿主：吸收 verifiable-done + q0c-tracking + brief-parseable，见行 37/38/10 域合并） |
| 15 | scripts/check-q0c-tracking.sh | pre-commit:416（par_start） | #25 | **合并到 check-plan-integrity.sh** |
| 16 | scripts/check-secrets.sh | pre-commit:331/366/413 + pre-push:262 + npm:31 | #11 | **保留**（P0：本地早退通道 + pre-push 终扫 + CI 三点） |
| 17 | scripts/check-security.sh | 仅 package.json:32，零生产调用 | #1/#5 | **退役**（防护去向：eval/new Function/硬编码端口由 §五 linter 化规则（no-eval 等）承接；http URL 检查并入 CI quality job） |
| 18 | scripts/check-tech-debt.sh | 零生产调用（tests=1） | — | **退役**（防护去向：TECH_DEBT.md 摘要展示职责归 CTO 看板（daily-cto-board/gen-cto-health），不属门禁） |
| 19 | scripts/check-verifiable-done.sh | pre-commit:415（par_start） | #24 | **合并到 check-plan-integrity.sh** |
| 20 | scripts/checks/check-test-quality.sh | 零生产调用（tests=1） | #7/#8/#9 | **退役**（防护去向：三项测试质量判定已在 pre-commit L561-611 内联实现并随 33 项迁 CI） |
| 21 | scripts/ci/check-contract-gaps.sh | 零生产调用（tests=1） | #37 | **退役**（防护去向：#37 契约门禁暂不动仍在 pre-commit/CI；.codex/contracts 实测不存在（D962 表 §四），启用时由 #37 承载） |
| 22 | scripts/control-tower/check-bypass-log.sh | pre-push:425（CHECK_BYPASS）+ pre-audit-summary:46 | #33/#46 | **保留**（pre-push 对账单点） |
| 23 | scripts/control-tower/check-canary-drift.sh | ci.yml:281（checker-review job） | —（D858） | **合并到 check-ct-health.sh（新宿主）**（与 ci-stale-red/orphan-worktrees 同属控制塔健康域，调用方均单一） |
| 24 | scripts/control-tower/check-ci-stale-red.sh | gen-cto-health.py:511 | —（CT-39） | **合并到 check-ct-health.sh** |
| 25 | scripts/control-tower/check-citations.py | pre-dispatch-check.sh:50（CITE_PY） | —（D919） | **保留**（派单前置依赖，pre-dispatch-check skill 物理依赖） |
| 26 | scripts/control-tower/check-dsh-anchor.py | daily-cto-board.sh:30 + ci.yml:267（其测试） | P0 | **保留**（P0 三件之一） |
| 27 | scripts/control-tower/check-gitlinks.sh | 零生产调用（tests=1，ci.yml:254 跑该测试） | —（D665） | **保留**（防线=CI control-tower-tests lane 跑其测试；阶段 2 补调用点入 check-architecture.sh CI 步，接线而非退役——D665 事故回归） |
| 28 | scripts/control-tower/check-k3-report.py | 零生产调用（tests=1，ci.yml:268 跑该测试） | P0 | **保留**（P0 三件之一；防线同上=CI lane） |
| 29 | scripts/control-tower/check-notes-lifecycle.sh | pre-commit:338/922 | #22 | **保留**（调用点随 #22 迁 CI + 纯文档早退分支保留本地） |
| 30 | scripts/control-tower/check-orphan-worktrees.sh | gen-cto-health.py:527 | — | **合并到 check-ct-health.sh** |
| 31 | scripts/control-tower/check-ownership.py | check-pr-budget.sh:37（OWNERSHIP） | —（D733） | **保留**（pr-budget 物理依赖） |
| 32 | scripts/control-tower/check-pr-budget.sh | pre-commit:1462-1473（→迁 CI） | #49 | **保留**（P0 三件之一） |
| 33 | scripts/control-tower/check-sentinel-type-net.sh | 零生产调用（tests=2） | —（D752） | **合并到 check-architecture.sh**（哨兵类型网=架构域；接线进 CI architecture job——修复 M3 未接线而非退役） |
| 34 | scripts/doc-system/check-doc-truth.sh | pre-commit:1416-1429 | #47 | **保留**（D782 刚接线，调用随 33 项迁 CI） |
| 35 | scripts/product-lines/check-progress-freshness.py | progress-freshness-watchdog.yml:32 | — | **保留**（独立 workflow 单点） |
| 36 | scripts/workflow/check-boundaries-incremental.sh | verify-incremental.sh:194（唯一调用方） | — | **合并到 verify-incremental.sh 内联**（PostToolUse 域，唯一调用方内联=文件消失防护不变） |
| 37 | scripts/workflow/check-brief-parseable.sh | pre-commit:1351 | #42 | **合并到 check-plan-integrity.sh**（brief 域；brief_parser.py 单源不动） |
| 38 | scripts/workflow/check-brief-vs-code.sh | ci.yml:309（checker-review job）+ loop-score:61 | #40 | **保留**（ci.yml 直接调用） |
| 39 | scripts/workflow/check-dataflow-alignment.sh | 零真调用（仅 check-fde-terms.sh:47 白名单提及） | #34 | **退役**（防护去向：#34 已裁旁路看板指标——观测由 gate-stats 承载；启发式判定不再做门禁） |
| 40 | scripts/workflow/check-dev-doc-write-set.sh | pre-commit:1360 + pre-audit-summary:47 | #43 | **保留** |
| 41 | scripts/workflow/check-golden-regression.sh | pre-push:283（--verify-only） | —（D300/D474） | **保留**（pre-push 黄金门禁） |
| 42 | scripts/workflow/check-integration.sh | ci.yml:293（integration-check job） | — | **保留** |
| 43 | scripts/workflow/check-self-diagnosis.sh | 零调用（tests=0） | —（D86） | **退役**（防护去向：诊断职责已由 gen-cto-health.py 健康面板 + check-gates-v2 承接） |
| 44 | scripts/workflow/check-silent-swallow.sh | pre-commit:554（--diff） | #6 | **保留** |
| 45 | scripts/workflow/check-spec.sh | 零调用（tests=0） | —（铁律0-2 门禁①） | **退役**（防护去向：SPEC 强制语义已并入组 6 brief 门禁（#18/#19）迁 CI；独立 SPEC.md 检查死代码） |
| 46 | scripts/workflow/check-test-first.sh | 零生产调用（tests=1） | #7 | **退役**（防护去向：测试先行/配对判定已在 pre-commit L561-584 内联实现并迁 CI） |

### 阶段 2 后 check-* 清单（精确 20 个）

**保留 10**：check-gates-v2.py / check-dsh-anchor.py / check-k3-report.py / check-pr-budget.sh / check-secrets.sh / check-architecture.sh / check-plan-integrity.sh / check-file-driven.sh / check-notes-lifecycle.sh / check-doc-truth.sh

**保留 10（续）**：check-bypass-log.sh / check-citations.py / check-gitlinks.sh / check-ownership.py / check-dev-doc-write-set.sh / check-golden-regression.sh / check-integration.sh / check-brief-vs-code.sh(workflow) / check-silent-swallow.sh / check-progress-freshness.py

**合并消失 10**（防护承接已逐条给）：acceptance-ci→file-driven；hardcoded→file-driven（linter 化前）；q0c-tracking→plan-integrity；verifiable-done→plan-integrity；brief-parseable→plan-integrity；canary-drift/ci-stale-red/orphan-worktrees→**check-ct-health.sh（新）**；sentinel-type-net→architecture；boundaries-incremental→verify-incremental 内联

**退役 16**（防护去向逐条见上表）：as-any / security / bridge-files / file-hell / integrity-startup / lessons-learned / tech-debt / deprecated-mapping / 根 brief-vs-code / checks-test-quality / ci-contract-gaps / wf-test-first / wf-check-spec / wf-self-diagnosis / wf-dataflow-alignment / fde-terms

**核对：20 + 10 + 16 = 46 ✔**（`find ... | wc -l` = 46）

## 二、pre-commit 侧剩余项核算

去向表 50 项中，阶段 2 后仍留在本地 pre-commit 的：

| 类别 | 项 | 说明 |
|---|---|---|
| 保留-脚本 | #17 主树占用 / #33 绕过审计 7c / #46 GATEKEEPER 前置 | 本地并行/绕过语义，CI 无意义 |
| 暂不动 | #3 / #30 / #37 / #38 / #39 | linter 化与启用决策未落 |
| **隐含必留（本次核对新增 2）** | ① CT-34 纯文档早退通道的 Secrets 调用（pre-commit:331）+ fastlane 通道（:359-373） | Secrets 属"三点必留"（本地早退+pre-push+CI），fastlane 并入 #46 家族计 |
| | ② log_gate/gate-hits 元数据写入（:78-82） | #4/#29/#32/#34 四项旁路指标的数据源，旁路化后必须本地留钩子 |

**结论：本地 pre-commit 剩余 = 8 + 2 = 10 项口径**（#46 家族含 fastlane、#11 家族含早退 Secrets）。

## 三、1529 → ≤400 行数分解（实测块行数）

块行数实测（python 按 началь/结尾行号切块，sum=1501 + 空行 28 = 1529）：

| 块 | 行数 | 阶段 2 去向 |
|---|---|---|
| 头部注释+函数定义（1-219） | 219 | 精简至 ~90（三段重复注释 L147-155/L224-229/L375-385 共 ~33 行直接删；6 个检查函数收敛为 3） |
| GATEKEEPER+diff缓存+豁免/fastlane（232-386） | 155 | **本地保留**（#46+#11 早退），~150 不动 |
| 并行启动+plan.json（387-459） | 73 | par 启动 8 个迁 CI 调用点后只剩 2（hardcoded/file-driven 域宿主）→ ~25 |
| 组1-组13 检查体（466-1400） | 935 | 33 项迁 CI + 旁路 4 + 退役 4 的判定体全部移出 → 残留仅保留-脚本 3 项判定体 ~90 |
| D782/D734/平台/CP3/尾部（1402-1529) | 128 | 迁 CI（#47-#50）；尾部结果汇总保留 ~30 |

**估算：150(前置) + 25(par) + 90(组体残留) + 30(尾) + 头 90 ≈ 385 ≤ 400 ✔**（含缓冲；实施时以 `wc -l` 验收 ≤400）

## 四、33 项迁 CI 的 ci.yml 承载方案

- **落点**：新 job `iron-laws`（quality 之后、control-tower-tests 之前）——宿主脚本 `scripts/ci/run-iron-laws.sh`（新，非 check-* 前缀不计入 20），内部以 `SYNO_CI=1 SYNO_DIFF_BASE=<base>` 复用现 pre-commit-check.sh 的 CI 分支（L274-279 已内建 `SYNO_DIFF_BASE...HEAD` diff 与 L111-113 soft→硬 + L56-61 `::error` GitHub 注解）。
- **重型项拆分**：契约/技能同步/生成物等判定 ≤1s/项（实测空跑全量 1.618s），单 job 串行可承载；不新增并发压力（8GB 纪律）。
- **D956 未合宽窗**：新 job `continue-on-error: true` + 依赖既有 `::error title=IronLaws:<项名>` 注解（L59-60 已内建，PR checks 页注解可见不拦合并）——即"红腿告警必须可见"的物理落地；D956 合并后移除 continue-on-error 转硬阻断。
- P0 三件（merge_writeset_gate ci.yml:102 / check-dsh-anchor / check-k3-report tests ci.yml:256-268）**不动**。

## 五、linter 化候选清单（铁律 35：能变 lint 规则的不靠脚本）

| 去向表项 | 现实现 | linter 化草案 | 依据（DSH 同构） |
|---|---|---|---|
| #3 硬编码业务数据 | check-hardcoded.sh grep | oxlint `no-restricted-properties`（'marketing'/'sales'/部门名字面量表）+ `no-restricted-syntax`（可扩展实体数组） | DSH .oxlintrc.json:60+ 同款（B#3） |
| #5 empty catch 无 log | pre-commit 内联 grep | oxlint `no-empty-catch`（correctness 类，typeAware 开启即得） | DSH .oxlintrc.json typeAware:9（B#4） |
| #14 跨层引用 | 内联 grep（→合并 check-architecture.sh） | ESLint `no-restricted-imports` paths/patterns（L1/L2/L3 白名单矩阵）——中期目标 | DSH check-workspace-constraints（B#14） |
| #26-28 SOG 旧引用（已退役） | — | `no-restricted-imports` 单条（@synova/sog-core）作防回归钉子 | 同上 |
| #1 as any 家族 | 内联 grep（迁 CI） | `@typescript-eslint/no-explicit-any` + ban-types（never/unknown 双断言）——中期，需先清存量 47 处 | DSH tsc+typeAware 等价更强（B#1） |
| 不可 linter 化（明确排除） | #6 静默吞错（shell 语义）、#29 PRD 对照、#34 数据流启发式 | 维持脚本/旁路，不强行 lint | — |

## 六、自检 5 问

1. 接线：本件为计划文档，无代码接线；46 脚本调用方逐条 grep 证据在表内。
2. 异常处理：不涉代码。
3. 类型安全：不涉代码。
4. 测试质量：数字全部命令原始输出（find=46 / wc -l=1529 / 块行数 python 实测 / 空跑 1.618s）。
5. 残留：退役 16 项每项给了防护承接；合并 10 项给了宿主；未动 scripts/audit/**。

— D962-A2，工作树 .synova-wt-d962a（分支 docs/d962-disposition），2026-09-25
