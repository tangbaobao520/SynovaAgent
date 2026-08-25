# Task Brief: D390: P1-1 修复 — 注入缝武装守卫 + 豁免事件审计落盘

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D390)
> 来源: K3 D387 审计 P1-1（安全级）——SYNO_GIT_CACHED_* 注入缝 + SYNO_SECRETS_ROOT 组合 = 无痕迹全 13 组旁路

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
K3 审 D387 发现：D387 引入的 SYNO_GIT_CACHED_* 注入缝无武装守卫，组合 SYNO_SECRETS_ROOT 可无痕迹跳过全 13 组（post-commit 检测失效，M4）。本任务：① 注入缝加 SYNO_TEST_ARM 武装守卫（生产缝关闭）；② 豁免事件写 exempt.log 审计落盘。

### b) 文件审计
- scripts/pre-commit-check.sh（注入缝 :113-118 武装 + 早退分支 exempt.log）
- tests/control-tower/doc-commit-exempt.test.sh（RUN_PRECOMMIT 加 SYNO_TEST_ARM + T13 落盘断言）
- .claude/task-briefs/2026-08-16-D390-exempt-guard.md
- task-state/D390.json

### c) 决策
K3 建议双修（exempt.log + 武装守卫），注入缝是安全面 → 武装守卫为主、落盘为辅。参考：Anthropic（fail-closed）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① K3 攻击路径复现理解 → ② 武装守卫（if SYNO_TEST_ARM）→ ③ exempt.log 落盘 → ④ 测试更新（T13 + 武装）→ ⑤ 负测（无武装缝失效）→ ⑥ 提交。
引用 K3 D387 P1-1、M4 强化、CT-36 一类一机制。

### b) 执行约束
- rule: "无 SYNO_TEST_ARM 时注入缝变量被忽略（旁路堵死）"
  verify: "SYNO_GIT_CACHED_* 设值跑脚本 → 全量 13 组非豁免"
- rule: "豁免事件有审计痕迹"
  verify: "T13 exempt.log 含 EXEMPT"

### c) 决策参考系
参考：Anthropic（注入缝武装 = 测试缝不落生产）。收敛。

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/pre-commit-check.sh
- tests/control-tower/doc-commit-exempt.test.sh
- .claude/task-briefs/2026-08-16-D390-exempt-guard.md
- task-state/D390.json

不做什么：
- 不改 scripts/control-tower/check-secrets.sh（SYNO_SECRETS_ROOT 单缝不构成旁路，D370 惯例保留）
- 不改 .git/hooks/post-commit（exempt 对账列为后续，本轮落盘即可审计）

## Q3: 验收 — 入口 → 交互 → 结果

入口：pre-commit 早退分支 / 注入缝
处理：武装守卫区分测试/生产；豁免写 exempt.log
结果：无 SYNO_TEST_ARM 旁路失效；豁免事件可审计

## 架构层: 基础设施（门禁）

#CRITERIA: A

## Done 标准
- [ ] doc-commit-exempt.test.sh 18/0（含 T13）
- [ ] 负测：无 SYNO_TEST_ARM 设注入缝 → 全量 13 组执行
- [ ] exempt.log 记录 EXEMPT + staged
