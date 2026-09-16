---
状态: implemented
日期: 2026-09-16
决策: 仪表盘自动更新通道改为「workflow 只产 bot 分支 + CTO session 用 PAT 显式开 PR（真实凭据 → 必需检查正常报告）→ CI 全绿 → API 合并」；不再由 GITHUB_TOKEN 开 PR；新增产物过期看门狗（generated_at > 3 天 → 每日 CI job 红灯 + 邮件）
理由: GITHUB_TOKEN 创建的 PR 不触发任何 workflow（GitHub 平台递归防护），main 分支保护 12 个必需检查永不报告 → bot PR 永久 blocked（#403/#404 自 2026-09-07 起，产物停更 3 天+无告警 = M4 证据链断裂 + M2 假设被实测推翻）。改由真实凭据开 PR 让检查复活；合并职责对齐 D570「合并 PR 是 CTO 的工作」；看门狗把静默断链变成 3 天内可见红灯（铁律 35 fail-visible）
---

## 触发场景

D774 证据保鲜流水线收口验收（D786 派单）：CTO 实测发现「兑换成果没进 main」（F1）且 bot PR 永久 blocked（F5/F6）——「数字自动刷新」链 2026-09-07 起已断且无人发现（F7）。

## 备选方案 (a) 为何不采用（升级路径保留）

改用 PAT / GitHub App token 开 PR（workflow 内 `gh pr create` 换真实凭据）技术上可行，但当前唯一可用凭据是创始人个人宽权 classic PAT——单方面写入 repo secret 意味着任何未来 workflow 都能以创始人全权限行事，属安全 posture 变更，CTO 不自决。
**升级路径**：创始人创建最小权限 fine-grained PAT（仅本仓库 `contents:write` + `pull_requests:write`）→ 配为 repo secret（如 `SYNC_PR_TOKEN`）→ workflow 改回开 PR 模式。切换判据与步骤落档 `docs/synova/coordination/CI-诊断通道.md` §升级路径。

## 参考

- GitHub 官方文档 "Triggering a workflow from a workflow"：`GITHUB_TOKEN` 产生的事件（除 workflow_dispatch/repository_dispatch）不触发新 workflow run——平台设计，非配置错误
- 相关 D#: D786（通道+看门狗）· D371（product-progress 自动刷新）· D439（dashboard-auto 控制台）· D774（证据保鲜流水线）· D570（合并是 CTO 的工作）

## 落点

- `.github/workflows/product-progress.yml`、`.github/workflows/dashboard-auto.yml` — 移除 bot PR 创建，保留分支产出
- `.github/workflows/progress-freshness-watchdog.yml` — 新增每日看门狗
- `scripts/product-lines/check-progress-freshness.py` — 看门狗脚本（契约头 + 密封测试 `tests/control-tower/check-progress-freshness.test.sh` 入 CI canary）
- `docs/synova/coordination/CI-诊断通道.md` — 通道链路文档（下次断能查）
