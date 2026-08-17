# Task Brief: D417 secrets 门禁 git 可用性 fail-open 修复（U5b — CT-30 强化）

> 生成: 2026-08-17 | 分支: feat/u5-secrets-failopen | as any: 0

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔/工程基建（DSH 领地）。对象 scripts/check-secrets.sh（secrets 门禁，安全关键）。不改产品代码（src/）。

### b) 文件审计
grep 实证：check-secrets.sh 全工作区扫描二次过滤用 `git ls-files --error-unmatch` 判定 .env 是否未跟踪，git 不可用时该命令失败被误判为"未跟踪"→ 静默豁免（fail-open，M1）。 secrets 是安全关键门禁，豁免判定失效必须 fail-closed。

### c) 决策
二次过滤前加 git rev-parse 可用性预检，git 不可用 → exit 2 degraded。复用现有 SYNO_SECRETS_ROOT 注入缝。

## Q1: 调研 — 决策链 + 执行约束

- 铁律 24/31（catch 带 log + degraded 标记）；M1（fail-open 静默失效）。
- 决策参考：第一性原理（安全关键门禁查不了=不合规）+ Anthropic（fail-closed 不与通过混同）。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/check-secrets.sh
- tests/control-tower/check-secrets.test.sh
- task-state/D417.json
- .claude/task-briefs/2026-08-17-D417-secrets-failopen.md

不做什么（含文件路径）：
- 不改 src/（产品代码，越界）
- 不改 scripts/audit/（K3 专属红线）
- 不改 scripts/check-secrets.sh 的 .env 豁免主逻辑（D370 已修，本任务只补 git 可用性预检）
- 不改 post-commit.sh marker 判定（CT-29 留 U5a）

## Q3: 验收 — 入口 → 交互 → 结果

入口：git commit 触发 pre-commit 组 3 Secrets 扫描
处理：全工作区扫描二次过滤前先 git rev-parse 预检 → git 不可用则 exit 2 degraded
结果：git 不可用时不静默豁免（fail-closed）；git 可用时行为不变（现有 secrets-env-exempt 测试仍绿）

## 架构层: 控制塔/工程基建（非 L1-L5 产品层）
#CRITERIA: A

## Done 标准
- [ ] bash tests/control-tower/check-secrets.test.sh 全绿（3 用例：正常/降级/接线）
- [ ] git 不可用 + 有 secrets → exit 2（物理复现）
- [ ] 现有 secrets-env-exempt.test.sh 仍绿（不破坏既有豁免逻辑）
- [ ] grep "git 不可用" scripts/check-secrets.sh 命中真实代码
