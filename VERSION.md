# VERSION — SynovaAgent 版本管理

> 版本规范（2026-08-18 创始人定，所有人共同遵守）：
> - **补丁（patch）**：修 bug / 打补丁 → 第三位 +1（V4.8.0 → V4.8.1）
> - **升级（minor）**：加功能 / 能力增强 → 第二位 +1，第三位归零（V4.8.1 → V4.9.0）
> - **全面改版（major）**：破坏性变更 / 重设计 → 第一位 +1（V4.9.0 → V5.0.0）

## 当前版本

**V4.9.1**（补丁）

## 版本历史

| 版本 | 日期 | 类型 | 变更 |
|------|------|------|------|
| V4.9.1 | 2026-09-06 | 补丁 | D579 CT-55/CT-58 机制侧：k3 verdict 纳入证据新鲜度门（calc freshness_gate：TTL+git_touched_after，rejected 短路保持，降级三场景显式 pending_k3+problems）；批次审计报告派生改 task-state audit.report 显式字段优先+文件名兜底（gen-cto-health resolve_audit_report，过 D412 口径）——真数据 11 点诚实转 stale，D517-519 仪表盘 CONDITIONAL_PASS 可见 |
| V4.9.0 | 2026-08-21 | 升级 | 控制塔减负大改版：方案1挪CI（本地 pre-commit 硬阻断→软提示 + CI 权威，D467）；方案2状态分两类（会话态 gitignore）；方案3同步降频（砍 D335 提交前同步，D468）；CI gap 补齐（D465）；注释同步/测试跨平台（D466） |
| V4.8.1 | 2026-08-18 | 补丁 | D451 CT-42 读侧接线 + D331 补记死循环豁免；D456 alloc-task-id 并发锁（撞号根治）；D457 bypass.log merge=union（多 PR 冲突根治）；D458 运行时状态去跟踪（GIT-SYNC-PLAN 落地） |
| V4.8.0 | 2026-08-12 | 升级 | D307 worktree 隔离（并行根治，独立 index/暂存区/current-brief） |
| V4.7.9 | 2026-08-12 | 补丁 | （历史，见台账） |
| V4.7.8 | 2026-08-12 | 补丁 | （历史，见台账） |

## 打 tag 规范

- 每次补丁/升级/改版，提交后打 `git tag VX.Y.Z` + `git push --tags`
- tag 必须指向 main 上的提交（M6 教训：孤儿 tag 断裂锚点）
- 版本号变更 = 代码有实质变更（修 bug/加功能），纯文档/运行时状态变更不 bump 版本
