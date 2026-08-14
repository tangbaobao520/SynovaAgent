# SynovaAgent -- D216 审计子系统补全 (Audit Completion) 实施方案 v1.0

> 2026-07-23 | 权威文档 #17 第五章 Ch5 §2.2 + §7 + §9
> **控制塔 Phase 3 — Ch5 当前 1/6 完成。零文件冲突。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`scripts/control-tower/external-auditor.sh` 存在（9KB，D202），`scripts/control-tower/audit-rules.json` 存在（3KB），`scripts/hooks/post-commit.sh` 存在（D210 已接线）
- [x] Get-Content 读取：Ch5 §9 文件清单 — 4 脚本（audit-rules.sh, audit-runner.sh, cross-check.sh, trends-analyzer.sh）+ 2 目录（.codex/audit/, .codex/self-reports/）。Ch5 §2.2 组件清单 — 审计规则引擎（23 项错误模式独立检测）、审计运行器（调度+聚合）、交叉对比引擎（Agent 自评 vs 审计）、趋势分析器
- [x] Select-String 验证：D202 external-auditor.sh 接受 `--task-id` 和 `--diff` 参数，依赖 audit-rules.json；D210 post-commit.sh 在每次提交后调用 external-auditor.sh
- [x] 引用 — Ch5 §1.2 审计哲学："只检查物理事实——文件存在？符号被引用？语法合法？不判断语义正确性"

---

## 问题根因

D202 external-auditor.sh 是 Ch5 的"审计运行器"，D210 将其接入了 post-commit hook。但 Ch5 定义了 4 个独立脚本 + 2 个数据目录——当前只完成了 1/6（D202 脚本 + D210 接线）。缺失的 audit-rules.sh（23 项独立检测）、cross-check.sh（自评对比）、trends-analyzer.sh（趋势分析）和 `.codex/audit/` + `.codex/self-reports/` 目录全部未建。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 控制塔 — 审计子系统补全。创建 3 个新 bash 脚本（audit-rules.sh, cross-check.sh, trends-analyzer.sh）+ 2 个数据目录。与现有 D202 external-auditor.sh 和 D201-Phase2 known-error-patterns.json 协同工作。

### Q1：调研
- D202 external-auditor.sh：已有审计运行器，接受 `--task-id` 和 `--diff` 参数，依赖 audit-rules.json
- D201-Phase2 known-error-patterns.json：23 项错误模式定义（6 auto_detectable + 17 语义）
- Ch5 §9：4 脚本 + 2 目录的完整文件清单
- D210 post-commit.sh：每次提交后调用 external-auditor.sh

### Q2：范围
- 最小：`scripts/audit/audit-rules.sh`（从 known-error-patterns.json 读取并逐项检测）+ `scripts/audit/cross-check.sh`（加载 self-report JSON vs audit-result.json）+ `scripts/audit/trends-analyzer.sh`（扫描历史审计结果检测重复模式）+ 创建 `.codex/audit/` 和 `.codex/self-reports/` 目录
- 不做：不修改 D202 external-auditor.sh、不修改 D210 post-commit hook

### Q3：验收
- 入口：`bash scripts/audit/audit-rules.sh --diff HEAD~1..HEAD` → 扫描变更文件 → 输出 audit-result.json
- 交互：Agent 完成后写 self-report → `cross-check.sh` 对比 self-report vs audit-result → 输出一致性矩阵
- 结果：P0 阻断（expertType=unknown 命中）→ 红色信号 → D213 仪表盘显示

### Q4：契约与测试
- @input：git diff 范围（audit-rules.sh）+ audit-result.json + self-report.json（cross-check.sh）
- @output：audit-result.json + cross-check-report.json + trends-report.json
- @degraded：known-error-patterns.json 缺失 → 降级跳过
- 测试：audit-rules 检测(2) + cross-check 一致/矛盾(2) + trends 重复/无重复(2) = 6 tests

---

## 构建内容

### 1. scripts/audit/audit-rules.sh（新建，约 120 行）

