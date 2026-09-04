---
状态: implemented
日期: 2026-09-04
决策: 产品线兑换机制诚实化（CT-53）——redeem 证据类型 k3→task_redeem（任务闭环声明非审计裁决）、审计复核点 k3_only 禁任务兑换、calc 存量假 k3 降级；alloc 在途 worktree 盲区修复（CT-54）
理由: K3 D572 审计实证线1 假绿——redeem 把「任务级 audit 非 FAIL」冒充 record_type=k3 被 calc 一票翻绿（1-2 Windows 从未实测却 verified）。诚实规则：任务闭环=机器级证据，翻绿需真 K3 复核或创始人核验。alloc 只查 origin/main 看不到在途 worktree 占用（D575 撞 D573 实证，D550 同型）。
---

## 变更清单
1. scripts/product-lines/redeem-progress.py：REDEEM_RECORD_TYPE=task_redeem；load_k3_only_points()（desc 含「审计员复核」25 点）跳过不兑换；note 显式声明非审计裁决
2. scripts/product-lines/calc-progress.py：load_evidence_records 存量降级（record_type=k3 且 note 含「自动兑换（redeem-progress.py）」→ task_redeem，不改历史文件）；status_for_point 加 task_redeem 走 machine 路径（TTL/touched/pending_k3）+ k3_only 点封顶 pending_k3
3. docs/synova/product-lines/product-lines.yaml：25 个审计复核点加 k3_only: true
4. scripts/control-tower/alloc-task-id.sh：worktree 扫描合入占用表（跟随 TASK_STATE_DIR 所属仓库；SYNO_ALLOC_NO_WORKTREE 注入缝；非 git 目录自动跳过）
5. tests/control-tower/redeem-task-redeem.test.sh：5 断言（正常兑换类型/k3_only 跳过/存量降级/k3_only 封顶/无 k3 冒充）

## 执行证据
- verify: redeem-task-redeem.test.sh 5/5 绿
- verify: alloc-task-id.test.sh 13/13 绿 + lock 测试 3/3 绿（worktree 扫描不破坏既有语义）
- verify: 主仓库 calc 重跑 → 产品总进度 11%→6%（20→10 verified，假绿水分挤出——诚实回落为预期行为）
- 参考系: K3 D572 报告（docs/synova/audit-reports/2026-09-04-D572-line1-desktop.md）+ D333 四步（第一性原理：进度=真实，宁低勿假）

## 效果与边界
- 产品进度 11%→6% 是诚实修正非回退：verified 集合 = K3 真 PASS + 创始人核验
- 翻绿路径不变：真 K3 复核（gen-k3-task 流程）或 founder-demo 证据
- 边界: 不改 scripts/audit/；不改 redeem 的调用方 refresh-all.sh（集成点不变）
