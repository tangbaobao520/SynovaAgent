<!--
  SYNOVA-IMPL-D703: 证据命令机器化——verify-dXXX.sh 随 spec 入库 + CI 原样执行（W-1）
  状态: dev doc | 2026-09-11 | 优先级 P1（消灭唯一系统性短板：DS 证据停留在文档字符串）
  权威文档: docs/synova/coordination/Win侧代码质量提升建议-20260909.md（W-1）；AGENTS.md 铁律 35（自动化优先）
  作者: Codex（Win 线 CTO）| 号段: Win/Codex 侧任务号 ≥ D700（创始人 2026-09-10 定）
  前身: D660（原号与 Mac 板端 D660 撞车且落入旧号段，本卡改号 D703；内容校订见 §0）
  依赖: 无
  ⚠️ 串行约束: 本卡与 D704 都改 .github/workflows/ci.yml → 两卡必须串行，禁止并行
-->

# SYNOVA-IMPL-D703：证据命令机器化（verify-dXXX.sh + CI 原样执行）

> 状态：dev doc | 2026-09-11 | 优先级 P1
> 归属：Win 线（scripts/ci/ + .github/workflows/ + dev-doc 模板）
> 依据：K3 W-1——DS 证据命令停留在「文档字符串」：W2 引用了不存在的测试文件、W4 声称 0 命中实测 2 命中，根因都是没人原样跑过

## 0. 派单前校订（2026-09-11，Codex 复核 @ main 5f5dde25）

| 项 | 前身 D660 原文 | 校订后 | 证据（实测） |
|---|---|---|---|
| 任务号 | D660 | **D703** | Win/Codex 侧任务号 ≥ D700；且 Mac 板端已占用 D660（`task-state/D660.json`＝任务看板活动判定重排） |
| 模板落点 | 「`docs/plans/codex/implementation/` dev-doc 模板（skill 内）§7 自检清单」 | **`.claude/skills/dev-doc-delivery/template/编码指令模板.md` §四 复核清单**（该模板只有 §一~§五，无 §7） | 实测该模板存在且与 .dsh 侧逐字一致（md5 恒等）；dev-doc 的 §1-§8 体例由 Codex 技能侧维护，不在本仓 |
| 双目录同步 | 未要求 | 必须同时改 `.dsh/skills/dev-doc-delivery/template/编码指令模板.md` | 组 13 技能同步一致性（`.claude/skills ↔ .dsh/skills` 漂移即硬阻断） |
| CI 测试清单接线 | 未提 | 新 shell 测试必须追加进 `.github/workflows/ci.yml` 的密封测试 for 清单（:162-191，当前 29 条） | 该 job 只跑显式列出的测试；不追加＝永不执行（正是 W-1 要消灭的「没人跑过」） |
| tsc 基线口径 | 「基线 28」 | 「与基线 worktree 逐条 diff 恒等、零新增」**（不写死数字）** | 本机 raw 33 = 28 基线 + 5 条 mcp SDK 模块解析噪声 |

## 1. 权威文档引用

- **Win 侧代码质量提升建议 W-1 证据命令机器化**：① dev doc 每条 DS 证据命令在干净 clone 原样跑一遍再合并 spec；② 把证据命令做成 `verify-dXXX.sh` 随 spec 入库，CI 原样执行；③ spec 自检清单加机器可查项「每条 verify 命令已在本分支 CI 实跑过」。
- **AGENTS.md 铁律 35**（自动化优先——能变脚本的不靠文档）。

## 2. 代码审计——现状（@ main 5f5dde25 实测）

- `.github/workflows/ci.yml:79` Vitest job 只跑 `npx vitest run --shard=${{ matrix.shard }} --reporter=verbose`；`:40` 跑 tsc（自带 `grep -v` 噪声过滤）。**没有任何「回放 dev-doc 证据命令」的 job**。
- dev-doc 的 DS 证据命令（grep/vitest/tsc）是 markdown 里的字符串，没有机器执行工件。
- 无 `scripts/ci/verify-doc.sh` 机制（`scripts/ci/` 现仅 4 个文件：check-contract-gaps.sh / diagnosis-quality-check.sh / golden-case-checker.ts / golden-snapshot-runner.ts）。
- `.github/workflows/ci.yml:17-21` 已有「纯文档 PR 瘦身」判定（docs_only 时跳过 TS+Iron Laws 步骤）——本卡新增的 verify 步骤必须挂在**非** docs-only 路径上，否则形同虚设。
- `.github/workflows/ci.yml:162-191` control-tower 密封测试 job 用显式 `for t in ...` 清单（实测 29 条）；新增 shell 测试不入列＝不跑。

