<!--
  SYNOVA-IMPL-D704: 分支覆盖准出——改动文件 branch 阈值门禁（W-3）
  状态: dev doc | 2026-09-11 | 优先级 P1（缺口全在没写的分支）
  权威文档: docs/synova/coordination/Win侧代码质量提升建议-20260909.md（W-3）；AGENTS.md 铁律 48（测试非空壳）
  作者: Codex（Win 线 CTO）| 号段: Win/Codex 侧任务号 ≥ D700（创始人 2026-09-10 定）
  前身: D661（原号落入 Mac 号段，本卡改号 D704；内容校订见 §0）
  依赖: 无
  ⚠️ 串行约束: 本卡与 D703 都改 .github/workflows/ci.yml → 两卡必须串行，禁止并行
-->

# SYNOVA-IMPL-D704：分支覆盖准出（改动文件 branch 阈值门禁）

> 状态：dev doc | 2026-09-11 | 优先级 P1
> 归属：Win 线（.github/workflows/ci.yml + vitest 配置 + scripts/ci/）
> 依据：K3 W-3——W1 的 ACCOUNT_DISABLED 分支零测试、W4 映射表 10 条只测 3 条，缺口全在「没写的分支」

## 0. 派单前校订（2026-09-11，Codex 复核 @ main 5f5dde25）

**前身 D661 的 §2 现状审计有实质性错误，本卡据此重写前提**：

| 项 | 前身 D661 原文 | 校订后（实测） | 证据 |
|---|---|---|---|
| 任务号 | D661 | **D704** | Win/Codex 侧任务号 ≥ D700 |
| 「无 vitest.config 的 coverage 配置」 | 声称缺失 | **错误——已存在全局阈值配置** | `vitest.config.ts` coverage 段：provider `v8`、include `./src/**/*.ts`、thresholds `{lines:40, functions:45, branches:30, statements:40}`（P3-01 注释） |
| 「需接入 @vitest/coverage-v8」 | 当作新增依赖 | **已装**：`package.json:83` devDependencies `@vitest/coverage-v8: 4.1.8`（与 vitest 4.1.8 同版），`node_modules/@vitest/coverage-v8` 实测存在；`package.json:22` 已有 `test:coverage` 脚本 | 实测 |
| 真实缺口 | — | **① 全局阈值不是准出闸门**（改一个文件也能靠全仓平均分掩盖漏测分支）；**② CI 的 Vitest job（ci.yml:79）根本不跑 `--coverage`**；**③ 无「改动文件」口径与显式豁免机制** | `grep -n "coverage" .github/workflows/ci.yml` 零命中 |
| CI 测试清单接线 | 未提 | 新 shell 测试须追加进 ci.yml:160-191 的密封测试清单 | 该 job 只跑显式列出的测试 |
| tsc 基线口径 | 「基线 28」 | 「与基线 worktree 逐条 diff 恒等、零新增」（不写死数字） | 本机 raw 33 = 28 基线 + 5 条 mcp SDK 模块解析噪声 |

## 1. 权威文档引用

- **Win 侧代码质量提升建议 W-3 分支覆盖准出**：① 对本次改动文件启用 `vitest --coverage` 的 branch 阈值（改动文件 branches ≥ 阈值才准合并）；② 「每个新增分支要么有测试、要么显式标注豁免」从文化变数字；③ 覆盖门禁配「断言强度」抽查（只调用不断言的用例不计数）。
- **AGENTS.md 铁律 48**（测试非空壳，覆盖正常/降级/边界）。

## 2. 代码审计——现状（@ main 5f5dde25 实测）

- `.github/workflows/ci.yml:79` Vitest job 仅 `--shard --reporter=verbose`，**无 `--coverage`**；`:114` GraphStore 兼容 job 也只是 `vitest run tests/architecture/`。
- `vitest.config.ts` 已有 coverage 配置，但**只有全仓聚合阈值**（branches 30），无「改动文件」维度 → 单文件漏测可被全仓平均掩盖。
- `package.json:22` `test:coverage` = `vitest run --coverage`（手动用，未进门禁）。
- 无「改动文件 branch 阈值」门禁脚本；无豁免机制。

### 2.1 无重复造轮子审计（S-14）

| 检查 | 结果（实测） |
|---|---|
| 全仓 grep | `rg "coverage" .github/workflows/` → 零命中；`scripts/ci/` 无 coverage 相关脚本 |
| 既有层确认 | v8 provider + reporter 基建已在 vitest.config.ts，本卡只加「改动文件准出闸门」与 CI 接线，不重写 coverage 体系 |
| 结论 | 新建轻量 `scripts/ci/branch-coverage-gate.sh`（读 json-summary 报告 → 只判改动文件），保留既有全局阈值不动 |

## 3. 实现方案

### 3.1 写集 (2 修改 + 2 新建)

