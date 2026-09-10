<!--
  SYNOVA-IMPL-D661: 分支覆盖准出——改动文件 branch 阈值门禁（W-3）
  状态: dev doc | 2026-09-10 | 优先级 P1（缺口全在没写的分支）
  权威文档: docs/synova/coordination/Win侧代码质量提升建议-20260909.md W-3；AGENTS.md 铁律 48（测试非空壳）
  借鉴: 无
  依赖: 无
  并行: 无（写集 .github/workflows/ + vitest config；与在途零交集）
-->

# SYNOVA-IMPL-D661：分支覆盖准出（改动文件 branch 阈值门禁）

> 状态：dev doc | 2026-09-10 | 优先级 P1
> 归属：Win 线（.github/workflows/ci.yml + vitest 配置）
> 依据：K3 W-3——W1 ACCOUNT_DISABLED 分支零测试、W4 映射表 10 条只测 3 条，缺口全在「没写的分支」

## 1. 权威文档引用

- **Win 侧代码质量提升建议 W-3 分支覆盖准出**：① 对本次改动文件启用 `vitest --coverage` 的 branch 阈值（改动文件 branches ≥ 阈值才准合并）；② 「每个新增分支要么有测试、要么显式标注豁免」从文化变数字；③ 覆盖门禁配「断言强度」抽查（只调用不断言的用例不计数）。
- **AGENTS.md 铁律 48**（测试非空壳，覆盖正常/降级/边界）。

## 2. 代码审计——现状（file:line，实测）

- `.github/workflows/ci.yml` L79 `npx vitest run --shard --reporter=verbose`——**无 `--coverage`、无 branch 阈值**。
- 无 `vitest.config` 的 coverage 配置（`@vitest/coverage-v8` 或 istanbul）。
- 无「改动文件 branches 阈值」门禁。

### 2.1 无重复造轮子审计（S-14）

| 检查 | 结果 |
|---|---|
| 全仓 grep | `rg "coverage|branches|threshold" .github/workflows/ vitest.config.* package.json` → 无 branch 阈值门禁 |
| 既有层确认 | 无既有 coverage 门禁 |
| 结论 | 新建轻量 branch 阈值（只对本次改动文件），不追求全仓 100% 覆盖 |

## 3. 实现方案

### 3.1 写集 (2 修改 + 1 新建)
| 文件 | 操作 | 说明 |
|---|---|---|
| `.github/workflows/ci.yml` | 修改 | 新增/扩展 Vitest job：对 PR 改动文件跑 `--coverage`，提取 branches 百分比，低于阈值（默认 80%）fail |
| `vitest.config.ts`（或 `vitest.config.mts`） | 修改 | 加 coverage 配置（provider v8/istanbul，reporter json-summary，include 改动文件） |
| `scripts/ci/branch-coverage-gate.sh` | 新建 | 从 coverage json 提取改动文件 branches 百分比，低于阈值 exit 1；输出缺失分支清单 |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（阈值数值、coverage provider、改动文件获取方式），必须在此节同 commit 回填最终形态。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不追求全仓 100% 覆盖 | 只对本次改动文件（准出闸门，非清库存） |
| 不做「只调用不断言」的 AST 强度检查 | 属后续「断言强度」抽查，本卡做 branch 数字闸门 |
| 不引 `@deepseek-ai` | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

`branch-coverage-gate.sh`：改动文件 branches=60%（<80%）→ exit 1；branches=90%（≥80%）→ exit 0；coverage json 缺失/损坏 → fail-closed exit 1。

RED 必须覆盖失败模式（S-5）：构造 branches 低于阈值的 coverage 报告 → 修复前无此门禁 → red；修复后 exit 1。

### 4.5 决策参考（S-12）

- **决策点 1（阈值）**：参考系 = 业界 branch 准出惯例 80% + K3「缺口全在没写的分支」——采纳默认 80%，可经 manifest 豁免。
- **决策点 2（provider）**：参考系 = vitest 生态默认——采纳 `@vitest/coverage-v8`（快），必要时回退 istanbul。

## 5. 接线要求

| 新 export/脚本 | 调用方 | 确认方式 |
|---|---|---|
| `scripts/ci/branch-coverage-gate.sh` | `.github/workflows/ci.yml` Vitest job | `grep -n "branch-coverage-gate" .github/workflows/ci.yml` 命中 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 门禁落地**：`ls scripts/ci/branch-coverage-gate.sh` 存在。
- **DS2 CI 接线**：`grep -n "coverage\|branch" .github/workflows/ci.yml` 命中。
- **DS3 失败模式**：低于阈值 coverage 报告 → `bash scripts/ci/branch-coverage-gate.sh` exit 1。
- **DS4 测试 red→green**：门禁脚本自测先 red → green。
- **DS5 零回归**：`npx tsc --noEmit` 报错集 = 基线 28（零新增）。
- **DS6 类型安全**：脚本为 bash，无 as any（不适用，descope）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记）。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；CI task-relevant jobs 绿。

## 7. 自检清单

- [ ] K3 W-3 三落地（coverage branch 阈值 / 豁免显式化 / 断言强度抽查）已覆盖前两项，第三项 descope 记录
- [ ] 阈值只对改动文件（准出闸门非清库存）
- [ ] 不是凭记忆 / 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 门禁落地 | `ls scripts/ci/branch-coverage-gate.sh` | 存在 |
| CI 接线 | `grep -n "coverage\|branch" .github/workflows/ci.yml` | 命中 |
| 失败模式 | `bash scripts/ci/branch-coverage-gate.sh <低于阈值报告>` | exit 1 |
| 零回归 | `npx tsc --noEmit` | 28 = 基线 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 一致 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后）+ CI 绿 |
