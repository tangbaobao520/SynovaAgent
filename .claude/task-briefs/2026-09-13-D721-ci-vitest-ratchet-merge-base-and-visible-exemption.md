# Task Brief: D721 ci-vitest-ratchet-merge-base-and-visible-exemption

> 生成: 2026-09-13 | 任务: D721 | 认领: 主 CTO（synova-cto）
> 参考: ctrl-tower-change skill（门禁变更模式库）+ 铁律 11（静默降级禁止）
> 触发: #513 永红复盘 —— 从「PR 刷新」追到「CI 棘轮判据错误」，再追到「main 假绿」

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔 CI 门禁修复（非五层）。Vitest 作业内有一层**存量失败棘轮**：失败用例若不在「本次改动」集合内，
判为历史遗留并放行（exit 0）。本单修该机制的两个真问题（均 P1）：

- **F2 判据错误**：`CHANGED=$(git diff --name-only HEAD~1..HEAD)` —— 当 HEAD 是**合并提交**（刷新分支时 `git merge origin/main`）时，
  `HEAD~1` = 分支尖端，`HEAD~1..HEAD` = **被并入的 main 全部改动** → 存量红被误判为「本 PR 新增红」→ PR 永红。
  实证：#513（D711）head `bf6ac999` 与 `5aae38fc`（当时 main）`git diff` 为 **0 个文件**，却因合并提交被判 3 个新增失败；重跑两次均复现。
- **F1 静默放行**：同一机制让 main 自己的红灯被长期豁免。实测 main `021897a0` 的 Vitest(2/2) 日志：
  `Test Files 3 failed | 286 passed | 1 skipped (290)` 紧跟 `Pre-existing test failures from unchanged files — not blocking`
  → 作业结论 **success**。即「main 全绿」是假象（铁律 11 同族：降级发生了，但没人看得见）。
  三个真红（本地实测复现，与 CI 一致）：`tests/agent/expert-file-loader.integration.test.ts`（断言 8 位专家，仓库实为 6）、
  `tests/l3/graphbridge-wiring.test.ts`（`expected +0 to be 1`）、`tests/electron/use-streaming-conversation.test.ts`
  （`Cannot find package 'react-markdown'` = 已登记 `PLAN-react-markdown-dep`）
### b) 文件审计（读代码确认，非凭记忆）
- `.github/workflows/ci.yml:86` — 棘轮判据 `CHANGED=` 所在（全仓其余 `HEAD~1` 命中均在 commit 后的单提交语境，本单不动）
- `.github/workflows/ci.yml:93-107` — 放行分支（`if [ -z "$NEW_FAILURES" ]; then echo ...; exit 0`）
- 同 job 下方 D708 步骤用 `--base origin/main` → 证明本 job 内 `origin/main` 可用
### c) 决策
F2 修判据（三点差 `merge-base(origin/main, HEAD)..HEAD`）；F1 **不取消棘轮、不收紧阈值**
（取消 = main 立刻全红压垮编码线，正是 V4.5.1 教训），改为**可见化**（`::warning::` + 放行文件名清单）+ 登记在案。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- ctrl-tower-change 模式 1/3/6：门禁三态退出码；条件检查保持 <1s；改门禁者先过门禁 + 反向验证
- 铁律 11：静默降级禁止 → 放行必须留痕（GitHub annotation + 文件名）
- 铁律 47（"拆完了"须 grep 证明）同构：**"main 绿"也必须由日志证明**，不能由作业状态推断 —— 本单正是该推论的反例
- 历史教训：V4.5.1「门禁误拦 → `--no-verify` → 门禁链全线失效」；D603「文档声称有执法、实际零执法」
### 参考：ctrl-tower-change + 铁律 11/47 + V4.5.1/D603 教训 → 判据改三点差；放行改为可见 + 登记，阈值不动

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/check-brief-vs-code.sh — 同族同因第二处：G12 的 diff 基准改 merge-base 三点差（合并提交不再把 main 并入的改动判为越界）；origin/main 不可用 → 回退 + 显式提示
- .github/workflows/ci.yml — ① `CHANGED` 改用 `merge-base(refs/remotes/origin/main, HEAD)..HEAD`（三点差），origin/main 不可用时回退旧判据并打 `::warning::`
  ② 放行分支补 `::warning::` + 放行文件名清单 + 指向 board-backlog 登记项；阻断分支补「本 PR 引进的失败」清单
- docs/synova/coordination/board-backlog.json — 登记 F1（main Vitest 三个真红，须烧掉）+ `graphbridge-wiring` 红（此前未登记）
- memory/notes/implemented/2026-09-13-ci-vitest-ratchet-merge-base-fix.md — 决策沉淀（铁律 49）
- .claude/task-briefs/2026-09-13-D721-ci-vitest-ratchet-merge-base-and-visible-exemption.md、task-state/D721.json — 本单
不做什么：
- 不改 `scripts/audit/`（审计红线）
- 不取消棘轮、不放宽/收紧通过阈值（本单只修**判据正确性**与**放行可见性**）
- 不修那 3 个真红测试本身（产品域：react-markdown → D717 在途；expert-file-loader / graphbridge-wiring → 本单只登记，另行派单）
- 不改 `scripts/check-brief-vs-code.sh`、`scripts/control-tower/synova-commit`、`scripts/hooks/post-commit.sh` 的 `HEAD~1` 用法（单提交语境正确，避免扩大爆炸半径）

## Q3: 验收 — 入口 → 交互 → 结果
入口：任何 PR / main 推送触发的 CI（Vitest 作业）
处理：以 `merge-base(origin/main, HEAD)` 为基准算本 PR 真实改动集 → 失败用例落在改动集内才阻断；否则放行并留可见告警
结果：① 刷新分支（含并入 main 的合并提交）不再被存量红误判为永红 ② 存量红每次 CI 都被点名告警，不再静默

## 架构层: 基础设施（CI 门禁，非五层）
变更面限 `.github/workflows/ci.yml` + board-backlog 登记 + 决策 Note

## Done 标准:
- [ ] YAML 合法：`python3 -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml'));print('ok')"` → 输出 ok
- [ ] 裸 `HEAD~1..HEAD` 不再作为变更集基准：`grep -c 'CHANGED=\$(git diff --name-only HEAD~1' .github/workflows/ci.yml` → 0
- [ ] 三点差判据在位：`grep -c 'merge-base' .github/workflows/ci.yml` → ≥1
- [ ] 放行可见：`grep -c '::warning::' .github/workflows/ci.yml` → ≥2
- [ ] 反向验证（沙箱模拟「合并提交 + 存量红」）：旧判据把 main 并入的文件算进改动集、新判据不算 → 两条命令输出贴进 PR
- [ ] G12 基准可证：grep -c 'merge-base refs/remotes/origin/main HEAD' scripts/check-brief-vs-code.sh → ≥1
- [ ] 登记在案：`python3 -c "import json;b=json.load(open('docs/synova/coordination/board-backlog.json'))['backlog'];print([e['id'] for e in b if 'vitest' in e['id'].lower() or 'graphbridge' in e['id'].lower()])"` → 含本单两项