| 文件 | 操作 | 说明 |
|---|---|---|
| scripts/ci/branch-coverage-gate.sh | 新建 | 入参：coverage-summary.json 路径 + 改动文件清单（默认 `git diff --name-only origin/main...HEAD`）。只判改动文件（src/**/*.ts）的 branches 百分比：< 阈值（默认 80，可 `BRANCH_COVERAGE_MIN` 覆盖）→ exit 1 + 点名缺失分支文件；报告缺失/损坏 → fail-closed exit 1；改动文件不在报告中（未被任何测试加载）→ 视为 0% exit 1；豁免：改动文件内出现 `branch-coverage-exempt: <理由>` 注释则跳过并打印理由 |
| tests/control-tower/branch-coverage-gate.test.sh | 新建 | ≥4 断言：改动文件 branches 60%（<80）→ exit 1；90%（≥80）→ exit 0；报告缺失/损坏 → exit 1（fail-closed）；含豁免注释的文件 → 跳过且打印理由 |
| .github/workflows/ci.yml | 修改 | 新增 coverage 准出步骤（仅在 PR 且 src/ 有改动时跑 `npx vitest run --coverage --coverage.reporter=json-summary`，再调 branch-coverage-gate.sh）；control-tower 密封测试清单追加 tests/control-tower/branch-coverage-gate.test.sh |
| vitest.config.ts | 修改 | 追加 `json-summary` reporter 配置（保留既有全局 thresholds 与 include/exclude 不变，避免全量 CI 因全局阈值变化而红） |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（阈值默认值、覆盖率运行范围、改动文件获取方式、豁免语法、CI 触发条件），必须在此节同 commit 回填最终形态。

### 3.3 不做的事

| 项 | 理由 |
|---|---|
| 不追求全仓 100% 覆盖 | 只对本次改动文件（准出闸门，非清库存） |
| 不动既有全局 thresholds（lines 40/functions 45/branches 30/statements 40） | 本卡是增量闸门；改全局阈值会让全量 CI 变红，属另一议题 |
| 不做「只调用不断言」的 AST 强度检查 | K3 W-3 第③点属后续「断言强度」抽查，本卡只做 branch 数字闸门 |
| 不改 scripts/control-tower/ | 铁律 0-5：开发者不改门禁判定 |
| 不引 @deepseek-ai | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

`tests/control-tower/branch-coverage-gate.test.sh`（新文件，≥4 断言）：

- 改动文件 branches=60% → exit 1；
- 改动文件 branches=90% → exit 0；
- coverage 报告缺失/JSON 损坏 → fail-closed exit 1；
- 改动文件带 `branch-coverage-exempt: <理由>` → 跳过 + 打印理由（不静默）。

**RED 必须覆盖失败模式（S-5）**：门禁脚本不存在时测试应红；实现后「低于阈值」用例必须 exit 1 且输出点名文件——这正是 W1/W4 的真实事故形态（分支漏测却全绿合并）。

### 4.5 决策参考（S-12）

- **决策点 1（阈值）**：参考系 = 业界 branch 准出惯例 80% + K3「缺口全在没写的分支」——采纳默认 80%，`BRANCH_COVERAGE_MIN` 可覆盖（便于测试注入），文件级豁免走显式注释。
- **决策点 2（provider / 运行范围）**：参考系 = 仓库既有 v8 provider（已装、已配）+ CI 时长约束——采纳复用 v8 + json-summary；覆盖率运行范围由实现方在 §3.2 写明（全量 `--coverage` vs 仅改动文件相关测试），以 CI 时长可控为准。

## 5. 接线要求（S-3）

| 新脚本 | 调用方 | 确认方式 |
|---|---|---|
| scripts/ci/branch-coverage-gate.sh | .github/workflows/ci.yml 新步骤 | `grep -n "branch-coverage-gate" .github/workflows/ci.yml` 命中 |
| tests/control-tower/branch-coverage-gate.test.sh | .github/workflows/ci.yml 密封测试清单 | `grep -n "branch-coverage-gate.test.sh" .github/workflows/ci.yml` 命中 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 门禁落地**：`ls scripts/ci/branch-coverage-gate.sh` 存在。
- **DS2 CI 接线**：`grep -n "coverage" .github/workflows/ci.yml` 命中 ≥2（本次由 0 命中变为命中）。
- **DS3 失败模式**：构造 branches 低于阈值的 json-summary → `bash scripts/ci/branch-coverage-gate.sh <报告> <文件清单>` exit 1 且点名文件。
- **DS4 测试 red→green**：`bash tests/control-tower/branch-coverage-gate.test.sh` 先 red → green（≥4 断言）。
- **DS5 零回归**：`npx tsc --noEmit` 报错集与基线 worktree 逐条 diff 恒等；既有全局阈值不变（改前后 `vitest.config.ts` 的 thresholds 值逐字相同）。
- **DS6 类型安全**：本卡为 bash + yml + config，无 TS 源码变更（显式 descope）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 本次零新增；`git push` 后 CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] K3 W-3 前两点（改动文件 branch 阈值 / 豁免显式化）已覆盖，第三点（断言强度）明确 descope
- [ ] 阈值只判改动文件（准出闸门，非全仓清库存）
- [ ] §0 校订：既有 coverage 配置与 v8 依赖是「已存在」，不得当作新增依赖重装
- [ ] 新 shell 测试已入 ci.yml 密封清单
- [ ] 不是凭记忆 / 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 门禁落地 | `ls scripts/ci/branch-coverage-gate.sh` | 存在 |
| CI 接线 | `grep -n "coverage" .github/workflows/ci.yml` | 命中 ≥2（改前 0） |
| 失败模式 | `bash scripts/ci/branch-coverage-gate.sh <低于阈值报告> <文件清单>` | exit 1 + 点名文件 |
| 测试全绿 | `bash tests/control-tower/branch-coverage-gate.test.sh` | 全 pass（≥4 断言） |
| 零回归 | `npx tsc --noEmit` + 既有 thresholds 逐字不变 | 报错集逐条恒等 + 配置 diff 仅新增 reporter |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 一致 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 本次 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 合并后空 + CI task-relevant jobs 绿 |
