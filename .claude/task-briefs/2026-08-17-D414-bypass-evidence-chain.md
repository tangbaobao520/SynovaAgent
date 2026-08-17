# Task Brief: D414 bypass 证据链对账门禁（U1 — M4 第4次复发根治）

> 生成: 2026-08-17 | 分支: feat/u1-bypass-reconcile | as any: 0

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔/工程基建（DSH 领地）。对象 scripts/control-tower/synova-commit（提交封装）+ check-bypass-log.sh（对账门禁）。不改产品代码（src/ L1-L5）。是"创始人零信任控制台"的可信证据源之一。

### b) 文件审计
grep 实证：synova-commit:601 写 COMMITTED 到 bypass.log 但从不 git add（证据链只在工作区、不进 git、换 worktree 即断——D411 提交时亲手撞到）；check-bypass-log.sh:49 `git log || true` 假 PASS（git 失败空循环当通过）；M4 已 4 次复发（D328→D329→D383→D394/D395a）。

### c) 决策
U1a commit 前 add bypass.log（滚动入库）；U1c git log 失败 fail-closed exit 2。复用现有脚本，不新建。无冲突。

## Q1: 调研 — 决策链 + 执行约束

- 铁律 24/31（catch 带 log + degraded 标记）；M4（执行证据链断裂）；M1（fail-open 假 PASS）。
- 决策参考：第一性原理（证据链必须进 git 才可被任何环境审计）+ Anthropic（fail-closed 不与通过混同）。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/synova-commit
- scripts/control-tower/check-bypass-log.sh
- tests/control-tower/synova-commit.test.sh
- tests/control-tower/check-bypass-log.test.sh
- task-state/D414.json
- .claude/task-briefs/2026-08-17-D414-bypass-evidence-chain.md
- .claude/bypass.log

不做什么（含文件路径）：
- 不改 src/（产品代码，越界）
- 不改 scripts/audit/（K3 专属红线）
- 不改 scripts/hooks/post-commit.sh 的 marker 判定（CT-29 留 U5）
- 不做 DEGRADED 路径补 HASH（U1b 留后续）

## Q3: 验收 — 入口 → 交互 → 结果

入口：synova-commit 提交任何变更
处理：commit 前自动 git add .claude/bypass.log（若有变更）→ 证据链随提交入库；check-bypass-log 对账时 git log 失败 → exit 2 fail-closed
结果：bypass.log 的 COMMITTED 记录进 git（git show HEAD 可见）；对账 git log 失败不再假 PASS

## 架构层: 控制塔/工程基建（非 L1-L5 产品层）
#CRITERIA: A

## Done 标准
- [ ] bash tests/control-tower/synova-commit.test.sh + check-bypass-log.test.sh 全绿
- [ ] synova-commit 提交后 bypass.log 变更随提交入库（git show HEAD 含 bypass.log）
- [ ] check-bypass-log git log 失败 → exit 2（不假 PASS）
- [ ] grep "git add \"\$BYPASS_LOG\"" scripts/control-tower/synova-commit 命中真实调用