从 `scripts/control-tower/known-error-patterns.json` 读取 23 项模式 → 对 git diff 变更文件逐行 grep → 生成 `audit-result.json`：

```json
{
  "taskId": "D216",
  "timestamp": "2026-07-23T...",
  "findings": [
    {"ruleId": "P01", "file": "src/foo.ts:42", "pattern": "from\"...", "severity": "high"},
    {"ruleId": "P04", "file": "src/bar.ts:15", "pattern": "catch(){}", "severity": "high"}
  ],
  "summary": {"total": 2, "high": 2, "medium": 0, "low": 0}
}
```

### 2. scripts/audit/cross-check.sh（新建，约 80 行）

加载 Agent 自检 5 问结果（`.codex/self-reports/{taskId}.json`）→ 对比 audit-result.json → 输出一致性矩阵：

| 检查项 | Agent 自评 | 外部审计 | 一致性 |
|--------|-----------|---------|--------|
| as_any=0 | PASS | FAIL (3 found) | ❌ 矛盾 |
| empty_catch | PASS | PASS | ✅ 一致 |

### 3. scripts/audit/trends-analyzer.sh（新建，约 60 行）

扫描 `.codex/audit/` 历史审计结果 → 检测同类 bug 反复出现的模式（同一 ruleId 在连续 3+ 次审计中出现）→ 输出 `trends-report.json`

### 4. 目录创建

- `.codex/audit/` — 存放 audit-result.json, cross-check-report.json, trends-report.json
- `.codex/self-reports/` — 存放 Agent 自检 5 问 JSON

---

## 不做什么

- 不修改 D202 external-auditor.sh（保持独立运行）
- 不修改 D210 post-commit hook（已正确接线）
- 不修改 D201-Phase2 known-error-patterns.json（数据源，不是脚本）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- audit-rules.sh 扫描含 `as any` 的变更文件 → 检出 P02 命中
- audit-rules.sh 扫描干净文件 → 0 命中
- cross-check.sh Agent 自评 PASS + 审计 FAIL → 标记矛盾
- cross-check.sh 双方一致 PASS → 标记一致
- trends-analyzer.sh 同一 ruleId 连续 3 次出现 → 标记重复模式
- trends-analyzer.sh 无重复 → 空报告
- 6 个测试

### L2a：接线测试
- 3 个脚本均存在且可执行（bash -n 语法检查）
- `.codex/audit/` 和 `.codex/self-reports/` 目录存在

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| audit-rules.sh | audit-runner.sh (D202 external-auditor) | bash -n 语法检查 |
| cross-check.sh | PostToolUse hook 或手工 | bash -n 语法检查 |
| trends-analyzer.sh | Cron 或手工 | bash -n 语法检查 |

---

## 完成标准

```
[ ] scripts/audit/audit-rules.sh: 读取 known-error-patterns.json + 逐行 grep
[ ] scripts/audit/cross-check.sh: Agent 自评 vs 审计结果对比
[ ] scripts/audit/trends-analyzer.sh: 历史趋势扫描
[ ] .codex/audit/ 目录创建
[ ] .codex/self-reports/ 目录创建
[ ] audit-result.json 格式正确（findings[] + summary）
[ ] 降级: known-error-patterns.json 缺失 → 跳过 + degraded
[ ] 降级: grep 不可用 → 跳过 + degraded
[ ] ≥6 个测试: audit-rules(2) + cross-check(2) + trends(2)
```

---

## 权威文档引用

- 权威文档 #17 第五章：外部审计器 — §2.2 组件清单 / §7 实现 / §9 文件清单 (行 448-453)
- D202 external-auditor.sh（已有审计运行器）
- D201-Phase2 known-error-patterns.json（23 项模式数据源）
- D210 post-commit hook（触发机制）
- AGENTS.md Iron Law 0-5 错误 #9（审计假通过）、#10（测试缺失未发现）、#11（半成品放过）、#20（同类 bug 反复出现）
