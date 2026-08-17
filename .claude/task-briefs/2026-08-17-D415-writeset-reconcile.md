# Task Brief: D415 dev doc 写集双向对账门禁（U2 — M2/M7）

> 生成: 2026-08-17 | 分支: feat/u2-writeset-reconcile | as any: 0

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔/工程基建（DSH 领地）。对象 scripts/workflow/check-dev-doc-write-set.sh（dev doc 写集对账）。不改产品代码（src/ L1-L5）。是"声称 vs 事实"防忽悠体系的一环。

### b) 文件审计
grep 实证：check-dev-doc-write-set.sh 只查"声明→实际"单向（遍历声明条目查变更命中），"改了没登记"完全没查；无写集表 fail-open exit 0；对账基准 git diff HEAD + --cached 混用。漂移实证：D355 写集 7 实际 9（少列）、D383 声称 25 实际 23（漏交）。

### c) 决策
补反向对账（实际→声明差集），复用 devdoc_writeset.py 清洗（不重复造轮子）。注入缝 SYNO_STAGED_FILES 供测试。无冲突。

## Q1: 调研 — 决策链 + 执行约束

- 铁律 0-2（测试先行+接线验收）；M2/M7（声称 vs 事实 / 写集漂移）；铁律 12（真实路由不 mock）。
- 决策参考：第一性原理（写集是分发契约，双向一致才算真）+ Anthropic（机器可验 + fail-closed）。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/workflow/check-dev-doc-write-set.sh
- tests/control-tower/check-dev-doc-write-set.test.sh
- task-state/D415.json
- .claude/task-briefs/2026-08-17-D415-writeset-reconcile.md

不做什么（含文件路径）：
- 不改 src/（产品代码，越界）
- 不改 scripts/audit/（K3 专属红线）
- 不改 dev-doc-gatekeeper.sh C6 接线（U2d 双版漂移留后续）
- 不改 verify-parallel.sh（CT-28 留 U5）

## Q3: 验收 — 入口 → 交互 → 结果

入口：git commit 暂存 dev doc（SYNOVA-IMPL-*.md）+ 代码文件
处理：pre-commit G12c 调 check-dev-doc-write-set.sh → 正向（声明了没改）+ 反向（改了没登记）双向对账
结果：写集与实际双向一致才过；改了没登记 → 阻断并逐行点名

## 架构层: 控制塔/工程基建（非 L1-L5 产品层）
#CRITERIA: A

## Done 标准
- [ ] bash tests/control-tower/check-dev-doc-write-set.test.sh 全绿（4 用例：正常/反向漂移/文档豁免/接线）
- [ ] 改代码但不登记进写集 → commit 被 G12c 阻断点名（物理复现）
- [ ] 文档类变更不算漂移（豁免，原则 7）
- [ ] grep "实际变更但未登记" scripts/workflow/check-dev-doc-write-set.sh 命中真实调用
