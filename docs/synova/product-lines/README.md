# docs/synova/product-lines/ — 产品完成度仪表盘数据目录

> 生成器: scripts/product-lines/（D371 Phase 1，DeepSeek Harness）

## 文件角色

| 文件 | 角色 | 谁维护 |
|------|------|--------|
| product-lines.yaml | **单一事实源**：26 条线 + 验收点清单（产品定义） | 创始人定线集；Harness 起草验收点 |
| todo-line-map.yaml | 待办归属映射（任务编号/标准/场景 → 线） | Harness；改完跑 refresh-all.sh |
| cockpit-override.yaml | **待裁决清单**（页面置顶区，手动区） | Harness 起草；创始人裁决后改 status |
| evidence/*.json | 证据记录（审计结论/场景实测/自动测试/创始人核验） | 自动（evidence-writer / parse-k3-report）；首份审计证据由 Harness 从报告原文登记 |
| todos.yaml | 待办聚合产物（AUTO 机器生成 + MANUAL 人工微调） | 自动（aggregate-todos.py） |
| product-progress.json | 机器状态（六态 + 进度 + 降级清单） | 自动（calc-progress.py） |
| product-progress.html | **创始人驾驶舱页面（打开即真相）** | 自动（gen-progress-page.py） |
| k3-task-line-*.md | 审计复核任务书（线 100% / 每 2 周） | 自动（gen-k3-task.py） |

## 诚实规则（本目录第一红线）

- **只有带证据的验收点才算已验证**。agent 说"做了"不算；代码提交不算；任务合并不算。
- **线到 100% 必须审计员全量复核**（防最后 10% 烂尾）。
- **代码一变，相关证据自动转黄**（待重跑），不继承旧绿。
- 六态: ⚪未开始 / 🔴有问题 / 🔴被审计员否决 / 🟡待审计员确认 / 🟡待重跑 / 🟢已验证。

## 每周节奏（全自动，创始人零维护）

周五 09:00 UTC CI 自动跑聚合→计算→生成→有变化开 PR（创始人点合并即完成更新）。
