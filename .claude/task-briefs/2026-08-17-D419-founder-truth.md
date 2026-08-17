# Task Brief: D419 创始人真相采集器（零信任控制台 L1 物理层 MVP）

> 生成: 2026-08-17 | 分支: feat/founder-truth-mvp | as any: 0

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔/工程基建（DSH 领地）。对象 scripts/control-tower/founder-truth.py（新建，创始人零信任控制台的 L1 物理事实数据源 MVP）。不改产品代码（src/）。

### b) 文件审计
grep 实证：gen-cto-health.py 派生任务 spec/impl/audit（工件驱动），但无"声称 status vs git 物理核验"的测谎对照；本脚本补这个创始人视角的零信任核验。

### c) 决策
新建 founder-truth.py（物理事实采集 + 红绿灯判定），复用 git log/merge-base 物理原语。无冲突。

## Q1: 调研 — 决策链 + 执行约束

- FOUNDER-CONSOLE 设计（零信任控制台 L1 物理层）；M2（声称 vs 事实）。
- 决策参考：第一性原理（创始人可验证 = 物理事实，非 agent 自报）。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/founder-truth.py
- tests/control-tower/founder-truth.test.sh
- task-state/D419.json
- .claude/task-briefs/2026-08-17-D419-founder-truth.md

不做什么（含文件路径）：
- 不改 src/（产品代码，越界）
- 不改 scripts/audit/（K3 专属红线）
- 不做完整控制台 UI（本任务只做 L1 物理数据源 MVP）
- 不改 gen-cto-health.py（既有，U3 在另一分支）

## Q3: 验收 — 入口 → 交互 → 结果

入口：python3 scripts/control-tower/founder-truth.py --offline
处理：读 task-state/*.json + git log/merge → 每任务声称 status vs 物理验证（提交/合并进 main）
结果：输出任务真相对照表（红绿灯）；疑似虚报（声称完成但 git 无提交）→ exit 1

## 架构层: 控制塔/工程基建（非 L1-L5 产品层）
#CRITERIA: B

## Done 标准
- [ ] bash tests/control-tower/founder-truth.test.sh 全绿（4 用例）
- [ ] founder-truth.py --offline 输出任务真相对照表（含红绿灯 + 小结）
- [ ] grep "git_committed_dns" scripts/control-tower/founder-truth.py 命中真实调用
