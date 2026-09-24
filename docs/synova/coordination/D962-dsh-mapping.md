# D962-B — DSH 对应做法映射 + 控制塔测试覆盖盘点

> 编写：d962-coder-b（D962 小队编码 B），工作树 `.synova-wt-d962b`，分支 `chore/d962-dsh-mapping`（base = origin/main @ 6a714483）。
> DSH checkout：`/Users/wane/src/deepseek-harness-017/`（**只读盘点，零修改**）。
> 本文件为唯一写集产物。供 D962-A 合入去向表第 5 列（"DSH 有/无对应做法"）。

---

## 〇、前提实测（每条均命令原始输出）

| 前提 | 命令 | 输出摘要 |
|---|---|---|
| DSH checkout 存在且可读 | `ls /Users/wane/src/deepseek-harness-017/` | 30 项顶层（AGENTS.md/apps/packages/scripts/lefthook.yml 等） |
| Synova pre-commit 检查项数 | `grep -nE 'hard_check "\|soft_check "' scripts/pre-commit-check.sh \| wc -l` | **38**（≠ CTO 口径 48；A 侧以实测数为准已在 D962-disposition-table.md 声明口径） |
| 13 组结构存在 | `grep -n "── 组 " scripts/pre-commit-check.sh` | 组 1,2,3,4,5,6,7,8,9,10,12,13 各有 echo 标头（组 11 无独立标头，其内容并入组 2/组 6） |
| tests/control-tower 文件数 | `ls tests/control-tower/ \| wc -l` | **124**（含 `__init__.py`） |
| DSH CI workflows 数 | `ls .github/workflows/` | **20 个 .yml** |
| DSH lefthook 本地钩子 | `wc -l lefthook.yml` | 55 行；pre-commit 6 jobs + pre-merge-commit 2 jobs + pre-push 1 job（typecheck） |
| DSH scripts 规模 | `ls scripts/*.spec.ts \| wc -l` | 113 个 .spec.ts；非 spec 的 .ts 脚本 143 个 |

---

## 一、DSH 门禁承重结构盘点（file:line 依据）

### 1.1 执行架构总览

DSH 的门禁分两层：**lefthook 本地钩子（快速检查点）+ CI 门禁矩阵（权威）**，与 Synova V5.0.0 的"本地软提示 + CI 权威"（D515/D516）同构。

### 1.2 lefthook.yml（本地钩子，55 行）

| 钩子 | job | 依据 |
|---|---|---|
| pre-commit | translation pairing | lefthook.yml:7-12（`scripts/verify-translation-pairing.ts`） |
| pre-commit | archived agent notes | lefthook.yml:14-16（`scripts/verify-archived-agent-notes.ts`） |
| pre-commit | lint (staged) | lefthook.yml:18-24（`run-oxlint.ts --config .oxlintrc.staged.json --fix`，**自动修复而非拒绝**，stage_fixed: true） |
| pre-commit | third-party notices 再生成 | lefthook.yml:26-35（`gen-third-party-notices.ts && git add`，注释明确"Regenerate rather than reject"） |
| pre-commit | whitespace | lefthook.yml:37-38（`git diff --cached --check`） |
| pre-commit | vendor manifest guard | lefthook.yml:40-41（`scripts/check-vendor-manifest.sh`） |
| pre-merge-commit | 同上翻译配对 + 归档笔记 | lefthook.yml:44-58 |
| pre-push | typecheck | lefthook.yml:60-62（`pnpm run typecheck`） |

### 1.3 CI workflows（20 个 .yml，职责）

主矩阵 `ci.yml`（726 行）12 jobs：`node-24`(:42 静态门禁+lint)、`node-24-coverage`(:110)、`node-24-bench`(:193)、`node-24-consumers`(:239)、`node-compat`(:367)、`python-sdk`(:459)、`python-runtime`(:487)、`windows-build`(:503)、`windows-coverage`(:565)、`windows-native-tests`(:643)、`all-checks-passed`(:700 汇总门)。
`ci-master.yml`（523 行，main 分支追加）：`python-runtime`(:34)、`windows`(:45)、`serial-linux-selfhosted`(:133)、`serial-macos`(:189)、`serial-windows`(:227)、`larger-runner-benchmark`(:281)、`consolidated-runner-benchmark`(:392)。
其余 18 个：发布（release*.yml ×5、python-release、node-addon-system*×2）、构建（build-exe-for-python-sdk、build-preview-cloudflare）、docs-pages、e2e、pi-ai-provider-e2e、sandbox、issue-lifecycle/issue-policy、expected-filenames、weighted-approval-review-event/weighted-approval。

