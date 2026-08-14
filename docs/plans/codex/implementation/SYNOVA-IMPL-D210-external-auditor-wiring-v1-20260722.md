# SynovaAgent -- D210 外部审计器接线 (D202 wiring) 实施方案 v1.0

> 2026-07-22 | 权威文档 #17 第五章：外部审计器
> **控制塔 5 组件并行部署 — 第 3/5 项。零文件冲突。**
> **D202 external-auditor.sh 脚本已存在（9KB），仅需接线。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/external-auditor.sh` 存在（9KB），`scripts/control-tower/audit-rules.json` 存在（3KB）
- [x] Get-Content 读取：external-auditor.sh Line 1-29 — 用法 `--task-id <ID> --diff <RANGE>`、依赖 `audit-rules.json`、退出码 0=完成 1=故障
- [x] Select-String 验证：audit-rules.json 含 7 条审计规则（as_any/empty_catch/missing_test/wiring_gap/degraded_propagation/edge_id_invalid/semifinished_stub）
- [x] 引用 — Ch5 §1.1 核心矛盾："Agent 的自我报告不可全信。" + §1.2 审计哲学："只检查物理事实，不判断语义正确性"

---

## 问题根因

D202 external-auditor.sh 在 commit 40e720b 交付后从未被触发。脚本在磁盘上躺着——和修复前的 D201 完全相同的模式。需要接入 post-commit hook，使每次提交后自动执行审计。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — D202 接线。最小改动：在 `.git/hooks/post-commit` 中追加 external-auditor.sh 调用，每次提交后自动扫描变更文件并输出审计报告。

### Q1：调研
- external-auditor.sh：接受 `--task-id` 和 `--diff` 参数，扫描 git diff 变更文件
- audit-rules.json：定义 7 条审计规则（as_any / empty_catch / missing_test / wiring_gap 等）
- 当前 post-commit hook：`.git/hooks/post-commit` 已存在（含 bypass 日志记录）
- 安装脚本：`scripts/workflow/hook-block-write.sh` 存在，但缺少 post-commit hook 安装

### Q2：范围
- 最小：(A) 在现有 post-commit hook 中追加 `bash external-auditor.sh --task-id $TASK --diff HEAD~1..HEAD`；(B) 创建 `scripts/workflow/install-post-commit.sh` 安装脚本
- 不做：不修改 external-auditor.sh 本身、不修改 audit-rules.json

### Q3：验收
- 入口：`git commit` → post-commit hook 触发 → external-auditor.sh 执行
- 交互：审计器扫描 `git diff HEAD~1..HEAD` 变更文件 → 与 audit-rules.json 比对
- 结果：审计报告写入 `.codex/audit-reports/` 目录，输出 P0/P1/P2 分级

### Q4：契约与测试
- @input：git commit 事件（自动触发）
- @output：`.codex/audit-reports/{task-id}-{timestamp}.md`
- @degraded：audit-rules.json 不可用 → 跳过审计 + log.warn + 不阻断 commit
- 测试：post-commit hook 存在 + 可执行 external-auditor.sh 语法检查

---

## 构建内容

### 1. 修改 .git/hooks/post-commit（追加 3 行）

在现有 hook 末尾追加：

```bash
# D210: 外部审计器 — 提交后自动扫描 23 项错误模式
TASK_ID=$(git log -1 --pretty=%B | grep -oP '(?<=D)\d+(?=[-FIX])' | head -1 || echo "unknown")
bash "$PROJECT_ROOT/scripts/control-tower/external-auditor.sh" --task-id "D${TASK_ID}" --diff HEAD~1..HEAD 2>&1 | tail -3
```

### 2. scripts/workflow/install-post-commit.sh（新建，约 30 行）

自动化安装脚本：复制 post-commit 模板到 `.git/hooks/post-commit`，确保可执行权限。

---

## 不做什么

- 不修改 external-auditor.sh（脚本已完整）
- 不修改 audit-rules.json（规则已定义）
- 不在 pre-commit 中加审计（post-commit 不阻断，仅报告）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- post-commit hook 文件存在 + 包含 external-auditor.sh 引用
- external-auditor.sh 可执行（bash -n 语法检查通过）
- install-post-commit.sh 可执行且幂等（重复安装不报错）
- 3 个测试

### L2a：接线测试
- `.git/hooks/post-commit` 包含 `external-auditor.sh` 引用
- audit-rules.json 文件存在且 JSON 格式正确

---

## 接线验证（铁律 4）

| 组件 | 触发方式 | 验证方式 |
|------|------|------|
| external-auditor.sh | post-commit hook 自动触发 | grep "external-auditor" .git/hooks/post-commit |
| audit-rules.json | external-auditor.sh 读取 | Test-Path 验证 |

---

## 完成标准

```
[ ] .git/hooks/post-commit 包含 external-auditor.sh 调用
[ ] install-post-commit.sh 存在且可执行
[ ] external-auditor.sh 语法检查通过（bash -n）
[ ] audit-rules.json 存在且 JSON 格式正确（python -m json.tool 验证）
[ ] 降级：audit-rules.json 不可用 → 不阻断 commit
[ ] ≥3 个测试
```

---

## 权威文档引用

- 权威文档 #17 第五章：外部审计器 — §1.1 核心矛盾 / §1.2 审计哲学 / §3 审计规则定义 / §4 分阶段部署
- D202 dev doc：[SYNOVA-IMPL-D202-external-auditor-v1-20260722.md](D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-IMPL-D202-external-auditor-v1-20260722.md)
- AGENTS.md Iron Law 0-5 错误 #9（审计假通过）、#10（测试缺失未发现）、#11（半成品放过）

