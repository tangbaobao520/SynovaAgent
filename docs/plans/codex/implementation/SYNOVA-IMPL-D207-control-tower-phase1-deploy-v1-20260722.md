# SynovaAgent -- D207 控制塔 Phase 1 部署上线 实施方案 v1.0

> 2026-07-22 | 权威文档 #17：创始人控制塔 — 全体系部署
> **D200/D201/D202/D206 代码已提交并推送到仓库。D207 将它们接入实际工作流——让这些脚本真正运行起来。**
> **纯配置任务。不改业务代码。不改控制塔脚本本身——只改集成点。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：四个组件全部存在（context-injector.sh、synova-commit、external-auditor.sh、dev-doc-gatekeeper.sh）
- [x] 权威文档 #17 已阅读——控制塔部署逻辑在第一章 §9（注射器集成点）、第二章 §2-§3（网守集成点）、第五章 §3（审计器集成点）
- [x] 代码一致性确认：四个脚本的 commit hash 已在仓库中（d8853b6、40e720b、39a672f、534d898）

---

## Loop Engineering V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔部署。D207 将四个已完成的控制塔组件接入真实工作流——不是写新代码，是修改配置和集成点，让已有的脚本在正确的时机被触发。

### Q1：调研
- D200 context-injector.sh 需要 task-start.sh 在生成 task brief 后调用它
- D201 synova-commit 需要 Claude Code 的 PostToolUse 配置指向它，替代 git commit
- D202 external-auditor.sh 需要 synova-commit 在提交成功后调用它
- D206 dev-doc-gatekeeper.sh 需要在 Codex Agent 分发 dev doc 前调用它

### Q2：范围
- 最小实现：改 4 个集成点——task-start.sh（D200）、Claude Code 配置（D201）、synova-commit（D202）、Codex 分发流程（D206）
- 不做：不修改四个控制塔脚本本身、不新增业务功能、不改代码门禁规则

### Q3：验收
- 入口：每个集成点改完后，触发对应的操作（启动 task、提交代码、分发文档）
- 交互：控制塔脚本在预期的时机自动运行
- 结果：D200 注入内容出现在 task brief 中、D201 门禁在 commit 前被执行、D202 审计报告在 commit 后生成、D206 校验在分发前运行

### Q4：契约与测试
- @input：四个已有的控制塔脚本 + 四个集成点
- @output：四个集成点修改完成 + 验证通过
- @degraded：集成点修改后控制塔脚本不可用 → 告警 + 降级（不阻断原有流程）
- 测试：每个集成点改完后手动触发验证

---

## 当前状态

- D200 context-injector.sh：已推送到仓库（d8853b6），但 task-start.sh **未调用它**
- D201 synova-commit：已推送到仓库（40e720b），但 Claude Code **仍在使用 git commit**
- D202 external-auditor.sh：已推送到仓库（39a672f），但 synova-commit **未调用它**
- D206 dev-doc-gatekeeper.sh：已推送到仓库（534d898），但 Codex **分发 dev doc 前未运行它**
- 所有四个脚本在磁盘上，但工作流中没有一个被集成

---

## 部署动作

### 部署 1：D206 — Dev Doc Gatekeeper 接入 Codex 分发流程

**位置**：Codex Agent 的工作流——在我说"可以分发"之前
**动作**：在分发 dev doc 给 Claude Code 之前，运行：
```
bash scripts/control-tower/dev-doc-gatekeeper.sh {dev-doc-path}
```
**验证**：拿 D20 的中文版跑一次，确认 exit 0 或 exit 1（根据文档质量）。写一份故意把 Edge ID 写错的假文档，确认 exit 1。

### 部署 2：D200 — 上下文注射器接入 task-start.sh

**位置**：`scripts/workflow/task-start.sh`——在 task brief 生成之后、退出之前
**动作**：在脚本末尾（brief 文件写入完成后）插入：
```bash
TASK_BRIEF_FILE=".claude/task-briefs/${TASK_ID}.md"
if [ -f "$TASK_BRIEF_FILE" ]; then
  bash scripts/control-tower/context-injector.sh "$TASK_ID"
fi
```
**验证**：运行 task-start.sh 生成一份 brief，打开 `.claude/task-briefs/{id}.md`，确认 Q1c 字段有注入的 Edge ID 或文件路径。