### 2.1 无重复造轮子审计（S-14）

| 检查 | 结果（grep 实测） |
|---|---|
| 全仓 grep | `rg "verify-d|verify-doc|evidence-command" scripts/ci/ .github/workflows/` → 零命中，无既有机制 |
| 既有层确认 | `scripts/control-tower/` 有 verify-* 门禁（DSH 线），但那是控制塔门禁，不是「回放 dev-doc DS 证据」；`scripts/workflow/check-dev-doc-write-set.sh` 只校验写集声明，不跑 DS 命令 |
| 结论 | 新建轻量 `verify-dXXX.sh` 机制（纯 grep/vitest/tsc 回放），不重写控制塔门禁 |

## 3. 实现方案

### 3.1 写集 (3 修改 + 3 新建)

| 文件 | 操作 | 说明 |
|---|---|---|
| scripts/ci/verify-doc.sh | 新建 | 通用执行器：接收 dev-doc 路径，提取 §6/§8 的 DS 证据命令（grep/git/vitest/npx tsc 白名单），逐条在干净工作树回放，任一失败 exit 1；非白名单命令（含 `;` `&` `$` `<` `>` 反引号）拒绝执行 exit 1 |
| scripts/ci/verify-d703.sh | 新建 | 本卡自证脚本：对 D702/D703/D704 三份 spec 中可机器化的 DS 命令逐条回放（不可机器化的显式 skip + 理由） |
| .github/workflows/ci.yml | 修改 | ① 非 docs-only 路径追加步骤「changed dev-doc → 跑对应 scripts/ci/verify-dXXX.sh（存在则跑，缺省 skip + 警告）」；② control-tower 密封测试清单追加 tests/control-tower/verify-doc.test.sh |
| .claude/skills/dev-doc-delivery/template/编码指令模板.md | 修改 | §四 复核清单追加机器可查项：「每条 verify/DS 证据命令已在本分支 CI 实跑过（看 job 日志，非自述）」 |
| .dsh/skills/dev-doc-delivery/template/编码指令模板.md | 修改 | 与 .claude 侧逐字同步（组 13 技能同步一致性硬阻断） |
| tests/control-tower/verify-doc.test.sh | 新建 | ≥4 断言：合法 grep 回放 exit 0 / 引用不存在测试文件 exit 1（W2 缺陷场景）/ 非白名单命令拒绝 exit 1 / 无 DS 命令的 doc 显式 skip |

### 3.2 最终实现同 commit 回填

> 实现时若偏离本 doc（命令提取正则、白名单范围、CI job 触发条件、模板改点），必须在此节同 commit 回填最终形态。

### 3.3 不做的事

| 项 | 理由 |
|---|---|
| 不重写控制塔 verify-* 门禁（DSH 线） | 本卡是「回放 dev-doc 证据」，非控制塔门禁 |
| 不做 AST 级写操作吞错门禁 | 属 W-2/D702 的后续，本卡不混 |
| 不改 scripts/control-tower/ | 铁律 0-5：开发者不改门禁（本卡新增的是 scripts/ci/ 回放器，不触碰既有门禁判定） |
| 不引 @deepseek-ai | 非借鉴卡 |

## 4. 测试要求（测试优先，red → green）

`tests/control-tower/verify-doc.test.sh`（新文件，≥4 断言）：

- 合法 grep 命令回放 → exit 0；
- 引用不存在测试文件的 `npx vitest run tests/agent/diagnosis-launcher.test.ts` 类命令 → exit 1（W2 缺陷场景）；
- 非白名单命令（含 `;` / `&` / `rm`）→ 拒绝 exit 1；
- 无 DS 证据命令的 doc → 显式 skip（exit 0 + 打印 skip 理由，不静默）。

