# 并行 session 纪律（Claude Code skill 补充建议）

> 2026-08-12 | 来源：D330/D331 共享暂存区拉锯事件（2026-08-12）——D331 re-add 抢占 → D330 被一致性门禁拒绝 → 循环。
> 背景根因：git 暂存区（index）是 **worktree 级单例**，并行 session 共用一个 worktree 必然竞争。D307（worktree 隔离）是根治；以下是 D307 落地前的**软加固**，建议写入 Claude Code 各开发 skill（brief-compose / claim-verifier / task-start 流程）。
> 控制塔侧对应实施：[D332（V4.7.4）](../plans/codex/implementation/SYNOVA-IMPL-D332-控制塔并行协调补丁-20260812.md) 落地 CT-10~13（staging-guard 指引 / attach 强制 register / wait_manager 竞争检测 / 事件记录）。

## 建议动作（按优先级）

| # | 动作 | 写入位置 | 说明 |
|---|------|---------|------|
| P1-1 | **任务启动强制 register session**（写集 + 活跃状态） | task-start 流程第一步 | 2026-08-12 事件中 D330 未登记 → staging-guard 不知道它存在。register 后防护才有对方数据 |
| P1-2 | **暂存纪律：git add 后立即 commit，不积攒暂存区** | brief-compose 收尾纪律 | 缩短"暂存区暴露窗口"，让他人 unstage/竞争的概率最小化 |
| P1-3 | **提交前自查暂存区归属**：`git diff --cached --name-only` + `resolve-commit-brief.sh`，非本 brief 文件先 unstage | 提交前 checklist | 在被门禁拒绝前自己发现问题 |
| P1-4 | **被拒后禁止对抗重试（>1 次）**：第一次被拒就停下，分析归属 + 协调/等待 | claim-verifier / 提交流程 | 消灭"unstage → 对方 re-add → 再拒"拉锯；D300 教训"第一时间停下协调"写死成规则 |
| P2-1 | **共享 worktree 场景先声明后动手**：写代码前 registry 登记写集 | task-start | 与 P1-1 配合 |
| P2-2 | 提交被拒时，读 staging-guard/门禁报错里的"活跃 session 列表 + 文件归属"指引，按其建议行动 | 报错处理 | 控制塔 CT-10 落地后报错会带指引 |

## 最小规则（写进 skill 的一句话版）

> **共享 worktree 时：①开始即 register；②暂存即提交；③提交前查归属；④被拒不重试、先协调。**

## 与 D307 的关系

以上是**减害**，不是根治。D307（每 session 独立 worktree → 独立 index）才是物理解法；软加固保证 D307 落地前并行不失控。
