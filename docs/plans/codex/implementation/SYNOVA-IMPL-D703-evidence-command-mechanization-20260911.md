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

### 3.2 最终实现同 commit 回填（2026-09-11 实现时回填，与本卡交付同 commit）

> 实现时若偏离本 doc（命令提取正则、白名单范围、CI job 触发条件、模板改点），必须在此节同 commit 回填最终形态。

| # | 偏离点 | 任务行原文 | 最终形态（实测落地） | 理由 |
|---|---|---|---|---|
| 1 | 提取范围 | §6/§8 的 DS 命令 | `sed -n '/^## 6\./,/^## 7\./p; /^## 8\./,/^## 9\./p'` 两节 + 反引号行内代码 `grep -oE` + `awk !seen[]++` 去重（同一命令在两节重复只回放一次） | 区间未闭合时自然到 EOF，正则最简 |
| 2 | 白名单范围 | grep/git/vitest/npx tsc | 首二级 token 白名单：grep / ls / rg / sed（命中 `-i`/`--in-place` 拒绝）/ git（只读子命令 diff\|log\|show\|status\|rev-parse\|ls-files）/ npx vitest\|tsc / bash（仅限 scripts/ci/verify-*.sh 与 tests/control-tower/*.test.sh） | 实测三份 spec 的 DS 命令含 ls（D703 DS1、D704 DS1）与 bash 密封测试（DS4）——按任务行 4 token 白名单会把这些合法证据命令全拒绝 |
| 3 | `<占位符>` 处理 | 含 `<` `>` 一律拒绝 | 含 `<...>` 占位符的参数化命令（如 `bash scripts/ci/verify-doc.sh <坏 doc>`）→ **显式 skip**；不含占位符但含 `;` `&` 反引号 `$` 重定向 → 拒绝 exit 1 | 参数化命令不可实例化 ≠ 恶意注入；两者必须区分，否则合法证据命令被误拒 |
| 4 | vitest 路径预检（新增） | 未提 | npx vitest 的路径参数先做存在性检查，引用不存在 → exit 1 快速失败（W2 形态），不进入 vitest | 密封 CI job 无 npm ci（跑不了真 vitest）；预检使 W2 形态在无 node_modules 下也可判红，测试保持密封 |
| 5 | grep 语义 | 未提 | grep exit 1 = 零命中 = 命令成功（缺失类断言合法结果）；exit ≥2 = 引用错误 → FAIL | 缺失类断言（「残留 grep 零命中」）合法依赖 exit 1；预期数值判读归各 verify-dXXX.sh curation |
| 6 | CI job 触发条件 | 非 docs-only 路径 | quality job 新步骤 `Replay changed dev-doc evidence commands (D703)`，`if: steps.docsonly.outputs.docs_only != 'true'`（复用 D515 既有 id: docsonly）；changed 集限定 `docs/plans/codex/implementation/SYNOVA-IMPL-*.md`；D 号 = basename 过 `grep -oE 'D[0-9]+'` 首个；`scripts/ci/verify-${DNUM}.sh` 存在则跑（失败 `::error` + job 红），不存在 → `::warning` 显式 skip；步骤置于 npm ci 后（未来 verify 脚本可用 node）、TypeScript check 前（tsc 红也能先出证据） | 与决策点 2 一致；warning 不静默（倒逼各卡交付自证脚本） |
| 7 | verify-d703.sh 形态 | 「三份 spec 可机器化 DS 命令逐条回放」 | **curation 回放**而非全量委托 verify-doc.sh：D703 DS5a（tsc 基线逐条恒等需基线 worktree，CI 无）/ DS8b（推送后 CI job 级）不可机器化 → 显式 skip + 理由；D702/D704 两 spec 的 DS 全部断言各自实现后未来态 → 全部显式 skip + 理由（两卡实现时自建 verify-d702.sh / verify-d704.sh，CI 触发器按 D 号自动发现） | 全量委托会在 D703 spec 自身 DS5 `npx tsc --noEmit` 上红（存量 33 错误，exit 2）——curation 判定归 verify-dXXX.sh，通用引擎只判命令成败 |
| 8 | 模板改点 | §四 追加机器可查项 | 落点 = §四 新 6「证据机器可查（D703 起）」，原兜底项 6 顺延为 7；.claude/.dsh 两侧 cp 同步，md5 恒等（72f3b710b8ac838f0346f62e1efe0d8a） | 落点与顺延保持编号连续 |
| 9 | 回放 cwd | 未提 | doc 参数先解析绝对路径，回放统一 cd 仓库根（spec 内命令均为仓库根相对） | doc 可能以相对路径传入，cd 后相对 doc 路径失效 |
| 10 | 密封测试接线断言 | 未提 | 引擎存在性断言用 `-f` 而非 `-x` | 仓库惯例 scripts/ 与 tests/ 全部 100644（CI 以 bash 调用）；`-x` 在 ubuntu 必挂、Win MSYS 宽松判真造成本地假绿（CI ubuntu 实证 7/8 后修正） |
| 11 | D 号→脚本名映射 | 未提 | spec 文件名大写 D 号转小写再拼 `verify-<d#>.sh`（仓库惯例小写） | spec 名 `SYNOVA-IMPL-D703-…` 提取出 `D703`，直拼 `verify-D703.sh` 在 ubuntu 大小写敏感恒 warning skip（CI 首轮实证） |
| 12 | git 输出引号归一 | 未提 | DS6/DS7 的 git diff 统一加 `-c core.quotepath=off` | CI ubuntu 默认 quotepath=true 会把非 ASCII 路径输出为带引号八进制转义，与写集字面量恒不匹配 → DS7 误判越界；本地绿是 install-hooks 设了 quotepath false（D319 老坑变体，CI 三轮实证定位） |

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
