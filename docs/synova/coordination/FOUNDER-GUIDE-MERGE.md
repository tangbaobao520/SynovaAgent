# 创始人手册 — 多机协作你只需要做这些（D334, 2026-08-14）

> 你是创始人，代码由 AI Agent 写。这套流程保证：**你在 Mac 和 Win 两台电脑上的
> Agent 不会互相覆盖对方的工作**。你只需要做下面 3 类事，每类 1-2 分钟。

---

## 一、日常：派活（一句话）

给任何一台机器上的 Agent 发任务时，加上这句：

> "任务：xxx。遵守 docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md 的 PR 工作流。"

Agent 会自动：拉最新代码 → 开自己的分支 → 干活 → 推送 → 给你 PR 链接。

## 二、日常：验收合并（点 2 个按钮）

Agent 干完后给你一个链接，形如：

```
https://github.com/tangbaobao520/SynovaAgent/pull/123
```

1. 打开链接
2. **看勾勾**：绿色 ✅ = 测试通过；红色 ❌ = 让 Agent 看 CI 日志修复
3. 点绿色 **Merge pull request** 按钮
4. 点 **Confirm merge** 确认
5. 完成 ✅

## 三、一次性设置（5 分钟，只做一次）

GitHub 网页设置 main 分支保护（双保险，防止任何机器误推 main）：

1. 打开 https://github.com/tangbaobao520/SynovaAgent/settings/branches
2. 点 **Add branch protection rule**
3. Branch name pattern 填：`main`
4. 勾选 **Require a pull request before merging**
5. 勾选 **Require status checks to pass before merging**（如果出现 status check 列表，选全部）
6. 点绿色 **Create** 保存
7. 完成 ✅（以后 main 只能通过 PR 合并，任何直接推送都会被 GitHub 拒绝）

## 四、遇到问题怎么办

| 现象 | 做什么 |
|------|--------|
| PR 页面显示红色 ❌ | 让 Agent 看 CI 日志修复，修好后再 Merge |
| PR 显示 "conflicts"（冲突） | 让 Agent 执行 `git rebase main` 解决冲突后重新推送 |
| Agent 说 push 被门禁拒绝 | 让 Agent 读阻断消息里的修复命令（通常是先 fetch 拉平） |
| 紧急情况必须绕过门禁 | 你自己判断批准后，Agent 用 `--no-verify`（会被审计日志记录） |

## 五、核心规则（一句话版）

**main 是唯一真相。一台机器一件事一个分支。合并走 PR。**
你的两台机器永远不会在同一个分支上直接打架——这就是这套流程的全部意义。