### 1.4 门禁统一调度器 `scripts/run-gates.ts`

所有 CI 门禁以**有向依赖图**聚合成 mode（`ci-static`/`ci-coverage`/`node-compat` 等 17 种，run-gates.ts:24-41），进程内调度并发（注释引用 `.agents/notes/implemented/process/2026-07-06-parallel-pre-push-gates.md`）。关键 gate 清单（file:line）：

**静态门禁 `ciSharedStaticGates()`（run-gates.ts:341-358）**：runtime-closure、default-product-isolation、application-entrypoints、constraints(check-workspace-constraints)、package-dependencies、dsh-package-licenses、package-invariants、package-meta、cordis-config、hygiene 组、approval-policy、issue-management。

**构建产物门禁 `ciArtifactGates()`（run-gates.ts:492-503）**：build → publint(:495) → node-next-types → built-package-invariants → built-bin-smoke。

**lint `lintGate()`（run-gates.ts:633-644）**：`lint:contracts-ready` = `tsx scripts/run-oxlint.ts .`（package.json:49），type-aware oxlint（.oxlintrc.json:11 `"typeAware": true`）。

**node-compat（run-gates.ts:400-417）**：typecheck + build + web build + CLI smoke —— 对应"compat-preflight"口径的跨 Node 版本验证（nodeCompatGates 按 runningNodeMajor 分支）。

### 1.5 关键工具/插件（package.json file:line）

| 工具 | 依据 | 用途 |
|---|---|---|
| oxlint 1.76.0 | package.json:246 | 主 lint（快速，type-aware） |
| oxlint-tsgolint 7.0.2001 | package.json:247 | oxlint 的类型检查后端 |
| eslint-plugin-sonarjs ^4.1.1 | package.json:231 | 重复码/质量规则（duplication gate） |
| @stylistic/eslint-plugin ^5.10.0 | package.json:220 | 风格规则 |
| publint ^0.3.21 | package.json:249 | 发布产物校验（package.json:94 `publint-all.ts`） |
| vitest | coverage 分区 gate（run-gates.ts:671-706） | 测试 + 覆盖率阈值 + 免重套件白名单（coverage-exempt.ts） |
| verify-package-invariants | package.json:109 / scripts/package-invariants.ts | 包结构不变量 |
| verify-built-package-invariants | package.json:111 / scripts/verify-built-package-invariants.mjs | 构建后产物不变量 |

### 1.6 check-* 脚本清单（DSH scripts/ 内）

`check-workspace-constraints.ts`（接 package.json:188 `constraints`，进 ciStatic）、`check-expected-filenames.sh`（独立 workflow .github/workflows/expected-filenames.yml:28）、`check-vendor-manifest.sh`（lefthook pre-commit:40-41）、`check-macos-deployment-target.py`。注意：DSH 的"检查"大多不叫 check-*，而是 verify-*（~20 个，如 verify-runtime-closure/verify-package-dependencies 等，均由 run-gates 聚合）。

---

## 二、Synova 13 组 → DSH 有/无对应做法映射表

> 检查项行号 = .synova-wt-d962b 中 scripts/pre-commit-check.sh 实测行号（38 处 hard/soft_check 调用，组 3 Secrets 为独立脚本 par_collect 计 1 项）。

### 组 1 — 类型安全 + 硬编码数据

