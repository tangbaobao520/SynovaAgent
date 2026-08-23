# D508 提交流程减负 — 四项决策记录

> 提取自: CTO 自查（D506/D507 提交循环实测）+ Win PR#128 五摩擦项综合
> 主题: 提交循环 7+ 轮 → 1-2 轮的路径

## 决策

1. **对账范围 merge-base 化**（Win#7 + CTO 实证补记死循环同根因）：`$BASE..HEAD` 在 merge main 后把 main 侧已验提交也当欠账 → 6+ 次补记循环。改为 `git merge-base $BASE HEAD..HEAD`，范围=分支自己的新提交。质量根不降（无记录新提交仍拦，测试双断言）。
2. **--check 全量 dry-run**（Anthropic fail-fast + 完整报告）：三个检查器（plan-integrity/pre-commit 13 组/commit-msg）一次跑完汇总输出。逐个揭穿 7 轮 → 1 轮看全 1 轮提交。
3. **COMMITTED 登记提前到 commit 成功瞬间**：原在 push 之后，set -e 下 push 失败 → 记录永缺 → D331 拦 → 补记 → 死循环。现在提交即有记录。
4. **软噪声出证据链**（Win#10）：GATE_FAIL_SOFT 写独立 gate-soft-warnings.log，bypass.log 只记真实提交/绕过；alloc-task-id 认领即生成 brief 六字段骨架（模板接线）。

## 质量边界（不减清单）

13 组门禁判定本体、K3 故障注入、S-6/S-10、接线验收——零触碰。四项全是反馈模式与登记时机优化。
