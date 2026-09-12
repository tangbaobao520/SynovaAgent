#CRITERIA: A

# Task Brief: D706 synova-commit-deletion-loss-fix

> 生成: 2026-09-12 | 任务: D706 | 认领: 🧭 并行 CTO session（synova-cto 预设）
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 派单: docs/synova/coordination/派单-并行CTO-控制塔收口批次-20260911.md §D706

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔域（非五层产品架构）。`scripts/control-tower/synova-commit` 是本仓库通往 `git commit`
的唯一路径（D201 契约），所有提交经它执行 13 组门禁。本任务修其**提交原语**：
「实际进入提交树的文件集合」必须等于「提交时暂存区声明的集合」。

### b) 文件审计
- `scripts/control-tower/synova-commit` L600 / L602 / L693 / L695 —— 四处部分提交调用
  `git commit -m "$MESSAGE" -- <pathspec>`（现役，缺陷本体）
- `tests/control-tower/synova-commit.test.sh` —— 配对测试（已在 ci.yml 密封清单，只扩展不新建）
- 实证留痕: `9aabd581` 声称摘除 10 个 gitlink，`git ls-tree -r HEAD | grep -c '^160000'` 仍为 10

### c) 决策
复用既有脚本 + 扩展既有测试；不新建脚本（一类一机制）。修法见 Q1。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- memory 教训: M2（声称 vs 事实）第三次止血；M4（执行证据链断裂）。D665 期间亲历。
- ctrl-tower-change 模式 1（门禁三态 exit code）、模式 5（mktemp 沙箱 + 三态断言）。
- 业界基线: `git commit -- <pathspec>` 走 git **部分提交机制**，对匹配路径用**工作区内容**
  内部重算（等价于对该 pathspec 做一次 add），而非逐字提交索引。
- 参考：第一性原理（提交树 = 索引的函数，不得依赖工作区状态）+ git 文档语义 + 本仓 D311 M1b
  → 结论：提交原语改「索引精确提交」+ 提交后不变量校验 + 失败还原索引。

## Q2: 范围 — 正确的最简方案
做什么：
- scripts/control-tower/synova-commit —— 提交原语 D706 段：`_d706_staged_state` /
  `_d706_extra_staged` / `_d706_index_exact_commit` + 两处调用点改造 + `git add` 逐路径容错
- tests/control-tower/synova-commit.test.sh —— 新增 ⑥⑦⑧ 三段（跨调用/越界/错配负例）
- memory/notes/implemented/2026-09-12-D706-commit-index-exact.md —— 四态 Note（铁律 49）
- .claude/task-briefs/2026-09-12-D706-synova-commit-deletion-loss-fix.md —— 本 brief
不做什么：
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 src/server.ts（产品代码属编码/Win 线）
- 不改 scripts/ci/branch-coverage-gate.sh（Win 线 D704 在写）
- 不改 vitest.config.ts（Win 线 D704 在写）
- 不改 .github/workflows/ci.yml（两项回归测试均已在密封清单，扩展既有文件即可）
- 不改 scripts/pre-commit-check.sh（D707 写集，本任务不碰以免 PR 交叉）

## Q3: 验收 — 入口 → 交互 → 结果
入口：`bash scripts/control-tower/synova-commit --task-id D706 --agent … --message …`
处理：索引精确提交 → 提交树 vs 暂存声明逐项比对 → 不一致则撤销提交并还原索引
结果：提交树 == 暂存声明（`git ls-tree` 前后对比 1→0）；不一致时 exit 1 + 点名差异

## 架构层: scripts（控制塔域，非 L1-L5 产品架构）

## Done 标准
- [x] verify: bash tests/control-tower/synova-commit.test.sh → exit 0（17 断言全绿）
- [x] verify: 反向验证——同测试跑 origin/main 原版脚本 → ⑥⑦⑧ 共 6 断言必红
- [x] verify: 复现脚本——修复前 `git ls-tree` 计数 1（删除项未进树），修复后 0
- [x] verify: CI Control Tower Gate Tests（ubuntu/windows）conclusion=success