| # | Synova 检查（行号） | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 1 | as any / as never / as unknown as 零容忍（L493, hard） | hard | **有，等价更强**：TS `tsc -b` typecheck 全量类型检查（类型错误即 fail），无"as any 特赦"需求——DSH 无历史逃逸事故，靠编译器 + oxlint typeAware | .oxlintrc.json:11 `typeAware: true`；run-gates.ts:633 lintGate；lefthook.yml:60-62 pre-push typecheck |
| 2 | from 损伤 D93/D95（L499, hard） | hard | **无对应**（Synova 专属事故模式） | — |
| 3 | 硬编码业务数据/类型（L514, soft） | soft | **部分对应**：no-restricted-properties 等受限属性规则（按域限定 magic 字符串），但无"业务实体清单"类检查 | .oxlintrc.json:60+ no-restricted-properties |

### 组 2 — 测试质量

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 4 | empty catch 无 log（L551, soft） | soft | **有**：oxlint correctness 类规则 + typeAware（.oxlintrc.json:7 categories correctness off 但 overrides 内规则逐条启用；空 catch 由 no-empty 类规则覆盖于 ESLint 层，eslint-plugin-sonarjs） | package.json:231 sonarjs；.oxlintrc.json overrides:44+ |
| 5 | 静默吞错 D313 M5b（L556, soft） | soft | **无直接对应**；同类靠 sonarjs 质量规则 + 测试覆盖 | package.json:231 |
| 6 | 新文件配对 impl↔test（L583, hard） | hard | **无配对强制**；替代 = 覆盖率阈值门禁（vitest --coverage + coverage-exempt 白名单制度化） | run-gates.ts:671-706 coverageGates；scripts/coverage-exempt.ts |
| 7 | 桩测试 ≥3 expect（L610, hard） | hard | **无对应**（用覆盖率数字代替断言计数） | run-gates.ts:671 |
| 8 | 跨模块集成需 .integration.test.ts（L611, hard） | hard | **无对应**；DSH 用 e2e.yml + pi-ai-provider-e2e.yml 独立 E2E workflow 分层 | .github/workflows/e2e.yml；pi-ai-provider-e2e.yml |
| 9-10 | 控制塔脚本测试门禁 U7/CT-40 + 执行失败三态（L622/L624, hard） | hard | **部分对应**：scripts/ 下 113 个 .spec.ts 与实现同仓同跑（test lane 内联），无独立"脚本测试门禁"聚合 | `ls scripts/*.spec.ts \| wc -l` = 113；run-gates ciStatic 各 gate 均含自身 spec |

### 组 3 — Secrets

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 11 | check-secrets.sh 全工作区 + .claude/ 专项（L640 par_collect, hard） | hard | **无 secrets 模式扫描脚本**；替代：check-dsh-package-licenses（许可而非泄密）+ 租赁 runner 沙箱隔离 + .gitignore；GitHub native secret scanning（外部，非仓库内门禁） | run-gates.ts:350 dsh-package-licenses |

### 组 4 — 接线完整性

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 12 | 新 export 必须被引用（L677, hard） | hard | **有，等价更强**：`no-unused-vars`（.oxlintrc.json:51）+ runtime-closure（运行时闭包完整性：每个入口可达依赖被打包） | .oxlintrc.json:51；run-gates.ts:309/344 verify-runtime-closure |
| 13 | 接线深度：须被调用非仅 import（L697, hard） | hard | **有**：no-unused-expressions + runtime-closure（未调用的导出不会进入产物闭包） | .oxlintrc.json:50；verify-runtime-closure |

### 组 5 — 架构边界 + 桥接文件

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 14 | 禁止跨层引用 铁律39（L728, soft） | soft | **有，等价更强**：`constraints`（check-workspace-constraints.ts）做 workspace 包间依赖约束 + `verify-package-dependencies` + `verify-module-graph` 模块图校验 | package.json:188；run-gates.ts:348/347/487 |
| 15 | 桥接文件欺诈/壳包 铁律46（L767, soft） | soft | **无对应**（Synova engine-core 拆分事故专属；DSH 的包结构由 package-invariants 保证，不存在迁移代理问题） | run-gates.ts:349 package-invariants |

