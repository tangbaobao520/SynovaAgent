# SynovaAgent -- D201-FIX synova-commit 网守安装 实施方案 v1.0

> 2026-07-22 | 审计发现：P0 — synova-commit 未安装为 git alias
> **审计报告：SYNOVA-AUDIT-REPORT-20260722.md — P0 第2项**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/synova-commit` 存在（8355 bytes，有效 bash 脚本）
- [x] Get-Content 读取：synova-commit Line 1-29 — 完整使用说明 + 输入输出契约 + 降级路径
- [x] Select-String 验证：`--no-verify` 在 synova-commit 中不存在（无绕过开关）
- [x] 引用 — `git config --get alias.synova-commit` 返回 NOT FOUND（git alias 未安装）

---

## 问题根因

D201 synova-commit 校验网守脚本已在 D201 commit (40e720b) 中交付，D207 Phase 1 部署也已完成。但 `git config alias.synova-commit` 返回空——git alias 从未被安装。控制塔的 commit gatekeeper 脚本躺在磁盘上但不接入 git 工作流。`--no-verify` 绕过依然可行。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔部署修复。将 synova-commit 脚本安装为 git alias，使得 `git synova-commit` 成为通往 `git commit` 的唯一路径（替换 `git commit --no-verify` 的习惯）。

### Q1：调研
- synova-commit 脚本已存在且功能完整：接受 `--task-id`、`--agent`、`--message`、`--files` 参数
- 脚本退出码：0=通过、1=阻断、2=降级
- git alias 使用 `!bash <script-path>` 语法执行外部脚本
- Windows 环境需使用绝对路径（`D:/novis-backup-20260526/Novis/synova-agent/scripts/control-tower/synova-commit`）

### Q2：范围
- 最小：运行 `git config alias.synova-commit '!bash "<absolute-path>"'` 安装 alias
- 可选：添加到 `scripts/workflow/install-hooks.sh`（或等效 Windows 脚本）中，使新克隆自动安装
- 不做：不修改 synova-commit 脚本本身

### Q3：验收
- 入口：运行 `git synova-commit --task-id D201-FIX --agent test --message "test"` → 通过 pre-commit 检查
- 交互：`git synova-commit` 替代 `git commit` 作为标准提交流程
- 结果：`git config --get alias.synova-commit` 返回非空脚本路径

### Q4：契约与测试
- @input：`git config alias.synova-commit '!bash "..."'`
- @output：`git config --get alias.synova-commit` 返回非空
- @degraded：bash 不可用 → 回退到直接 `git commit`（降级警告）
- 测试：git alias 存在性验证 + synova-commit 脚本可执行性验证

---

## 修复内容

### 1. 安装 git alias（一次性命令）

```bash
# 在项目根目录执行：
git config alias.synova-commit '!bash "D:/novis-backup-20260526/Novis/synova-agent/scripts/control-tower/synova-commit"'
```

或使用 PowerShell：
```powershell
git config alias.synova-commit "!bash `"D:/novis-backup-20260526/Novis/synova-agent/scripts/control-tower/synova-commit`""
```

### 2. 验证安装

```bash
git config --get alias.synova-commit
# 预期输出: !bash "D:/novis-backup-20260526/Novis/synova-agent/scripts/control-tower/synova-commit"
```

### 3. 可选：加入自动化安装脚本

在 `scripts/workflow/install-hooks.sh`（或新建 `install-hooks.ps1`）中添加：

```bash
echo "Installing synova-commit gatekeeper..."
git config alias.synova-commit "!bash \"$PROJECT_ROOT/scripts/control-tower/synova-commit\""
echo "Done. Use 'git synova-commit --task-id <ID> --agent <NAME> --message <MSG>' to commit."
```

---

## 不做什么

- 不修改 synova-commit 脚本本身
- 不替换现有的 pre-commit hook（并行独立运行）
- 不安装 synova-pre-push alias（D201 作用域仅限 commit gatekeeper）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- `git config --get alias.synova-commit` → 返回非空字符串（安装后）
- `git synova-commit --help` → 退出码 0 + 输出使用说明
- `git synova-commit --health` → 退出码 0 + 输出 "healthy"
- 4 组 fixture：normal(安装成功) / boundary(重复安装不报错) / error(路径错误→退出码1) / temporal(安装后持久化)

### L2a：接线测试
- git alias 指向的脚本路径真实存在（Test-Path 确认）
- synova-commit 脚本有执行权限（或 bash 可读取）

---

## 接线验证（铁律 4）

| 组件 | 触发方式 | 验证方式 |
|------|------|------|
| git alias synova-commit | Claude Code 提交时执行 `git synova-commit ...` | git config --get alias.synova-commit |
| synova-commit 脚本 | alias 触发 → bash 执行 | bash -n 语法检查通过 |

---

## 完成标准

```
[ ] git config alias.synova-commit 已安装且非空
[ ] git synova-commit --help 退出码 0
[ ] git synova-commit --health 退出码 0
[ ] synova-commit 脚本路径真实存在
[ ] synova-commit 脚本无 --no-verify 绕过开关（grep 确认）
[ ] 可选：install-hooks.sh 中包含 alias 安装步骤
[ ] >=4 个测试：alias 存在(1) + --help(1) + --health(1) + 路径验证(1)
```

---

## 权威文档引用

- 权威文档 #17 第二章 §2.2：synova-commit — 通往 git commit 的唯一路径
- D201 dev doc：[SYNOVA-IMPL-D201-gatekeeper-synova-commit-v1-20260722.md](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D201-gatekeeper-synova-commit-v1-20260722.md)
- D207 dev doc：[SYNOVA-IMPL-D207-control-tower-phase1-deploy-v1-20260722.md](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D207-control-tower-phase1-deploy-v1-20260722.md)
- SYNOVA-AUDIT-REPORT-20260722.md — P0 第2项
- AGENTS.md Iron Law 0-5 错误 #17：--no-verify 依赖
