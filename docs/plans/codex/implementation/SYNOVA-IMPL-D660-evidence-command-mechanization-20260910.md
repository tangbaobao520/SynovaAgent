<!--
  SYNOVA-IMPL-D660: 证据命令机器化——verify-dXXX.sh 随 spec 入库 + CI 原样执行（W-1）
  状态: dev doc | 2026-09-10 | 优先级 P1（消灭唯一系统性短板）
  权威文档: docs/synova/coordination/Win侧代码质量提升建议-20260909.md W-1；AGENTS.md 铁律 35（自动化优先）
  借鉴: 无
  依赖: 无
  并行: 无（写集 scripts/ci/ + .github/workflows/ + dev-doc 模板；与在途零交集）
-->

# SYNOVA-IMPL-D660：证据命令机器化（verify-dXXX.sh + CI 原样执行）

> 状态：dev doc | 2026-09-10 | 优先级 P1
> 归属：Win 线（scripts/ci/ + .github/workflows/ + dev-doc 模板）
> 依据：K3 W-1——DS 证据命令停留在「文档字符串」，W2 引用不存在测试文件、W4 声称 0 命中实测 2 命中，都因没人原样跑过

## 1. 权威文档引用

- **Win 侧代码质量提升建议 W-1 证据命令机器化**：① dev doc 每条 DS 证据命令在干净 clone 原样跑一遍再合并 spec；② 把证据命令做成 `verify-dXXX.sh` 随 spec 入库，CI 原样执行；③ spec 自检清单加机器可查项「每条 verify 命令已在本分支 CI 实跑过」。
- **AGENTS.md 铁律 35**（自动化优先——能变脚本的不靠文档）。

## 2. 代码审计——现状（file:line，实测）

- `.github/workflows/ci.yml` 目前只跑 `npx vitest run --shard`（L79）+ tsc（L40），**没有任何「回放 dev-doc 证据命令」的 job**。
- dev-doc 的 DS 证据命令（grep/vitest/tsc）是 markdown 里的字符串，没有机器执行工件。
- 无 `scripts/ci/verify-dXXX.sh` 机制。

### 2.1 无重复造轮子审计（S-14）

| 检查 | 结果 |
|---|---|
| 全仓 grep | `rg "verify-d|verify-doc|evidence-command" scripts/ci/ .github/workflows/` → 零命中，无既有机制 |
| 既有层确认 | `scripts/control-tower/` 有 verify-* 门禁（DSH），但那是控制塔门禁，不是「回放 dev-doc DS 证据」 |
| 结论 | 新建轻量 `verify-dXXX.sh` 机制（纯 grep/vitest/tsc 回放），不重写控制塔门禁 |

## 3. 实现方案

### 3.1 写集 (2 新建 + 2 修改 + 1 测试)
| 文件 | 操作 | 说明 |
|---|---|---|
| `scripts/ci/verify-doc.sh` | 新建 | 通用执行器：接收一个 dev-doc 路径，提取其 §6/§8 的 DS 证据命令（grep/vitest/tsc 白名单），逐条在干净工作树回放，任一失败 exit 1 |
| `scripts/ci/verify-dXXX.sh`（模板，随 D660 落地 1 个样例） | 新建 | 每个任务的证据命令固化脚本（本卡先落 `verify-d660.sh` 自证机制跑通） |
| `.github/workflows/ci.yml` | 修改 | 加 job：对本次 PR 改动的 dev-doc，跑对应 `verify-dXXX.sh`（存在则跑，缺省跳过并警告） |
| `docs/plans/codex/implementation/` dev-doc 模板（skill 内） | 修改 | §7 自检清单加机器可查项「每条 verify 命令已在本分支 CI 实跑过（看 job 日志，非自述）」 |
| `tests/control-tower/verify-doc.test.sh` | 新建 | 测 verify-doc.sh：合法 grep 命令回放成功 / 引用不存在测试文件的命令失败 exit 1 / 非白名单命令拒绝 |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（命令提取正则、白名单范围、CI job 触发条件），必须在此节同 commit 回填最终形态。

### 3.3 不做的事
| 项 | 理由 |
|---|---|
| 不重写控制塔 verify-* 门禁（DSH） | 本卡是「回放 dev-doc 证据」，非控制塔门禁 |
| 不做 AST 级写操作吞错门禁 | 属 W-2 的 DSH/后续，本卡不混 |
| 不引 `@deepseek-ai` | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

`tests/control-tower/verify-doc.test.sh`：合法 grep 回放 → exit 0；引用不存在测试文件的 `vitest run tests/agent/diagnosis-launcher.test.ts` → exit 1（W2 缺陷场景）；非白名单命令（如含 `;`/`&`/`rm`）→ 拒绝 exit 1。

RED 必须覆盖失败模式（S-5）：`verify-doc.sh` 回放「引用不存在测试文件」的命令 → 修复前无此脚本 → red；修复后 exit 1。

### 4.5 决策参考（S-12）

- **决策点 1（命令白名单）**：参考系 = dev-doc 技能「证据命令首 token 只读白名单（grep/git/vitest/ls/tsc 等）」——采纳同一白名单，禁 `; & $ < > \``。
- **决策点 2（CI 触发）**：参考系 = PR 改动的 dev-doc 才跑对应 verify（不跑全量历史 spec）——采纳按 changed files 匹配 `verify-dXXX.sh`。

## 5. 接线要求

| 新 export/脚本 | 调用方 | 确认方式 |
|---|---|---|
| `scripts/ci/verify-doc.sh` | `.github/workflows/ci.yml` 新 job | `grep -n "verify-doc.sh\|verify-d" .github/workflows/ci.yml` 命中 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 机制落地**：`ls scripts/ci/verify-doc.sh scripts/ci/verify-d660.sh` 存在。
- **DS2 CI 接线**：`grep -n "verify-d" .github/workflows/ci.yml` 命中。
- **DS3 失败模式**：`bash scripts/ci/verify-doc.sh <一个引用不存在测试文件的 doc>` exit 1。
- **DS4 测试 red→green**：`bash tests/control-tower/verify-doc.test.sh` 先 red → green。
- **DS5 零回归**：`npx tsc --noEmit` 报错集 = 基线 28（零新增）。
- **DS6 类型安全**：脚本为 bash，无 as any（不适用，显式 descope）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 零命中；CI task-relevant jobs 绿。

## 7. 自检清单

- [ ] K3 W-1 三落地（干净 clone 跑 / verify 脚本入库 / CI 实跑）已覆盖
- [ ] 命令白名单与 dev-doc 技能一致
- [ ] W2 缺陷场景（不存在测试文件）作为 red 基准
- [ ] 不是凭记忆 / 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 机制落地 | `ls scripts/ci/verify-doc.sh scripts/ci/verify-d660.sh` | 存在 |
| CI 接线 | `grep -n "verify-d" .github/workflows/ci.yml` | 命中 |
| 失败模式 | `bash scripts/ci/verify-doc.sh <坏 doc>` | exit 1 |
| 测试全绿 | `bash tests/control-tower/verify-doc.test.sh` | 全 pass |
| 零回归 | `npx tsc --noEmit` | 28 = 基线 |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 一致 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 空（合并后）+ CI 绿 |