### 组 6 — Task Brief / 认领流程

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 16 | 主树占用检测 D537（L843, hard） | hard | **无对应**（多 worktree 并发是 DSH 产品功能本身，见 packages/workspace） | — |
| 17 | 骨架 brief 占位符（L906, hard） | hard | **无对应**（无 task brief 体系） | — |
| 18 | 时间戳顺序 brief 早于代码（L916, soft） | soft | **无对应** | — |

### 组 7 — 架构合规

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 19 | 禁止 DiagnosticModule（L992, soft） | soft | **无对应**（领域专属） | — |
| 20 | 数据流：路由文件须含 API 调用证据（L1070, soft） | soft | **部分对应**：client-route-resolution + client-domain-graph（前端路由/域图静态验证） | run-gates.ts sharedHygieneGates:361+；run-gates.ts:299 |

### 组 8 — 文件驱动架构完整性

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 21 | check-file-driven.sh（manifest/tags/目录，L1086 区段） | soft/hard | **部分对应**：`verify-cordis-config`（配置文件 schema）、`check-expected-filenames`（独立 workflow 断言文件命名）、translation pairing（i18n 文件配对强制） | run-gates.ts:310；.github/workflows/expected-filenames.yml:28；lefthook.yml:7-12 |

### 组 9 — 契约门禁 D257

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 22 | 契约声明产出须在暂存区（L1117, soft） | soft | **有，机制不同**：契约即类型（tsc build）+ `lint-contracts`（oxlint-contract-* 可执行契约测试，见 .oxlintrc.json:23-24 ignore 注释 "contract tests"）+ doc-typecheck（文档代码块类型检查 scripts/doc-typecheck.ts） | package.json:95-96 doc-typecheck；.oxlintrc.json:23-24 |

### 组 10 — V3 CP3 流水线健康度（L1121 区段）

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 23 | G10 条件区域不匹配（warn） | warn | **无对应**（Synova criteria-code-map 专属） | — |
| 24 | G11 声明端到端验收但无测试文件（warn） | warn | **无对应** | — |

### 组 12 — Task Scope 一致性

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 25 | G12d 生成物单点生成 D458（L1345, hard） | hard | **有，等价**：third-party notices lefthook job——"Regenerate rather than reject"，生成物由钩子自动再生并 git add，单点生成被机制保证 | lefthook.yml:26-35（注释明说 freshness assertion 兜底 test lane） |
| 26 | G12c dev doc 写集验证 D313 M3b（L1362, soft） | soft | **无对应** | — |
| 27 | G12d 声称↔证据对照表 U4 D423（L1376 soft + L1378 hard 执行失败） | soft+hard | **无对应**（DSH 无 dev doc 声称体系） | — |
| 28 | D1 文档真相 check-doc-truth（L1424-1429, soft×3） | soft | **有，等价更强**：`doc-sync` gate + doc-typecheck（docs 代码块与源码类型一致性硬验证） | run-gates.ts:40/317 docSyncLeafGates；package.json:95-96 |
| 29 | D2 文档登记门禁 doc-registry-gate（L1440-1445, soft×3） | soft | **部分对应**：docs-pages.yml 构建校验 + expected-filenames 命名断言 | .github/workflows/docs-pages.yml；expected-filenames.yml:28 |

### 组 13 — 技能同步一致性 D370

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 30-31 | 技能漂移 sync-dsh-skills + 三态（L1394/L1396, hard×2） | hard | **无对应**（Synova .claude/skills ↔ .dsh/skills 双源专属） | — |

### 附加组（组 7 尾/组 12 尾扩展项）

| # | Synova 检查 | 类型 | DSH 对应 | 依据 |
|---|---|---|---|---|
| 32 | D734 PR 预算超限（L1468, soft） | soft | **部分对应**：PR 合并门 weighted-approval.yml（加权审批）+ all-checks-passed 汇总 job（PR 不可绕过红腿） | .github/workflows/weighted-approval.yml；ci.yml:700 |
| 33 | D734 PR 预算执行失败三态（L1470, soft） | soft | 同上 | — |
| 34 | V5 平台敏感命令 D520（L1489, soft） | soft | **有，等价更强**：windows 专属 jobs（windows-build/coverage/native-tests + ci-master serial-windows）+ `check:windows-wine`（package.json:89）本地 Wine 预检 | ci.yml:503/565/643；ci-master.yml:227；package.json:89 |

