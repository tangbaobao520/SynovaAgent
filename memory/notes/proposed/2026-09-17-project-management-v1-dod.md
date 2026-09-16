---
状态: proposed
日期: 2026-09-17
决策: 产品完成度口径改为「交付度（只增不减）+ 保鲜（单独计时）」，并把 26 条产品线的散文式完成定义改写为 **V1 可判定断言**（125 条，签字后冻结分母）；新需求一律进 V2 backlog，改 V1 需走变更单。四张机器派生视图（交付账本 / 执行看板 / 阻塞清单 / 时间轴）以 git 为唯一真相源，其中交付账本对创始人可视。
理由: 现行 `calc-progress.py` 把三件事（做没做完 / 证据新不新 / 当前在不在验）压成一个数，TTL 到期即扣完成度 → 完成度不单调。实证：唯一 verified 点 19-2 靠 2026-09-02 的 K3 证据在 09-16 恰好第 14 天存活，09-17 归零（1%→0%）；且 246 张 task-state 卡中 0 张有 depends_on/blocked_by/owner/milestone 字段，164 点里 yaml 声明通过 5 条、证据独立认定 1 条、**交集 0** —— 项目管理缺的是数据模型，不是看板皮肤。
---

## 落地

- **S0a（本次）**: `docs/synova/project/26线-V1验收标准-草案v0.1-20260917.md`（机器源）+ `产品完成标准-可视版-20260917.html`（派生视图）
- **S0b**: `docs/synova/coordination/PROJECT-MANAGEMENT.md`（字段/状态机/四视图/阈值/门禁条款）
- **S1/S2/S3**: task-state 补 6 字段 + 门禁校验 / 派生器四视图 / 看板列映射 + 每日 cron + 周报（各 1 张编码派单）

## 参考

- 插件市场调研：社区有甘特插件 [dsh-plugin-project-management](https://github.com/Luke-Yong/dsh-plugin-project-management)（访谈式输入 + 确定性调度 + Word/Excel 导出）；本机看板插件 `@linxin666/dsh-client-ui-task-board` v0.3.17（无依赖/里程碑/甘特）。判断：**不整体接入做真相源**（会引入第二份手工维护的真相），S4 只做 spike 复用其关键路径/导出。
- 取号说明：`alloc-task-id.sh` 本机不可用（:242 全角 `$VAR` 崩溃、生产路径 110+ worktree 挂住、关扫描即撞在途号 D792）→ 本次以「全 refs + 全 worktree + K3 独立区」三重交叉核验取 D793；脚本修复另列派单项。