### 部署 3：D201 — synova-commit 接入 Claude Code

**位置**：Claude Code 的 PostToolUse 配置（`.claude/settings.json` 或环境变量）
**动作**：将 commit 命令从 `git commit -m "..."` 改为：
```
synova-commit --task-id "$TASK_ID" --agent "claude-code" --message "..." --files "$CHANGED_FILES"
```
**验证**：让 Claude Code 提交一次代码，确认日志中出现 pre-commit-check.sh 的输出。

### 部署 4：D202 — 外部审计器接入 synova-commit

**位置**：`scripts/control-tower/synova-commit`——在 git commit 成功之后
**动作**：在 synova-commit 的 git commit 成功分支后插入：
```bash
bash scripts/control-tower/external-auditor.sh --task-id "$TASK_ID" --diff "HEAD~1..HEAD"
```
**验证**：synova-commit 提交一次后，检查 `.codex/audit-reports/` 目录是否有新报告生成。

---

## 不做什么

- 不修改四个控制塔脚本本身（代码已完成）
- 不修改现有的 pre-commit-check.sh 规则
- 不修改 Claude Code 的其他设置（只改 commit 命令）
- 不修改 Codex 的 task brief 模板（只在生成后调用注射器）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### 手动集成验证（每项部署后单独验证）

| 部署 | 验证动作 | 预期结果 |
|:--:|------|------|
| D206 | 拿一份含错误 Edge ID 的假 dev doc 跑 gatekeeper | exit 1 + FAIL 输出 |
| D206 | 拿 D200 中文版（合格文档）跑 gatekeeper | exit 0 + ALL PASS |
| D200 | 运行 task-start.sh 生成 brief | Q1c 字段有注入内容 |
| D201 | Claude Code 提交一次代码 | 日志中有 pre-commit-check.sh 输出 |
| D202 | synova-commit 提交后 | .codex/audit-reports/ 有新报告 |

---

## 接线验证（铁律 4）

| 集成点 | 调用方 | 被调用方 | 验证方式 |
|------|------|------|------|
| D200 → task-start.sh | task-start.sh | context-injector.sh | grep "context-injector" scripts/workflow/task-start.sh |
| D201 → Claude Code | Claude Code | synova-commit | grep "synova-commit" .claude/settings.json |
| D202 → synova-commit | synova-commit | external-auditor.sh | grep "external-auditor" scripts/control-tower/synova-commit |
| D206 → Codex | Codex Agent | dev-doc-gatekeeper.sh | 人工验证（Codex 分发流程） |

---

## 部署顺序

必须按此顺序，不可并行：

```
1. D206（文档校验）→ 先保护文档质量，后续部署的产出受此校验
2. D200（上下文注射）→ task brief 质量提升，后续 Claude Code 任务受益
3. D201（代码门禁）→ 替代 git commit，消除 --no-verify 绕过
4. D202（事后审计）→ 在 D201 集成后接入 post-commit hook
```

---

## 完成标准

```
[ ] D206：dev-doc-gatekeeper.sh 在 Codex 分发 dev doc 前被调用
[ ] D206：拿一份错误文档验证，确认 exit 1 + FAIL 输出
[ ] D200：task-start.sh 在 brief 生成后调用 context-injector.sh
[ ] D200：生成的 task brief 中 Q1c 字段有注入的 Edge ID/文件路径
[ ] D201：Claude Code 配置指向 synova-commit（非 git commit）
[ ] D201：验证一次 Claude Code 提交走了 synova-commit → pre-commit 门禁
[ ] D202：synova-commit 在 git commit 成功后调用 external-auditor.sh
[ ] D202：验证一次提交后 .codex/audit-reports/ 有新报告
```

---

## 权威文档引用

- 权威文档 #17：创始人控制塔 — 第一章 §9（注射器集成点）、第二章 §2-§3（网守集成点）、第五章 §3（审计器集成点）
- D200/D201/D202/D206：四个控制塔组件的开发文档