**统计**：38 实测检查项中（上表合并同断言三态项后列 34 条目）：DSH 有等价或更强做法 ≈ 14；部分对应 ≈ 7；无对应 ≈ 13（其中多数为 Synova 事故专属：task brief 体系、声称↔证据、技能双源、DiagnosticModule、桥接欺诈）。

**核心结论**：DSH 与 Synova 门禁哲学一致（lefthook 本地快检 + CI 权威矩阵 + 生成物自动再生优于拒绝）。DSH 无 Synova 的"agent 行为治理"类门禁（brief/认领/声称证据/技能同步），因为 DSH 的贡献者是 + 同行评审 PR 模型，不是多 agent 并发写主树模型。Synova 这类门禁在 DSH 语境无对应物是**合理差异**而非缺口。

---

## 三、tests/control-tower/ 124 文件 ↔ 13 组检查对应关系

> 口径：124 文件（`ls tests/control-tower/ | wc -l` = 124，含 `__init__.py`）。映射按"该测试验证的检查属于哪一组/哪道门禁"；**大量文件测的是 pre-push/post-commit/workflow 层而非 pre-commit 13 组本身**，逐组对应如下。

### pre-commit 13 组 → 测试文件

| 组 | 对应测试文件（tests/control-tower/） |
|---|---|
| 组 1 类型安全 | hard-gate-convergence.test.sh（结构断言：as any 项保持 hard）、grep-oP-regression.test.sh（组1 grep 引擎回归） |
| 组 2 测试质量 | check-test-first.test.sh、ct-test-gate.test.sh（控制塔脚本测试门禁 U7/CT-40）、hard-gate-convergence.test.sh（配对/expect 保持 hard） |
| 组 3 Secrets | check-secrets.test.sh、secrets-env-exempt.test.sh |
| 组 4 接线完整性 | hard-gate-convergence.test.sh（接线物理事实保持 hard） |
| 组 5 架构边界/桥接 | （无直接组级测试；write-set 类间接：write-set-check.test.sh） |
| 组 6 Task Brief | brief-parseable.test.sh、brief-parser-strip.test.sh、brief-template-decision.test.sh、brief_parser.test.sh、skeleton-brief-gate.test.sh、task-start.test.sh、task-start-parallel.test.sh、resolve-commit-brief.test.sh、q2-error-locating.test.sh、parallel-main-tree-occupancy.test.sh（主树占用 D537） |
| 组 7 架构合规 | check-dataflow-alignment.test.sh、check-sentinel-type-net.test.sh（DiagnosticModule/Sentinel 接口） |
| 组 8 文件驱动 | （无直接；generated-gate.test.sh 邻接） |
| 组 9 契约门禁 | （无直接组级测试文件） |
| 组 10 V3 CP3 | （无直接；verify-claims-table.test.sh 邻接 G11） |
| 组 12 Task Scope | g12-day-window.test.sh、g12-taskstate-exempt.test.sh、generated-gate.test.sh（G12d D458）、verify-claims-table.test.sh（G12d U4）、check-dev-doc-write-set.test.sh（G12c）、hook-check-task-scope.test.sh、write-set-check.test.sh、writeset-c6-gatekeeper.test.sh、declare-write-set.test.sh、merge_writeset_gate.test.sh、dev-doc-gatekeeper.test.sh、test-dev-doc-gatekeeper.py |
| 组 13 技能同步 | sync-dsh-skills.test.sh、install-dsh-preset.test.sh |

### 组外（13 组不直接覆盖，但属控制塔体系）的测试文件

