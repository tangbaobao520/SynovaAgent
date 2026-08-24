# Task Brief: D430: U8 死引用热修复（K3 终审 FAIL 补救）

> 生成: 2026-08-17 | 认领: 🧭 DSH (控制塔脚本领地) | 上游: K3 终审报告 audit/k3-final-20260817（D426 FAIL）

## Q0: 定位
K3 终审判 feat/u8-pre-audit-summary FAIL：pre-audit-summary.sh 引用不存在的 reconcile-bypass-log.sh（U1 实际改为修复存量 check-bypass-log.sh，spec 契约里的新脚本未建）+ U4 无参调用 verify-claims-table.sh（用法错误恒 exit 2）→ 脚本永远跑不出"预审通过"。本任务热修两处死引用 + 注入 GIT_SSH_COMMAND 防 SSH hang + 加回归测试。

## Q1: 调研
- K3 实测：合并态 pre-audit-summary exit 2 恒不通过（交付即死）。
- 修复：U1 引用改 check-bypass-log.sh origin/main（U1 实际落地脚本）；U4 改 @DEV_DOCS 扫描 dev doc（无 doc 则跳过非降级）；run_gate 注入 GIT_SSH_COMMAND 防 check-bypass-log.sh 的 git fetch SSH hang。
- 回归测试：assert 不再引用 reconcile-bypass-log.sh + 引用 check-bypass-log.sh。

## Q2: 范围
做什么：
- scripts/control-tower/pre-audit-summary.sh
- tests/control-tower/pre-audit-summary.test.sh
- .claude/task-briefs/2026-08-17-D430-u8-deadref-hotfix.md
不做什么：
- 不改 scripts/audit/

## Q3: 验收
入口：bash scripts/control-tower/pre-audit-summary.sh。
处理：U1 check-bypass-log.sh origin/main 对账；U4 扫描 dev doc；U7 无暂存跳过。
结果：干净 checkout 下能达 exit 0"机器预审全过"（不再是恒 exit 2）。

## 架构层: 控制塔/工程基建（非 L1-L5 产品层）
#CRITERIA: D

## Done 标准
- [x] 死引用修复 + 干净态可达 exit 0 — verify: bash scripts/control-tower/pre-audit-summary.sh
- [x] 回归测试 7 项全绿 — verify: bash tests/control-tower/pre-audit-summary.test.sh