**RED 必须覆盖失败模式（S-5）**：脚本不存在时测试应红；实现后「引用不存在测试文件」用例必须 exit 1——这正是 W2 当时的真实事故场景。

### 4.5 决策参考（S-12）

- **决策点 1（命令白名单）**：参考系 = dev-doc 技能「证据命令首 token 只读白名单」——采纳同一白名单，禁 `; & $ < > 反引号`。
- **决策点 2（CI 触发）**：参考系 = 只跑本次 PR 改动的 dev-doc 对应 verify（不跑全量历史 spec，避免 CI 时长失控）——采纳按 changed files 匹配 `verify-dXXX.sh`。

## 5. 接线要求（S-3）

| 新脚本 | 调用方 | 确认方式 |
|---|---|---|
| scripts/ci/verify-doc.sh | .github/workflows/ci.yml 新步骤 | `grep -n "verify-doc" .github/workflows/ci.yml` 命中 |
| tests/control-tower/verify-doc.test.sh | .github/workflows/ci.yml 密封测试清单 | `grep -n "verify-doc.test.sh" .github/workflows/ci.yml` 命中 |

## 6. 完成标准（DS1-DS8，机器可验证）

- **DS1 机制落地**：`ls scripts/ci/verify-doc.sh scripts/ci/verify-d703.sh` 两者存在。
- **DS2 CI 接线**：`grep -n "verify-doc" .github/workflows/ci.yml` 命中 ≥2（执行步骤 + 测试清单）。
- **DS3 失败模式**：构造引用不存在测试文件的 doc → `bash scripts/ci/verify-doc.sh <doc>` exit 1。
- **DS4 测试 red→green**：`bash tests/control-tower/verify-doc.test.sh` 先 red → green（≥4 断言）。
- **DS5 零回归**：`npx tsc --noEmit` 报错集与基线 worktree 逐条 diff 恒等（零新增）；`bash scripts/pre-commit-check.sh` 本地跑过无新增硬阻断。
- **DS6 类型安全**：本卡为 bash + yml，无 TS 变更（显式 descope，不适用 as any 判据）。
- **DS7 范围一致**：`git diff --name-only HEAD^` 恰为 §3.1 写集（+ brief 簿记），无越界。
- **DS8 无绕过 + 推送 CI**：`grep -n "no-verify" .claude/bypass.log` 本次零新增；`git push` 后 CI task-relevant jobs 绿（job 级）。

## 7. 自检清单

- [ ] K3 W-1 三点（干净 clone 实跑 / verify 脚本入库 / CI 实跑）逐条覆盖
- [ ] 命令白名单与 dev-doc 技能一致（禁 `; & $ < > 反引号`）
- [ ] W2 缺陷场景（引用不存在测试文件）作为 red 基准
- [ ] 新 shell 测试已入 ci.yml 密封清单（不入列＝永不执行）
- [ ] .claude/.dsh 两侧模板逐字同步（组 13）
- [ ] 不是凭记忆 / 不用 --no-verify

## 8. 交付声明（声称 ↔ 证据对照表）

| 声称 | 证据命令 | 预期 |
|---|---|---|
| 机制落地 | `ls scripts/ci/verify-doc.sh scripts/ci/verify-d703.sh` | 两者存在 |
| CI 接线 | `grep -n "verify-doc" .github/workflows/ci.yml` | 命中 ≥2 |
| 失败模式 | `bash scripts/ci/verify-doc.sh <坏 doc>` | exit 1 |
| 测试全绿 | `bash tests/control-tower/verify-doc.test.sh` | 全 pass（≥4 断言） |
| 零回归 | `npx tsc --noEmit` | 报错集逐条恒等（零新增） |
| 范围一致 | `git diff --name-only HEAD^` | 与 §3.1 一致 |
| 无绕过 | `grep -n "no-verify" .claude/bypass.log` | 本次 0 命中 |
| 推送+CI | `git log origin/main..HEAD --oneline` | 合并后空 + CI task-relevant jobs 绿 |