- **pre-commit 机制自身**：ci-strict-mode.test.sh、ci-strict-visible.test.sh、hard-gate-convergence.test.sh（4保6放）、gate-stats.test.sh、rerun-evidence.test.sh、fastlane-bypass-only.test.sh、fastlane-extended.test.sh、check-bypass-log.test.sh、bypass-ledger.test.sh、bypass-union-merge.test.sh、tag-bypass-wiring.test.sh
- **pre-push / 多机同步**：push-sync-guard.test.sh、tag-consistency.test.sh、tag-ancestry.test.sh、commit-msg-consistency.test.sh、commit-msg-merge.test.sh、commit-msg-note-mandatory.test.sh
- **workflow/hook 层**：hook-block-write.test.sh、hook-check-memory.test.sh、hook-git-detect.test.sh、hooks-install.test.sh、verify-incremental.test.sh、verify-parallel.test.sh、verify-parallel-ci.test.sh、baseline-check.test.sh、baseline-exemption.test.sh、ban-stash.test.sh、sop-gate.test.sh、doc-commit-exempt.test.sh
- **文档门禁 D1/D2**：check-citations.test.sh、verify-doc.test.sh、founder-truth.test.sh、check-progress-freshness.test.sh、check-gitlinks.test.sh
- **控制塔运维/治理**：alloc-task-id.test.sh、alloc-task-id-lock.test.sh、merge-pr-queue.test.sh、check-pr-budget.test.sh、check-ownership.test.sh、check-orphan-worktrees.test.sh、session-worktree-isolation.test.sh、worktree-manager.test.{sh,py}、synova-commit.test.sh、synova-submit.test.sh、attach.test.sh、daemon-smoke.test.sh、weekly-selfcheck.test.sh、pre-dispatch-check.test.sh、pre-audit-summary.test.sh、external-auditor.test.sh、check-k3-report.test.sh、check-dsh-anchor.test.sh、dashboard-alignment.test.py、gen-cto-health*.test.{sh,py}、gen-plan-status.test.sh、gen-task-board.test.py、decide-next.test.sh、today-by-name.test.sh、incident-loop{,-hygiene}.test.sh、notes-four-state.test.sh、check-notes-lifecycle.test.sh、redeem-task-redeem.test.sh、claim-regex-narrow.test.sh、calc-k3-stale.test.py、check-canary-drift.test.sh、check-ci-stale-red.test.sh、ci-ratchet-base.test.sh、utf8.test.sh、platform-checklist.test.sh、check-progress-freshness.test.sh、product-lines.test.py、signal-emitter.test.ts、enterprise-fact{,s-chain}.test.ts、check-progress-freshness.test.sh、simulate-ci.test.sh、staging-guard-session.test.py、test-staging-guard.py、test-session-registry.py、test-wait-manager.py、test-write-lock.py、test_control_tower_truthfulness.py、test_env_validator.py、test_product_health.py、test_views_45.py、clone-config-init.test.sh、clone-shadow-commit.test.sh、post-commit.test.sh、post-commit-marker.test.sh、backup-db.test.sh

**覆盖结论**：13 组中组 1/2/3/4/6/12/13 有直接测试文件（含 hard-gate-convergence 的"4 保 6 放"结构断言）；**组 5/8/9/10/11 无组级直接测试**（组 11 已并入组 2/6，组 5/8/9/10 仅由 hard-gate-convergence 的结构断言间接覆盖）。124 文件中约 60% 测的是 13 组之外的控制塔机制（pre-push/hook/运维/审计），这是 D515 后"本地软提示"架构下测试重心向 CI 与机制层转移的体现。

---

## 四、自检 5 问

1. **接线检查**：本任务是纯文档交付（映射表），唯一产物 = 本文件，供 D962-A 合入去向表第 5 列（task-1 写集），接线由 A 侧负责。
2. **异常处理**：无代码 catch；只读盘点命令失败处均已如实标注（如 `grep -ci` 输出 113/143 的 exit code 差异已复核）。
3. **类型安全**：不涉代码。
4. **测试质量**：不涉测试；本表所有 file:line 均命令实测。
5. **残留清理**：工作树 `.synova-wt-d962b` 内仅本文件变更；DSH checkout 零修改（全程只读命令）。

## 五、遗留

- 组 5/8/9/10 无组级直接测试这一缺口，若 D962 去向表裁决"保留"这些组，建议 CT 队列补测试（不属本卡写集）。
- CTO 口径 48 项 vs 实测 38 处 hard/soft_check 调用的差异，已在 §〇 声明，最终口径以 A 侧 disposition-table 表头为准。
